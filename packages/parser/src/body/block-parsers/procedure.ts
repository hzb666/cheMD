import type { Diagnostic, ProcedureNode, ProcedureStepNode, SourceSpan } from "@chemd/core";

import {
  createBodyText,
  parseAllowedFields,
  parseChildBlockFieldLine,
  readStructuredBlockId,
  splitLeadingFieldLines
} from "./common";
import { createMarkdownFromText } from "../parse-body-shared";
import type { BlockParser } from "./types";

const PROCEDURE_FIELDS = new Set(["ref"]);
const STEP_LINE_RE = /^\s*step\s*:\s*(.+)$/i;
const STEP_BLOCK_START_RE = /^\s*:::step(?:\s+(.*))?\s*$/i;
const STEP_STRUCTURAL_PARAM_KEYS = new Set([
  "id",
  "step_id",
  "family",
  "inputs",
  "outputs",
  "depends_on",
  "dependsOn"
]);

const splitStepSegments = (value: string): string[] =>
  value
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

const readStepParam = (segment: string): [string, string] | undefined => {
  const separatorIndex = segment.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = segment.slice(0, separatorIndex).trim();
  const value = segment.slice(separatorIndex + 1).trim();
  return key && value ? [key, value] : undefined;
};

const readStepList = (params: Record<string, string>, ...keys: string[]): string[] | undefined => {
  const raw = keys.map((key) => params[key]).find((value) => value);
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
};

const splitChildBlockList = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  const values = value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
};

const removeStructuralParams = (params: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter(([key]) => !STEP_STRUCTURAL_PARAM_KEYS.has(key)));

const readChildBlockId = (headerArg: string | undefined): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
};

const createLineSourceSpan = (lines: string[], startIndex: number, endIndex = startIndex): SourceSpan => ({
  startLine: startIndex + 1,
  endLine: endIndex + 1,
  startColumn: 1,
  endColumn: (lines[endIndex]?.length ?? 0) + 1
});

const withStepMetadata = (
  step: ProcedureStepNode,
  procedureId: string | undefined,
  index: number
): ProcedureStepNode => {
  const stepId = step.stepId ?? `${procedureId ?? "procedure"}:s${index + 1}`;

  return {
    ...step,
    stepId,
    provenance: {
      origin: "author",
      sourceNodeType: "step",
      sourceNodeId: stepId,
      sourceField: "step",
      ruleId: "parser.author.step",
      ...(step.sourceSpan ? { sourceSpan: step.sourceSpan } : {}),
      confidence: 1
    }
  };
};

const parseStepLine = (line: string, sourceSpan: SourceSpan): ProcedureStepNode | undefined => {
  const match = line.match(STEP_LINE_RE);
  if (!match) {
    return undefined;
  }

  const segments = splitStepSegments(match[1] ?? "");
  const [firstSegment = "", ...restSegments] = segments;
  const firstParam = readStepParam(firstSegment);
  const paramSegments = firstParam ? segments : restSegments;
  const params = Object.fromEntries(
    paramSegments.flatMap((segment) => {
      const param = readStepParam(segment);
      return param ? [param] : [];
    })
  );
  const family = firstParam ? params.family ?? "" : firstSegment;
  const stepId = params.id ?? params.step_id;
  const stepParams = removeStructuralParams(params);
  const inputs = readStepList(params, "inputs");
  const outputs = readStepList(params, "outputs");
  const dependsOn = readStepList(params, "depends_on", "dependsOn");

  return {
    type: "step",
    family,
    ...(stepId ? { stepId } : {}),
    ...(Object.keys(stepParams).length > 0 ? { params: stepParams } : {}),
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    raw: line.trim(),
    authorProvided: true,
    sourceSpan
  };
};

