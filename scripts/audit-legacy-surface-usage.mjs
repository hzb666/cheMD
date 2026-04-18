import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auditLegacySurfaceUsage } from "./legacy-surface-shared.mjs";

export { auditLegacySurfaceUsage };

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const [, , filePath] = process.argv;
  if (!filePath) {
    console.error("Usage: node scripts/audit-legacy-surface-usage.mjs <file>");
    process.exit(1);
  }

  const findings = auditLegacySurfaceUsage(readFileSync(filePath, "utf8"));
  process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
}
