import { PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE } from "../../../lib/theme-sync-events";

export const PREVIEW_THEME_SYNC_MESSAGE_TYPE = "chemd:theme-sync";

const PREVIEW_THEME_SYNC_SCRIPT_BODY = `(() => {
  const applyTheme = (theme) => {
    if (theme !== "dark" && theme !== "light") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;

    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;

    if (body) {
      body.classList.toggle("dark", theme === "dark");
      body.setAttribute("data-theme", theme);
      body.style.colorScheme = theme;
    }
  };

  const postThemeSyncAck = (theme, requestId) => {
    if (typeof requestId !== "string" || requestId.length === 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.parent.postMessage(
        {
          type: ${JSON.stringify(PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE)},
          requestId,
          theme
        },
        "*"
      );
    });
  };

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (!payload || typeof payload !== "object" || payload.type !== ${JSON.stringify(PREVIEW_THEME_SYNC_MESSAGE_TYPE)}) {
      return;
    }

    applyTheme(payload.theme);
    postThemeSyncAck(payload.theme, payload.requestId);
  });

  applyTheme(
    document.documentElement.classList.contains("dark")
      || document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );
})();`;

export const buildPreviewThemeSyncScriptTag = (): string =>
  `<script>${PREVIEW_THEME_SYNC_SCRIPT_BODY}</script>`;
