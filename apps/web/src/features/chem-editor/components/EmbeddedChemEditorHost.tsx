"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  exportChemEditorDraft,
  getChemEditorImportCandidates,
  getChemEditorStructureInput
} from "../lib/chem-editor-export";
import { syncKetcherViewport } from "../lib/ketcher-viewport";
import type { ChemEditorDraft, KetcherBridgeInstance } from "../types";

type KetcherEditorComponent = React.ComponentType<{
  onInit?: (instance: KetcherBridgeInstance) => void;
  staticResourcesUrl: string;
  structServiceProvider: unknown;
}>;

interface KetcherRuntime {
  Editor: KetcherEditorComponent;
  structServiceProvider: unknown;
}

interface EmbeddedChemEditorHostProps {
  value: ChemEditorDraft;
  onChange: (next: ChemEditorDraft) => void;
  onBridgeReady?: (instance: KetcherBridgeInstance | null) => void;
}

interface KetcherStatusShellProps {
  state: "loading" | "error";
  children: React.ReactNode;
}

interface KetcherRuntimeSurfaceProps {
  runtime: KetcherRuntime;
  isReady: boolean;
  onInit: (instance: KetcherBridgeInstance) => void;
}

const KETCHER_STATIC_RESOURCES_URL = "/ketcher";

const loadKetcherRuntime = async (): Promise<KetcherRuntime> => {
  const [{ Editor }, { StandaloneStructServiceProvider }] = await Promise.all([
    import("ketcher-react"),
    import("ketcher-standalone")
  ]);

  return {
    Editor: Editor as KetcherEditorComponent,
    structServiceProvider: new StandaloneStructServiceProvider()
  };
};

