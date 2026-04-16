export const formatReactionListForEditor = (values: string[]): string => values.join("\n");

export const parseReactionListFromEditor = (value: string): string[] =>
  value
    .split(/\r?\n|\|/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
