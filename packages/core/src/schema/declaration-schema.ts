import type { ChemdProgramDeclarationKind } from "../program-ast";
import type { DeclarationFieldValueSchema } from "./declaration-value-schema";
import {
  booleanValue,
  chemicalValue,
  enumValue,
  floatValue,
  identifierValue,
  listValue,
  pathValue,
  percentValue,
  quantityValue,
  recordValue,
  refOrLiteralValue,
  stringValue,
  textValue
} from "./declaration-value-schema";

export type {
  DeclarationFieldValueSchema,
  DeclarationReferenceTargetKind
} from "./declaration-value-schema";

export const DECLARATION_KINDS = [
  "molecule", "material", "batch", "reaction", "result", "analysis", "sample",
  "artifact", "condition_screen", "procedure", "observation", "trace", "agent_run"
] as const satisfies readonly ChemdProgramDeclarationKind[];

export type ChemdDeclarationKind = typeof DECLARATION_KINDS[number];

export interface DeclarationFieldSchema {
  name: string;
  aliases?: string[];
  aliasListModes?: Record<string, "pipe" | "repeat" | "comma">;
  description?: string;
  list?: boolean;
  listMode?: "pipe" | "repeat" | "comma";
  required?: boolean;
  value?: DeclarationFieldValueSchema;
}

export interface DeclarationSchema {
  kind: ChemdDeclarationKind;
  fields: DeclarationFieldSchema[];
  allowsArbitraryFields?: boolean;
}

export interface DeclarationFieldResolution {
  canonicalName: string;
  isAlias: boolean;
}

const field = (
  name: string,
  options: Omit<DeclarationFieldSchema, "name"> = {}
): DeclarationFieldSchema => ({ name, ...options });

const statusValue = enumValue(["success", "partial", "failed", "unknown"], {
  aliases: { complete: "success", completed: "success", fail: "failed" },
  allowExtensions: true
});

const atmosphereValue = enumValue(["nitrogen", "argon", "air", "oxygen", "inert"], {
  aliases: { n2: "nitrogen", ar: "argon", o2: "oxygen" },
  allowExtensions: true
});

const participantValue = recordValue(refOrLiteralValue("molecule", "material", "batch"), {
  amount: quantityValue("amount"),
  equiv: quantityValue("equivalent"),
  equivalents: quantityValue("equivalent"),
  mass: quantityValue("mass"),
  volume: quantityValue("volume"),
  limiting: booleanValue
}, { delimiter: "|", openParams: false });

const evidenceValue = listValue(refOrLiteralValue("artifact", "analysis", "result", "sample"));
const targetFileListValue = listValue(pathValue);

