import type { ChemdSemanticKind } from "../ast";
import type { ReferenceTargetKind } from "../reference-utils";
import type { QuantityClass } from "./quantity-schema";

type FieldReferenceTargets = ReferenceTargetKind | readonly ReferenceTargetKind[];

interface FieldValueSchemaBase {
  description?: string;
}

export type ChemicalFieldValueKind =
  | "smiles"
  | "rxn_smiles"
  | "inchi"
  | "inchikey"
  | "cas"
  | "formula";

export type FieldValueSchema =
  | (FieldValueSchemaBase & { kind: "string" })
  | (FieldValueSchemaBase & { kind: "text" })
  | (FieldValueSchemaBase & { kind: "identifier" })
  | (FieldValueSchemaBase & { kind: "boolean" })
  | (FieldValueSchemaBase & { kind: "integer" })
  | (FieldValueSchemaBase & { kind: "float" })
  | (FieldValueSchemaBase & { kind: "date" })
  | (FieldValueSchemaBase & { kind: "path" })
  | (FieldValueSchemaBase & { kind: "url" })
  | (FieldValueSchemaBase & {
      kind: "enum";
      values: readonly string[];
      aliases?: Readonly<Record<string, string>>;
      allowExtensions?: boolean;
      suggestions?: readonly string[];
    })
  | (FieldValueSchemaBase & { kind: "quantity"; quantityClass: QuantityClass })
  | (FieldValueSchemaBase & { kind: "percent" })
  | (FieldValueSchemaBase & { kind: "reference"; targetKind: FieldReferenceTargets })
  | (FieldValueSchemaBase & { kind: "ref_or_literal"; targetKind: FieldReferenceTargets })
  | (FieldValueSchemaBase & { kind: "list"; item: FieldValueSchema; mode: "pipe" | "comma" | "repeat" })
  | (FieldValueSchemaBase & {
      kind: "record";
      head?: FieldValueSchema;
      params: Readonly<Record<string, FieldValueSchema>>;
      delimiter?: "|" | ",";
      openParams?: boolean;
    })
  | (FieldValueSchemaBase & { kind: "chemical"; chemicalKind: ChemicalFieldValueKind })
  | (FieldValueSchemaBase & { kind: "domain"; domainKind: string });

export interface BlockFieldSchema {
  name: string;
  aliases?: string[];
  aliasListModes?: Record<string, "pipe" | "repeat">;
  completionKinds?: ChemdSemanticKind[];
  list?: boolean;
  listMode?: "pipe" | "repeat";
  value?: FieldValueSchema;
  values?: Record<string, string>;
}

export interface PatternFieldSchema {
  description: string;
  pattern: RegExp;
}

export interface BlockSchema {
  blockType: string;
  childLineFields?: string[];
  fields: BlockFieldSchema[];
  nodeType: string;
  patternFields?: PatternFieldSchema[];
  allowsArbitraryFields?: boolean;
}

export interface FieldResolution {
  canonicalName: string;
  isAlias: boolean;
}

const field = (
  name: string,
  options: Omit<BlockFieldSchema, "name"> = {}
): BlockFieldSchema => ({ name, ...options });

const chemdCommon = ["molecule", "reaction"] satisfies ChemdSemanticKind[];
const chemdMolecule = ["molecule"] satisfies ChemdSemanticKind[];
const chemdReaction = ["reaction"] satisfies ChemdSemanticKind[];
const quantityClasses = [
  "amount",
  "mass",
  "volume",
  "temperature",
  "time",
  "pressure",
  "concentration",
  "equivalent",
  "percent",
  "rate",
  "rpm",
  "ph"
] satisfies QuantityClass[];

const stringValue = { kind: "string" } satisfies FieldValueSchema;
const textValue = { kind: "text" } satisfies FieldValueSchema;
const identifierValue = { kind: "identifier" } satisfies FieldValueSchema;
const booleanValue = { kind: "boolean" } satisfies FieldValueSchema;
const floatValue = { kind: "float" } satisfies FieldValueSchema;
const pathValue = { kind: "path" } satisfies FieldValueSchema;
const percentValue = { kind: "percent" } satisfies FieldValueSchema;

const enumValue = (
  values: readonly string[],
  options: Omit<Extract<FieldValueSchema, { kind: "enum" }>, "kind" | "values"> = {}
): FieldValueSchema => ({ kind: "enum", values, ...options });

