import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface PanelHeaderProps {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  separator?: boolean;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  eyebrow,
  title,
  meta,
  actions,
  separator,
}) => (
  <div className="flex flex-col gap-1.5 border-b border-border/35 bg-transparent px-4 py-3">
    <div className="flex min-w-0 items-center gap-2">
      {eyebrow && (
        <Label className="shrink-0 text-xs uppercase text-muted-foreground">
          {eyebrow}
        </Label>
      )}
      <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
      {meta && (
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      )}
      {actions && (
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      )}
    </div>
    {separator && <Separator />}
  </div>
);

export default PanelHeader;
