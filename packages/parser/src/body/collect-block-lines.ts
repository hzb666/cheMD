import type { Diagnostic } from "@chemd/core";

const NESTED_CHILD_BLOCKS: Record<string, Set<string>> = {
  procedure: new Set(["step"]),
  observation: new Set(["event"])
};

const isBlockTypeStart = (char: string): boolean => char >= "a" && char <= "z";

const isBlockTypePart = (char: string): boolean =>
  isBlockTypeStart(char) || (char >= "0" && char <= "9") || char === "_";

const readColBraceState = (trimmed: string): "open" | "close" | "none" => {
  if (trimmed === "}" || trimmed === ":::}") {
    return "close";
  }

  if (!trimmed.startsWith("col:")) {
    return "none";
  }

  const value = trimmed.slice(4).trim();
  if (!value.startsWith("{")) {
    return "none";
  }

  return value.endsWith("}") && value.length > 1 ? "none" : "open";
};

const readBlockTypeName = (trimmed: string): { blockType: string; index: number } | undefined => {
  let index = 3;
  if (!isBlockTypeStart(trimmed[index] ?? "")) return undefined;
  let blockType = "";

  while (index < trimmed.length) {
    const char = trimmed[index];
    if (isBlockTypePart(char)) {
      blockType += char;
      index += 1;
      continue;
    }
    if (char === "-" && isBlockTypeStart(trimmed[index + 1] ?? "")) {
      blockType += char;
      index += 1;
      continue;
    }
    break;
  }

  return { blockType, index };
};

const readNumericBlockSuffixEnd = (trimmed: string, index: number): number | undefined => {
  if (trimmed[index] === "-") {
    index += 1;
    let digitCount = 0;
    while (trimmed[index] >= "0" && trimmed[index] <= "9") {
      index += 1;
      digitCount += 1;
    }
    if (digitCount === 0) return undefined;
  }

  return index;
};

const readBlockType = (trimmed: string): string | undefined => {
  if (!trimmed.startsWith(":::")) return undefined;

  const blockName = readBlockTypeName(trimmed);
  if (!blockName) return undefined;

  const index = readNumericBlockSuffixEnd(trimmed, blockName.index);
  if (index === undefined) return undefined;

  if (index < trimmed.length && trimmed[index] !== " " && trimmed[index] !== "\t") {
    return undefined;
  }
  return blockName.blockType;
};

const startsNestedChildBlock = (parentBlockType: string, trimmed: string): boolean => {
  const childTypes = NESTED_CHILD_BLOCKS[parentBlockType];
  const blockType = readBlockType(trimmed);

  return Boolean(blockType && childTypes?.has(blockType));
};

export const collectBraceBlockLines = (
  lines: string[],
  startIndex: number
): { lines: string[]; nextIndex: number; terminated: boolean } => {
  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::}") {
      return { lines: collected, nextIndex: index + 1, terminated: true };
    }

    collected.push(line);
    index += 1;
  }

  return { lines: collected, nextIndex: index, terminated: false };
};

export const collectStructuredBlockLines = (
  blockType: string,
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number
): { blockLines: string[]; nextIndex: number; terminated: boolean } => {
  const blockLines: string[] = [];
  let index = startIndex;
  let braceDepth = 0;
  let nestedChildDepth = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (blockType === "col") {
      const braceState = readColBraceState(trimmed);

      if (braceState === "open") {
        braceDepth += 1;
      } else if (braceState === "close" && braceDepth > 0) {
        braceDepth -= 1;
      }
    }

    if (startsNestedChildBlock(blockType, trimmed)) {
      nestedChildDepth += 1;
      blockLines.push(line);
      index += 1;
      continue;
    }

    if (trimmed === ":::" && nestedChildDepth > 0) {
      nestedChildDepth -= 1;
      blockLines.push(line);
      index += 1;
      continue;
    }

    if (trimmed === ":::" && (blockType !== "col" || braceDepth === 0)) {
      return { blockLines, nextIndex: index + 1, terminated: true };
    }

    blockLines.push(line);
    index += 1;
  }

  if (blockType === "col" && braceDepth > 0) {
    diagnostics.push({
      code: "W_UNTERMINATED_BRACE_BLOCK",
      severity: "warning",
      message: "Unterminated brace block inside col block"
    });
  }

  return { blockLines, nextIndex: index, terminated: false };
};
