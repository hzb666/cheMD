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

const KETCHER_STATIC_RESOURCES_URL = "/ketcher";

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

export const EmbeddedChemEditorHost = ({
  value,
  onChange,
  onBridgeReady
}: EmbeddedChemEditorHostProps) => {
  const [runtime, setRuntime] = useState<KetcherRuntime | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const ketcherRef = useRef<KetcherBridgeInstance | null>(null);
  const applyingRef = useRef(false);
  const changeHandlerRef = useRef<(() => void) | null>(null);
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
    let cancelled = false;

    const loadRuntime = async () => {
      try {
        const [{ Editor }, { StandaloneStructServiceProvider }] = await Promise.all([
          import("ketcher-react"),
          import("ketcher-standalone")
        ]);

        if (cancelled) {
          return;
        }

        setRuntime({
          Editor: Editor as KetcherEditorComponent,
          structServiceProvider: new StandaloneStructServiceProvider()
        });
        setLoadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Failed to load Ketcher");
      }
    };

    void loadRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const instance = ketcherRef.current;
    if (!instance || !isReady || applyingRef.current) {
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
  }, [isReady, structureInput]);

  useEffect(() => {
    return () => {
      const instance = ketcherRef.current;
      const changeHandler = changeHandlerRef.current;
      if (instance && changeHandler) {
        instance.changeEvent?.remove?.(changeHandler);
      }

      changeHandlerRef.current = null;
      ketcherRef.current = null;
      onBridgeReady?.(null);
    };
  }, [onBridgeReady]);

  if (loadError) {
    return (
      <div className="ketcher-host-shell" data-ketcher-host="embedded" data-ketcher-state="error">
        <p className="panel-meta">Ketcher load failed: {loadError}</p>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="ketcher-host-shell" data-ketcher-host="embedded" data-ketcher-state="loading">
        <div className="ketcher-host-loading">
          <p className="panel-kicker">Structure sketch surface</p>
          <p className="panel-meta">Loading Ketcher</p>
        </div>
      </div>
    );
  }

  const { Editor, structServiceProvider } = runtime;

  return (
    <div className="ketcher-host-shell" data-ketcher-host="embedded" data-ketcher-state={isReady ? "ready" : "booting"}>
      {!isReady ? (
        <div className="ketcher-host-loading">
          <p className="panel-kicker">Structure sketch surface</p>
          <p className="panel-meta">Loading Ketcher</p>
        </div>
      ) : null}
      <div className="ketcher-host-surface" data-ketcher-surface="editor">
        <Editor
          onInit={(instance) => {
            const previousInstance = ketcherRef.current;
            const previousHandler = changeHandlerRef.current;
            if (previousInstance && previousHandler) {
              previousInstance.changeEvent?.remove?.(previousHandler);
            }

            ketcherRef.current = instance;
            setIsReady(true);
            onBridgeReady?.(instance);

            const handleEditorChange = () => {
              void syncDraftFromEditor();
            };

            changeHandlerRef.current = handleEditorChange;
            instance.changeEvent?.add?.(handleEditorChange);
          }}
          staticResourcesUrl={KETCHER_STATIC_RESOURCES_URL}
          structServiceProvider={structServiceProvider}
        />
      </div>
    </div>
  );
};
