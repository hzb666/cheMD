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
  source: "registry" | "unknown";
  title?: string;
}

export const explainDiagnosticCodeFrom = (
  code: string,
  spec: DiagnosticSpec | undefined
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

  return {
    code,
    known: false,
    source: "unknown"
  };
};
