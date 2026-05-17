import test from "node:test";
import assert from "node:assert/strict";

import {
  createDevDemoProcesses,
  resolveChemServiceCommand,
  resolveCommand,
  resolveSpawnInvocation
} from "./dev-demo.mjs";

test("resolveCommand uses pnpm.cmd on Windows", () => {
  assert.equal(resolveCommand("pnpm", "win32"), "pnpm.cmd");
});

test("resolveCommand uses poetry.exe on Windows", () => {
  assert.equal(resolveCommand("poetry", "win32"), "poetry.exe");
});

test("resolveChemServiceCommand uses in-project virtualenv python", () => {
  assert.equal(
    resolveChemServiceCommand("D:\\Code\\chemd", "win32"),
    "D:\\Code\\chemd\\services\\chem-service\\.venv\\Scripts\\python.exe"
  );
  assert.equal(
    resolveChemServiceCommand("/repo/chemd", "linux"),
    "/repo/chemd/services/chem-service/.venv/bin/python"
  );
});

test("resolveSpawnInvocation wraps cmd launchers with cmd.exe on Windows", () => {
  assert.deepEqual(
    resolveSpawnInvocation("pnpm.cmd", ["--filter", "@chemd/web", "dev"], "win32"),
    {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "--filter", "@chemd/web", "dev"]
    }
  );

  assert.deepEqual(
    resolveSpawnInvocation("poetry.exe", ["--version"], "win32"),
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
    assert.deepEqual(resolveSpawnInvocation("pnpm.cmd", ["dev"], "win32"), {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "dev"]
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
  const processes = createDevDemoProcesses(rootDir, "win32");

  assert.deepEqual(processes, [
    {
      name: "web",
      command: "pnpm.cmd",
      args: ["--filter", "@chemd/web", "dev"],
      cwd: rootDir,
      url: "http://127.0.0.1:2436"
    },
    {
      name: "chem-service",
      command: "D:\\Code\\chemd\\services\\chem-service\\.venv\\Scripts\\python.exe",
      args: ["app.py"],
      cwd: "D:\\Code\\chemd\\services\\chem-service",
      url: "http://127.0.0.1:18081"
    }
  ]);
});
