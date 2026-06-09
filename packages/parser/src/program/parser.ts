import type {
  ChemdDocComment,
  ChemdDocCommentAttachment,
  ChemdDocCommentExportPolicy,
  ChemdImportDeclaration,
  ChemdMetaDeclaration,
  ChemdModuleDeclaration,
  ChemdProgramDocument,
  SourceSpan,
} from "@chemd/core";

import { lexProgram } from "./lexer";
import { parseDeclarations } from "./parse-declarations";
import { parseMetaDeclaration } from "./parse-meta";
import {
  ProgramParserCursor,
  tokenValue
} from "./parser-cursor";

export {
  ProgramParserCursor,
  isIdentifierToken,
  tokenToSourceSpan,
  tokenValue
} from "./parser-cursor";

export interface ParseChemdProgramOptions {
  renderSelection?: ChemdProgramDocument["renderSelection"];
}

export interface ProgramParserContext {
  moduleName: string;
  addDocs: (
    docs: ChemdDocComment[],
    attachment: ChemdDocCommentAttachment,
    exportPolicy?: ChemdDocCommentExportPolicy
  ) => ChemdDocCommentRef[];
}

type ChemdDocCommentRef = ChemdModuleDeclaration["docs"][number];

export const parseChemdProgram = (
  source: string,
  options: ParseChemdProgramOptions = {}
): ChemdProgramDocument => {
  const lexed = lexProgram(source);
  const diagnostics = [...lexed.diagnostics];

  const cursor = new ProgramParserCursor(source, lexed.tokens, diagnostics);
  const docs: ChemdDocComment[] = [];
  const addDocs = createDocAccumulator(docs);
  const module = parseModuleDeclaration(cursor, { moduleName: "", addDocs });
  const context = { moduleName: module.name, addDocs };
  const imports = parseImportDeclarations(cursor, context);
  cursor.registerReferenceModuleNames([
    module.name,
    ...imports.map((item) => item.moduleName),
    ...imports.map((item) => item.alias)
  ]);

  return {
    type: "program_document",
    schemaVersion: "chemd-program-ast/v1",
    sourceLanguage: "chemd/program-v1",
    module,
    imports,
    meta: parseMetaDeclaration(cursor, context),
    declarations: parseDeclarations(cursor, context),
    docs,
    diagnostics,
    source,
    sourceSpan: sourceSpanForSource(source),
    renderSelection: options.renderSelection
  };
};

const createDocAccumulator = (
  docs: ChemdDocComment[]
): ProgramParserContext["addDocs"] => (
  pendingDocs,
  attachment,
  exportPolicy
) => {
  const attached = pendingDocs.map((doc) => ({
    ...doc,
    attachment,
    exportPolicy: exportPolicy ?? doc.exportPolicy
  }));
  docs.push(...attached);
  return attached.map((doc) => ({ docId: doc.id }));
};

const parseModuleDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext
): ChemdModuleDeclaration => {
  const docs = cursor.collectDocs();
  const start = cursor.expectValue("module", "E_PROGRAM_MODULE_EXPECTED");
  const name = cursor.expectIdentifier(
    "E_PROGRAM_MODULE_NAME_EXPECTED",
    "module name"
  );
  const moduleName = tokenValue(name) ?? "unknown";

  return {
    kind: "module",
    name: moduleName,
    docs: context.addDocs(docs, { kind: "module", moduleName }),
    sourceSpan: cursor.sourceSpanFrom(start, name)
  };
};

const parseImportDeclarations = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext
): ChemdImportDeclaration[] => {
  const imports: ChemdImportDeclaration[] = [];
  while (tokenValue(cursor.peekAfterDocs()) === "import") {
    imports.push(parseImportDeclaration(cursor, context));
  }
  return imports;
};

const parseImportDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext
): ChemdImportDeclaration => {
  const docs = cursor.collectDocs();
  const start = cursor.expectValue("import", "E_PROGRAM_IMPORT_EXPECTED");
  const moduleName = cursor.expectIdentifier(
    "E_PROGRAM_IMPORT_MODULE_EXPECTED",
    "import module name"
  );
  const alias = cursor.matchValue("as")
    ? tokenValue(cursor.expectIdentifier("E_PROGRAM_IMPORT_ALIAS_EXPECTED", "import alias"))
    : undefined;
  cursor.expectValue("from", "E_PROGRAM_IMPORT_FROM_EXPECTED");
  const from = cursor.expectString(
    "E_PROGRAM_IMPORT_SOURCE_EXPECTED",
    "import source"
  );

  return {
    kind: "import",
    moduleName: tokenValue(moduleName) ?? "unknown",
    from: decodeStringToken(from),
    ...(alias ? { alias } : {}),
    docs: context.addDocs(docs, { kind: "file" }),
    sourceSpan: cursor.sourceSpanFrom(start, from)
  };
};

const sourceSpanForSource = (source: string): SourceSpan => {
  const lines = source.split(/\r\n|\n|\r/);
  const lastLine = lines[lines.length - 1] ?? "";
  return {
    start: 0,
    end: source.length,
    startLine: 1,
    startColumn: 1,
    endLine: lines.length,
    endColumn: lastLine.length + 1
  };
};

const decodeStringToken = (token?: { raw: string }): string => {
  if (!token) {
    return "";
  }
  if (token.raw.startsWith("\"")) {
    try {
      return JSON.parse(token.raw) as string;
    } catch {
      return token.raw.slice(1, -1);
    }
  }
  return token.raw.slice(1, -1).replaceAll("\\'", "'");
};
