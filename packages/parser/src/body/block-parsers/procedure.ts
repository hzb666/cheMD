import {
  getAllowedBlockFieldSet,
  type Diagnostic,
  type ProcedureChildNode,
  type ProcedureControlKind,
  type ProcedureControlNode,
  type ProcedureNode,
  type ProcedureStepNode,
  type SourceSpan
} from "@chemd/core";

import {
  createBodyText,
  parseAllowedFields,
  parseAllowedFieldSpans,
  parseChildBlockFieldLine,
  readStringListField,
  readStructuredBlockId,
  splitLeadingFieldLines
} from "./common";
import { createMarkdownFromText } from "../parse-body-shared";
import type { BlockParser } from "./types";

const PROCEDURE_FIELDS = getAllowedBlockFieldSet("procedure");
const STEP_LINE_RE = /^\s*step\s*:\s*(.+)$/i;
const STEP_BLOCK_START_RE = /^\s*:::step(?:\s+(.*))?\s*$/i;
const CONTROL_BLOCK_START_RE = /^\s*(repeat|until|branch|parallel|case|default|path)\s*:\s*(.*?)\s*\{\s*$/i;
const CONTROL_LINE_RE = /^\s*(wait|abort_if)\s*:\s*(.+)$/i;
const STEP_STRUCTURAL_PARAM_KEYS = new Set([
  "id",
  "step_id",
  "family",
  "inputs",
  "outputs",
  "depends_on",
  "dependsOn",
  "stage",
  "purpose",
  "evidence",
  "confidence"
]);
const CONTROL_STRUCTURAL_PARAM_KEYS = new Set(["outputs"]);

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

const readStepConfidence = (params: Record<string, string>): number | undefined => {
  const raw = params.confidence;
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
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

const removeControlStructuralParams = (params: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter(([key]) => !CONTROL_STRUCTURAL_PARAM_KEYS.has(key)));

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
  const generatedStepId = step.stepId === undefined;
  const stepId = step.stepId ?? `${procedureId ?? "procedure"}:s${index + 1}`;

  return {
    ...step,
    stepId,
    ...(generatedStepId ? { generatedStepId } : {}),
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

const withControlMetadata = (
  control: ProcedureControlNode,
  procedureId: string | undefined
): ProcedureControlNode => ({
  ...control,
  provenance: {
    origin: "author",
    sourceNodeType: "procedure",
    sourceNodeId: procedureId,
    sourceField: control.kind,
    ruleId: "parser.author.control",
    ...(control.sourceSpan ? { sourceSpan: control.sourceSpan } : {}),
    confidence: 1
  }
});

const createStepNode = (
  family: string,
  params: Record<string, string>,
  raw: string,
  sourceSpan: SourceSpan
): ProcedureStepNode => {
  const stepParams = removeStructuralParams(params);
  const inputs = readStepList(params, "inputs");
  const outputs = readStepList(params, "outputs");
  const dependsOn = readStepList(params, "depends_on", "dependsOn");
  const evidence = readStepList(params, "evidence");
  const confidence = readStepConfidence(params);
  const step: ProcedureStepNode = {
    type: "step",
    family,
    raw,
    authorProvided: true,
    sourceSpan
  };

  if (params.id ?? params.step_id) {
    step.stepId = params.id ?? params.step_id;
  }
  if (params.stage) {
    step.stage = params.stage;
  }
  if (params.purpose) {
    step.purpose = params.purpose;
  }
  if (Object.keys(stepParams).length > 0) {
    step.params = stepParams;
  }
  if (inputs) {
    step.inputs = inputs;
  }
  if (outputs) {
    step.outputs = outputs;
  }
  if (dependsOn) {
    step.dependsOn = dependsOn;
  }
  if (evidence) {
    step.evidence = evidence;
  }
  if (confidence !== undefined) {
    step.confidence = confidence;
  }

  return step;
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

  return createStepNode(family, params, line.trim(), sourceSpan);
};

const parseControlHeader = (
  kind: ProcedureControlKind,
  rawHeader: string
): Pick<ProcedureControlNode, "controlId" | "params" | "outputs"> => {
  const segments = splitStepSegments(rawHeader);
  const [firstSegment = "", ...restSegments] = segments;
  const firstParam = readStepParam(firstSegment);
  const paramSegments = firstParam ? segments : restSegments;
  const params = Object.fromEntries(
    paramSegments.flatMap((segment) => {
      const param = readStepParam(segment);
      return param ? [param] : [];
    })
  );
  const controlId = kind === "default"
    ? undefined
    : firstParam ? undefined : firstSegment || undefined;
  const outputs = readStepList(params, "outputs");
  const controlParams = removeControlStructuralParams(params);

  return {
    ...(controlId ? { controlId } : {}),
    ...(Object.keys(controlParams).length > 0 ? { params: controlParams } : {}),
    ...(outputs ? { outputs } : {})
  };
};

const createControlNode = (
  kind: ProcedureControlKind,
  rawHeader: string,
  raw: string,
  sourceSpan: SourceSpan,
  children?: ProcedureChildNode[]
): ProcedureControlNode => ({
  type: "control",
  kind,
  ...parseControlHeader(kind, rawHeader),
  ...(children && children.length > 0 ? { children } : {}),
  raw,
  authorProvided: true,
  sourceSpan
});

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
  const evidence = splitChildBlockList(fields.evidence);
  const confidence = readStepConfidence(fields);

  return {
    type: "step",
    family,
    ...(stepId ? { stepId } : {}),
    ...(fields.stage ? { stage: fields.stage } : {}),
    ...(fields.purpose ? { purpose: fields.purpose } : {}),
    ...(Object.keys(stepParams).length > 0 ? { params: stepParams } : {}),
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    ...(evidence ? { evidence } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
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

interface ProcedureChildrenParseResult {
  bodyLines: string[];
  children: NonNullable<ProcedureNode["children"]>;
  controls: ProcedureControlNode[];
  closed: boolean;
  nextIndex: number;
  steps: ProcedureStepNode[];
}

const createProcedureControlDiagnostic = (
  diagnostics: Diagnostic[],
  code: string,
  message: string,
  procedureId: string | undefined
) => {
  diagnostics.push({
    code,
    severity: "error",
    message,
    sourceLayer: "parser",
    sourceNodeType: "procedure",
    sourceNodeId: procedureId
  });
};

const splitProcedureBodyAndChildren = (
  lines: string[],
  diagnostics: Diagnostic[],
  procedureId: string | undefined,
  startIndex = 0,
  stopOnBrace = false
): ProcedureChildrenParseResult => {
  const bodyLines: string[] = [];
  const bodyBuffer: string[] = [];
  const steps: ProcedureStepNode[] = [];
  const controls: ProcedureControlNode[] = [];
  const children: NonNullable<ProcedureNode["children"]> = [];
  let index = startIndex;

  const flushBodyChild = () => {
    const body = createBodyText(bodyBuffer);
    if (body) {
      children.push(createMarkdownFromText(body, diagnostics));
    }
    bodyBuffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "}") {
      if (stopOnBrace) {
        flushBodyChild();
        return { bodyLines, children, controls, steps, nextIndex: index + 1, closed: true };
      }

      createProcedureControlDiagnostic(
        diagnostics,
        "E_PROCEDURE_CONTROL_SYNTAX",
        "Unexpected procedure control closing brace.",
        procedureId
      );
      index += 1;
      continue;
    }

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

    const blockControlMatch = line.match(CONTROL_BLOCK_START_RE);
    if (blockControlMatch) {
      flushBodyChild();
      const nested = splitProcedureBodyAndChildren(lines, diagnostics, procedureId, index + 1, true);
      if (!nested.closed) {
        createProcedureControlDiagnostic(
          diagnostics,
          "E_PROCEDURE_CONTROL_UNCLOSED",
          `Procedure control ${blockControlMatch[1]} is missing a closing brace.`,
          procedureId
        );
      }
      const endIndex = nested.closed ? nested.nextIndex - 1 : Math.max(index, nested.nextIndex - 1);
      const control = withControlMetadata(
        createControlNode(
          blockControlMatch[1].toLowerCase() as ProcedureControlKind,
          blockControlMatch[2] ?? "",
          lines.slice(index, endIndex + 1).map((item) => item.trimEnd()).join("\n"),
          createLineSourceSpan(lines, index, endIndex),
          nested.children
        ),
        procedureId
      );
      controls.push(control, ...nested.controls);
      steps.push(...nested.steps);
      children.push(control);
      index = nested.nextIndex;
      continue;
    }

    const lineControlMatch = line.match(CONTROL_LINE_RE);
    if (lineControlMatch) {
      flushBodyChild();
      const control = withControlMetadata(
        createControlNode(
          lineControlMatch[1].toLowerCase() as ProcedureControlKind,
          lineControlMatch[2] ?? "",
          line.trim(),
          createLineSourceSpan(lines, index)
        ),
        procedureId
      );
      controls.push(control);
      children.push(control);
      index += 1;
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
  return { bodyLines, steps, children, controls, nextIndex: index, closed: !stopOnBrace };
};

export const parseProcedureBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, PROCEDURE_FIELDS);
  const parsedBody = splitProcedureBodyAndChildren(bodyLines, diagnostics, id);
  const fields = parseAllowedFields(fieldLines, diagnostics, "procedure", PROCEDURE_FIELDS, {
    listFields: new Set(["evidence"]),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(fieldLines, PROCEDURE_FIELDS, "procedure");

  return {
    type: "procedure",
    id,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    reaction: typeof fields.reaction === "string" ? fields.reaction : undefined,
    evidence: readStringListField(fields.evidence),
    fieldSpans,
    body: createBodyText(parsedBody.bodyLines),
    ...(parsedBody.steps.length > 0 ? { steps: parsedBody.steps } : {}),
    ...(parsedBody.controls.length > 0 ? { controls: parsedBody.controls } : {}),
    ...(parsedBody.children.length > 0 ? { children: parsedBody.children } : {})
  } as ProcedureNode;
};
