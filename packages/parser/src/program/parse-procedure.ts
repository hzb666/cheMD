import type {
  ChemdCallArg,
  ChemdDocComment,
  ChemdReferenceExpr,
  ChemdValue,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement,
  ProgramProcedureControlKind,
  ProcedureStepDeclaration
} from "@chemd/core";

import type { ProgramParserContext, ProgramParserCursor } from "./parser";
import { tokenValue } from "./parser";
import {
  consumeOptionalSeparator,
  parseTargetReference,
  valueAsNumber,
  valueAsReferenceList,
  valueAsStringList
} from "./parse-declarations";

export const parseProcedureDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  docs: ChemdDocComment[]
): ProcedureDeclaration => {
  const start = cursor.expectValue("procedure", "E_PROGRAM_PROCEDURE_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_PROCEDURE_ID_EXPECTED", "procedure id");
  const declarationId = tokenValue(id) ?? "unknown";
  const target = parseTargetReference(cursor);
  cursor.expectValue("{", "E_PROGRAM_PROCEDURE_BLOCK_EXPECTED");

  let evidence: ChemdReferenceExpr[] | undefined;
  const parsed = parseProcedureStatements(cursor, context, declarationId, {
    allowEvidence: true,
    onEvidence: (value) => {
      evidence = value;
    }
  });
  if (!parsed.closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close procedure block.");
  }

  return {
    kind: "procedure",
    id: declarationId,
    qualifiedId: `${context.moduleName}.${declarationId}`,
    ...(target ? { target } : {}),
    ...(evidence ? { evidence } : {}),
    children: parsed.children,
    docs: context.addDocs(docs, { kind: "declaration", declarationId }),
    sourceSpan: cursor.sourceSpanFrom(start, parsed.endToken ?? start)
  };
};

const PROCEDURE_CONTROL_KINDS = new Set<ProgramProcedureControlKind>([
  "repeat",
  "until",
  "branch",
  "parallel",
  "case",
  "default",
  "path",
  "wait",
  "abort_if"
]);

const parseProcedureStatements = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  declarationId: string,
  options: {
    allowEvidence?: boolean;
    onEvidence?: (value: ChemdReferenceExpr[] | undefined) => void;
  } = {}
): { children: ProcedureStatement[]; endToken?: ReturnType<ProgramParserCursor["consume"]>; closed: boolean } => {
  const children: ProcedureStatement[] = [];
  let endToken: ReturnType<ProgramParserCursor["consume"]>;
  let closed = false;

  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === "}") {
      endToken = cursor.consume();
      closed = true;
      break;
    }
    const statementDocs = cursor.collectDocs();
    const next = tokenValue(cursor.peek());
    if (options.allowEvidence && next === "evidence") {
      cursor.consume();
      cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
      options.onEvidence?.(valueAsReferenceList(cursor.parseValue()));
      consumeOptionalSeparator(cursor);
    } else if (next === "step") {
      children.push(parseProcedureStep(cursor, context, declarationId, statementDocs));
    } else if (next && PROCEDURE_CONTROL_KINDS.has(next as ProgramProcedureControlKind)) {
      children.push(parseProcedureControl(cursor, context, declarationId, statementDocs));
    } else {
      cursor.syntaxError(
        "E_PROGRAM_PROCEDURE_STATEMENT_EXPECTED",
        "Expected a procedure step, control, or evidence field.",
        cursor.peek()
      );
      cursor.consume();
    }
  }

  return { children, endToken, closed };
};

const parseProcedureControl = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  declarationId: string,
  docs: ChemdDocComment[]
): ProcedureControlDeclaration => {
  const start = cursor.consume();
  const controlKind = tokenValue(start) as ProgramProcedureControlKind;
  const id = readOptionalControlId(cursor);
  const parsedArgs = parseProcedureControlArgs(cursor);
  const parsedBody = tokenValue(cursor.peek()) === "{"
    ? parseProcedureControlBody(cursor, context, declarationId)
    : undefined;
  consumeOptionalSeparator(cursor);

  const controlId = id ? tokenValue(id) : undefined;
  return {
    kind: "control",
    ...(controlId ? { id: controlId } : {}),
    controlKind,
    args: parsedArgs.args,
    children: parsedBody?.children ?? [],
    docs: context.addDocs(docs, {
      kind: "procedure_step",
      declarationId,
      stepId: controlId ?? `${controlKind}_control`
    }),
    sourceSpan: cursor.sourceSpanFrom(start, parsedBody?.endToken ?? parsedArgs.endToken ?? id ?? start)
  };
};

