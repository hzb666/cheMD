const LEGACY_OPEN_RE = /^:::(molecule|reaction)(\b.*)?$/;
const KIND_RE = /^\s*kind\s*:/;
const KIND_PROBE_SKIP_RE = /^\s*(?:#.*)?$/;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})/;

const detectNewline = (source) => source.includes("\r\n") ? "\r\n" : "\n";

const splitLines = (source) => {
  const hasFinalNewline = /(?:\r\n|\n)$/.test(source);
  const lines = source.split(/\r?\n/);

  return hasFinalNewline ? lines.slice(0, -1) : lines;
};

const joinLines = (lines, source) => {
  const newline = detectNewline(source);
  const suffix = /(?:\r\n|\n)$/.test(source) ? newline : "";

  return `${lines.join(newline)}${suffix}`;
};

const updateFenceState = (line, fence) => {
  const match = line.match(FENCE_RE);
  if (!match) {
    return fence;
  }

  const marker = match[2];
  if (!fence) {
    return {
      char: marker[0],
      length: marker.length
    };
  }

  return marker[0] === fence.char && marker.length >= fence.length ? null : fence;
};

const maybeInsertKind = (output, line, state) => {
  if (!state.activeLegacyKind || !state.needsKind || KIND_PROBE_SKIP_RE.test(line)) {
    return state;
  }

  if (!KIND_RE.test(line)) {
    output.push(`kind: ${state.activeLegacyKind}`);
  }

  return { ...state, needsKind: false };
};

const openLegacyBlock = (output, match) => {
  output.push(`:::chemd${match[2] ?? ""}`);

  return {
    activeLegacyKind: match[1],
    needsKind: true
  };
};

const closeLegacyBlockIfNeeded = (line, state) =>
  state.activeLegacyKind && line.trim() === ":::"
    ? { activeLegacyKind: null, needsKind: false }
    : state;

export const auditLegacySurfaceUsage = (source) => {
  const lines = splitLines(source);
  let fence = null;

  return lines.flatMap((line, index) => {
    fence = updateFenceState(line, fence);
    if (fence) {
      return [];
    }

    const match = line.match(LEGACY_OPEN_RE);
    return match
      ? [{ line: index + 1, blockType: match[1], header: line }]
      : [];
  });
};

export const migrateLegacySurfaceToChemd = (source) => {
  const lines = splitLines(source);
  const output = [];
  let state = {
    activeLegacyKind: null,
    needsKind: false
  };
  let fence = null;

  for (const line of lines) {
    fence = updateFenceState(line, fence);

    if (fence && !state.activeLegacyKind) {
      output.push(line);
      continue;
    }

    const match = fence ? null : line.match(LEGACY_OPEN_RE);
    if (match) {
      state = openLegacyBlock(output, match);
      continue;
    }

    state = maybeInsertKind(output, line, state);

    if (fence) {
      output.push(line);
      continue;
    }

    output.push(line);

    state = closeLegacyBlockIfNeeded(line, state);
  }

  if (state.activeLegacyKind && state.needsKind) {
    output.push(`kind: ${state.activeLegacyKind}`);
  }

  return joinLines(output, source);
};
