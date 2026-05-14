import { Badge } from "@/components/ui/badge";

type StatusTone = "success" | "ready" | "ok" | "warning" | "pending" | "placeholder" | "degraded" | "danger" | "offline" | "error" | "failure";

const toneVariant: Record<StatusTone, "default" | "secondary" | "outline" | "destructive"> = {
  success: "default",
  ready: "default",
  ok: "default",
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
  <Badge variant={toneVariant[tone] ?? "outline"} className="gap-1.5">
    {dot && (
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        data-state={tone}
      />
    )}
    {label}
    {detail && <span className="opacity-70 font-normal">{detail}</span>}
  </Badge>
);

export default StatusBadge;
