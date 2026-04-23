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

const nextSource = request.source.includes(":::result #res-main")
  ? request.source
  : `${request.source}
:::result #res-main
ref: rxn-main
status: success
yield: 72%
:::

:::analysis #ana-main
ref: rxn-main
type: tlc
result: one major spot
:::
`;

process.stdout.write(JSON.stringify({
  schemaVersion,
  action: "rewrite",
  note: "add result and analysis",
  nextSource
}));
