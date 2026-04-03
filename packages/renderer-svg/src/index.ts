import type { MoleculeNode, ReactionNode } from "@chemd/core";
import {
  mapRenderOptionsToAdapterPayload,
  sanitizeRenderAdapterPayload,
  type RenderAdapterPayload,
  type RenderOptions
} from "@chemd/render-profile";

type SvgAdapterOptions = RenderAdapterPayload["rdkit"];
type Point = { x: number; y: number };
type SmilesSketchEdge = { from: number; to: number; order: number };
type SmilesSketch = { atoms: string[]; aromatic: boolean[]; edges: SmilesSketchEdge[] };
type SmilesParseResult =
  | { status: "ok"; sketch: SmilesSketch }
  | { status: "unsupported"; reason: string; token?: string; index?: number };
type ReactionFragment = { markup: string; width: number };
const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const sanitizeId = (value: string | undefined, fallback: string): string => {
  const normalized = value?.replaceAll(/[^a-zA-Z0-9_-]/g, "-").replaceAll(/-+/g, "-").replaceAll(/^-|-$/g, "");
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const formatNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  const normalized = Number(value.toFixed(2));
  return `${normalized}`;
};

const estimateTextWidth = (value: string, fontSize: number): number =>
  Math.max(fontSize * 1.4, value.length * fontSize * 0.6);

const isUppercaseAscii = (value: string): boolean => value >= "A" && value <= "Z";
const isLowercaseAscii = (value: string): boolean => value >= "a" && value <= "z";
const isDigitAscii = (value: string | undefined): value is string => Boolean(value && value >= "0" && value <= "9");

const parseRingIndex = (
  input: string,
  index: number
): { ringIndex: number; consumed: number } | undefined => {
  const token = input[index];
  if (token >= "1" && token <= "9") {
    return { ringIndex: Number(token), consumed: 1 };
  }

  if (token !== "%") {
    return undefined;
  }

  const first = input[index + 1];
  const second = input[index + 2];
  if (!isDigitAscii(first) || !isDigitAscii(second)) {
    return undefined;
  }

  const ringIndex = Number(`${first}${second}`);
  if (ringIndex <= 0) {
    return undefined;
  }

  return { ringIndex, consumed: 3 };
};

const parseSmilesSketch = (smiles: string | undefined): SmilesParseResult => {
  if (!smiles) {
    return {
      status: "unsupported",
      reason: "Empty SMILES value"
    };
  }

  const input = smiles.trim();
  if (!input) {
    return {
      status: "unsupported",
      reason: "Empty SMILES value"
    };
  }

  const atoms: string[] = [];
  const aromatic: boolean[] = [];
  const edges: SmilesSketchEdge[] = [];
  const branchStack: number[] = [];
  const ringAnchors = new Map<number, { atomIndex: number; order: number }>();
  let currentAtomIndex = -1;
  let pendingBond = 1;

  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];

    if (token === " " || token === "\t") {
      continue;
    }

    if (token === "-") {
      pendingBond = 1;
      continue;
    }

    if (token === "=") {
      pendingBond = 2;
      continue;
    }

    if (token === "#") {
      pendingBond = 3;
      continue;
    }

    if (token === "(") {
      if (currentAtomIndex < 0) {
        return {
          status: "unsupported",
          reason: "Branch opener appears before first atom",
          token,
          index
        };
      }

      branchStack.push(currentAtomIndex);
      continue;
    }

    if (token === ")") {
      const branchAtomIndex = branchStack.pop();
      if (branchAtomIndex === undefined) {
        return {
          status: "unsupported",
          reason: "Branch closer has no matching opener",
          token,
          index
        };
      }

      currentAtomIndex = branchAtomIndex;
      continue;
    }

    const ringToken = parseRingIndex(input, index);
    if (ringToken) {
      if (currentAtomIndex < 0) {
        return {
          status: "unsupported",
          reason: "Ring closure appears before first atom",
          token,
          index
        };
      }

      const existingAnchor = ringAnchors.get(ringToken.ringIndex);
      if (!existingAnchor) {
        ringAnchors.set(ringToken.ringIndex, { atomIndex: currentAtomIndex, order: pendingBond });
      } else {
        const order = pendingBond !== 1 ? pendingBond : existingAnchor.order;
        edges.push({
          from: existingAnchor.atomIndex,
          to: currentAtomIndex,
          order
        });
        ringAnchors.delete(ringToken.ringIndex);
      }

      index += ringToken.consumed - 1;
      pendingBond = 1;
      continue;
    }

    if (isUppercaseAscii(token) || isLowercaseAscii(token)) {
      const aromaticAtom = isLowercaseAscii(token);
      let atom = aromaticAtom ? token : token;
      const next = input[index + 1];
      if (!aromaticAtom && isUppercaseAscii(token) && next && isLowercaseAscii(next)) {
        atom += next;
        index += 1;
      }

      atoms.push(atom);
      aromatic.push(aromaticAtom);
      const newAtomIndex = atoms.length - 1;
      if (currentAtomIndex >= 0) {
        edges.push({
          from: currentAtomIndex,
          to: newAtomIndex,
          order: pendingBond
        });
      }
      currentAtomIndex = newAtomIndex;
      pendingBond = 1;
      continue;
    }

    return {
      status: "unsupported",
      reason: "Unsupported token in SMILES subset",
      token,
      index
    };
  }

  if (atoms.length === 0) {
    return {
      status: "unsupported",
      reason: "No atoms parsed from SMILES"
    };
  }

  if (branchStack.length > 0) {
    return {
      status: "unsupported",
      reason: "Unclosed branch in SMILES"
    };
  }

  if (ringAnchors.size > 0) {
    return {
      status: "unsupported",
      reason: "Unclosed ring anchor in SMILES"
    };
  }

  return {
    status: "ok",
    sketch: { atoms, aromatic, edges }
  };
};

