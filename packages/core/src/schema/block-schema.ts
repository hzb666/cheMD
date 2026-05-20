import type { ChemdSemanticKind } from "../ast";

export interface BlockFieldSchema {
  name: string;
  aliases?: string[];
  aliasListModes?: Record<string, "pipe" | "repeat">;
  list?: boolean;
  listMode?: "pipe" | "repeat";
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

const pNumberField: PatternFieldSchema = {
  description: "Legacy TLC lane field pN",
  pattern: /^p\d+$/
};

const conditionAuxiliaryField: PatternFieldSchema = {
  description: "Legacy condition attempt/result/note fields",
  pattern: /^(?:var|res|note)\d+$/
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
      field("kind", { values: CHEMD_KIND_VALUE_ALIASES }),
      field("smiles"),
      field("cas"),
      field("inchi"),
      field("inchikey"),
      field("canonical_smiles"),
      field("name"),
      field("role"),
      field("caption"),
      field("formula"),
      field("mw"),
      field("amount"),
      field("equivalents", { aliases: ["equiv"] }),
      field("reactant", {
        aliases: ["reac", "reactants"],
        aliasListModes: { reactants: "pipe" },
        list: true,
        listMode: "repeat"
      }),
      field("product", {
        aliases: ["prod", "products"],
        aliasListModes: { products: "pipe" },
        list: true,
        listMode: "repeat"
      }),
      field("conditions", { list: true }),
      field("route"),
      field("prev", { list: true }),
      field("equation"),
      field("rxn_smiles"),
      field("reagents"),
      field("catalyst"),
      field("solvent"),
      field("temperature"),
      field("time"),
      field("pressure"),
      field("atmosphere"),
      field("yield"),
      field("conversion"),
      field("selectivity"),
      field("chemistry_features", { list: true })
    ]
  },
  {
    blockType: "material",
    nodeType: "material",
    fields: [
      field("molecule"),
      field("supplier"),
      field("lot"),
      field("purity"),
      field("density"),
      field("storage"),
      field("notes"),
      field("chemistry_features", { list: true })
    ]
  },
  {
    blockType: "batch",
    nodeType: "batch",
    fields: [
      field("source"),
      field("molecule"),
      field("state"),
      field("mass"),
      field("purity"),
      field("notes"),
      field("artifacts", { list: true }),
      field("chemistry_features", { list: true })
    ]
  },
  {
    blockType: "result",
    nodeType: "result",
    fields: [
      field("status"),
      field("yield"),
      field("conversion"),
      field("selectivity"),
      field("isolated_mass"),
      field("product_state"),
      field("purity"),
      field("notes"),
      field("ref"),
      field("reaction"),
      field("product")
    ]
  },
  {
    blockType: "analysis",
    nodeType: "analysis",
    fields: [
      field("type", { aliases: ["analysis_type", "analysisType"] }),
      field("ref"),
      field("time"),
      field("eluent"),
      field("plate"),
      field("visualization"),
      field("result"),
      field("instrument"),
      field("solvent"),
      field("frequency"),
      field("method"),
      field("artifact", { aliases: ["artifacts"], aliasListModes: { artifacts: "pipe" }, list: true, listMode: "repeat" }),
      field("spectrum"),
      field("lane", { list: true, listMode: "repeat" }),
      field("spot", { list: true, listMode: "repeat" }),
      field("mess", { list: true, listMode: "repeat" }),
      field("base", { list: true, listMode: "repeat" }),
      field("none", { list: true, listMode: "repeat" }),
      field("peak", { list: true, listMode: "repeat" }),
      field("ion", { list: true, listMode: "repeat" }),
      field("data"),
      field("notes")
    ],
    patternFields: [pNumberField]
  },
  {
    blockType: "sample",
    nodeType: "sample",
    fields: [
      field("name"),
      field("sample_id"),
      field("batch"),
      field("purity"),
      field("supplier"),
      field("notes"),
      field("ref"),
      field("derived_from"),
      field("aliquot_of"),
      field("batch_of"),
      field("artifacts", { list: true }),
      field("chemistry_features", { list: true })
    ]
  },
  {
    blockType: "artifact",
    nodeType: "artifact",
    fields: [
      field("kind"),
      field("ref"),
      field("path"),
      field("checksum"),
      field("instrument"),
      field("notes"),
      field("chemistry_features", { list: true })
    ]
  },
  {
    blockType: "condition-varies",
    nodeType: "condition_varies",
    fields: [
      field("reaction"),
      field("standard"),
      field("factor", { list: true, listMode: "repeat" }),
      field("outcome", { list: true, listMode: "repeat" }),
      field("attempt", { list: true, listMode: "repeat" }),
      field("condition"),
      field("varies"),
      field("notes")
    ],
    patternFields: [conditionAuxiliaryField],
    allowsArbitraryFields: true
  },
  {
    blockType: "procedure",
    nodeType: "procedure",
    childLineFields: ["step", "repeat", "until", "branch", "parallel", "wait", "abort_if"],
    fields: [
      field("ref"),
      field("reaction"),
      field("evidence", { list: true })
    ]
  },
  {
    blockType: "trace",
    nodeType: "trace",
    childLineFields: ["event"],
    fields: [
      field("plan"),
      field("mode")
    ]
  },
  {
    blockType: "observation",
    nodeType: "observation",
    childLineFields: ["event"],
    fields: [field("ref")]
  },
  {
    blockType: "template",
    nodeType: "template",
    fields: [
      field("params"),
      field("bind"),
      field("description"),
      field("body")
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
      field("id"),
      field("step_id"),
      field("family"),
      field("inputs"),
      field("outputs"),
      field("depends_on", { aliases: ["dependsOn"] }),
      field("stage"),
      field("purpose"),
      field("evidence"),
      field("confidence")
    ]
  },
  {
    blockType: "trace_event",
    nodeType: "trace_event",
    fields: [
      field("id"),
      field("event_id"),
      field("type", { aliases: ["eventType", "event_type"] }),
      field("at"),
      field("step", { aliases: ["stepId", "step_id"] }),
      field("control", { aliases: ["controlId", "control_id"] }),
      field("artifact"),
      field("analysis"),
      field("result")
    ]
  },
  {
    blockType: "event",
    nodeType: "event",
    fields: [
      field("id"),
      field("event_id"),
      field("type", { aliases: ["eventType", "event_type"] }),
      field("stage"),
      field("timepoint"),
      field("severity"),
      field("linked_step", { aliases: ["linkedStep"] }),
      field("evidence"),
      field("confidence")
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