const quantityValue = (quantityClass: QuantityClass): FieldValueSchema => ({
  kind: "quantity",
  quantityClass
});

const chemicalValue = (chemicalKind: ChemicalFieldValueKind): FieldValueSchema => ({
  kind: "chemical",
  chemicalKind
});

const domainValue = (domainKind: string): FieldValueSchema => ({ kind: "domain", domainKind });

const fieldTargets = (
  targets: readonly [ReferenceTargetKind, ...ReferenceTargetKind[]]
): FieldReferenceTargets => targets.length === 1 ? targets[0] : targets;

const refOrLiteralValue = (
  ...targetKind: [ReferenceTargetKind, ...ReferenceTargetKind[]]
): FieldValueSchema => ({
  kind: "ref_or_literal",
  targetKind: fieldTargets(targetKind)
});

const listValue = (
  item: FieldValueSchema,
  mode: Extract<FieldValueSchema, { kind: "list" }>["mode"] = "pipe"
): FieldValueSchema => ({ kind: "list", item, mode });

const recordValue = (
  head: FieldValueSchema | undefined,
  params: Readonly<Record<string, FieldValueSchema>>,
  options: Omit<Extract<FieldValueSchema, { kind: "record" }>, "kind" | "head" | "params"> = {}
): FieldValueSchema => ({
  kind: "record",
  ...(head ? { head } : {}),
  params,
  ...options
});

const participantReferenceValue = refOrLiteralValue("molecule", "material", "batch");
const participantValue = recordValue(participantReferenceValue, {
  amount: quantityValue("amount"),
  equiv: quantityValue("equivalent"),
  equivalent: quantityValue("equivalent"),
  equivalents: quantityValue("equivalent"),
  mass: quantityValue("mass"),
  volume: quantityValue("volume"),
  limiting: booleanValue
}, { delimiter: "|", openParams: false });

const conditionDeclarationValue = recordValue(identifierValue, {
  baseline: stringValue,
  quantity: enumValue(quantityClasses),
  quantityClass: enumValue(quantityClasses)
}, { delimiter: "|", openParams: false });

const conditionAttemptValue = recordValue(identifierValue, {
  mode: enumValue(["partial", "override", "full", "replace"]),
  reaction: refOrLiteralValue("reaction"),
  result: refOrLiteralValue("result")
}, { delimiter: "|", openParams: true });

const analysisTypeValue = enumValue(
  ["tlc", "nmr", "hplc", "uplc", "gc", "lcms", "gcms", "ms", "hrms", "ir", "uv"],
  {
    aliases: {
      "lc-ms": "lcms",
      "gc-ms": "gcms",
      "uv-vis": "uv"
    },
    allowExtensions: true
  }
);

const statusValue = enumValue(["success", "partial", "failed", "unknown"], {
  aliases: {
    complete: "success",
    completed: "success",
    done: "success",
    fail: "failed",
    partial_conversion: "partial"
  },
  suggestions: ["success", "failed", "partial", "pending"]
});

const atmosphereValue = enumValue(["nitrogen", "argon", "air", "oxygen", "inert"], {
  aliases: {
    n2: "nitrogen",
    ar: "argon",
    o2: "oxygen"
  },
  allowExtensions: true
});

const pNumberField: PatternFieldSchema = {
  description: "TLC lane field pN",
  pattern: /^p\d+$/
};

export const CHEMD_KIND_VALUE_ALIASES: Record<string, ChemdSemanticKind> = {
  molecule: "molecule",
  mol: "molecule",
  reaction: "reaction",
  reac: "reaction"
};