const resolveAdapterOptions = (
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): SvgAdapterOptions => {
  const fallback = mapRenderOptionsToAdapterPayload(options);
  return sanitizeRenderAdapterPayload(adapterPayload, options).rdkit ?? fallback.rdkit;
};

const renderBackground = (width: number, height: number, adapterOptions: SvgAdapterOptions): string => {
  if (adapterOptions.transparentBackground) {
    return "";
  }

  return `<rect width="${width}" height="${height}" rx="18" fill="${escapeXml(adapterOptions.backgroundColor)}" />`;
};

const renderCaption = (label: string, value: string, x: number, y: number, fontSize: number): string =>
  `<text x="${x}" y="${y}" font-size="${fontSize}" fill="#475569">${escapeXml(label)}: ${escapeXml(value)}</text>`;

const joinReactionSide = (values: string[] | undefined, fallback: string): string => {
  if (!values || values.length === 0) {
    return fallback;
  }

  const text = values.join(" + ").trim();
  return text.length > 0 ? text : fallback;
};

const renderBondLines = (
  start: Point,
  end: Point,
  bondOrder: number,
  color: string,
  lineWidth: number,
  offsetDistance: number
): string => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offsets = bondOrder === 3 ? [-offsetDistance, 0, offsetDistance] : bondOrder === 2 ? [-offsetDistance, offsetDistance] : [0];

  return offsets
    .map((offset) => {
      const x1 = start.x + normalX * offset;
      const y1 = start.y + normalY * offset;
      const x2 = end.x + normalX * offset;
      const y2 = end.y + normalY * offset;

      return `<line x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}" stroke="${escapeXml(color)}" stroke-width="${formatNumber(lineWidth)}" stroke-linecap="round" />`;
    })
    .join("");
};

