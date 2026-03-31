/** Types for the structure-editor (Ketcher) feature. */

export interface KetcherBridgeOptions {
  /** URL of the standalone Ketcher HTML page served as an iframe. */
  ketcherUrl?: string;
}

export interface KetcherSavePayload {
  molfile: string;
}

export type KetcherBridgeState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "saving" }
  | { phase: "error"; message: string };