export const BLOCK_SCHEMAS: readonly BlockSchema[] = [
  {
    blockType: "chemd",
    nodeType: "chemd",
    fields: [
      field("kind", {
        values: CHEMD_KIND_VALUE_ALIASES,
        completionKinds: chemdCommon,
        value: enumValue(["molecule", "reaction"], { aliases: CHEMD_KIND_VALUE_ALIASES })
      }),
      field("smiles", { completionKinds: chemdMolecule, value: chemicalValue("smiles") }),
      field("cas", { completionKinds: chemdMolecule, value: chemicalValue("cas") }),
      field("inchi", { completionKinds: chemdMolecule, value: chemicalValue("inchi") }),
      field("inchikey", { completionKinds: chemdMolecule, value: chemicalValue("inchikey") }),
      field("canonical_smiles", { completionKinds: chemdMolecule, value: chemicalValue("smiles") }),
      field("name", { completionKinds: chemdCommon, value: stringValue }),
      field("role", { completionKinds: chemdMolecule, value: stringValue }),
      field("caption", { completionKinds: chemdCommon, value: textValue }),
      field("formula", { completionKinds: chemdMolecule, value: chemicalValue("formula") }),
      field("mw", { completionKinds: chemdMolecule, value: domainValue("molecular_weight") }),
      field("amount", { value: quantityValue("amount") }),
      field("equivalents", { aliases: ["equiv"], value: quantityValue("equivalent") }),
      field("reactant", {
        aliases: ["reac", "reactants"],
        aliasListModes: { reactants: "pipe" },
        completionKinds: chemdReaction,
        list: true,
        listMode: "repeat",
        value: participantValue
      }),
      field("product", {
        aliases: ["prod", "products"],
        aliasListModes: { products: "pipe" },
        completionKinds: chemdReaction,
        list: true,
        listMode: "repeat",
        value: participantValue
      }),
      field("conditions", { completionKinds: chemdReaction, list: true, value: listValue(stringValue) }),
      field("route", { completionKinds: chemdReaction, value: identifierValue }),
      field("prev", { completionKinds: chemdReaction, list: true, value: listValue(refOrLiteralValue("reaction")) }),
      field("equation", { completionKinds: chemdReaction, value: stringValue }),
      field("rxn_smiles", { aliases: ["reaction_smiles"], completionKinds: chemdReaction, value: chemicalValue("rxn_smiles") }),
      field("reagents", { completionKinds: chemdReaction, value: stringValue }),
      field("catalyst", { completionKinds: chemdReaction, value: stringValue }),
      field("solvent", { completionKinds: chemdReaction, value: stringValue }),
      field("temperature", { completionKinds: chemdReaction, value: quantityValue("temperature") }),
      field("time", { completionKinds: chemdReaction, value: quantityValue("time") }),
      field("pressure", { completionKinds: chemdReaction, value: quantityValue("pressure") }),
      field("atmosphere", { completionKinds: chemdReaction, value: atmosphereValue }),
      field("yield", { completionKinds: chemdReaction, value: percentValue }),
      field("conversion", { completionKinds: chemdReaction, value: percentValue }),
      field("selectivity", { completionKinds: chemdReaction, value: percentValue }),
      field("chemistry_features", { completionKinds: chemdCommon, list: true, value: listValue(identifierValue) })
    ]
  },
  {
    blockType: "material",
    nodeType: "material",
    fields: [
      field("molecule", { value: refOrLiteralValue("molecule") }),
      field("supplier", { value: stringValue }),
      field("lot", { value: stringValue }),
      field("purity", { value: percentValue }),
      field("density", { value: domainValue("density") }),
      field("storage", { value: textValue }),
      field("notes", { value: textValue }),
      field("chemistry_features", { list: true, value: listValue(identifierValue) })
    ]
  },
  {
    blockType: "batch",
    nodeType: "batch",
    fields: [
      field("source", { value: refOrLiteralValue("reaction", "result", "sample", "batch") }),
      field("molecule", { value: refOrLiteralValue("molecule") }),
      field("state", { value: stringValue }),
      field("mass", { value: quantityValue("mass") }),
      field("purity", { value: percentValue }),
      field("notes", { value: textValue }),
      field("artifacts", { list: true, value: listValue(refOrLiteralValue("artifact")) }),
      field("chemistry_features", { list: true, value: listValue(identifierValue) })
    ]
  },
  {
    blockType: "result",
    nodeType: "result",
    fields: [
      field("status", { value: statusValue }),
      field("yield", { value: percentValue }),
      field("conversion", { value: percentValue }),
      field("selectivity", { value: percentValue }),
      field("isolated_mass", { value: quantityValue("mass") }),
      field("product_state", { value: stringValue }),
      field("purity", { value: percentValue }),
      field("notes", { value: textValue }),
      field("ref", { value: refOrLiteralValue("reaction") }),
      field("reaction", { value: refOrLiteralValue("reaction") }),
      field("product", { value: refOrLiteralValue("molecule") })
    ]
  },
  {
    blockType: "analysis",
    nodeType: "analysis",
    fields: [
      field("type", { aliases: ["analysis_type", "analysisType"], value: analysisTypeValue }),
      field("ref", { value: refOrLiteralValue("reaction", "result", "sample", "batch", "material") }),
      field("time", { value: quantityValue("time") }),
      field("eluent", { value: stringValue }),
      field("plate", { value: stringValue }),
      field("visualization", { value: stringValue }),
      field("result", { value: stringValue }),
      field("instrument", { value: stringValue }),
      field("solvent", { value: stringValue }),
      field("frequency", { value: domainValue("nmr_frequency") }),
      field("method", { value: stringValue }),
      field("artifact", {
        aliases: ["artifacts"],
        aliasListModes: { artifacts: "pipe" },
        list: true,
        listMode: "repeat",
        value: refOrLiteralValue("artifact")
      }),
      field("spectrum", { value: domainValue("analysis_spectrum") }),
      field("lane", { list: true, listMode: "repeat", value: domainValue("tlc_lane") }),
      field("spot", { list: true, listMode: "repeat", value: domainValue("tlc_spot") }),
      field("mess", { list: true, listMode: "repeat", value: domainValue("tlc_mess") }),
      field("base", { list: true, listMode: "repeat", value: domainValue("tlc_baseline") }),
      field("none", { list: true, listMode: "repeat", value: domainValue("tlc_none") }),
      field("peak", { list: true, listMode: "repeat", value: domainValue("analysis_peak") }),
      field("ion", { list: true, listMode: "repeat", value: domainValue("mass_spectrometry_ion") }),
      field("data", { value: textValue }),
      field("notes", { value: textValue })
    ],
    patternFields: [pNumberField]
  },
  {
    blockType: "sample",
    nodeType: "sample",
    fields: [
      field("name", { value: stringValue }),
      field("sample_id", { value: identifierValue }),
      field("batch", { value: stringValue }),
      field("purity", { value: percentValue }),
      field("supplier", { value: stringValue }),
      field("notes", { value: textValue }),
      field("ref", { value: refOrLiteralValue("reaction", "result", "analysis", "batch", "material") }),
      field("derived_from", { value: refOrLiteralValue("sample", "batch", "result", "reaction") }),
      field("aliquot_of", { value: refOrLiteralValue("sample") }),
      field("batch_of", { value: refOrLiteralValue("sample") }),
      field("artifacts", { list: true, value: listValue(refOrLiteralValue("artifact")) }),
      field("chemistry_features", { list: true, value: listValue(identifierValue) })
    ]
  },
  {
    blockType: "artifact",
    nodeType: "artifact",
    fields: [
      field("kind", { value: identifierValue }),
      field("ref", { value: refOrLiteralValue("reaction", "result", "analysis", "sample", "batch", "material") }),
      field("path", { value: pathValue }),
      field("checksum", { value: stringValue }),
      field("instrument", { value: stringValue }),
      field("notes", { value: textValue }),
      field("chemistry_features", { list: true, value: listValue(identifierValue) })
    ]
  },
  {
    blockType: "condition-varies",
    nodeType: "condition_varies",
    fields: [
      field("reaction", { value: refOrLiteralValue("reaction") }),
      field("standard", { value: refOrLiteralValue("reaction", "result") }),
      field("factor", { list: true, listMode: "repeat", value: conditionDeclarationValue }),
      field("outcome", { list: true, listMode: "repeat", value: conditionDeclarationValue }),
      field("attempt", { list: true, listMode: "repeat", value: conditionAttemptValue }),
      field("notes", { value: textValue })
    ]
  },
  {
    blockType: "procedure",
    nodeType: "procedure",
    childLineFields: ["step", "repeat", "until", "branch", "parallel", "wait", "abort_if"],
    fields: [
      field("ref", { value: refOrLiteralValue("reaction", "result", "sample", "analysis") }),
      field("reaction", { value: refOrLiteralValue("reaction") }),
      field("evidence", { list: true, value: listValue(refOrLiteralValue("artifact", "analysis", "result")) })
    ]
  },
  {
    blockType: "trace",
    nodeType: "trace",
    childLineFields: ["event"],
    fields: [
      field("plan", { value: refOrLiteralValue("procedure") }),
      field("mode", { value: enumValue(["planned", "observed", "replay"], { allowExtensions: true }) })
    ]
  },
  {
    blockType: "observation",
    nodeType: "observation",
    childLineFields: ["event"],
    fields: [field("ref", { value: refOrLiteralValue("reaction", "procedure", "analysis", "result", "sample") })]
  },
  {
    blockType: "template",
    nodeType: "template",
    fields: [
      field("params", { value: listValue(identifierValue) }),
      field("bind", { value: domainValue("template_bindings") }),
      field("description", { value: textValue }),
      field("body", { value: textValue })
    ]
  },
  {
    blockType: "use",
    nodeType: "use",
    fields: [],
    allowsArbitraryFields: true
  },
  {
    blockType: "col",
    nodeType: "col",
    fields: []
  },
  {
    blockType: "step",
    nodeType: "step",
    fields: [
      field("id", { value: identifierValue }),
      field("step_id", { value: identifierValue }),
      field("family", {
        value: enumValue([
          "charge",
          "add",
          "stir",
          "heat",
          "cool",
          "quench",
          "extract",
          "wash",
          "dry",
          "concentrate",
          "purify",
          "analyze"
        ], { allowExtensions: true })
      }),
      field("inputs", { value: listValue(refOrLiteralValue("molecule", "material", "batch", "sample"), "comma") }),
      field("outputs", { value: listValue(refOrLiteralValue("molecule", "material", "batch", "sample", "artifact"), "comma") }),
      field("depends_on", { aliases: ["dependsOn"], value: listValue(identifierValue, "comma") }),
      field("stage", {
        value: enumValue([
          "reaction_setup",
          "reaction",
          "workup",
          "purification",
          "analysis"
        ], { allowExtensions: true })
      }),
      field("purpose", { value: textValue }),
      field("evidence", { value: listValue(refOrLiteralValue("artifact", "analysis", "result"), "comma") }),
      field("confidence", { value: floatValue })
    ]
  },
  {
    blockType: "trace_event",
    nodeType: "trace_event",
    fields: [
      field("id", { value: identifierValue }),
      field("event_id", { value: identifierValue }),
      field("type", { aliases: ["eventType", "event_type"], value: identifierValue }),
      field("at", { value: stringValue }),
      field("step", { aliases: ["stepId", "step_id"], value: identifierValue }),
      field("control", { aliases: ["controlId", "control_id"], value: identifierValue }),
      field("artifact", { value: refOrLiteralValue("artifact") }),
      field("analysis", { value: refOrLiteralValue("analysis") }),
      field("result", { value: refOrLiteralValue("result") })
    ]
  },
  {
    blockType: "event",
    nodeType: "event",
    fields: [
      field("id", { value: identifierValue }),
      field("event_id", { value: identifierValue }),
      field("type", {
        aliases: ["eventType", "event_type"],
        value: enumValue(["color_change", "precipitation", "gas_evolution", "phase_change"], {
          allowExtensions: true
        })
      }),
      field("stage", { value: stringValue }),
      field("timepoint", { value: stringValue }),
      field("severity", { value: enumValue(["info", "warning", "error"], { allowExtensions: true }) }),
      field("linked_step", { aliases: ["linkedStep"], value: identifierValue }),
      field("evidence", { value: listValue(refOrLiteralValue("artifact", "analysis", "result"), "comma") }),
      field("confidence", { value: floatValue })
    ]
  }
];

