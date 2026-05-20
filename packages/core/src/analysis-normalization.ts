import type { AnalysisNode } from "./ast";
import { classifyTlcAnalysis, type NormalizedTlcAnalysis } from "./tlc-analysis";

export type NormalizedAnalysisKind =
  | "tlc"
  | "nmr"
  | "hplc"
  | "uplc"
  | "gc"
  | "gcms"
  | "lcms"
  | "ms"
  | "hrms"
  | "ir"
  | "uv";

export interface NmrSpectrumNode {
  raw: string;
  nucleus?: string;
  method?: string;
  frequency?: { raw: string; value: number; unit: string };
  solvent?: string;
}

export interface NmrPeakNode {
  raw: string;
  shift?: number;
  minShift?: number;
  maxShift?: number;
  multiplicity?: string;
  coupling?: string;
  integration?: string;
  siteLabel?: string;
}

export interface ChromatographyPeakNode {
  raw: string;
  retentionTime?: { raw: string; value: number; unit: string };
  areaPercent?: number;
  component?: string;
}

export interface MassIonNode {
  raw: string;
  mz?: number;
  adduct?: string;
  component?: string;
}

export type NormalizedAnalysis =
  | { kind: "tlc"; tlc: NormalizedTlcAnalysis }
  | { kind: "nmr"; spectrum?: NmrSpectrumNode; peaks: NmrPeakNode[] }
  | { kind: "hplc" | "uplc" | "gc"; peaks: ChromatographyPeakNode[] }
  | { kind: "gcms" | "lcms"; peaks: ChromatographyPeakNode[]; ions: MassIonNode[] }
  | { kind: "ms" | "hrms"; ions: MassIonNode[] }
  | { kind: "ir" | "uv"; rawData?: string };

const normalizeKind = (raw: string | undefined): NormalizedAnalysisKind | undefined => {
  const key = raw?.trim().toLowerCase().replace(/[-_\s]+/g, "");
  const aliases: Record<string, NormalizedAnalysisKind> = {
    tlc: "tlc",
    nmr: "nmr",
    hplc: "hplc",
    uplc: "uplc",
    gc: "gc",
    gcms: "gcms",
    lcms: "lcms",
    lc: "lcms",
    ms: "ms",
    hrms: "hrms",
    ir: "ir",
    uv: "uv",
    uvvis: "uv"
  };
  return key ? aliases[key] : undefined;
};

export const parseNmrSpectrum = (raw: string | undefined): NmrSpectrumNode | undefined => {
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/^(.+?)\s*\((.*?)\)\s*$/);
  const details = match?.[2]?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const frequency = details.find((item) => /^\d+(?:\.\d+)?\s*MHz$/i.test(item));
  const nucleus = raw.match(/^(?:\s*)?([0-9]+[A-Za-z]+)\s+NMR/i)?.[1];

  return {
    raw,
    ...(nucleus ? { nucleus } : {}),
    method: match?.[1]?.trim() ?? raw,
    ...(frequency
      ? {
          frequency: {
            raw: frequency,
            value: Number(frequency.match(/\d+(?:\.\d+)?/)?.[0]),
            unit: "MHz"
          }
        }
      : {}),
    ...(details.find((item) => item !== frequency) ? { solvent: details.find((item) => item !== frequency) } : {})
  };
};

export const parseNmrPeak = (raw: string): NmrPeakNode => {
  const match = raw.match(/^(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*\((.*)\)\s*$/);
  if (!match) {
    return { raw };
  }

  const parts = match[3].split(",").map((part) => part.trim()).filter(Boolean);
  const couplingIndex = parts.findIndex((part) => /^J\s*=/i.test(part));
  const couplingParts = couplingIndex >= 0 ? [parts[couplingIndex] as string] : [];
  for (let index = couplingIndex + 1; couplingIndex >= 0 && index < parts.length; index += 1) {
    const part = parts[index] as string;
    if (/^\d+(?:\.\d+)?\s*Hz$/i.test(part)) {
      couplingParts.push(part);
      continue;
    }
    break;
  }
  const coupling = couplingParts.length > 0 ? couplingParts.join(", ") : undefined;
  const integration = parts.find((part) => /^\d+(?:\.\d+)?\s*H$/i.test(part));
  const siteLabel = parts.find(
    (part) => part !== parts[0] && !couplingParts.includes(part) && part !== integration
  );

  return {
    raw,
    ...(match[2]
      ? { minShift: Number(match[2]), maxShift: Number(match[1]) }
      : { shift: Number(match[1]) }),
    ...(parts[0] ? { multiplicity: parts[0] } : {}),
    ...(coupling ? { coupling } : {}),
    ...(integration ? { integration } : {}),
    ...(siteLabel ? { siteLabel } : {})
  };
};

export const parseChromatographyPeak = (raw: string): ChromatographyPeakNode => {
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(min|s)\s*(?:\((.*?)\))?\s*$/i);
  if (!match) {
    return { raw };
  }

  const parts = match[3]?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  const area = parts.find((part) => /^\d+(?:\.\d+)?\s*%$/.test(part));
  const component = parts.find((part) => part !== area);

  return {
    raw,
    retentionTime: { raw: `${match[1]} ${match[2]}`, value: Number(match[1]), unit: match[2].toLowerCase() },
    ...(area ? { areaPercent: Number(area.replace("%", "").trim()) } : {}),
    ...(component ? { component } : {})
  };
};

export const parseMassIon = (raw: string): MassIonNode => {
  const match = raw.match(/^m\/z\s+(\d+(?:\.\d+)?)\s*(?:\((.*?)\))?\s*$/i);
  if (!match) {
    return { raw };
  }

  const parts = match[2]?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return {
    raw,
    mz: Number(match[1]),
    ...(parts[0] ? { adduct: parts[0] } : {}),
    ...(parts[1] ? { component: parts[1] } : {})
  };
};

export const normalizeAnalysis = (node: AnalysisNode): NormalizedAnalysis | undefined => {
  const kind = normalizeKind(node.type_name);
  if (!kind) {
    return undefined;
  }

  if (kind === "tlc") {
    const tlc = classifyTlcAnalysis(node);
    return tlc ? { kind, tlc } : undefined;
  }
  if (kind === "nmr") {
    return {
      kind,
      ...(node.spectrum ? { spectrum: parseNmrSpectrum(node.spectrum) } : {}),
      peaks: (node.peaks ?? []).map(parseNmrPeak)
    };
  }
  if (kind === "hplc" || kind === "uplc" || kind === "gc") {
    return { kind, peaks: (node.peaks ?? []).map(parseChromatographyPeak) };
  }
  if (kind === "gcms" || kind === "lcms") {
    return {
      kind,
      peaks: (node.peaks ?? []).map(parseChromatographyPeak),
      ions: (node.ions ?? []).map(parseMassIon)
    };
  }
  if (kind === "ms" || kind === "hrms") {
    return { kind, ions: (node.ions ?? []).map(parseMassIon) };
  }

  return { kind, rawData: node.data };
};
