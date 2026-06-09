import type {
  CompilerDiagnosis,
  CompilerDiagnosisManualItem,
  CompilerDiagnosisRequiredInput,
  CompilerDiagnosisSafeFix
} from "./diagnosis";

const pushSection = (lines: string[], title: string, items: string[]): void => {
  if (items.length === 0) {
    return;
  }

  if (lines.length > 0) {
    lines.push("");
  }
  lines.push(title, ...items);
};

const renderRequiredInput = (item: CompilerDiagnosisRequiredInput): string[] => {
  const title = item.checklistId ?? item.inputId;
  const missingItems = item.missingItems.length > 0
    ? item.missingItems.map((missing) => `  - ${missing}`)
    : [`  - ${item.title}`];

  return [`- ${title}:`, ...missingItems];
};

const renderManualItem = (item: CompilerDiagnosisManualItem): string =>
  `- ${item.diagnosticCode}: ${item.message}`;

const renderSafeFix = (item: CompilerDiagnosisSafeFix): string =>
  `- ${item.diagnosticCode}: ${item.quickFix.title}`;

export const renderDiagnosisForLlm = (diagnosis: CompilerDiagnosis): string => {
  const lines = [
    `Compiler status: ${diagnosis.status}`,
    "Summary:",
    `- errors: ${diagnosis.summary.errorCount}`,
    `- warnings: ${diagnosis.summary.warningCount}`,
    `- info: ${diagnosis.summary.infoCount}`,
    `- safe fixes: ${diagnosis.summary.safeFixCount}`,
    `- required inputs: ${diagnosis.summary.requiredInputCount}`,
    `- manual review: ${diagnosis.summary.manualReviewCount}`
  ];

  pushSection(lines, "Safe fixes:", diagnosis.safeFixes.map(renderSafeFix));
  pushSection(lines, "Required author input:", diagnosis.requiredInputs.flatMap(renderRequiredInput));
  pushSection(lines, "Manual review:", diagnosis.manualReviewItems.map(renderManualItem));
  pushSection(lines, "Next actions:", diagnosis.nextActions.map((action) => `- ${action}`));

  return lines.join("\n");
};
