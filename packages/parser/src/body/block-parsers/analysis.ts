import {
  getAllowedBlockFieldSet,
  resolveBlockField,
  type AnalysisNode,
  type TlcLaneEntryNode,
  type TlcLaneNode
} from "@chemd/core";

import { parseKeyValueLine } from "../parse-body-shared";
import { createLineSourceSpan, parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const ANALYSIS_FIELDS = getAllowedBlockFieldSet("analysis");

const LANE_FIELD_PATTERN = /^p\d+$/;
const TLC_ENTRY_FIELDS = new Set(["spot", "mess", "base", "none"]);
const LIST_FIELDS = new Set(["artifact", "peak", "ion"]);

const splitSegments = (value: string): string[] =>
  value
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

const splitAssignment = (segment: string): [string, string] | undefined => {
  const match = segment.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(.+)$/);
  return match ? [match[1], match[2].trim()] : undefined;
};

const parseLane = (raw: string, laneIndex: number, sourceIndex: number, lines: string[]): TlcLaneNode => {
  const [label = "", ...segments] = splitSegments(raw);
  const params = segments.reduce<Record<string, string>>((result, segment) => {
    const assignment = splitAssignment(segment);
    return assignment ? { ...result, [assignment[0]]: assignment[1] } : result;
  }, {});

  return {
    id: `lane${laneIndex + 1}`,
    label,
    ...(Object.keys(params).length > 0 ? { params } : {}),
    entries: [],
    sourceSpan: createLineSourceSpan(lines, sourceIndex)
  };
};

const createAnalysisDiagnostic = (
  diagnostics: Parameters<BlockParser>[0]["diagnostics"],
  id: string | undefined,
  code: string,
  message: string,
  field: string
) => {
  diagnostics.push({
    code,
    severity: "error",
    message,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "analysis",
    sourceNodeId: id,
    sourceField: field
  });
};

const applyTlcDefaults = (node: AnalysisNode): AnalysisNode => {
  if (node.type_name?.toLowerCase() !== "tlc") {
    return node;
  }

  return {
    ...node,
    plate: node.plate ?? "silica gel GF254",
    visualization: node.visualization ?? "UV 254 nm"
  };
};

export const parseAnalysisBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields: Record<string, string | string[]> = {};
  const peaks: string[] = [];
  const ions: string[] = [];
  const artifacts: string[] = [];
  const tlcLanes: TlcLaneNode[] = [];
  let currentLane: TlcLaneNode | undefined;

  const pushTlcEntry = (kind: TlcLaneEntryNode["kind"], raw: string, lineIndex: number) => {
    if (!currentLane) {
      createAnalysisDiagnostic(diagnostics, id, "E_TLC_LANE_REQUIRED", `${kind} requires a preceding lane.`, kind);
      return;
    }
    currentLane.entries.push({
      kind,
      raw,
      sourceSpan: createLineSourceSpan(lines, lineIndex)
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.toLowerCase() === "none") {
      pushTlcEntry("none", "", index);
      return;
    }

    const parsed = parseKeyValueLine(trimmed);
    if (!parsed) {
      return;
    }

    const resolved = resolveBlockField("analysis", parsed.key)?.canonicalName
      ?? (LANE_FIELD_PATTERN.test(parsed.key) ? parsed.key : undefined);
    if (!resolved) {
      createAnalysisDiagnostic(diagnostics, id, "W_UNKNOWN_FIELD", `Unknown field "${parsed.key}" on analysis`, parsed.key);
      return;
    }

    if (resolved === "lane") {
      currentLane = parseLane(parsed.rawValue, tlcLanes.length, index, lines);
      tlcLanes.push(currentLane);
      return;
    }

    if (TLC_ENTRY_FIELDS.has(resolved)) {
      pushTlcEntry(resolved as TlcLaneEntryNode["kind"], parsed.rawValue, index);
      return;
    }

    if (resolved === "peak") {
      peaks.push(parsed.rawValue.trim());
      return;
    }
    if (resolved === "ion") {
      ions.push(parsed.rawValue.trim());
      return;
    }
    if (resolved === "artifact") {
      artifacts.push(...splitSegments(parsed.rawValue));
      return;
    }

    if (LIST_FIELDS.has(resolved)) {
      const existing = Array.isArray(fields[resolved]) ? fields[resolved] as string[] : [];
      fields[resolved] = [...existing, parsed.rawValue.trim()];
      return;
    }

    fields[resolved] = parsed.rawValue.trim();
  });
  const fieldSpans = parseAllowedFieldSpans(lines, ANALYSIS_FIELDS, "analysis", {
    allowExtraField: (key) => LANE_FIELD_PATTERN.test(key)
  });
  const { type: analysisType, ...rest } = fields;

  return applyTlcDefaults({
    type: "analysis",
    id,
    fieldSpans,
    type_name: typeof analysisType === "string" ? analysisType : undefined,
    ...(artifacts.length > 0 ? { artifact: artifacts[0], artifacts } : {}),
    ...(peaks.length > 0 ? { peaks } : {}),
    ...(ions.length > 0 ? { ions } : {}),
    ...(tlcLanes.length > 0 ? { tlcLanes } : {}),
    ...rest
  } as AnalysisNode);
};
