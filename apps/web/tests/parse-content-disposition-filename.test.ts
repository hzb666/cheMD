import { describe, expect, it } from "vitest";

import { parseContentDispositionFilename } from "../src/features/export-docx/lib/parse-content-disposition-filename";

describe("parseContentDispositionFilename", () => {
  it("returns undefined when header is missing", () => {
    expect(parseContentDispositionFilename(null)).toBeUndefined();
  });

  it("extracts plain filename values", () => {
    expect(parseContentDispositionFilename('attachment; filename="report.docx"')).toBe(
      "report.docx"
    );
  });

  it("decodes utf-8 encoded filename values", () => {
    expect(
      parseContentDispositionFilename("attachment; filename*=UTF-8''report%20name.docx")
    ).toBe("report name.docx");
  });
});