const parseNestedStepFields = (
  headerArg: string | undefined,
  lines: string[],
  raw: string,
  sourceSpan: SourceSpan
): ProcedureStepNode | undefined => {
  const fields = Object.fromEntries(
    lines.flatMap((line) => {
      const parsed = parseChildBlockFieldLine(line.trim());
      return parsed ? [[parsed.key, parsed.rawValue.trim()]] : [];
    })
  );
  const family = fields.family;
  if (!family) {
    return undefined;
  }

  const stepId = fields.id ?? fields.step_id ?? readChildBlockId(headerArg);
  const stepParams = removeStructuralParams(fields);
  const inputs = splitChildBlockList(fields.inputs);
  const outputs = splitChildBlockList(fields.outputs);
  const dependsOn = splitChildBlockList(fields.dependsOn ?? fields.depends_on);

  return {
    type: "step",
    family,
    ...(stepId ? { stepId } : {}),
    ...(Object.keys(stepParams).length > 0 ? { params: stepParams } : {}),
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    raw,
    authorProvided: true,
    sourceSpan
  };
};

const parseNestedStepBlock = (
  lines: string[],
  startIndex: number
): { step?: ProcedureStepNode; nextIndex: number } | undefined => {
  const match = lines[startIndex].match(STEP_BLOCK_START_RE);
  if (!match) {
    return undefined;
  }

  const blockLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && lines[index].trim() !== ":::") {
    blockLines.push(lines[index]);
    index += 1;
  }

  const rawLines = [lines[startIndex], ...blockLines, ...(index < lines.length ? [lines[index]] : [])];
  return {
    step: parseNestedStepFields(
      match[1],
      blockLines,
      rawLines.map((line) => line.trimEnd()).join("\n"),
      createLineSourceSpan(lines, startIndex, index < lines.length ? index : Math.max(startIndex, index - 1))
    ),
    nextIndex: index < lines.length ? index + 1 : index
  };
};

const splitProcedureBodyAndSteps = (
  lines: string[],
  diagnostics: Diagnostic[],
  procedureId: string | undefined
): { bodyLines: string[]; steps: ProcedureStepNode[]; children: NonNullable<ProcedureNode["children"]> } => {
  const bodyLines: string[] = [];
  const bodyBuffer: string[] = [];
  const steps: ProcedureStepNode[] = [];
  const children: NonNullable<ProcedureNode["children"]> = [];
  let index = 0;

  const flushBodyChild = () => {
    const body = createBodyText(bodyBuffer);
    if (body) {
      children.push(createMarkdownFromText(body, diagnostics));
    }
    bodyBuffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];
    const nestedStep = parseNestedStepBlock(lines, index);
    if (nestedStep) {
      flushBodyChild();
      if (nestedStep.step) {
        const step = withStepMetadata(nestedStep.step, procedureId, steps.length);
        steps.push(step);
        children.push(step);
      }
      index = nestedStep.nextIndex;
      continue;
    }

    const step = parseStepLine(line, createLineSourceSpan(lines, index));
    if (step) {
      flushBodyChild();
      const stepWithMetadata = withStepMetadata(step, procedureId, steps.length);
      steps.push(stepWithMetadata);
      children.push(stepWithMetadata);
      index += 1;
      continue;
    }

    bodyLines.push(line);
    bodyBuffer.push(line);
    index += 1;
  }

  flushBodyChild();
  return { bodyLines, steps, children };
};

export const parseProcedureBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, PROCEDURE_FIELDS);
  const parsedBody = splitProcedureBodyAndSteps(bodyLines, diagnostics, id);
  const fields = parseAllowedFields(fieldLines, diagnostics, "procedure", PROCEDURE_FIELDS, {
    listFields: new Set()
  });

  return {
    type: "procedure",
    id,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    body: createBodyText(parsedBody.bodyLines),
    ...(parsedBody.steps.length > 0 ? { steps: parsedBody.steps } : {}),
    ...(parsedBody.children.length > 0 ? { children: parsedBody.children } : {})
  } as ProcedureNode;
};