export const DECLARATION_SCHEMAS: readonly DeclarationSchema[] = [
  {
    kind: "molecule",
    fields: [
      field("name", { required: true, value: stringValue }),
      field("smiles", { value: chemicalValue("smiles") }),
      field("role", { value: identifierValue }),
      field("formula", { value: chemicalValue("formula") }),
      field("cas", { value: chemicalValue("cas") }),
      field("inchi", { value: chemicalValue("inchi") }),
      field("inchikey", { value: chemicalValue("inchikey") })
    ]
  },
  {
    kind: "material",
    fields: [
      field("molecule", { value: refOrLiteralValue("molecule") }),
      field("supplier", { value: stringValue }),
      field("lot", { value: stringValue }),
      field("purity", { value: percentValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    kind: "batch",
    fields: [
      field("source", { value: refOrLiteralValue("reaction", "result", "sample", "batch") }),
      field("molecule", { value: refOrLiteralValue("molecule") }),
      field("mass", { value: quantityValue("mass") }),
      field("purity", { value: percentValue }),
      field("artifacts", { list: true, value: listValue(refOrLiteralValue("artifact")) })
    ]
  },
  {
    kind: "reaction",
    fields: [
      field("name", { value: stringValue }),
      field("reactants", { list: true, value: listValue(participantValue) }),
      field("products", { list: true, value: listValue(participantValue) }),
      field("reagents", { value: textValue }),
      field("catalyst", { value: textValue }),
      field("solvent", { value: stringValue }),
      field("temperature", { value: quantityValue("temperature") }),
      field("time", { value: quantityValue("time") }),
      field("pressure", { value: quantityValue("pressure") }),
      field("atmosphere", { value: atmosphereValue }),
      field("rxn_smiles", { aliases: ["reaction_smiles"], value: chemicalValue("rxn_smiles") })
    ]
  },
  {
    kind: "result",
    fields: [
      field("reaction", { aliases: ["ref"], value: refOrLiteralValue("reaction") }),
      field("product", { value: refOrLiteralValue("molecule", "batch", "sample") }),
      field("status", { value: statusValue }),
      field("yield", { value: percentValue }),
      field("conversion", { value: percentValue }),
      field("selectivity", { value: percentValue }),
      field("purity", { value: percentValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    kind: "analysis",
    fields: [
      field("type", { aliases: ["analysis_type"], value: identifierValue }),
      field("ref", { value: refOrLiteralValue("reaction", "result", "sample", "batch", "material") }),
      field("instrument", { value: stringValue }),
      field("method", { value: stringValue }),
      field("artifact", { aliases: ["artifacts"], list: true, value: listValue(refOrLiteralValue("artifact")) }),
      field("data", { value: textValue }),
      field("notes", { value: textValue })
    ],
    allowsArbitraryFields: true
  },
  {
    kind: "sample",
    fields: [
      field("name", { value: stringValue }),
      field("batch", { value: refOrLiteralValue("batch") }),
      field("derived_from", { value: refOrLiteralValue("sample", "batch", "result", "reaction") }),
      field("purity", { value: percentValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    kind: "artifact",
    fields: [
      field("kind", { value: identifierValue }),
      field("ref", { value: refOrLiteralValue("reaction", "result", "analysis", "sample", "batch", "material") }),
      field("path", { value: pathValue }),
      field("checksum", { value: stringValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    kind: "condition_screen",
    fields: [
      field("reaction", { value: refOrLiteralValue("reaction") }),
      field("standard", { value: refOrLiteralValue("reaction", "result") }),
      field("factor", { aliases: ["factors"], list: true, value: listValue(identifierValue) }),
      field("outcome", { aliases: ["outcomes"], list: true, value: listValue(identifierValue) }),
      field("notes", { value: textValue })
    ],
    allowsArbitraryFields: true
  },
  {
    kind: "procedure",
    fields: [
      field("ref", { value: refOrLiteralValue("reaction", "result", "sample", "analysis") }),
      field("reaction", { value: refOrLiteralValue("reaction") }),
      field("evidence", { list: true, value: evidenceValue })
    ]
  },
  {
    kind: "observation",
    fields: [
      field("ref", { value: refOrLiteralValue("reaction", "procedure", "analysis", "result", "sample") }),
      field("evidence", { list: true, value: evidenceValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    kind: "trace",
    fields: [
      field("plan", { value: refOrLiteralValue("procedure") }),
      field("mode", { value: enumValue(["planned", "observed", "replay"], { allowExtensions: true }) }),
      field("evidence", { list: true, value: evidenceValue })
    ]
  },
  {
    kind: "agent_run",
    fields: [
      field("goal", { required: true, value: textValue }),
      field("status", { required: true, value: enumValue(["planned", "running", "completed", "failed", "blocked", "cancelled"]) }),
      field("target_files", { aliases: ["targetFiles"], list: true, value: targetFileListValue }),
      field("evidence", { list: true, value: evidenceValue }),
      field("confidence", { value: floatValue })
    ],
    allowsArbitraryFields: true
  }
];

const SCHEMA_BY_KIND = new Map(DECLARATION_SCHEMAS.map((schema) => [schema.kind, schema]));

export const isKnownDeclarationKind = (kind: string): kind is ChemdDeclarationKind =>
  SCHEMA_BY_KIND.has(kind as ChemdDeclarationKind);

export const getDeclarationSchema = (kind: string): DeclarationSchema | undefined =>
  isKnownDeclarationKind(kind) ? SCHEMA_BY_KIND.get(kind) : undefined;

export const getCanonicalDeclarationFields = (kind: string): string[] =>
  getDeclarationSchema(kind)?.fields.map((item) => item.name) ?? [];

export const getDeclarationFieldSchemas = (kind: string): DeclarationFieldSchema[] =>
  [...(getDeclarationSchema(kind)?.fields ?? [])];

export const resolveDeclarationField = (
  kind: string,
  fieldName: string
): DeclarationFieldResolution | undefined => {
  const schema = getDeclarationSchema(kind);
  if (!schema) {
    return undefined;
  }

  for (const fieldSchema of schema.fields) {
    if (fieldSchema.name === fieldName) {
      return { canonicalName: fieldSchema.name, isAlias: false };
    }

    if (fieldSchema.aliases?.includes(fieldName)) {
      return { canonicalName: fieldSchema.name, isAlias: true };
    }
  }

  return schema.allowsArbitraryFields
    ? { canonicalName: fieldName, isAlias: false }
    : undefined;
};

export const getDeclarationFieldSchema = (
  kind: string,
  fieldName: string
): DeclarationFieldSchema | undefined => {
  const schema = getDeclarationSchema(kind);
  const resolved = resolveDeclarationField(kind, fieldName);
  const canonicalName = resolved?.canonicalName ?? fieldName;

  return schema?.fields.find((item) => item.name === canonicalName);
};