const SCHEMA_BY_BLOCK = new Map(BLOCK_SCHEMAS.map((schema) => [schema.blockType, schema]));

export const getBlockSchema = (blockType: string): BlockSchema | undefined =>
  SCHEMA_BY_BLOCK.get(blockType);

export const isKnownBlockType = (blockType: string): boolean =>
  SCHEMA_BY_BLOCK.has(blockType);

export const normalizeChemdKind = (raw: string): ChemdSemanticKind | undefined =>
  CHEMD_KIND_VALUE_ALIASES[raw.trim().toLowerCase()];

export const getCanonicalBlockFields = (blockType: string): string[] =>
  getBlockSchema(blockType)?.fields.map((item) => item.name) ?? [];

export const getBlockFieldSchemas = (blockType: string): BlockFieldSchema[] =>
  [...(getBlockSchema(blockType)?.fields ?? [])];

export const getBlockFieldSchema = (
  blockType: string,
  fieldName: string
): BlockFieldSchema | undefined => {
  const schema = getBlockSchema(blockType);
  const resolved = resolveBlockField(blockType, fieldName);
  const canonicalName = resolved?.canonicalName ?? fieldName;

  return schema?.fields.find((item) => item.name === canonicalName);
};

export const getFieldValueSchema = (
  blockType: string,
  fieldName: string
): FieldValueSchema | undefined =>
  getBlockFieldSchema(blockType, fieldName)?.value;

