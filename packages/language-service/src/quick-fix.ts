import {
  applyDiagnosticQuickFix,
  type DiagnosticQuickFix
} from "@chemd/compiler";
import type { Diagnostic } from "@chemd/core";
import {
  createDocumentRange,
  createSourceHash
} from "./ranges";
import type {
  ChemdQuickFixProposal,
  ChemdSourceRange
} from "./types";

const createQuickFixId = (
  diagnostic: Diagnostic,
  quickFix: DiagnosticQuickFix,
  index: number
): string => [
  diagnostic.code,
  diagnostic.sourceNodeId ?? diagnostic.nodeId ?? "document",
  quickFix.kind,
  String(index + 1)
].join(":");

export const buildQuickFixProposals = (
  source: string,
  diagnostic: Diagnostic,
  diagnosticRange: ChemdSourceRange
): ChemdQuickFixProposal[] => {
  const quickFixes = diagnostic.quickFixes ?? [];
  const beforeHash = createSourceHash(source);
  const documentRange = createDocumentRange(source);

  return quickFixes.map((quickFix, index) => {
    const replacement = applyDiagnosticQuickFix(source, diagnostic, quickFix);
    return {
      id: createQuickFixId(diagnostic, quickFix, index),
      title: quickFix.title,
      diagnosticCode: diagnostic.code,
      sourceRange: diagnosticRange,
      patch: {
        beforeHash,
        edits: [{
          range: documentRange,
          replacement
        }]
      }
    };
  });
};
