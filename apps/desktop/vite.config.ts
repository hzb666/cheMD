import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const normalizeModuleId = (id: string) => id.replaceAll("\\", "/");

const manualChunks = (id: string) => {
  const moduleId = normalizeModuleId(id);

  if (!moduleId.includes("/node_modules/")) {
    return undefined;
  }

  if (moduleId.includes("monaco-editor") || moduleId.includes("@monaco-editor")) {
    return "monaco";
  }

  if (moduleId.includes("/react/") || moduleId.includes("/react-dom/") || moduleId.includes("/scheduler/")) {
    return "react-vendor";
  }

  return undefined;
};

const isUseClientDirectiveWarning = (warning: { code?: string; message?: string }) => (
  warning.code === "MODULE_LEVEL_DIRECTIVE"
  && warning.message?.includes('"use client"')
);

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 2437,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (isUseClientDirectiveWarning(warning)) {
          return;
        }

        defaultHandler(warning);
      },
      output: {
        manualChunks
      }
    }
  }
});