export const getListItemValueSchema = (
  value: FieldValueSchema | undefined
): FieldValueSchema | undefined =>
  value?.kind === "list" ? value.item : value;

export const getEnumFieldValues = (
  blockType: string,
  fieldName: string
): string[] => {
  const value = getListItemValueSchema(getFieldValueSchema(blockType, fieldName));
  if (value?.kind === "enum") {
    return [...value.values];
  }

  return Object.keys(getBlockFieldSchema(blockType, fieldName)?.values ?? {});
};

export const getFieldValueSuggestions = (
  blockType: string,
  fieldName: string
): string[] => {
  const value = getListItemValueSchema(getFieldValueSchema(blockType, fieldName));
  if (value?.kind !== "enum") {
    return getEnumFieldValues(blockType, fieldName);
  }

  return [...(value.suggestions ?? value.values)];
};

export const getQuantityFieldClass = (
  blockType: string,
  fieldName: string
): QuantityClass | undefined => {
  const value = getListItemValueSchema(getFieldValueSchema(blockType, fieldName));
  if (value?.kind === "quantity") {
    return value.quantityClass;
  }

  return value?.kind === "percent" ? "percent" : undefined;
};

const referenceTargetsToArray = (targetKind: FieldReferenceTargets): ReferenceTargetKind[] =>
  typeof targetKind === "string" ? [targetKind] : [...targetKind];

