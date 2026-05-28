import { readFileSync } from "node:fs";
import process from "node:process";

const request = JSON.parse(readFileSync(0, "utf8"));
const schemaVersion = "chemd-agent-driver-response/v0.1";
const mode = process.argv[2] ?? "rewrite";

if (mode === "stop") {
  process.stdout.write(JSON.stringify({
    schemaVersion,
    action: "stop",
    note: "need more facts"
  }));
  process.exit(0);
}

const nextSource = request.source.includes("result res_main")
  ? request.source
  : `module exp_cli_agent_fixed

meta {
  id: "exp-cli-agent-fixed"
  title: "CLI Agent Fixed"
  date: "2026-04-24"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

result res_main for @rxn_main {
  status: success
  yield: 72%
}

analysis ana_main for @res_main {
  type: tlc
  notes: "one major spot"
}
`;

process.stdout.write(JSON.stringify({
  schemaVersion,
  action: "rewrite",
  note: "rewrite to program result and analysis",
  nextSource
}));
