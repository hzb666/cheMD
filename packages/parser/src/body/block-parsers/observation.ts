import type { Diagnostic, ObservationEventAuthorNode, ObservationNode, SourceSpan } from "@chemd/core";

import {
  createBodyText,
  parseAllowedFields,
  parseAllowedFieldSpans,
  parseChildBlockFieldLine,
  readStructuredBlockId,
  splitLeadingFieldLines
} from "./common";
import { createMarkdownFromText } from "../parse-body-shared";
import type { BlockParser } from "./types";

const OBSERVATION_FIELDS = new Set(["ref"]);
const EVENT_LINE_RE = /^\s*event\s*:\s*(.+)$/i;
const EVENT_BLOCK_START_RE = /^\s*:::event(?:\s+(.*))?\s*$/i;
const EVENT_STRUCTURAL_PARAM_KEYS = new Set([
  "id",
  "event_id",
  "type",
  "eventType",
  "event_type",
  "stage",
  "timepoint",
  "severity",
  "linked_step",
  "linkedStep",
  "evidence",
  "confidence"
]);

const splitEventSegments = (value: string): string[] =>
  value
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

const readEventParam = (segment: string): [string, string] | undefined => {
  const separatorIndex = segment.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = segment.slice(0, separatorIndex).trim();
  const value = segment.slice(separatorIndex + 1).trim();
  return key && value ? [key, value] : undefined;
};

const removeStructuralParams = (params: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter(([key]) => !EVENT_STRUCTURAL_PARAM_KEYS.has(key)));

const readEventType = (
  firstParam: [string, string] | undefined,
  firstSegment: string,
  params: Record<string, string>
): string =>
  firstParam
    ? params.eventType ?? params.event_type ?? params.type ?? ""
    : firstSegment;

const readEventId = (params: Record<string, string>): string | undefined =>
  params.id ?? params.event_id;

const readLinkedStepId = (params: Record<string, string>): string | undefined =>
  params.linked_step ?? params.linkedStep;

const readEventList = (params: Record<string, string>, key: string): string[] | undefined => {
  const raw = params[key];
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
};

