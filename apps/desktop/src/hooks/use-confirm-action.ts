import { useCallback, useState } from "react";

type UseConfirmActionOptions = {
  disabled?: boolean;
  onConfirm: () => Promise<void> | void;
};

export const useConfirmAction = ({
  disabled = false,
  onConfirm,
}: UseConfirmActionOptions) => {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const isConfirming = !disabled && confirming;

  const reset = useCallback(() => {
    if (!running) setConfirming(false);
  }, [running]);

  const run = useCallback(async () => {
    if (disabled || running) return;
    if (!isConfirming) {
      setConfirming(true);
      return;
    }

    setRunning(true);
    try {
      await onConfirm();
      setConfirming(false);
    } finally {
      setRunning(false);
    }
  }, [disabled, isConfirming, onConfirm, running]);

  return {
    isConfirming,
    isRunning: running,
    reset,
    run,
  };
};
