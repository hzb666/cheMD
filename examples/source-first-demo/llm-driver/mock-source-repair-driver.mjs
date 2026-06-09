#!/usr/bin/env node
import { readFileSync } from "node:fs";

const request = JSON.parse(readFileSync(0, "utf8"));
const schemaVersion = "chemd-agent-driver-response/v0.1";

const needsResultDeclaration = () =>
  request.diagnosis?.requiredInputs?.some?.((item) =>
    item.missingItems?.some?.((input) =>
      String(input).toLowerCase().includes("result")
      || String(input).includes("result 声明")
    )
  );

const ensurePrimaryReferences = (source) => {
  let next = source
    .replace(/(\bprimary_reaction:\s*)rxn_main\b/g, "$1@rxn_main")
    .replace(/(\bprimary_result:\s*)res_main\b/g, "$1@res_main");

  if (next.includes("reaction rxn_main") && !/\bprimary_reaction:\s*/.test(next)) {
    next = next.replace(
      /(\n\s*date:\s*"[^"]+"\n)/,
      "$1  primary_reaction: @rxn_main\n"
    );
  }

  if (next.includes("result res_main") && !/\bprimary_result:\s*/.test(next)) {
    next = next.replace(
      /(\n\s*primary_reaction:\s*@rxn_main\n|\n\s*date:\s*"[^"]+"\n)/,
      "$1  primary_result: @res_main\n"
    );
  }

  return next;
};

const repairSource = (source) => {
  if (source.includes("@rxn_missing") && source.includes("reaction rxn_main")) {
    return source.replaceAll("@rxn_missing", "@rxn_main");
  }

  if (
    request.diagnostics?.some?.((diagnostic) => diagnostic.code === "E_PROGRAM_BLOCK_CLOSE_EXPECTED")
    && !source.trimEnd().endsWith("}")
  ) {
    return `${source.trimEnd()}\n}\n`;
  }

  if (
    needsResultDeclaration()
    && source.includes("reaction rxn_main")
    && !/\nresult\s+\w+\s+for\s+@rxn_main\b/.test(source)
  ) {
    return ensurePrimaryReferences(`${source.trimEnd()}\n\nresult res_main for @rxn_main {\n  status: unknown\n  notes: "No result was specified in the source text."\n}\n`);
  }

  return ensurePrimaryReferences(source);
};

const nextSource = repairSource(request.source);

process.stdout.write(JSON.stringify(
  nextSource === request.source
    ? {
        schemaVersion,
        action: "stop",
        note: "mock driver found no supported source repair"
      }
    : {
        schemaVersion,
        action: "rewrite",
        nextSource,
        note: "mock source repair applied"
      }
));
