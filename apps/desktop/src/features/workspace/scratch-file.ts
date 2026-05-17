import type { WorkspaceFileEntry } from "../../contracts";

const scratchFilePathPrefix = "untitled://";
const scratchFileNamePattern = /^Untitled-(\d+)\.chemd(?:\.md)?$/;

export const isScratchFile = (file: WorkspaceFileEntry): boolean =>
  file.path.startsWith(scratchFilePathPrefix);

export const createScratchFile = (index: number): WorkspaceFileEntry => ({
  id: `untitled-editor-tab-${index}`,
  name: `Untitled-${index}.chemd`,
  path: `${scratchFilePathPrefix}Untitled-${index}.chemd`,
  kind: "file",
  chemdKind: "document",
});

export const getNextScratchFileIndex = (
  tabs: readonly WorkspaceFileEntry[],
): number =>
  tabs.reduce((nextIndex, tab) => {
    const match = tab.name.match(scratchFileNamePattern);
    if (!match || !isScratchFile(tab)) return nextIndex;
    return Math.max(nextIndex, Number(match[1]) + 1);
  }, 1);
