import { Badge } from "@/components/ui/badge";

type StatusTone = "success" | "ready" | "ok" | "warning" | "pending" | "placeholder" | "degraded" | "danger" | "offline" | "error" | "failure";

const toneVariant: Record<StatusTone, "default" | "secondary" | "outline" | "destructive"> = {
  success: "outline",
  ready: "outline",
  ok: "outline",
  warning: "secondary",
  pending: "secondary",
  placeholder: "secondary",
  degraded: "secondary",
  danger: "destructive",
  offline: "destructive",
  error: "destructive",
  failure: "destructive",
};

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  detail?: string;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone, detail, dot }) => (
  <Badge variant={toneVariant[tone] ?? "outline"} className="max-w-[14rem] gap-1.5 rounded-full border-border/40 bg-card/35 font-medium text-foreground shadow-none">
    {dot && (
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        data-state={tone}
      />
    )}
    <span className="truncate">{label}</span>
    {detail && <span className="truncate opacity-70 font-normal">{detail}</span>}
  </Badge>
);

export default StatusBadge;
