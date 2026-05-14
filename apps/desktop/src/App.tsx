import { useCallback, useMemo, useRef, useState } from "react";

import type { AgentRun } from "@chemd/agent-tools";
import { compileChemdForEditor } from "@chemd/language-service";

import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopWorkbench } from "./components/DesktopShell";
import { useDesktopWorkspaceIndexController } from "./workspace-index/use-desktop-workspace-index";
import { buildDesktopReactionIntelligenceJob } from "./desktop-reaction-intelligence-job";
import { reactionIntelligenceArtifactHasReactionOverlap } from "./desktop-reaction-intelligence-artifact-controller";
import { buildDesktopSemanticPreview } from "./desktop-semantic-preview";
import { buildDesktopKnowledgeMapViewModel, type DesktopSourceJumpIntent } from "./knowledge-map/desktop-knowledge-map";
import { isSameChemdDesktopDocumentPath, type MonacoChemdEditorHandle } from "./MonacoChemdEditor";
import { createEditorSourceHash, invokeDesktop } from "./desktop-utils";

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

import type { AgentMessage } from "./desktop-types";
import type { WorkspaceFileEntry } from "./desktop-contracts";

export const App = () => {
  const workspaceController = useWorkspaceFileController();
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);
  const editorRef = useRef<MonacoChemdEditorHandle | null>(null);

  const sidecarController = useSidecarController();
  const postgresController = usePostgresController();

  const readWorkspaceIndexFile = useCallback(
    (file: WorkspaceFileEntry) =>
      invokeDesktop("read_workspace_file", {
        workspaceId: workspaceController.workspace.workspaceId,
        path: file.path,
      }).then((result) => ({
        content: result.content,
        modifiedAtMs: result.modifiedAtMs,
      })),
    [workspaceController.workspace.workspaceId],
  );

  const output = useMemo(
    () =>
      compileChemdForEditor({
        source: workspaceController.source,
        documentUri: workspaceController.selectedFile.path,
        options: { strictChemdKind: true, procedureMode: "auto" },
      }),
    [workspaceController.selectedFile.path, workspaceController.source],
  );

  const outputReactionIds = useMemo(
    () =>
      output.status === "ok"
        ? output.symbols.filter((s) => s.kind === "reaction").map((s) => s.id)
        : [],
    [output],
  );

  const semanticPreview = useMemo(() => buildDesktopSemanticPreview(output), [output]);

  const workspaceIndexController = useDesktopWorkspaceIndexController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    selectedFile: workspaceController.selectedFile,
    source: workspaceController.source,
    readFile: readWorkspaceIndexFile,
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
      buildDesktopReactionIntelligenceJob({
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
    () => buildDesktopKnowledgeMapViewModel(output, { reactionIntelligenceArtifact: localReactionIntelligenceArtifact }),
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

  const handleKnowledgeMapSourceJump = useCallback(
    (intent: DesktopSourceJumpIntent) => {
      const currentPath = workspaceController.selectedFile.path;
      if (!isSameChemdDesktopDocumentPath(intent.sourceUri, currentPath)) {
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
      <DesktopWorkbench
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
        selectedFile={workspaceController.selectedFile}
        selectedFileId={workspaceController.selectedFileId}
        mode={workspaceController.mode}
        message={workspaceController.message}
        source={workspaceController.source}
        savedSource={workspaceController.savedSource}
        workspaceConflict={workspaceController.workspaceConflict}
        rootPath={workspaceController.rootPath}
        canSave={workspaceController.canSave}
        agentRun={agentRun}
        agentMessage={agentMessage}
        agentCurrentBeforeHash={createEditorSourceHash(workspaceController.source)}
        editorRef={editorRef}
        onRootPathChange={workspaceController.setRootPath}
        onSourceChange={updateEditorSource}
        onSave={() => void workspaceController.saveWorkspaceFile()}
        onOpenWorkspace={() => void workspaceController.openWorkspace()}
        onSelectFile={(file) => void workspaceController.selectFile(file)}
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
