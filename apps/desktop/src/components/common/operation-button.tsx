import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

interface OperationButtonProps {
  label: string;
  loadingLabel?: string;
  icon: React.ReactNode;
  operation: string;
  activeOperation: string | null;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  onClick: () => void;
}

export const OperationButton: React.FC<OperationButtonProps> = ({
  label,
  loadingLabel,
  icon,
  operation,
  activeOperation,
  disabled,
  disabledReason,
  variant = "outline",
  size = "sm",
  onClick,
}) => {
  const isLoading = activeOperation === operation;
  const content = (
    <>
      {isLoading ? <Loader2 className="animate-spin" /> : icon}
      {isLoading ? (loadingLabel ?? `${label}...`) : label}
    </>
  );

  const button = (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || activeOperation !== null}
      onClick={onClick}
    >
      {content}
    </Button>
  );

  if (disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

export default OperationButton;
