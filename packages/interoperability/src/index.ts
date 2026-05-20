export type InteropDirection = "import" | "export";
export type InteropSeverity = "info" | "warning" | "error";

export interface InteropContext {
  documentId?: string;
  source?: string;
  verifier?: "none" | "external";
}

export interface InteropDiagnostic {
  code: string;
  severity: InteropSeverity;
  message: string;
  field?: string;
  facts?: Record<string, unknown>;
}

export interface InteropLoss {
  field: string;
  reason: string;
  rawValue?: unknown;
}

export interface InteropResult<T> {
  value?: T;
  diagnostics: InteropDiagnostic[];
  loss?: InteropLoss[];
  verified?: boolean;
}

export interface InteropAdapter<TInput, TOutput> {
  format: string;
  direction: InteropDirection;
  convert(input: TInput, context: InteropContext): InteropResult<TOutput>;
}

export interface MoleculeIdentityInput {
  smiles?: string;
  inchi?: string;
  inchikey?: string;
}

export interface MoleculeIdentityProjection extends MoleculeIdentityInput {
  standard_fields: Array<"smiles" | "inchi" | "inchikey">;
}

export interface ReactionStructureInput {
  rxn_smiles?: string;
}

export interface ReactionStructureProjection {
  rxn_smiles: string;
}

export interface AnimlPlaceholderMapping {
  profile: "animl-like-placeholder";
  compliant: false;
  analysis_type?: string;
  artifact_refs?: string[];
  fields: Record<string, unknown>;
}

export interface SilaRuntimeAdapter<TInput = unknown, TOutput = unknown>
  extends InteropAdapter<TInput, TOutput> {
  standard: "sila2";
}

export const INCHIKEY_PATTERN = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;

const diagnostic = (
  code: string,
  severity: InteropSeverity,
  message: string,
  field?: string,
  facts: Record<string, unknown> = {}
): InteropDiagnostic => ({
  code,
  severity,
  message,
  ...(field ? { field } : {}),
  ...(Object.keys(facts).length > 0 ? { facts } : {})
});

export const validateInChI = (value: string): InteropDiagnostic[] => {
  const trimmed = value.trim();
  return trimmed.startsWith("InChI=")
    ? []
    : [diagnostic(
        "E_INTEROP_INCHI_FORMAT",
        "error",
        "InChI value must start with InChI=.",
        "inchi",
        { raw_value: value }
      )];
};

export const validateInChIKey = (value: string): InteropDiagnostic[] => {
  const trimmed = value.trim();
  return INCHIKEY_PATTERN.test(trimmed)
    ? []
    : [diagnostic(
        "E_INTEROP_INCHIKEY_FORMAT",
        "error",
        "InChIKey must use the standard 14-10-1 uppercase segment format.",
        "inchikey",
        { raw_value: value }
      )];
};

export const validateSmilesSurface = (value: string): InteropDiagnostic[] => {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed)
    ? []
    : [diagnostic(
        "E_INTEROP_SMILES_PARSE",
        "error",
        "SMILES value must be a non-empty single token.",
        "smiles",
        { raw_value: value }
      )];
};

export const validateRxnSmilesSurface = (value: string): InteropDiagnostic[] => {
  const trimmed = value.trim();
  const parts = trimmed.split(">>");
  const valid = parts.length === 2 && parts.every((part) => part.trim().length > 0) && !/\s/.test(trimmed);

  return valid
    ? []
    : [diagnostic(
        "E_INTEROP_RXN_SMILES_PARSE",
        "error",
        "RXN SMILES must contain one non-empty reactant side and product side separated by >>.",
        "rxn_smiles",
        { raw_value: value }
      )];
};

export const exportMoleculeIdentity = (
  input: MoleculeIdentityInput,
  context: InteropContext = {}
): InteropResult<MoleculeIdentityProjection> => {
  const diagnostics = [
    ...(input.smiles ? validateSmilesSurface(input.smiles) : []),
    ...(input.inchi ? validateInChI(input.inchi) : []),
    ...(input.inchikey ? validateInChIKey(input.inchikey) : [])
  ];
  const standardFields = (["smiles", "inchi", "inchikey"] as const).filter((field) => Boolean(input[field]));
  const verified = context.verifier === "external" && diagnostics.every((item) => item.severity !== "error");

  if (!verified && standardFields.length > 1) {
    diagnostics.push(diagnostic(
      "W_INTEROP_UNVERIFIED_IDENTITY",
      "warning",
      "Multiple molecule identity fields are present but no external verifier confirmed consistency.",
      "identity",
      { fields: standardFields }
    ));
  }

  return {
    value: {
      ...input,
      standard_fields: standardFields
    },
    diagnostics,
    verified
  };
};

export const exportReactionStructure = (
  input: ReactionStructureInput,
  context: InteropContext = {}
): InteropResult<ReactionStructureProjection> => {
  if (!input.rxn_smiles) {
    return {
      diagnostics: [diagnostic(
        "E_INTEROP_RXN_SMILES_MISSING",
        "error",
        "Reaction structure export requires rxn_smiles.",
        "rxn_smiles"
      )],
      verified: false
    };
  }

  const diagnostics = validateRxnSmilesSurface(input.rxn_smiles);
  return {
    value: { rxn_smiles: input.rxn_smiles },
    diagnostics,
    verified: context.verifier === "external" && diagnostics.every((item) => item.severity !== "error")
  };
};

export const createAnimlPlaceholderMapping = (input: {
  analysis_type?: string;
  artifact_refs?: string[];
  fields?: Record<string, unknown>;
}): InteropResult<AnimlPlaceholderMapping> => ({
  value: {
    profile: "animl-like-placeholder",
    compliant: false,
    analysis_type: input.analysis_type,
    artifact_refs: input.artifact_refs,
    fields: input.fields ?? {}
  },
  diagnostics: [diagnostic(
    "W_INTEROP_PLACEHOLDER_NOT_COMPLIANT",
    "warning",
    "AnIML export is a placeholder mapping, not a validator-backed compliant export.",
    "profile"
  )],
  loss: [],
  verified: false
});
