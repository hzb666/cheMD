import {
  getAllowedBlockFieldSet,
  type Diagnostic,
  type SourceSpan,
  type TraceEventAuthorNode,
  type TraceNode
} from "@chemd/core";

import {
  createBodyText,
  parseAllowedFields,
  parseAllowedFieldSpans,
  readStructuredBlockId,
  splitLeadingFieldLines
} from "./common";
import { createMarkdownFromText } from "../parse-body-shared";
import type { BlockParser } from "./types";

const TRACE_FIELDS = getAllowedBlockFieldSet("trace");
const TRACE_EVENT_LINE_RE = /^\s*event\s*:\s*(.+)$/i;
const TRACE_EVENT_STRUCTURAL_KEYS = new Set([
  "id",
  "event_id",
  "type",
  "at",
  "step",
  "stepId",
  "step_id",
  "control",
  "controlId",
  "control_id",
  "artifact",
  "analysis",
  "result"
]);

const splitSegments = (value: string): string[] =>
  value
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

const readParam = (segment: string): [string, string] | undefined => {
  const separatorIndex = segment.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = segment.slice(0, separatorIndex).trim();
  const value = segment.slice(separatorIndex + 1).trim();
  return key && value ? [key, trimQuotes(value)] : undefined;
};

const trimQuotes = (value: string): string =>
  value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")
    ? value.slice(1, -1)
    : value;

const createLineSourceSpan = (lines: string[], index: number): SourceSpan => ({
  startLine: index + 1,
  endLine: index + 1,
  startColumn: 1,
  endColumn: (lines[index]?.length ?? 0) + 1
});

const removeStructuralParams = (params: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter(([key]) => !TRACE_EVENT_STRUCTURAL_KEYS.has(key)));

const parseTraceEventLine = (
  line: string,
  sourceSpan: SourceSpan
): TraceEventAuthorNode | undefined => {
  const match = line.match(TRACE_EVENT_LINE_RE);
  if (!match) {
    return undefined;
  }

  const segments = splitSegments(match[1] ?? "");
  const [eventType = "", ...restSegments] = segments;
  const params = Object.fromEntries(
    restSegments.flatMap((segment) => {
      const param = readParam(segment);
      return param ? [param] : [];
    })
  );
  const eventId = params.id ?? params.event_id;
  const stepId = params.step ?? params.stepId ?? params.step_id;
  const controlId = params.control ?? params.controlId ?? params.control_id;
  const eventParams = removeStructuralParams(params);

  return {
    type: "trace_event",
    eventType,
    ...(eventId ? { eventId } : {}),
    ...(params.at ? { at: params.at } : {}),
    ...(stepId ? { stepId } : {}),
    ...(controlId ? { controlId } : {}),
    ...(params.artifact ? { artifact: params.artifact } : {}),
    ...(params.analysis ? { analysis: params.analysis } : {}),
    ...(params.result ? { result: params.result } : {}),
    ...(Object.keys(eventParams).length > 0 ? { params: eventParams } : {}),
    raw: line.trim(),
    authorProvided: true,
    sourceSpan,
    provenance: {
      origin: "author",
      sourceNodeType: "trace",
      sourceField: "event",
      ruleId: "parser.author.trace_event",
      sourceSpan,
      confidence: 1
    }
  };
};

const splitTraceBodyAndEvents = (
  lines: string[],
  diagnostics: Diagnostic[]
): { bodyLines: string[]; children: NonNullable<TraceNode["children"]>; events: TraceEventAuthorNode[] } => {
  const bodyLines: string[] = [];
  const bodyBuffer: string[] = [];
  const events: TraceEventAuthorNode[] = [];
  const children: NonNullable<TraceNode["children"]> = [];

  const flushBodyChild = () => {
    const body = createBodyText(bodyBuffer);
    if (body) {
      children.push(createMarkdownFromText(body, diagnostics));
    }
    bodyBuffer.length = 0;
  };

  lines.forEach((line, index) => {
    const event = parseTraceEventLine(line, createLineSourceSpan(lines, index));
    if (event) {
      flushBodyChild();
      events.push(event);
      children.push(event);
      return;
    }

    bodyLines.push(line);
    bodyBuffer.push(line);
  });

  flushBodyChild();
  return { bodyLines, children, events };
};

export const parseTraceBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, TRACE_FIELDS);
  const parsedBody = splitTraceBodyAndEvents(bodyLines, diagnostics);
  const fields = parseAllowedFields(fieldLines, diagnostics, "trace", TRACE_FIELDS, {
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(fieldLines, TRACE_FIELDS, "trace");

  return {
    type: "trace",
    id,
    plan: typeof fields.plan === "string" ? fields.plan : undefined,
    mode: typeof fields.mode === "string" ? fields.mode : undefined,
    fieldSpans,
    ...(parsedBody.events.length > 0 ? { events: parsedBody.events } : {}),
    ...(parsedBody.children.length > 0 ? { children: parsedBody.children } : {})
  } as TraceNode;
};
