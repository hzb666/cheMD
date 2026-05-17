import test from "node:test";
import assert from "node:assert/strict";

import {
  createDevDemoProcesses,
  resolveChemServiceCommand,
  resolveCommand,
  resolvePnpmEntrypoint,
  resolvePnpmInvocation,
  resolveSpawnInvocation
} from "./dev-demo.mjs";

test("resolveCommand uses pnpm.cmd on Windows", () => {
  assert.equal(resolveCommand("pnpm", "win32"), "pnpm.cmd");
});

test("resolveCommand uses poetry.exe on Windows", () => {
  assert.equal(resolveCommand("poetry", "win32"), "poetry.exe");
});

test("resolveChemServiceCommand uses Poetry without shell wrapping", () => {
  assert.equal(resolveChemServiceCommand("win32"), "poetry.exe");
  assert.equal(resolveChemServiceCommand("linux"), "poetry");
});

test("resolvePnpmEntrypoint prefers pnpm npm_execpath on Windows", () => {
  assert.equal(
    resolvePnpmEntrypoint(
      {
        npm_execpath: "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs",
        APPDATA: "C:\\Users\\dev\\AppData\\Roaming"
      },
      "win32"
    ),
    "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs"
  );
});

test("resolvePnpmEntrypoint falls back to APPDATA on Windows", () => {
  assert.equal(
    resolvePnpmEntrypoint(
      {
        APPDATA: "C:\\Users\\dev\\AppData\\Roaming"
      },
      "win32"
    ),
    "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs"
  );
});

test("resolvePnpmInvocation runs pnpm through node on Windows", () => {
  assert.deepEqual(
    resolvePnpmInvocation("win32", {
      APPDATA: "C:\\Users\\dev\\AppData\\Roaming"
    }),
    {
      command: "node",
      args: ["C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs"]
    }
  );
});

test("resolveSpawnInvocation passes command and args without shell wrapping", () => {
  assert.deepEqual(
    resolveSpawnInvocation("poetry.exe", ["--version"]),
    {
      command: "poetry.exe",
      args: ["--version"]
    }
  );
});

test("resolveSpawnInvocation ignores ComSpec environment values", () => {
  const previousComSpec = process.env.ComSpec;
  process.env.ComSpec = "attacker-controlled.cmd";

  try {
    assert.deepEqual(resolveSpawnInvocation("node", ["pnpm.cjs", "dev"]), {
      command: "node",
      args: ["pnpm.cjs", "dev"]
    });
  } finally {
    if (previousComSpec === undefined) {
      delete process.env.ComSpec;
    } else {
      process.env.ComSpec = previousComSpec;
    }
  }
});

test("createDevDemoProcesses builds web and chem-service processes", () => {
  const rootDir = "D:\\Code\\chemd";
  const processes = createDevDemoProcesses(rootDir, "win32", {
    APPDATA: "C:\\Users\\dev\\AppData\\Roaming"
  });

  assert.deepEqual(processes, [
    {
      name: "web",
      command: "node",
      args: [
        "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs",
        "--filter",
        "@chemd/web",
        "dev"
      ],
      cwd: rootDir,
      url: "http://127.0.0.1:2436"
    },
    {
      name: "chem-service",
      command: "poetry.exe",
      args: ["run", "python", "app.py"],
      cwd: "D:\\Code\\chemd\\services\\chem-service",
      url: "http://127.0.0.1:18081"
    }
  ]);
});
