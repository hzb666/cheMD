"use client";

import React, { useState } from "react";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  dispatchPreviewThemeSyncRequest,
  isPreviewThemeSyncAckMessage,
  isThemeSyncAckDetail,
  PREVIEW_THEME_SYNC_ACK_EVENT
} from "../lib/theme-sync-events";
import { Button } from "./ui/button";

export const resolveNextTheme = (resolvedTheme?: string): "light" | "dark" =>
  resolvedTheme === "dark" ? "light" : "dark";

const THEME_SYNC_TIMEOUT_MS = 96;

const disableThemeChangeTransitions = (): (() => void) => {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      `*,*::before,*::after{-webkit-transition:none!important;transition:none!important;-webkit-animation:none!important;animation:none!important;}`
    )
  );
  document.head.appendChild(style);

  return () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
};

const applyThemeToDocument = (theme: "light" | "dark"): void => {
  const root = document.documentElement;
  const body = document.body;

  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;

  if (!body) {
    return;
  }

  body.classList.toggle("dark", theme === "dark");
  body.setAttribute("data-theme", theme);
  body.style.colorScheme = theme;
};

const createThemeSyncRequestId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `theme-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isWaitingForPreview, setIsWaitingForPreview] = useState(false);

  const handleClick = () => {
    if (isWaitingForPreview) {
      return;
    }

    const nextTheme = resolveNextTheme(resolvedTheme);
    const requestId = createThemeSyncRequestId();
    let settled = false;

    setIsWaitingForPreview(true);

    const finishThemeSwitch = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener(PREVIEW_THEME_SYNC_ACK_EVENT, handlePreviewAck);
      window.removeEventListener("message", handlePreviewAckMessage);
      window.clearTimeout(timeoutId);
      setIsWaitingForPreview(false);
      const restoreTransitions = disableThemeChangeTransitions();
      applyThemeToDocument(nextTheme);
      setTheme(nextTheme);
      restoreTransitions();
    };

    const handlePreviewAck = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isThemeSyncAckDetail(detail) || detail.requestId !== requestId) {
        return;
      }

      finishThemeSwitch();
    };

    const handlePreviewAckMessage = (event: MessageEvent) => {
      if (!isPreviewThemeSyncAckMessage(event.data) || event.data.requestId !== requestId) {
        return;
      }

      finishThemeSwitch();
    };

    const timeoutId = window.setTimeout(finishThemeSwitch, THEME_SYNC_TIMEOUT_MS);

    window.addEventListener(PREVIEW_THEME_SYNC_ACK_EVENT, handlePreviewAck);
    window.addEventListener("message", handlePreviewAckMessage);
    dispatchPreviewThemeSyncRequest({
      requestId,
      theme: nextTheme
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={isWaitingForPreview}
      className="h-9 w-9 rounded-full border-border bg-background/50 shadow-sm backdrop-blur-sm hover:bg-[#f2f9ff] hover:text-[#097fe8] hover:border-[rgba(9,127,232,0.28)] hover:shadow-[0_8px_20px_rgba(15,23,42,0.1)] dark:hover:bg-[rgba(30,41,59,0.88)] dark:hover:text-[#93c5fd] dark:hover:border-[rgba(96,165,250,0.32)] dark:hover:shadow-[0_12px_28px_rgba(2,6,23,0.3)]"
      onClick={handleClick}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