const readOptionalControlId = (
  cursor: ProgramParserCursor
): ReturnType<ProgramParserCursor["consume"]> => {
  const next = tokenValue(cursor.peek());
  if (!next || ["(", "{", "}", ",", ";"].includes(next)) {
    return undefined;
  }
  return cursor.expectIdentifier("E_PROGRAM_PROCEDURE_CONTROL_ID_EXPECTED", "procedure control id");
};

const parseProcedureControlArgs = (
  cursor: ProgramParserCursor
): { args: Record<string, ChemdValue>; endToken?: ReturnType<ProgramParserCursor["consume"]> } => {
  const args: Record<string, ChemdValue> = {};
  if (!cursor.matchValue("(")) {
    return { args };
  }

  let endToken: ReturnType<ProgramParserCursor["consume"]>;
  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === ")") {
      endToken = cursor.consume();
      break;
    }
    const name = cursor.expectIdentifier("E_PROGRAM_PROCEDURE_CONTROL_ARG_EXPECTED", "procedure control argument");
    cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
    const value = cursor.parseValue();
    const argName = tokenValue(name);
    if (argName) {
      args[argName] = value;
    }
    if (tokenValue(cursor.peek()) === ",") {
      cursor.consume();
    }
  }
  if (!endToken) {
    cursor.syntaxError("E_PROGRAM_PAREN_CLOSE_EXPECTED", "Expected ')' to close procedure control arguments.");
  }

  return { args, endToken };
};

const parseProcedureControlBody = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  declarationId: string
): { children: ProcedureStatement[]; endToken?: ReturnType<ProgramParserCursor["consume"]> } => {
  cursor.expectValue("{", "E_PROGRAM_BLOCK_OPEN_EXPECTED");
  const parsed = parseProcedureStatements(cursor, context, declarationId);
  if (!parsed.closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close procedure control block.");
  }
  return { children: parsed.children, endToken: parsed.endToken };
};

const parseProcedureStep = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  declarationId: string,
  docs: ChemdDocComment[]
): ProcedureStepDeclaration => {
  const start = cursor.expectValue("step", "E_PROGRAM_PROCEDURE_STEP_EXPECTED");
  const id = cursor.expectIdentifier("E_PROGRAM_PROCEDURE_STEP_ID_EXPECTED", "procedure step id");
  cursor.expectValue("=", "E_PROGRAM_PROCEDURE_STEP_ASSIGN_EXPECTED");
  const value = cursor.parseValue();
  const call = value.type === "call" ? value : undefined;
  if (!call) {
    cursor.syntaxError("E_PROGRAM_PROCEDURE_STEP_CALL_EXPECTED", "Expected a step call expression.");
  }
  const args = callArgsToRecord(call?.args ?? []);
  const stepId = tokenValue(id) ?? "unknown";
  consumeOptionalSeparator(cursor);

  return {
    kind: "step",
    id: stepId,
    family: call?.callee ?? stepId,
    args,
    ...stepProjection(args),
    docs: context.addDocs(docs, {
      kind: "procedure_step",
      declarationId,
      stepId
    }),
    sourceSpan: cursor.sourceSpanFrom(start, value?.sourceSpan)
  };
};

const callArgsToRecord = (args: ChemdCallArg[]): Record<string, ChemdValue> => {
  const record: Record<string, ChemdValue> = {};
  for (const arg of args) {
    record[arg.name] = arg.value;
  }
  return record;
};

const stepProjection = (
  args: Record<string, ChemdValue>
): Pick<
  ProcedureStepDeclaration,
  "inputs" | "outputs" | "dependsOn" | "evidence" | "confidence"
> => ({
  ...(valueAsReferenceList(args.inputs) ? { inputs: valueAsReferenceList(args.inputs) } : {}),
  ...(valueAsReferenceList(args.outputs) ? { outputs: valueAsReferenceList(args.outputs) } : {}),
  ...(valueAsStringList(args.depends_on) ? { dependsOn: valueAsStringList(args.depends_on) } : {}),
  ...(valueAsReferenceList(args.evidence) ? { evidence: valueAsReferenceList(args.evidence) } : {}),
  ...(valueAsNumber(args.confidence) !== undefined ? { confidence: valueAsNumber(args.confidence) } : {})
});
