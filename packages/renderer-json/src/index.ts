import type { ChemdDocument } from "@chemd/core";
import type { RenderAdapterPayload, RenderOptions } from "@chemd/render-profile";

export const renderJson = (
  document: ChemdDocument,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): string =>
  JSON.stringify(
    {
      document: {
        meta: document.meta,
        children: document.children
      },
      diagnostics: document.diagnostics,
      render: {
        profileId: options.profileId,
        resolvedOptions: options,
        ...(adapterPayload ? { adapter: adapterPayload } : {})
      }
    },
    null,
    2
  );
