"use client";

import { useCallback, useRef, useState } from "react";

import type { KetcherBridgeOptions, KetcherBridgeState, KetcherSavePayload } from "../types";

/**
 * Bridge between React and the Ketcher iframe.
 *
 * Uses the `postMessage` / `message` event API to communicate with the
 * Ketcher standalone application. The protocol mirrors Ketcher's documented
 * `window.ketcher` JS API – here we use postMessage to keep iframe isolation.
 */
export const useKetcherBridge = (_options: KetcherBridgeOptions = {}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<KetcherBridgeState>({ phase: "idle" });

  /** Called when the iframe `onLoad` fires. */
  const handleIframeLoad = useCallback(() => {
    setState({ phase: "ready" });
  }, []);

  /**
   * Load a structure into Ketcher via postMessage.
   *
   * Sends `{ type: "KETCHER_LOAD", payload: { molfile?, smiles? } }` to the
   * iframe content window.
   */
  const loadStructure = useCallback(
    (structure: { molfile?: string; smiles?: string }) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "KETCHER_LOAD", payload: structure },
        "*"
      );
    },
    []
  );

  /**
   * Request the current structure from Ketcher via postMessage.
   *
   * Ketcher should respond with a `KETCHER_STRUCTURE` message containing the
   * current molfile.  Returns a Promise that resolves when the response
   * arrives (or rejects after a timeout).
   */
  const getStructure = useCallback((): Promise<KetcherSavePayload> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Ketcher did not respond within 10 s"));
      }, 10_000);

      const handler = (event: MessageEvent) => {
        if (
          event.data &&
          typeof event.data === "object" &&
          (event.data as Record<string, unknown>).type === "KETCHER_STRUCTURE"
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          resolve(event.data as KetcherSavePayload);
        }
      };

      window.addEventListener("message", handler);
      iframeRef.current?.contentWindow?.postMessage({ type: "KETCHER_GET_STRUCTURE" }, "*");
    });
  }, []);

  const setError = useCallback((message: string) => {
    setState({ phase: "error", message });
  }, []);

  const setSaving = useCallback(() => setState({ phase: "saving" }), []);
  const setIdle = useCallback(() => setState({ phase: "idle" }), []);

  return {
    iframeRef,
    state,
    handleIframeLoad,
    loadStructure,
    getStructure,
    setError,
    setSaving,
    setIdle,
  };
};
