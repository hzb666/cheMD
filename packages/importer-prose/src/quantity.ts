import {
  QUANTITY_UNIT_SCHEMA,
  normalizeQuantityUnitKey
} from "@chemd/core";
import type { QuantityClass, QuantityUnitSchema } from "@chemd/core";

import type {
  ImportDiagnostic,
  ProseSourceSpan,
  QuantityMention
} from "./types";

interface UnitCandidate {
  quantityClass: QuantityClass;
  schema: QuantityUnitSchema;
  alias: string;
}

interface QuantityScanResult {
  quantities: QuantityMention[];
  diagnostics: ImportDiagnostic[];
}

const NUMBER_PATTERN = "[+-]?\\d+(?:\\.\\d+)?";
const UNKNOWN_UNIT_PATTERN = new RegExp(
  `(?<![A-Za-z0-9.])(${NUMBER_PATTERN})\\s+([A-Za-z°℃%][A-Za-z/%°℃-]*)`,
  "gu"
);

const createSpan = (sourceText: string, start: number, end: number): ProseSourceSpan => ({
  start,
  end,
  text: sourceText.slice(start, end)
});

const escapeRegExp = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createUnitCandidates = (): UnitCandidate[] =>
  (Object.entries(QUANTITY_UNIT_SCHEMA) as Array<[QuantityClass, Record<string, QuantityUnitSchema>]>)
    .flatMap(([quantityClass, units]) =>
      Object.values(units).flatMap((schema) =>
        [schema.unit, ...(schema.aliases ?? [])].map((alias) => ({
          quantityClass,
          schema,
          alias
        }))
      )
    )
    .sort((left, right) => right.alias.length - left.alias.length);

const UNIT_CANDIDATES = createUnitCandidates();

const createUnitPattern = (alias: string): RegExp => {
  if (alias === "%") {
    return new RegExp(`(?<![A-Za-z0-9.])(${NUMBER_PATTERN})(\\s*)(%)`, "gu");
  }

  const unitPattern = escapeRegExp(alias).replace(/\\ /g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9.])(${NUMBER_PATTERN})\\s+(${unitPattern})(?![A-Za-z0-9])`, "giu");
};

const overlaps = (left: QuantityMention, right: QuantityMention): boolean =>
  left.span.start < right.span.end && right.span.start < left.span.end;

const selectQuantityMentions = (quantities: readonly QuantityMention[]): QuantityMention[] => {
  const selected: QuantityMention[] = [];
  const sorted = [...quantities].sort((left, right) =>
    (right.span.end - right.span.start) - (left.span.end - left.span.start)
    || right.confidence - left.confidence
    || left.span.start - right.span.start
  );

  for (const quantity of sorted) {
    if (!selected.some((item) => overlaps(item, quantity))) {
      selected.push(quantity);
    }
  }

  return selected.sort((left, right) => left.span.start - right.span.start);
};

const createQuantity = (
  sourceText: string,
  match: RegExpMatchArray,
  unit: UnitCandidate,
  index: number
): QuantityMention | undefined => {
  if (match.index === undefined) return undefined;

  const raw = match[0];
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;

  return {
    id: `quantity:${index + 1}`,
    raw,
    value,
    unit: unit.schema.unit,
    canonicalUnit: unit.schema.canonicalUnit,
    span: createSpan(sourceText, match.index, match.index + raw.length),
    quantityClass: unit.quantityClass,
    confidence: 0.92
  };
};

const createPercentSpacingDiagnostic = (
  sourceText: string,
  quantity: QuantityMention
): ImportDiagnostic => ({
  code: "W_IMPORT_PERCENT_SPACING",
  severity: "warning",
  message: "Percent literals should be compact, for example 10% instead of 10 %.",
  span: createSpan(sourceText, quantity.span.start, quantity.span.end),
  facts: { raw: quantity.raw }
});

const createUnknownUnitDiagnostics = (
  sourceText: string,
  quantities: readonly QuantityMention[]
): ImportDiagnostic[] => {
  const diagnostics: ImportDiagnostic[] = [];

  for (const match of sourceText.matchAll(UNKNOWN_UNIT_PATTERN)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = match.index + match[0].length;
    if (quantities.some((quantity) => start < quantity.span.end && quantity.span.start < end)) {
      continue;
    }

    const unit = match[2];
    if (normalizeQuantityUnitKey(unit) in QUANTITY_UNIT_SCHEMA.percent) {
      continue;
    }

    diagnostics.push({
      code: "W_IMPORT_UNKNOWN_QUANTITY_UNIT",
      severity: "warning",
      message: "Unit-like prose token is not part of the Chemd quantity schema.",
      span: createSpan(sourceText, start, end),
      facts: {
        raw: match[0],
        unit
      }
    });
  }

  return diagnostics;
};

export const scanProseQuantities = (sourceText: string): QuantityScanResult => {
  const candidates: QuantityMention[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  let index = 0;

  for (const unit of UNIT_CANDIDATES) {
    for (const match of sourceText.matchAll(createUnitPattern(unit.alias))) {
      const quantity = createQuantity(sourceText, match, unit, index);
      if (!quantity) continue;
      index += 1;
      candidates.push(quantity);

      if (unit.alias === "%" && match[2]?.length) {
        diagnostics.push(createPercentSpacingDiagnostic(sourceText, quantity));
      }
    }
  }

  const quantities = selectQuantityMentions(candidates)
    .map((quantity, quantityIndex) => ({
      ...quantity,
      id: `quantity:${quantityIndex + 1}`
    }));

  return {
    quantities,
    diagnostics: [
      ...diagnostics,
      ...createUnknownUnitDiagnostics(sourceText, quantities)
    ]
  };
};
