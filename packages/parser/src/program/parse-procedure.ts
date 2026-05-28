import type {
  ChemdCallArg,
  ChemdDocComment,
  ChemdReferenceExpr,
  ChemdValue,
  ProcedureDeclaration,
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

  const children: ProcedureStepDeclaration[] = [];
  let evidence: ChemdReferenceExpr[] | undefined;
  let end = start;
  let closed = false;

  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === "}") {
      end = cursor.consume();
      closed = true;
      break;
    }
    const statementDocs = cursor.collectDocs();
    if (tokenValue(cursor.peek()) === "evidence") {
      cursor.consume();
      cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
      evidence = valueAsReferenceList(cursor.parseValue());
      consumeOptionalSeparator(cursor);
    } else if (tokenValue(cursor.peek()) === "step") {
      children.push(parseProcedureStep(cursor, context, declarationId, statementDocs));
    } else {
      cursor.syntaxError(
        "E_PROGRAM_PROCEDURE_STATEMENT_EXPECTED",
        "Expected a procedure step or evidence field.",
        cursor.peek()
      );
      cursor.consume();
    }
  }
  if (!closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close procedure block.");
  }

  return {
    kind: "procedure",
    id: declarationId,
    qualifiedId: `${context.moduleName}.${declarationId}`,
    ...(target ? { target } : {}),
    ...(evidence ? { evidence } : {}),
    children,
    docs: context.addDocs(docs, { kind: "declaration", declarationId }),
    sourceSpan: cursor.sourceSpanFrom(start, end)
  };
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
