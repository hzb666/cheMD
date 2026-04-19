#!/usr/bin/env node
import { register } from "node:module";
import process from "node:process";
import { URL } from "node:url";

register(new URL("../src/ts-loader.mjs", import.meta.url));

const { runChemdCli } = await import("../src/cli.ts");
const exitCode = await runChemdCli(process.argv.slice(2));

process.exit(exitCode);
