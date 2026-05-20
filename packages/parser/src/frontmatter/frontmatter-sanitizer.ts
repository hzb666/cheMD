import type { Diagnostic } from "@chemd/core";
import { createFrontmatterDiagnostic } from "./frontmatter-diagnostics";
import {
  FRONTMATTER_BLOCK_SCALAR_PATTERN,
  getIndentWidth,
  parseFrontmatterKeyValueLine
} from "./frontmatter-shared";

export const sanitizeFrontmatterLines = (
  lines: string[],
  diagnostics: Diagnostic[]
): string[] => {
  const sanitizedLines = [...lines];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (getIndentWidth(line) > 0) {
      continue;
    }

    const keyValue = parseFrontmatterKeyValueLine(line);
    if (!keyValue) {
      diagnostics.push(
        createFrontmatterDiagnostic({
          code: "W_INVALID_FRONTMATTER_LINE",
          severity: "error",
          message: `Invalid frontmatter line: ${trimmed}`,
          lineIndex: index,
          lineText: line,
          token: trimmed
        })
      );
      sanitizedLines[index] = "";
      continue;
    }

    const { key, rawValue } = keyValue;
    const value = rawValue.trim();

    if (!FRONTMATTER_BLOCK_SCALAR_PATTERN.test(value)) {
      continue;
    }

    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "E_INVALID_FRONTMATTER_VALUE",
        severity: "error",
        message: `Unsupported multiline frontmatter scalar for ${key}: block scalars (| or >) are not supported`,
        lineIndex: index,
        lineText: line,
        token: key
      })
    );

    // 先清空 YAML 不支持的 block scalar，保证后续 parseDocument 还能继续定位剩余问题。
    sanitizedLines[index] = "";
    let lookahead = index + 1;
    while (lookahead < lines.length) {
      const nextLine = lines[lookahead];

      if (!nextLine.trim() || getIndentWidth(nextLine) > 0) {
        sanitizedLines[lookahead] = "";
        lookahead += 1;
        continue;
      }

      break;
    }

    index = lookahead - 1;
  }

  return sanitizedLines;
};
