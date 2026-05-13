#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import { runDesktopOfflineCoreSmoke } from "./desktop-runtime-smoke.mjs";

export const runDesktopOfflineCoreSmokeCli = async ({
  runner = runDesktopOfflineCoreSmoke,
  logger = console
} = {}) => {
  try {
    await runner({ logger });
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopOfflineCoreSmokeCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
