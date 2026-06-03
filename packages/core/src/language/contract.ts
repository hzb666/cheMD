export const CHEMD_LANGUAGE_CONTRACT = {
  id: "chemd-current",
  schemaVersion: "chemd-language-contract/v0.5",
  sourceLanguage: "chemd/program-v1",
  compatibilityModes: [] as const,
  authorConfigFields: [] as const,
  program: {
    tokenTypes: [
      "identifier",
      "string",
      "number",
      "left_brace",
      "right_brace",
      "left_paren",
      "right_paren",
      "left_bracket",
      "right_bracket",
      "colon",
      "comma",
      "dot",
      "hash",
      "at",
      "equal",
      "percent",
      "comment",
      "doc_comment",
      "unknown",
      "eof"
    ],
    keywords: [
      "module",
      "import",
      "as",
      "from",
      "meta",
      "for",
      "step",
      "evidence",
      "tool",
      "patch",
      "decision",
      "timeline"
    ],
    declarationKinds: [
      "molecule",
      "material",
      "batch",
      "reaction",
      "result",
      "analysis",
      "sample",
      "artifact",
      "condition_screen",
      "procedure",
      "observation",
      "trace",
      "agent_run"
    ],
    module: {
      keyword: "module",
      nameToken: "identifier"
    },
    imports: {
      keyword: "import",
      aliasKeyword: "as",
      fromKeyword: "from",
      sourceToken: "string"
    },
    meta: {
      keyword: "meta",
      requiredFields: ["id", "title", "date"],
      primaryFields: [
        "primary_molecule",
        "primary_reaction",
        "primary_result",
        "primary_analysis",
        "primary_sample"
      ]
    },
    references: {
      prefix: "@",
      forms: [
        "@local",
        "@object.field",
        "@module.object",
        "@document#object",
        "@document#object.field"
      ]
    },
    values: {
      kinds: [
        "string",
        "identifier",
        "boolean",
        "number",
        "quantity",
        "percent",
        "reference",
        "list",
        "record",
        "call",
        "patch"
      ],
      collectionDelimiters: {
        list: ["[", "]"],
        record: ["{", "}"],
        call: ["(", ")"]
      }
    },
    parserCapabilities: {
      sourceSpans: true,
      diagnostics: true,
      recovery: true,
      docComments: true,
      legacySyntaxDiagnostics: true
    }
  }
} as const;

export type ChemdLanguageContract = typeof CHEMD_LANGUAGE_CONTRACT;