const readEventConfidence = (params: Record<string, string>): number | undefined => {
  const raw = params.confidence;
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

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

const withEventMetadata = (
  event: ObservationEventAuthorNode,
  observationId: string | undefined,
  index: number
): ObservationEventAuthorNode => {
  const eventId = event.eventId ?? `${observationId ?? "observation"}:e${index + 1}`;

  return {
    ...event,
    eventId,
    provenance: {
      origin: "author",
      sourceNodeType: "event",
      sourceNodeId: eventId,
      sourceField: "event",
      ruleId: "parser.author.event",
      ...(event.sourceSpan ? { sourceSpan: event.sourceSpan } : {}),
      confidence: 1
    }
  };
};

const parseEventLine = (line: string, sourceSpan: SourceSpan): ObservationEventAuthorNode | undefined => {
  const match = line.match(EVENT_LINE_RE);
  if (!match) {
    return undefined;
  }

  const segments = splitEventSegments(match[1] ?? "");
  const [firstSegment = "", ...restSegments] = segments;
  const firstParam = readEventParam(firstSegment);
  const paramSegments = firstParam ? segments : restSegments;
  const params = Object.fromEntries(
    paramSegments.flatMap((segment) => {
      const param = readEventParam(segment);
      return param ? [param] : [];
    })
  );
  const eventParams = removeStructuralParams(params);
  const eventType = readEventType(firstParam, firstSegment, params);
  const eventId = readEventId(params);
  const linkedStepId = readLinkedStepId(params);
  const evidence = readEventList(params, "evidence");
  const confidence = readEventConfidence(params);

  return {
    type: "event",
    eventType,
    ...(eventId ? { eventId } : {}),
    ...(params.stage ? { stage: params.stage } : {}),
    ...(params.timepoint ? { timepoint: params.timepoint } : {}),
    ...(params.severity ? { severity: params.severity } : {}),
    ...(linkedStepId ? { linkedStepId } : {}),
    ...(evidence ? { evidence } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(Object.keys(eventParams).length > 0 ? { params: eventParams } : {}),
    raw: line.trim(),
    authorProvided: true,
    sourceSpan
  };
};

const parseNestedEventFields = (
  headerArg: string | undefined,
  lines: string[],
  raw: string,
  sourceSpan: SourceSpan
): ObservationEventAuthorNode | undefined => {
  const fields = Object.fromEntries(
    lines.flatMap((line) => {
      const parsed = parseChildBlockFieldLine(line.trim());
      return parsed ? [[parsed.key, parsed.rawValue.trim()]] : [];
    })
  );
  const eventType = fields.eventType ?? fields.event_type ?? fields.type;
  if (!eventType) {
    return undefined;
  }

  const eventId = fields.id ?? fields.event_id ?? readChildBlockId(headerArg);
  const eventParams = removeStructuralParams(fields);
  const linkedStepId = readLinkedStepId(fields);
  const evidence = readEventList(fields, "evidence");
  const confidence = readEventConfidence(fields);

  return {
    type: "event",
    eventType,
    ...(eventId ? { eventId } : {}),
    ...(fields.stage ? { stage: fields.stage } : {}),
    ...(fields.timepoint ? { timepoint: fields.timepoint } : {}),
    ...(fields.severity ? { severity: fields.severity } : {}),
    ...(linkedStepId ? { linkedStepId } : {}),
    ...(evidence ? { evidence } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(Object.keys(eventParams).length > 0 ? { params: eventParams } : {}),
    raw,
    authorProvided: true,
    sourceSpan
  };
};

const parseNestedEventBlock = (
  lines: string[],
  startIndex: number
): { event?: ObservationEventAuthorNode; nextIndex: number } | undefined => {
  const match = lines[startIndex].match(EVENT_BLOCK_START_RE);
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
    event: parseNestedEventFields(
      match[1],
      blockLines,
      rawLines.map((line) => line.trimEnd()).join("\n"),
      createLineSourceSpan(lines, startIndex, index < lines.length ? index : Math.max(startIndex, index - 1))
    ),
    nextIndex: index < lines.length ? index + 1 : index
  };
};

const splitObservationBodyAndEvents = (
  lines: string[],
  diagnostics: Diagnostic[],
  observationId: string | undefined
): {
  bodyLines: string[];
  events: ObservationEventAuthorNode[];
  children: NonNullable<ObservationNode["children"]>;
} => {
  const bodyLines: string[] = [];
  const bodyBuffer: string[] = [];
  const events: ObservationEventAuthorNode[] = [];
  const children: NonNullable<ObservationNode["children"]> = [];
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
    const nestedEvent = parseNestedEventBlock(lines, index);
    if (nestedEvent) {
      flushBodyChild();
      if (nestedEvent.event) {
        const event = withEventMetadata(nestedEvent.event, observationId, events.length);
        events.push(event);
        children.push(event);
      }
      index = nestedEvent.nextIndex;
      continue;
    }

    const event = parseEventLine(line, createLineSourceSpan(lines, index));
    if (event) {
      flushBodyChild();
      const eventWithMetadata = withEventMetadata(event, observationId, events.length);
      events.push(eventWithMetadata);
      children.push(eventWithMetadata);
      index += 1;
      continue;
    }

    bodyLines.push(line);
    bodyBuffer.push(line);
    index += 1;
  }

  flushBodyChild();
  return { bodyLines, events, children };
};

export const parseObservationBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, OBSERVATION_FIELDS);
  const parsedBody = splitObservationBodyAndEvents(bodyLines, diagnostics, id);
  const fields = parseAllowedFields(fieldLines, diagnostics, "observation", OBSERVATION_FIELDS, {
    listFields: new Set()
  });
  const fieldSpans = parseAllowedFieldSpans(fieldLines, OBSERVATION_FIELDS);

  return {
    type: "observation",
    id,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    fieldSpans,
    body: createBodyText(parsedBody.bodyLines),
    ...(parsedBody.events.length > 0 ? { events: parsedBody.events } : {}),
    ...(parsedBody.children.length > 0 ? { children: parsedBody.children } : {})
  } as ObservationNode;
};
