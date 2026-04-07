import type { KetcherBridgeInstance } from "../types";

export const DEFAULT_KETCHER_ZOOM = 1;

export const syncKetcherViewport = (
  instance: Pick<KetcherBridgeInstance, "editor">,
  zoom = DEFAULT_KETCHER_ZOOM
): void => {
  const editor = instance.editor;
  if (!editor?.zoom) {
    return;
  }

  const currentZoom = editor.zoom();
  if (Math.abs(currentZoom - zoom) > 0.001) {
    editor.zoom(zoom);
  }

  editor.centerStruct?.();
};
