export const parseContentDispositionFilename = (
  value: string | null
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (!match || !match[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
