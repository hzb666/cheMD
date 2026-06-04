import type { DiagnosticSeverity } from "@chemd/core";
import type {
  DiagnosticBand,
  DiagnosticSpec
} from "./index";

export interface DiagnosticExplanation {
  band?: DiagnosticBand;
  code: string;
  defaultSeverity?: DiagnosticSeverity;
  known: boolean;
  source: "registry" | "legacy" | "unknown";
  title?: string;
}

export const explainDiagnosticCodeFrom = (
  code: string,
  spec: DiagnosticSpec | undefined,
  legacyBand: DiagnosticBand | undefined
): DiagnosticExplanation => {
  if (spec) {
    return {
      band: spec.band,
      code,
      defaultSeverity: spec.defaultSeverity,
      known: true,
      source: "registry",
      title: spec.title
    };
  }

  return legacyBand
    ? {
        band: legacyBand,
        code,
        known: true,
        source: "legacy",
        title: "Legacy diagnostic"
      }
    : {
        code,
        known: false,
        source: "unknown"
      };
};
