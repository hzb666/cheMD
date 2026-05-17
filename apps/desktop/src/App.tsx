import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentRun } from "@chemd/agent-tools";
import { compileChemdForEditor } from "@chemd/language-service";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Workbench } from "./features/workbench/workbench-shell";
import { useWorkspaceIndexController } from "./workspace-index/use-workspace-index";
import { buildReactionIntelligenceJob } from "./features/reaction-intelligence/job";
import { reactionIntelligenceArtifactHasReactionOverlap } from "./features/reaction-intelligence/artifact-controller";
import { buildSemanticPreview } from "./features/preview/semantic-preview";
import { buildKnowledgeMapViewModel, type SourceJumpIntent } from "./knowledge-map/knowledge-map";
import { isSameChemdDocumentPath, type MonacoChemdEditorHandle } from "./features/editor/source-path";
import { createEditorSourceHash, invokeCommand } from "./utils";

import { useWorkspaceFileController } from "./hooks/use-workspace-file-controller";
import { useSidecarController } from "./hooks/use-sidecar-controller";
import { usePostgresController, usePersistRuntimeController } from "./hooks/use-postgres-controller";
import {
  useLocalStoreController,
  useReactionIntelligenceJobController,
  useWorkspaceIngestController,
  useWorkspaceSymbolIndexController,
} from "./hooks/use-local-store-controller";
import { useAgentPatchController } from "./hooks/use-agent-patch-controller";
import { useConnectedRagQueryController, useEmbeddingProviderController } from "./hooks/use-connected-rag-controller";
import { useSettings, type AutoSaveMode } from "./features/settings/settings";

import type { AgentMessage } from "./types";
import type { WorkspaceFileEntry } from "./contracts";

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
};

export const shouldScheduleDelayedAutoSave = (
  autoSaveMode: AutoSaveMode,
  dirtyWorkspaceFileSignature: string,
): boolean =>
  autoSaveMode === "afterDelay" && dirtyWorkspaceFileSignature.length > 0;

export const shouldRunImmediateWorkspaceAutoSave = (
  autoSaveMode: AutoSaveMode,
  dirtyWorkspaceFileSignature: string,
): boolean =>
  autoSaveMode !== "off" && dirtyWorkspaceFileSignature.length > 0;

export const isWorkspaceSaveShortcut = (
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): boolean =>
  (event.ctrlKey || event.metaKey)
  && !event.altKey
  && !event.shiftKey
  && event.key.toLowerCase() === "s";

