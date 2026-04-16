"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "./ui/button";
import { writeTextToClipboard } from "../lib/write-text-to-clipboard";

interface CopyIconButtonProps {
  copyText: string;
  label: string;
  className?: string;
}

export const CopyIconButton = ({
  copyText,
  label,
  className
}: CopyIconButtonProps) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const handleCopy = async () => {
    try {
      await writeTextToClipboard(copyText);
    } catch {
      return;
    }
    setCopied(true);

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, 1600);
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void handleCopy();
      }}
      className={className}
      data-copy-button="true"
    >
      {copied
        ? <Check size={18} strokeWidth={2.15} className="!h-[0.98rem] !w-[0.98rem] shrink-0" />
        : <Copy size={18} strokeWidth={2.15} className="!h-[0.98rem] !w-[0.98rem] shrink-0" />}
    </Button>
  );
};
