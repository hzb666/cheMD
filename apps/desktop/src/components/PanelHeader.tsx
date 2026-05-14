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
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2">
      {eyebrow && (
        <Label className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </Label>
      )}
      <h3 className="text-sm font-medium">{title}</h3>
      {meta && (
        <span className="text-xs text-muted-foreground">{meta}</span>
      )}
      {actions && (
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      )}
    </div>
    {separator && <Separator />}
  </div>
);

export default PanelHeader;
