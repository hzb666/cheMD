export const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

export const isSafeMarkdownHref = (href: string): boolean => {
  const trimmed = href.trim();

  if (!trimmed || hasControlCharacters(trimmed)) {
    return false;
  }

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return true;
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (!schemeMatch) {
    return true;
  }

  const scheme = schemeMatch[1].toLowerCase();

  return ["http", "https", "mailto"].includes(scheme);
};
