"use client";

import React, { useMemo, useState } from "react";

import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { cn } from "../../../lib/utils";

interface EditorSurfaceProps {
  source: string;
  onSourceChange?: (nextSource: string) => void;
}

const GUTTER_GRID_CLASS = "grid-cols-[3rem_minmax(0,1fr)]";
const HIDDEN_GUTTER_GRID_CLASS = "grid-cols-[0rem_minmax(0,1fr)]";
const SURFACE_EASING_CLASS = "ease-[cubic-bezier(0.22,1,0.36,1)]";
const SURFACE_TRANSITION_CLASS = `duration-300 ${SURFACE_EASING_CLASS}`;
const EDITOR_TEXT_CLASS = "font-mono text-sm leading-6";

const getMirrorLine = (line: string) => (line.length > 0 ? line : "\u00a0");

export const EditorSurface = ({ source, onSourceChange }: EditorSurfaceProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const lines = useMemo(() => source.split(/\r?\n/), [source]);

  return (
    <div
      className={cn(
        "relative h-full overflow-hidden bg-background",
        "shadow-none"
      )}
    >
      <Label className="sr-only" htmlFor="chemd-source-editor">
        Chemd source editor
      </Label>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn("min-h-full py-4", isFocused ? "px-4" : "px-5")}
          style={{ transform: `translateY(-${scrollTop}px)` }}
        >
          {lines.map((line, index) => (
            <div
              key={`${index}-${line.length}`}
              className={cn(
                "grid min-w-0 transition-[grid-template-columns]",
                SURFACE_TRANSITION_CLASS,
                isFocused ? GUTTER_GRID_CLASS : HIDDEN_GUTTER_GRID_CLASS
              )}
            >
              <div
                data-editor-line-number={index + 1}
                className={cn(
                  "editor-gutter-font flex items-start justify-end overflow-hidden pl-0.5 pr-5 text-right text-[12px] leading-6 text-muted-foreground/72 transition-[opacity,transform]",
                  SURFACE_TRANSITION_CLASS,
                  isFocused
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-3 opacity-0"
                )}
              >
                {index + 1}
              </div>
              <div className={cn("min-w-0 whitespace-pre-wrap break-words text-transparent", EDITOR_TEXT_CLASS)}>
                {getMirrorLine(line)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Textarea
        id="chemd-source-editor"
        className={cn(
          "relative z-10 h-full w-full resize-none rounded-none border-0 bg-transparent py-4 pr-4 shadow-none transition-[padding,box-shadow]",
          EDITOR_TEXT_CLASS,
          SURFACE_TRANSITION_CLASS,
          isFocused
            ? "pl-[4rem]"
            : "px-5",
          "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        )}
        value={source}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => onSourceChange?.(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        placeholder="Start typing your chemical markdown..."
        spellCheck={false}
      />
    </div>
  );
};
