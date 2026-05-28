import type {
  ChemdDeclaration,
  ChemdProgramDeclarationKind,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue
} from "@chemd/core";

export interface AuthoringDeclaration {
  id: string;
  kind: ChemdProgramDeclarationKind;
  fields: Record<string, ChemdValue>;
  ref?: string;
}

type FieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;

const hasFields = (declaration: ChemdDeclaration): declaration is FieldDeclaration =>
  "fields" in declaration;

const valueToSourceText = (value: ChemdValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.type === "reference") return value.raw;
  if (value.type === "string") return value.value;
  if (value.type === "identifier") return value.name;
  if (value.type === "quantity" || value.type === "percent") return value.raw;
  return value.raw;
};

export const normalizeAuthoringRef = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^@/, "") : undefined;
};

export const readDeclarationField = (
  declaration: AuthoringDeclaration,
  field: string
): string | undefined =>
  valueToSourceText(declaration.fields[field]);

const readTargetRef = (
  declaration: Extract<ChemdDeclaration, { target?: ChemdReferenceExpr }>
): string | undefined => valueToSourceText(declaration.target);

const readDeclarationRef = (declaration: ChemdDeclaration): string | undefined => {
  if (declaration.kind === "result") {
    return readTargetRef(declaration) ?? valueToSourceText(declaration.fields.reaction);
  }
  if (declaration.kind === "analysis" || declaration.kind === "observation" || declaration.kind === "trace") {
    return readTargetRef(declaration) ?? valueToSourceText(declaration.fields.ref);
  }
  if (declaration.kind === "procedure") {
    return readTargetRef(declaration);
  }
  return hasFields(declaration) ? valueToSourceText(declaration.fields.ref) : undefined;
};

export const collectObjectDeclarations = (
  document: ChemdProgramDocument
): AuthoringDeclaration[] =>
  document.declarations.flatMap((declaration) =>
    declaration.kind === "agent_run"
      ? []
      : hasFields(declaration) || declaration.kind === "procedure"
      ? [{
          id: declaration.id,
          kind: declaration.kind,
          fields: hasFields(declaration) ? declaration.fields : {},
          ref: normalizeAuthoringRef(readDeclarationRef(declaration))
        }]
      : []
  );

export const collectDeclarationIds = (document: ChemdProgramDocument): string[] =>
  document.declarations.map((declaration) => declaration.id).filter(Boolean);

export const findLastDeclarationId = (
  declarations: AuthoringDeclaration[],
  candidateIds: string[]
): string | undefined => {
  const wanted = new Set(candidateIds.filter(Boolean));
  let lastId: string | undefined;

  for (const declaration of declarations) {
    if (wanted.has(declaration.id)) {
      lastId = declaration.id;
    }
  }

  return lastId;
};