export const getReferenceTargetKinds = (
  blockType: string,
  fieldName: string
): ReferenceTargetKind[] => {
  const value = getListItemValueSchema(getFieldValueSchema(blockType, fieldName));
  const candidate = value?.kind === "record" ? value.head : value;
  return candidate?.kind === "reference" || candidate?.kind === "ref_or_literal"
    ? referenceTargetsToArray(candidate.targetKind)
    : [];
};

export const getBlockChildLineFields = (blockType: string): string[] =>
  [...(getBlockSchema(blockType)?.childLineFields ?? [])];

export const getCompletionBlockFieldSchemas = (
  blockType: string,
  kind?: ChemdSemanticKind
): BlockFieldSchema[] => {
  const fields = getBlockFieldSchemas(blockType);
  if (blockType !== "chemd" || !kind) {
    return fields;
  }

  return fields.filter((item) => item.completionKinds?.includes(kind) === true);
};

export const getCompletionBlockFields = (
  blockType: string,
  kind?: ChemdSemanticKind
): string[] => getCompletionBlockFieldSchemas(blockType, kind).map((item) => item.name);

export const getAllowedBlockFieldSet = (blockType: string): Set<string> =>
  new Set(getCanonicalBlockFields(blockType));

export const getBlockListFieldSet = (blockType: string): Set<string> => {
  const schema = getBlockSchema(blockType);
  return new Set(schema?.fields.filter((item) => item.list).map((item) => item.name) ?? []);
};

export const getBlockFieldListMode = (
  blockType: string,
  canonicalName: string,
  originalName = canonicalName
): "pipe" | "repeat" | undefined => {
  const schema = getBlockSchema(blockType);
  const fieldSchema = schema?.fields.find((item) => item.name === canonicalName);
  if (!fieldSchema?.list) {
    return undefined;
  }

  return fieldSchema.aliasListModes?.[originalName] ?? fieldSchema.listMode ?? "pipe";
};

export const resolveBlockField = (
  blockType: string,
  fieldName: string
): FieldResolution | undefined => {
  const schema = getBlockSchema(blockType);
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

  if (schema.patternFields?.some((item) => item.pattern.test(fieldName))) {
    return { canonicalName: fieldName, isAlias: false };
  }

  return schema.allowsArbitraryFields
    ? { canonicalName: fieldName, isAlias: false }
    : undefined;
};
