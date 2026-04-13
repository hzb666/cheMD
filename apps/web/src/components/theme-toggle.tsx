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
      className="h-9 w-9 rounded-full border-border bg-background/50 shadow-sm backdrop-blur-sm hover:bg-[#f2f9ff] hover:text-[#097fe8] hover:border-[rgba(9,127,232,0.28)] hover:shadow-[0_8px_20px_rgba(15,23,42,0.1)] dark:hover:bg-[rgba(30,41,59,0.88)] dark:hover:text-[#93c5fd] dark:hover:border-[rgba(96,165,250,0.32)] dark:hover:shadow-[0_12px_28px_rgba(2,6,23,0.3)]"
      onClick={() => setTheme(resolveNextTheme(resolvedTheme))}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
