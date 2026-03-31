import { LineCounter, isMap, isScalar, isSeq } from "yaml";

export const getLineInfoFromOffset = (
  offset: number | undefined,
  lineCounter: LineCounter,
  lines: string[]
): { lineIndex: number; lineText: string } => {
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return {
      lineIndex: 0,
      lineText: lines[0] ?? ""
    };
  }

  const position = lineCounter.linePos(Math.max(offset, 0));
  const lineIndex = Math.max(position.line - 1, 0);

  return {
    lineIndex,
    lineText: lines[lineIndex] ?? ""
  };
};

export const getNestedNodeOffset = (node: unknown): number | undefined => {
  if (isMap(node)) {
    const mapNode = node as {
      items: Array<{ key?: { range?: [number, number?, number?] } }>;
      range?: [number, number?, number?];
    };

    return mapNode.items[0]?.key?.range?.[0] ?? mapNode.range?.[0];
  }

  if (isSeq(node)) {
    const sequenceNode = node as {
      items: Array<{ range?: [number, number?, number?] }>;
      range?: [number, number?, number?];
    };

    return sequenceNode.items[0]?.range?.[0] ?? sequenceNode.range?.[0];
  }

  return undefined;
};

export const getNodeLineSpan = (
  node: unknown,
  lineCounter: LineCounter
): { startLine: number; endLine: number } | undefined => {
  const rangedNode = node as { range?: [number, number?, number?] } | undefined;

  if (!rangedNode?.range || typeof rangedNode.range[0] !== "number") {
    return undefined;
  }

  const startOffset = rangedNode.range[0];
  const endOffset =
    typeof rangedNode.range[1] === "number"
      ? Math.max(rangedNode.range[1] - 1, startOffset)
      : startOffset;

  return {
    startLine: lineCounter.linePos(startOffset).line,
    endLine: lineCounter.linePos(endOffset).line
  };
};

export const getYamlMapKey = (keyNode: unknown): string | undefined => {
  if (isScalar(keyNode) && typeof keyNode.value === "string") {
    return keyNode.value;
  }

  if (isScalar(keyNode) && keyNode.value !== undefined && keyNode.value !== null) {
    return String(keyNode.value);
  }

  return undefined;
};

export const toPlainYamlValue = (node: unknown): unknown => {
  if (node === undefined || node === null) {
    return "";
  }

  if (isScalar(node)) {
    return node.value;
  }

  if (isSeq(node)) {
    return node.items.map((item) => toPlainYamlValue(item));
  }

  if (isMap(node)) {
    const value: Record<string, unknown> = {};

    for (const item of node.items) {
      const key = getYamlMapKey(item.key);

      if (!key) {
        continue;
      }

      value[key] = toPlainYamlValue(item.value);
    }

    return value;
  }

  return "";
};
