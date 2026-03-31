export const DEFAULT_COMPILE_DEBOUNCE_MS = 180;

export interface CompileSchedulerOptions {
  delayMs?: number;
}

export interface CompileInput {
  source: string;
  profileId: string;
}

export interface CompileScheduler<TInput, TOutput> {
  schedule: (input: TInput, onComplete: (result: TOutput) => void) => void;
  cancel: () => void;
}

export const createCompileScheduler = <TInput, TOutput>(
  compile: (input: TInput) => TOutput,
  options: CompileSchedulerOptions = {}
): CompileScheduler<TInput, TOutput> => {
  const delayMs = options.delayMs ?? DEFAULT_COMPILE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    schedule(input, onComplete) {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = undefined;
        onComplete(compile(input));
      }, delayMs);
    },
    cancel() {
      if (!timer) {
        return;
      }

      clearTimeout(timer);
      timer = undefined;
    }
  };
};
