import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import { App } from "./App";
import { useWebviewZoomShortcuts } from "./hooks/use-webview-zoom";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Chemd Desktop root element was not found");
}

const RuntimeHooks = () => {
  useWebviewZoomShortcuts();
  return null;
};

createRoot(rootElement).render(
  <StrictMode>
    <RuntimeHooks />
    <App />
  </StrictMode>
);