const renderLinearSketch = (
  sketch: SmilesSketch,
  startX: number,
  centerY: number,
  stepX: number,
  amplitude: number,
  atomFontSize: number,
  accent: string,
  lineWidth: number,
  bondOffset: number,
  className: string
): string => {
  const points = sketch.atoms.map<Point>((_, index) => ({
    x: startX + index * stepX,
    y: centerY + (index % 2 === 0 ? -amplitude : amplitude)
  }));

  const bonds = sketch.edges
    .map((edge) => renderBondLines(points[edge.from], points[edge.to], edge.order, accent, lineWidth, bondOffset))
    .join("");

  const atoms = points
    .map((point, index) => {
      const atom = sketch.atoms[index] ?? "C";
      const aromaticAtom = sketch.aromatic[index] ?? false;
      const showLabel = atom !== "C" || aromaticAtom || index === 0 || index === sketch.atoms.length - 1;
      return showLabel
        ? `<text x="${formatNumber(point.x)}" y="${formatNumber(point.y - atomFontSize * 0.75)}" font-size="${formatNumber(atomFontSize)}" text-anchor="middle" fill="#0f172a">${escapeXml(atom)}</text>`
        : "";
    })
    .join("");

  return `<g class="${className}">${bonds}${atoms}</g>`;
};

const renderMoleculeGraphic = (
  node: MoleculeNode,
  adapterOptions: SvgAdapterOptions,
  accent: string
): string => {
  const sketchResult = parseSmilesSketch(node.smiles);
  const accentColor = escapeXml(accent);
  const rawSmiles = node.smiles?.trim() ?? "";
  const safeSmiles = escapeXml(rawSmiles || "N/A");

  if (sketchResult.status !== "ok") {
    const reason = escapeXml(sketchResult.reason);
    return `<g class="chemd-molecule-fallback"><circle cx="72" cy="86" r="24" fill="${accentColor}" fill-opacity="0.12" stroke="${accentColor}" stroke-width="2" /><path d="M72 62 L98 78 L98 110 L72 126 L46 110 L46 78 Z" fill="none" stroke="${accentColor}" stroke-width="${formatNumber(adapterOptions.bondLineWidth)}" stroke-linejoin="round" /><text x="116" y="88" font-size="${formatNumber(Math.max(8, adapterOptions.fixedFontSize - 1))}" fill="#334155">SMILES fallback: ${safeSmiles}</text><text x="116" y="104" font-size="${formatNumber(Math.max(7, adapterOptions.fixedFontSize - 2))}" fill="#64748b">${reason}</text></g>`;
  }
  const sketch = sketchResult.sketch;

  if (sketch.atoms.length === 1) {
    return `<g class="chemd-molecule-sketch"><circle cx="160" cy="90" r="20" fill="${accentColor}" fill-opacity="0.08" stroke="${accentColor}" stroke-width="${formatNumber(adapterOptions.bondLineWidth)}" /><text x="160" y="94" font-size="${formatNumber(adapterOptions.fixedFontSize + 4)}" text-anchor="middle" fill="#0f172a">${escapeXml(sketch.atoms[0] ?? "C")}</text></g>`;
  }

  const maxWidth = 236;
  const naturalStep = Math.max(15, Math.min(24, adapterOptions.fixedBondLength * 0.72));
  const naturalWidth = Math.max(0, sketch.atoms.length - 1) * naturalStep;
  const step = naturalWidth > maxWidth ? naturalStep * (maxWidth / naturalWidth) : naturalStep;
  const actualWidth = Math.max(0, sketch.atoms.length - 1) * step;
  const startX = 160 - actualWidth * 0.5;
  const amplitude = Math.max(7, step * 0.3);
  const bondOffset = Math.max(1.4, adapterOptions.multipleBondOffset * step * 0.8);
  const lineWidth = Math.max(1, adapterOptions.bondLineWidth);
  const atomFontSize = Math.max(9, adapterOptions.fixedFontSize - 1);

  return renderLinearSketch(
    sketch,
    startX,
    94,
    step,
    amplitude,
    atomFontSize,
    accent,
    lineWidth,
    bondOffset,
    "chemd-molecule-sketch"
  );
};

