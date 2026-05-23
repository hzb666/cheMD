const CLAUSE_ACTION_PATTERN =
  /^(?:(?:the|a)\s+)?(?:(?:resulting\s+)?(?:reaction|mixture|solution|suspension)|combined\s+organic\s+phases?|organic\s+phases?|aqueous\s+phases?|layers?|residue|crude|this)?\s*(?:was|were|is|are)?\s*(?:then\s+)?(?:added|add|addition|stirred|stir|warmed|warm|heated|heat|refluxed|reflux|cooled|cool|quenched|quench|extracted|extract|washed|wash|dried|dry|filtered|filter|concentrated|concentrate|purified|purify|separated|separate|diluted|dilute|handled)\b/i;

const BOUNDARY_WORD_PATTERN = /\b(?:and|then|before|after|followed\s+by)\b/gi;

const isOpeningBracket = (char: string): boolean => char === "(" || char === "[" || char === "{";

const isClosingBracket = (char: string): boolean => char === ")" || char === "]" || char === "}";

const trimClause = (value: string): string =>
  value.trim().replace(/^[,;，；]\s*/u, "").replace(/\s*[,;，；]$/u, "").trim();

const startsWithActionClause = (value: string): boolean => {
  const candidate = value.trimStart().replace(/^(?:and|then)\s+/i, "").trimStart();
  return CLAUSE_ACTION_PATTERN.test(candidate);
};

const isThenAuxiliary = (sentence: string, boundaryStart: number): boolean => {
  const before = sentence.slice(Math.max(0, boundaryStart - 8), boundaryStart).toLowerCase();
  return /\b(?:was|were)\s+$/.test(before);
};

const isBoundaryWordAtDepthZero = (sentence: string, index: number, depth: number): RegExpMatchArray | undefined => {
  if (depth !== 0) return undefined;
  BOUNDARY_WORD_PATTERN.lastIndex = index;
  const match = BOUNDARY_WORD_PATTERN.exec(sentence);
  return match?.index === index ? match : undefined;
};

const readSplitPoint = (sentence: string, index: number, depth: number): number | undefined => {
  if (depth !== 0) return undefined;

  if (sentence[index] === ",") {
    return startsWithActionClause(sentence.slice(index + 1)) ? index + 1 : undefined;
  }

  const boundary = isBoundaryWordAtDepthZero(sentence, index, depth);
  if (!boundary) return undefined;
  const boundaryIndex = boundary.index;
  if (boundaryIndex === undefined) return undefined;
  if (boundary[0].toLowerCase() === "then" && isThenAuxiliary(sentence, boundaryIndex)) return undefined;

  const afterBoundary = sentence.slice(boundaryIndex + boundary[0].length);
  return startsWithActionClause(afterBoundary) ? boundaryIndex + boundary[0].length : undefined;
};

export const splitProcedureActionClauses = (sentence: string): string[] => {
  const result: string[] = [];
  let start = 0;
  let depth = 0;

  for (let index = 0; index < sentence.length; index += 1) {
    const char = sentence[index];
    if (isOpeningBracket(char)) {
      depth += 1;
      continue;
    }
    if (isClosingBracket(char)) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    const splitPoint = readSplitPoint(sentence, index, depth);
    if (splitPoint === undefined) continue;

    const clause = trimClause(sentence.slice(start, index));
    if (clause) result.push(clause);
    start = splitPoint;
    index = splitPoint - 1;
  }

  const tail = trimClause(sentence.slice(start));
  return tail ? [...result, tail] : result;
};
