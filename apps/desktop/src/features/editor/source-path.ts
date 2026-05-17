export type MonacoSourceJumpIntent = {
  range: {
    startLine: number;
    endLine?: number;
    startColumn?: number;
    endColumn?: number;
    startOffset?: number;
    endOffset?: number;
  };
};

export type MonacoCursorPosition = { lineNumber: number; column: number };

export type MonacoUndoRedoState = { canUndo: boolean; canRedo: boolean };

export type MonacoChemdEditorHandle = {
  jumpToSource: (intent: MonacoSourceJumpIntent) => boolean;
  redo: () => boolean;
  undo: () => boolean;
};

const encodeModelPathSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(/%2F/giu, "/");

export const toChemdModelUri = (documentPath: string): string => {
  const normalizedPath = documentPath.trim().replace(/\\/g, "/");
  const encodedPath = normalizedPath
    ? normalizedPath.split("/").filter(Boolean).map(encodeModelPathSegment).join("/")
    : "untitled.chemd";

  return `chemd://desktop/${encodedPath}`;
};

const normalizeChemdDocumentPath = (documentPath: string): string =>
  documentPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^chemd:\/\/desktop\//u, "")
    .replace(/^\/+/u, "")
    .replace(/\/+/gu, "/")
    .toLowerCase();

export const isSameChemdDocumentPath = (
  sourceUri: string | undefined,
  documentPath: string
): boolean => {
  if (!sourceUri) return true;
  const sourcePath = normalizeChemdDocumentPath(sourceUri);
  const currentPath = normalizeChemdDocumentPath(documentPath);
  return sourcePath === currentPath
    || currentPath.endsWith(`/${sourcePath}`)
    || sourcePath.endsWith(`/${currentPath}`);
};