const renderReactionFragment = (
  value: string,
  startX: number,
  centerY: number,
  adapterOptions: SvgAdapterOptions,
  accent: string
): ReactionFragment => {
  const sketchResult = parseSmilesSketch(value);
  if (sketchResult.status !== "ok") {
    const width = estimateTextWidth(value, adapterOptions.fixedFontSize + 1);
    const reasonTitle = sketchResult.reason;
    return {
      width,
      markup: `<g class="chemd-reaction-fragment chemd-reaction-fragment--text"><text x="${formatNumber(startX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 1)}" font-weight="600" fill="#0f172a">${escapeXml(value)}</text><title>${escapeXml(reasonTitle)}</title></g>`
    };
  }
  const sketch = sketchResult.sketch;

  if (sketch.atoms.length < 2 || sketch.atoms.length > 7) {
    const width = estimateTextWidth(value, adapterOptions.fixedFontSize + 1);
    return {
      width,
      markup: `<g class="chemd-reaction-fragment chemd-reaction-fragment--text"><text x="${formatNumber(startX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 1)}" font-weight="600" fill="#0f172a">${escapeXml(value)}</text><title>SMILES fragment size outside sketch window</title></g>`
    };
  }

  const step = Math.max(11, Math.min(18, adapterOptions.fixedBondLength * 0.45));
  const width = Math.max(0, sketch.atoms.length - 1) * step + 10;
  const amplitude = Math.max(4, step * 0.28);
  const bondOffset = Math.max(1, adapterOptions.multipleBondOffset * step * 0.6);
  const atomFontSize = Math.max(8, adapterOptions.fixedFontSize - 2);
  const lineWidth = Math.max(1, adapterOptions.bondLineWidth * 0.9);

  return {
    width,
    markup: renderLinearSketch(
      sketch,
      startX + 5,
      centerY,
      step,
      amplitude,
      atomFontSize,
      accent,
      lineWidth,
      bondOffset,
      "chemd-reaction-fragment chemd-reaction-fragment--sketch"
    )
  };
};

const renderReactionSide = (
  values: string[],
  startX: number,
  centerY: number,
  maxWidth: number,
  adapterOptions: SvgAdapterOptions,
  accent: string,
  sideClass: "chemd-reaction-side--reactants" | "chemd-reaction-side--products",
  fallbackText: string
): string => {
  let cursor = startX;
  const nodes: string[] = [];
  const plusSlot = Math.max(10, adapterOptions.reactionPlusGap + 8);

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]?.trim() ?? "";
    if (!value) {
      continue;
    }

    const fragment = renderReactionFragment(value, cursor, centerY, adapterOptions, accent);
    if (cursor + fragment.width - startX > maxWidth) {
      return `<text class="chemd-reaction-fallback ${sideClass}" x="${formatNumber(startX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 1)}" font-weight="600" fill="#0f172a">${escapeXml(fallbackText)}</text>`;
    }

    nodes.push(fragment.markup);
    cursor += fragment.width;

    if (index < values.length - 1) {
      const plusX = cursor + plusSlot * 0.5;
      if (plusX - startX > maxWidth) {
        return `<text class="chemd-reaction-fallback ${sideClass}" x="${formatNumber(startX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 1)}" font-weight="600" fill="#0f172a">${escapeXml(fallbackText)}</text>`;
      }

      nodes.push(
        `<text class="chemd-reaction-side__plus ${sideClass}" x="${formatNumber(plusX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 2)}" font-weight="700" text-anchor="middle" fill="${escapeXml(accent)}">+</text>`
      );
      cursor += plusSlot;
    }
  }

  if (nodes.length === 0) {
    return `<text class="chemd-reaction-fallback ${sideClass}" x="${formatNumber(startX)}" y="${formatNumber(centerY + 4)}" font-size="${formatNumber(adapterOptions.fixedFontSize + 1)}" font-weight="600" fill="#0f172a">${escapeXml(fallbackText)}</text>`;
  }

  return `<g class="chemd-reaction-side ${sideClass}">${nodes.join("")}</g>`;
};