const applyDraftToEditor = async (
  instance: Pick<KetcherBridgeInstance, "setMolecule" | "editor">,
  draft: ChemEditorDraft
): Promise<string | null> => {
  const candidates = getChemEditorImportCandidates(draft);

  for (const candidate of candidates) {
    try {
      await instance.setMolecule(candidate);
      syncKetcherViewport(instance);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
};

export const initializeEditorInstance = async ({
  instance,
  draft,
  structureInput,
  syncDraftFromEditor
}: {
  instance: Pick<KetcherBridgeInstance, "changeEvent" | "setMolecule" | "editor">;
  draft: ChemEditorDraft;
  structureInput: string;
  syncDraftFromEditor: () => Promise<void>;
}): Promise<{
  appliedValue: string | null;
  changeHandler: () => void;
}> => {
  const appliedValue = structureInput ? await applyDraftToEditor(instance, draft) : null;
  const changeHandler = () => {
    void syncDraftFromEditor();
  };

  instance.changeEvent?.add?.(changeHandler);

  return {
    appliedValue,
    changeHandler
  };
};

const KetcherStatusShell = ({ state, children }: KetcherStatusShellProps) => (
  <div className="ketcher-host-shell" data-ketcher-host="embedded" data-ketcher-state={state}>
    {children}
  </div>
);

const KetcherLoadingContent = () => (
  <div className="ketcher-host-loading">
    <p className="panel-kicker">Structure sketch surface</p>
    <p className="panel-meta">Loading Ketcher</p>
  </div>
);

const KetcherRuntimeSurface = ({ runtime, isReady, onInit }: KetcherRuntimeSurfaceProps) => {
  const { Editor, structServiceProvider } = runtime;

  return (
    <div className="ketcher-host-shell" data-ketcher-host="embedded" data-ketcher-state={isReady ? "ready" : "booting"}>
      {!isReady ? <KetcherLoadingContent /> : null}
      <div className="ketcher-host-surface" data-ketcher-surface="editor">
        <Editor
          onInit={onInit}
          staticResourcesUrl={KETCHER_STATIC_RESOURCES_URL}
          structServiceProvider={structServiceProvider}
        />
      </div>
    </div>
  );
};

const useKetcherRuntime = (): {
  runtime: KetcherRuntime | null;
  loadError: string | null;
} => {
  const [runtime, setRuntime] = useState<KetcherRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadKetcherRuntime()
      .then((nextRuntime) => {
        if (cancelled) {
          return;
        }

        setRuntime(nextRuntime);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load Ketcher");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    runtime,
    loadError
  };
};

export const EmbeddedChemEditorHost = ({
  value,
  onChange,
  onBridgeReady
}: EmbeddedChemEditorHostProps) => {
  const [isReady, setIsReady] = useState(false);
  const [editorInstanceVersion, setEditorInstanceVersion] = useState(0);
  const { runtime, loadError } = useKetcherRuntime();
  const ketcherRef = useRef<KetcherBridgeInstance | null>(null);
  const applyingRef = useRef(false);
  const changeHandlerRef = useRef<(() => void) | null>(null);
  const hasHydratedInitialValueRef = useRef(false);
  const valueRef = useRef(value);
  const structureInput = useMemo(() => getChemEditorStructureInput(value), [value]);
  const lastSyncedInputRef = useRef<string | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const syncDraftFromEditor = useCallback(async () => {
    const instance = ketcherRef.current;
    if (!instance || applyingRef.current) {
      return;
    }

    const next = await exportChemEditorDraft(instance, valueRef.current);
    lastSyncedInputRef.current = getChemEditorStructureInput(next);
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    const instance = ketcherRef.current;
    if (
      !instance ||
      !isReady ||
      editorInstanceVersion === 0 ||
      !hasHydratedInitialValueRef.current ||
      applyingRef.current
    ) {
      return;
    }

    if (!structureInput || lastSyncedInputRef.current === structureInput) {
      return;
    }

    let cancelled = false;

    const applyIncomingValue = async () => {
      applyingRef.current = true;
      try {
        const appliedValue = await applyDraftToEditor(instance, valueRef.current);

        if (!cancelled && appliedValue) {
          lastSyncedInputRef.current = appliedValue;
        }
      } finally {
        applyingRef.current = false;
      }
    };

    void applyIncomingValue();

    return () => {
      cancelled = true;
    };
  }, [editorInstanceVersion, isReady, structureInput]);

  useEffect(() => {
    const instance = ketcherRef.current;
    if (!instance || !isReady || editorInstanceVersion === 0 || hasHydratedInitialValueRef.current) {
      return;
    }

    let cancelled = false;

    const hydrateInitialValue = async () => {
      applyingRef.current = true;
      try {
        const { appliedValue, changeHandler } = await initializeEditorInstance({
          instance,
          draft: valueRef.current,
          structureInput,
          syncDraftFromEditor
        });

        if (cancelled) {
          instance.changeEvent?.remove?.(changeHandler);
          return;
        }

        changeHandlerRef.current = changeHandler;

        if (structureInput) {
          if (appliedValue) {
            lastSyncedInputRef.current = appliedValue;
          }
        } else {
          lastSyncedInputRef.current = "";
        }
      } finally {
        applyingRef.current = false;
      }

      hasHydratedInitialValueRef.current = true;
    };

    void hydrateInitialValue();

    return () => {
      cancelled = true;
    };
  }, [editorInstanceVersion, isReady, structureInput, syncDraftFromEditor]);

  const handleEditorInit = useCallback(
    (instance: KetcherBridgeInstance) => {
      const previousInstance = ketcherRef.current;
      const previousHandler = changeHandlerRef.current;
      if (previousInstance && previousHandler) {
        previousInstance.changeEvent?.remove?.(previousHandler);
      }

      ketcherRef.current = instance;
      changeHandlerRef.current = null;
      hasHydratedInitialValueRef.current = false;
      lastSyncedInputRef.current = null;
      setIsReady(true);
      setEditorInstanceVersion((current) => current + 1);
      onBridgeReady?.(instance);
    },
    [onBridgeReady]
  );

  useEffect(() => {
    return () => {
      const instance = ketcherRef.current;
      const changeHandler = changeHandlerRef.current;
      if (instance && changeHandler) {
        instance.changeEvent?.remove?.(changeHandler);
      }

      changeHandlerRef.current = null;
      ketcherRef.current = null;
      hasHydratedInitialValueRef.current = false;
      onBridgeReady?.(null);
    };
  }, [onBridgeReady]);

  if (loadError) {
    return (
      <KetcherStatusShell state="error">
        <p className="panel-meta">Ketcher load failed: {loadError}</p>
      </KetcherStatusShell>
    );
  }

  if (!runtime) {
    return (
      <KetcherStatusShell state="loading">
        <KetcherLoadingContent />
      </KetcherStatusShell>
    );
  }

  return <KetcherRuntimeSurface runtime={runtime} isReady={isReady} onInit={handleEditorInit} />;
};
