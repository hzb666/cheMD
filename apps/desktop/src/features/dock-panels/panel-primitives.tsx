import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export const dockPanelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/15 p-3 text-sm shadow-none";
export const dockPanelHeadingClassName = "flex items-center justify-between gap-2";
export const dockPanelSubheadClassName = "flex items-center gap-2 text-xs font-medium text-muted-foreground";
export const dockPanelActionRowClassName = "flex flex-wrap items-center gap-2";
export const dockPanelCardClassName = "rounded-xl border border-white/35 bg-white/18 p-3";
export const dockPanelMessageClassName = "m-0 text-xs leading-relaxed text-muted-foreground data-[tone=danger]:text-destructive data-[tone=info]:text-primary data-[tone=warning]:text-warning";
export const dockPanelMetricGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 text-xs";
export const dockPanelMetricCellClassName = "min-w-0 rounded-lg border border-white/35 bg-white/18 px-2.5 py-2";
export const dockPanelMetricTermClassName = "m-0 truncate text-xs font-medium uppercase text-muted-foreground";
export const dockPanelMetricValueClassName = "mt-0.5 truncate font-mono text-xs text-foreground";
export const dockPanelListClassName = "m-0 flex list-none flex-col gap-2 p-0";
export const dockPanelListItemClassName = "min-w-0 rounded-xl border border-white/35 bg-white/18 p-2 text-xs";
export const dockPanelLogClassName = "flex max-h-40 min-h-20 flex-col gap-1 overflow-auto rounded-xl border bg-slate-950/90 p-3 font-mono text-xs text-slate-100";
export const dockPanelEmptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";

export type DockPanelButtonProps<T extends string> = {
  label: string;
  loadingLabel: string;
  icon: LucideIcon;
  operation: T;
  activeOperation: T | null;
  disabled: boolean;
  onClick: () => void;
};

export const DockPanelButton = <T extends string>({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: DockPanelButtonProps<T>) => {
  const loading = activeOperation === operation;
  return (
    <Button variant="outline" size="sm" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </Button>
  );
};