export const renderMoleculeSvg = (
  node: MoleculeNode,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): string => {
  const width = 320;
  const height = 182;
  const title = node.name ?? node.id ?? "Untitled molecule";
  const subtitle = node.smiles ?? node.formula ?? "No structure data";
  const adapterOptions = resolveAdapterOptions(options, adapterPayload);
  const accent = adapterOptions.monochrome ? "#111827" : "#0f766e";

  return [
    `<svg class="chemd-svg chemd-svg--molecule" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Molecule ${escapeXml(title)}">`,
    renderBackground(width, height, adapterOptions),
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="16" fill="none" stroke="#cbd5e1" stroke-width="1.5" />`,
    renderMoleculeGraphic(node, adapterOptions, accent),
    `<text x="20" y="30" font-size="${adapterOptions.fixedFontSize + 3}" font-weight="600" fill="#0f172a">${escapeXml(title)}</text>`,
    `<text x="20" y="148" font-size="${adapterOptions.fixedFontSize + 1}" fill="#1e293b">${escapeXml(subtitle)}</text>`,
    node.formula ? renderCaption("Formula", node.formula, 20, 164, adapterOptions.fixedFontSize) : "",
    node.amount ? renderCaption("Amount", node.amount, 20, 176, adapterOptions.fixedFontSize) : "",
    `</svg>`
  ].join("");
};

export const renderReactionSvg = (
  node: ReactionNode,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): string => {
  const width = 520;
  const height = 180;
  const reactants = joinReactionSide(node.reactants, "No reactants");
  const products = joinReactionSide(node.products, "No products");
  const reactantValues = reactants === "No reactants" ? ["No reactants"] : reactants.split(" + ");
  const productValues = products === "No products" ? ["No products"] : products.split(" + ");
  const conditionParts =
    node.conditions && node.conditions.length > 0
      ? node.conditions
      : [
          node.temperature,
          node.time,
          node.solvent ? `Solvent: ${node.solvent}` : undefined,
          node.catalyst ? `Catalyst: ${node.catalyst}` : undefined
        ].filter((value): value is string => Boolean(value));
  const conditions = conditionParts.join(" • ");
  const markerId = `arrow-${sanitizeId(node.id, "reaction")}`;
  const adapterOptions = resolveAdapterOptions(options, adapterPayload);
  const accent = adapterOptions.monochrome ? "#111827" : "#1d4ed8";
  const accentColor = escapeXml(accent);
  const arrowStart = 190;
  const arrowEnd = arrowStart + adapterOptions.reactionArrowLength + 70;
  const conditionY = adapterOptions.showConditionsBelowArrow ? 132 : 74;
  const rightStart = arrowEnd + adapterOptions.reactionComponentGap;
  const reactantGraphic = renderReactionSide(
    reactantValues,
    36,
    82,
    arrowStart - 56,
    adapterOptions,
    accent,
    "chemd-reaction-side--reactants",
    reactants
  );
  const productGraphic = renderReactionSide(
    productValues,
    rightStart,
    82,
    width - rightStart - 24,
    adapterOptions,
    accent,
    "chemd-reaction-side--products",
    products
  );

  return [
    `<svg class="chemd-svg chemd-svg--reaction" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Reaction ${escapeXml(node.id ?? "diagram")}">`,
    `<defs><marker id="${markerId}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L8 3 L0 6 Z" fill="${accentColor}" /></marker></defs>`,
    renderBackground(width, height, adapterOptions),
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="18" fill="none" stroke="#cbd5e1" stroke-width="1.5" />`,
    reactantGraphic,
    `<line x1="${arrowStart}" y1="82" x2="${arrowEnd}" y2="82" stroke="${accentColor}" stroke-width="${adapterOptions.bondLineWidth + 0.2}" marker-end="url(#${markerId})" />`,
    conditions ? `<text x="${arrowStart + 8}" y="${conditionY}" font-size="${adapterOptions.fixedFontSize - 1}" fill="#475569">${escapeXml(conditions)}</text>` : "",
    productGraphic,
    `<text class="chemd-reaction-side-label chemd-reaction-side-label--reactants" x="36" y="154" font-size="${adapterOptions.fixedFontSize - 1}" fill="#475569">${escapeXml(reactants)}</text>`,
    `<text class="chemd-reaction-side-label chemd-reaction-side-label--products" x="${rightStart}" y="154" font-size="${adapterOptions.fixedFontSize - 1}" fill="#475569">${escapeXml(products)}</text>`,
    `</svg>`
  ].join("");
};
