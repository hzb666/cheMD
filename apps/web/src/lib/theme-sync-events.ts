export type ThemeSyncTheme = "light" | "dark";

export const PREVIEW_THEME_SYNC_REQUEST_EVENT = "chemd:theme-sync-request";
export const PREVIEW_THEME_SYNC_ACK_EVENT = "chemd:theme-sync-ack";
export const PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE = "chemd:theme-sync-applied";

export interface ThemeSyncRequestDetail {
  requestId: string;
  theme: ThemeSyncTheme;
}

export interface ThemeSyncAckDetail {
  requestId: string;
  theme: ThemeSyncTheme;
}

export interface PreviewThemeSyncAckMessage {
  type: typeof PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE;
  requestId: string;
  theme: ThemeSyncTheme;
}

const isThemeSyncTheme = (value: unknown): value is ThemeSyncTheme =>
  value === "light" || value === "dark";

export const isThemeSyncRequestDetail = (
  value: unknown
): value is ThemeSyncRequestDetail => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ThemeSyncRequestDetail>;
  return (
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    isThemeSyncTheme(candidate.theme)
  );
};

export const isThemeSyncAckDetail = (
  value: unknown
): value is ThemeSyncAckDetail => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ThemeSyncAckDetail>;
  return (
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    isThemeSyncTheme(candidate.theme)
  );
};

export const isPreviewThemeSyncAckMessage = (
  value: unknown
): value is PreviewThemeSyncAckMessage => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PreviewThemeSyncAckMessage>;
  return (
    candidate.type === PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE &&
    typeof candidate.requestId === "string" &&
    candidate.requestId.length > 0 &&
    isThemeSyncTheme(candidate.theme)
  );
};

export const dispatchPreviewThemeSyncRequest = (
  detail: ThemeSyncRequestDetail
): void => {
  window.dispatchEvent(
    new CustomEvent<ThemeSyncRequestDetail>(PREVIEW_THEME_SYNC_REQUEST_EVENT, {
      detail
    })
  );
};

export const dispatchPreviewThemeSyncAck = (
  detail: ThemeSyncAckDetail
): void => {
  window.dispatchEvent(
    new CustomEvent<ThemeSyncAckDetail>(PREVIEW_THEME_SYNC_ACK_EVENT, {
      detail
    })
  );
};
