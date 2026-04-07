"use client";

import React from "react";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "./ui/button";

export const resolveNextTheme = (resolvedTheme?: string): "light" | "dark" =>
  resolvedTheme === "dark" ? "light" : "dark";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="rounded-full w-9 h-9 border-border bg-background/50 backdrop-blur-sm shadow-sm"
      onClick={() => setTheme(resolveNextTheme(resolvedTheme))}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
