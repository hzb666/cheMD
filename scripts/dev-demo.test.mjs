import test from "node:test";
import assert from "node:assert/strict";

import { createDevDemoProcesses, resolveCommand } from "./dev-demo.mjs";

test("resolveCommand uses pnpm.cmd on Windows", () => {
  assert.equal(resolveCommand("pnpm", "win32"), "pnpm.cmd");
});

test("resolveCommand leaves poetry unchanged on Windows", () => {
  assert.equal(resolveCommand("poetry", "win32"), "poetry");
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
      command: "poetry",
      args: ["run", "python", "app.py"],
      cwd: "D:\\Code\\chemd\\services\\chem-service",
      url: "http://127.0.0.1:18081"
    }
  ]);
});