export const App = () => {
  const workspaceController = useWorkspaceFileController();
  const settingsController = useSettings();
  const { settings, updateSettings, resetSettings } = settingsController;
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);
  const editorRef = useRef<MonacoChemdEditorHandle | null>(null);
  const autostartAttemptedRef = useRef(false);
  const restoreWorkspaceAttemptedRef = useRef(false);

  const sidecarController = useSidecarController();
  const postgresController = usePostgresController({
    workspaceId: workspaceController.workspace.workspaceId,
    workspaceMode: workspaceController.mode
  });
  const compileInput = useMemo(
    () => ({
      fileId: workspaceController.selectedFileId,
      documentUri: workspaceController.selectedFile.path,
      source: workspaceController.source,
    }),
    [
      workspaceController.selectedFile.path,
      workspaceController.selectedFileId,
      workspaceController.source,
    ],
  );
  const debouncedCompileInput = useDebouncedValue(
    compileInput,
    settings.compileDebounceMs,
  );

  const readWorkspaceIndexFile = useCallback(
    (file: WorkspaceFileEntry) =>
      invokeCommand("read_workspace_file", {
        workspaceId: workspaceController.workspace.workspaceId,
        path: file.path,
      }).then((result) => ({
        content: result.content,
        modifiedAtMs: result.modifiedAtMs,
      })),
    [workspaceController.workspace.workspaceId],
  );

  const queryWorkspaceIndexDocuments = useCallback(
    (input: {
      workspaceId?: string;
      query?: string;
      excludePath?: string;
      cursor?: number;
      limit?: number;
    }) => invokeCommand("query_workspace_documents", input),
    [],
  );

  const output = useMemo(
    () =>
      compileChemdForEditor({
        source: debouncedCompileInput.source,
        documentUri: debouncedCompileInput.documentUri,
        options: { strictChemdKind: true, procedureMode: "auto" },
      }),
    [debouncedCompileInput],
  );

  const outputReactionIds = useMemo(
    () =>
      output.status === "ok"
        ? output.symbols.filter((s) => s.kind === "reaction").map((s) => s.id)
        : [],
    [output],
  );

  const semanticPreview = useMemo(() => buildSemanticPreview(output), [output]);

  const workspaceIndexController = useWorkspaceIndexController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    selectedFile: workspaceController.selectedFile,
    source: workspaceController.source,
    readFile: readWorkspaceIndexFile,
    queryDocuments: queryWorkspaceIndexDocuments,
  });

  const workspaceIndexViewModel = workspaceIndexController.viewModel;
  const embeddingProviderController = useEmbeddingProviderController();
  const connectedRagQueryController = useConnectedRagQueryController({
    mode: workspaceController.mode,
    postgresStatus: postgresController.status,
    embeddingStatus: embeddingProviderController.status,
    localResults: workspaceIndexViewModel.ragResults,
    file: workspaceController.selectedFile,
    workspace: workspaceController.workspace
  });
  const workspaceRagQueryState = connectedRagQueryController.state;

  const compileError = output.status === "failed" ? output.error.message : undefined;

  const persistController = usePersistRuntimeController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    postgresStatus: postgresController.status,
    source: workspaceController.source,
    workspace: workspaceController.workspace,
    compileOutput: output,
    agentRun,
  });

  const localStoreController = useLocalStoreController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    postgresStatus: postgresController.status,
    source: workspaceController.source,
    workspace: workspaceController.workspace,
    compileOutput: output,
    agentRun,
  });

  const reactionIntelligenceJobBuild = useMemo(
    () =>
      buildReactionIntelligenceJob({
        compileOutput: output,
        source: workspaceController.source,
        documentUri: workspaceController.selectedFile.path,
      }),
    [output, workspaceController.selectedFile.path, workspaceController.source],
  );

  const reactionIntelligenceJobController = useReactionIntelligenceJobController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    jobBuild: reactionIntelligenceJobBuild,
    onAfterRun: localStoreController.refresh,
  });

  const localReactionIntelligenceArtifact = useMemo(() => {
    const artifact = localStoreController.reactionIntelligenceArtifactState.artifact;
    return reactionIntelligenceArtifactHasReactionOverlap(artifact, outputReactionIds)
      ? artifact
      : null;
  }, [localStoreController.reactionIntelligenceArtifactState.artifact, outputReactionIds]);

  const knowledgeMapViewModel = useMemo(
    () => buildKnowledgeMapViewModel(output, { reactionIntelligenceArtifact: localReactionIntelligenceArtifact }),
    [localReactionIntelligenceArtifact, output],
  );

  const workspaceIngestController = useWorkspaceIngestController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    onAfterRun: localStoreController.refresh,
  });

  const workspaceSymbolIndexController = useWorkspaceSymbolIndexController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    selectedFile: workspaceController.selectedFile,
    source: workspaceController.source,
  });

  const updateEditorSource = (nextSource: string) => {
    workspaceController.setSource(nextSource);
    persistController.reset();
    localStoreController.reset();
  };

  useEffect(() => {
    const rootPath = workspaceController.rootPath.trim();
    if (!rootPath || rootPath === settings.lastWorkspacePath) return;
    updateSettings({ lastWorkspacePath: rootPath });
  }, [settings.lastWorkspacePath, updateSettings, workspaceController.rootPath]);

  useEffect(() => {
    if (
      restoreWorkspaceAttemptedRef.current
      || !settings.restoreLastWorkspace
      || !settings.lastWorkspacePath
      || workspaceController.workspaceState !== "empty"
    ) {
      return;
    }
    restoreWorkspaceAttemptedRef.current = true;
    void workspaceController.openWorkspacePath(settings.lastWorkspacePath);
  }, [
    settings.lastWorkspacePath,
    settings.restoreLastWorkspace,
    workspaceController,
  ]);

  useEffect(() => {
    if (
      !settings.sidecarAutostart
      || autostartAttemptedRef.current
      || sidecarController.operation
      || sidecarController.status.state === "ready"
    ) {
      return;
    }
    autostartAttemptedRef.current = true;
    sidecarController.start();
  }, [settings.sidecarAutostart, sidecarController]);

  const dirtyWorkspaceFileSignature = useMemo(
    () => workspaceController.dirtyWorkspaceFileSignature,
    [workspaceController.dirtyWorkspaceFileSignature],
  );

  useEffect(() => {
    if (!shouldScheduleDelayedAutoSave(settings.autoSaveMode, dirtyWorkspaceFileSignature)) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void workspaceController.saveDirtyWorkspaceFiles();
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [
    dirtyWorkspaceFileSignature,
    settings.autoSaveMode,
    workspaceController.saveDirtyWorkspaceFiles,
  ]);

  const runImmediateWorkspaceAutoSave = useCallback(() => {
    if (!shouldRunImmediateWorkspaceAutoSave(settings.autoSaveMode, dirtyWorkspaceFileSignature)) {
      return;
    }
    void workspaceController.saveDirtyWorkspaceFiles();
  }, [
    dirtyWorkspaceFileSignature,
    settings.autoSaveMode,
    workspaceController.saveDirtyWorkspaceFiles,
  ]);

  useEffect(() => {
    window.addEventListener("blur", runImmediateWorkspaceAutoSave);
    return () => window.removeEventListener("blur", runImmediateWorkspaceAutoSave);
  }, [runImmediateWorkspaceAutoSave]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isWorkspaceSaveShortcut(event)) return;
      event.preventDefault();
      void workspaceController.saveWorkspaceFile();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [workspaceController.saveWorkspaceFile]);

  const handleSelectFile = useCallback((file: WorkspaceFileEntry) => {
    if (file.id !== workspaceController.selectedFileId) {
      runImmediateWorkspaceAutoSave();
    }
    void workspaceController.selectFile(file);
  }, [
    runImmediateWorkspaceAutoSave,
    workspaceController.selectFile,
    workspaceController.selectedFileId,
  ]);

  const handleKnowledgeMapSourceJump = useCallback(
    (intent: SourceJumpIntent) => {
      const currentPath = workspaceController.selectedFile.path;
      if (!isSameChemdDocumentPath(intent.sourceUri, currentPath)) {
        workspaceController.setMessage(`Source ref points to ${intent.sourceUri}; current phase only jumps within ${currentPath}.`);
        return;
      }
      const jumped = editorRef.current?.jumpToSource(intent) ?? false;
      if (!jumped) {
        workspaceController.setMessage("Source ref jump is unavailable until Monaco editor is mounted.");
        return;
      }
      workspaceController.setMessage(`Jumped to ${currentPath} L${intent.range.startLine}-L${intent.range.endLine}.`);
    },
    [workspaceController],
  );

  const agentPatchController = useAgentPatchController({
    agentRun,
    setAgentRun,
    setAgentMessage,
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    workspace: workspaceController.workspace,
    source: workspaceController.source,
    onSourceChange: updateEditorSource,
  });

  return (
    <TooltipProvider>
      <Workbench
        workspace={workspaceController.workspace}
        workspaceState={workspaceController.workspaceState}
        sidecarController={sidecarController}
        postgresController={postgresController}
        persistController={persistController}
        localStoreController={localStoreController}
        reactionIntelligenceJobBuild={reactionIntelligenceJobBuild}
        reactionIntelligenceJobController={reactionIntelligenceJobController}
        workspaceIngestController={workspaceIngestController}
        workspaceSymbolIndexController={workspaceSymbolIndexController}
        semanticPreview={semanticPreview}
        workspaceIndexViewModel={workspaceIndexViewModel}
        workspaceRagQueryState={workspaceRagQueryState}
        workspaceRagQuery={connectedRagQueryController.query}
        workspaceRagQueryOperation={connectedRagQueryController.operation}
        workspaceRagQueryMessage={connectedRagQueryController.message}
        workspaceRagBackfillOperation={connectedRagQueryController.backfillOperation}
        workspaceRagBackfillMessage={connectedRagQueryController.backfillMessage}
        knowledgeMapViewModel={knowledgeMapViewModel}
        output={output}
        compileError={compileError}
        files={workspaceController.files}
        openedTabs={workspaceController.openedTabs}
        dirtyFileIds={workspaceController.dirtyFileIds}
        selectedFile={workspaceController.selectedFile}
        selectedFileId={workspaceController.selectedFileId}
        mode={workspaceController.mode}
        message={workspaceController.message}
        source={workspaceController.source}
        savedSource={workspaceController.savedSource}
        savedAt={workspaceController.savedAt}
        workspaceConflict={workspaceController.workspaceConflict}
        rootPath={workspaceController.rootPath}
        canSave={workspaceController.canSave}
        agentRun={agentRun}
        agentMessage={agentMessage}
        agentCurrentBeforeHash={createEditorSourceHash(workspaceController.source)}
        editorRef={editorRef}
        settings={settings}
        onSettingsChange={updateSettings}
        onResetSettings={resetSettings}
        onRootPathChange={workspaceController.setRootPath}
        onSourceChange={updateEditorSource}
        onSave={() => void workspaceController.saveWorkspaceFile()}
        onOpenWorkspace={() => void workspaceController.openWorkspace()}
        onSelectFile={handleSelectFile}
        onCloseFileTab={(fileId) => void workspaceController.closeFileTab(fileId)}
        onCloseAllFileTabs={() => void workspaceController.closeAllFileTabs()}
        onReorderFileTabs={workspaceController.reorderFileTabs}
        onOpenNewTab={() => void workspaceController.openNewTab()}
        onReloadWorkspaceConflict={() => void workspaceController.reloadWorkspaceConflict()}
        onKeepLocalWorkspaceConflict={workspaceController.keepLocalWorkspaceConflict}
        onKnowledgeMapSourceJump={handleKnowledgeMapSourceJump}
        onWorkspaceRagQueryChange={connectedRagQueryController.setQuery}
        onRunConnectedRagQuery={connectedRagQueryController.run}
        onBackfillConnectedRagEmbeddings={connectedRagQueryController.backfill}
        onProposeQuickFix={agentPatchController.proposeQuickFix}
        onApprovePatch={agentPatchController.approvePatch}
        onApplyPatch={agentPatchController.applyPatch}
        onRejectPatch={agentPatchController.rejectPatch}
      />
    </TooltipProvider>
  );
};

export default App;
