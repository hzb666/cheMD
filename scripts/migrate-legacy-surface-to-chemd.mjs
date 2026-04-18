import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrateLegacySurfaceToChemd } from "./legacy-surface-shared.mjs";

export { migrateLegacySurfaceToChemd };

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const [, , filePath, maybeWrite] = process.argv;
  if (!filePath) {
    console.error("Usage: node scripts/migrate-legacy-surface-to-chemd.mjs <file> [--write]");
    process.exit(1);
  }

  const source = readFileSync(filePath, "utf8");
  const migrated = migrateLegacySurfaceToChemd(source);

  if (maybeWrite === "--write") {
    writeFileSync(filePath, migrated);
  } else {
    process.stdout.write(migrated);
  }
}
