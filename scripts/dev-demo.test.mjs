import test from "node:test";
import assert from "node:assert/strict";

import {
  createChemServiceArgs,
  createDevDemoProcesses,
  parseDevDemoOptions,
  resolveChemServiceCommand,
  resolveChemServiceServerConfig,
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

test("parseDevDemoOptions enables reload only when explicitly requested", () => {
  assert.deepEqual(parseDevDemoOptions([]), { reload: false });
  assert.deepEqual(parseDevDemoOptions(["--reload"]), { reload: true });
});

test("resolveChemServiceServerConfig reads host and port from env", () => {
  assert.deepEqual(resolveChemServiceServerConfig({}), {
    host: "127.0.0.1",
    port: "18081",
    url: "http://127.0.0.1:18081"
  });

  assert.deepEqual(
    resolveChemServiceServerConfig({
      CHEM_SERVICE_HOST: "0.0.0.0",
      CHEM_SERVICE_PORT: "19090"
    }),
    {
      host: "0.0.0.0",
      port: "19090",
      url: "http://0.0.0.0:19090"
    }
  );
});

test("createChemServiceArgs switches to flask reload mode when requested", () => {
  assert.deepEqual(createChemServiceArgs(), ["app.py"]);
  assert.deepEqual(
    createChemServiceArgs(
      { reload: true },
      {
        host: "127.0.0.1",
        port: "18081",
        url: "http://127.0.0.1:18081"
      }
    ),
    [
      "-m",
      "flask",
      "--app",
      "app",
      "run",
      "--reload",
      "--host",
      "127.0.0.1",
      "--port",
      "18081"
    ]
  );
});

test("resolveSpawnInvocation wraps cmd launchers with cmd.exe on Windows", () => {
  assert.deepEqual(
    resolveSpawnInvocation("pnpm.cmd", ["--filter", "@chemd/web", "dev"], "win32", "cmd.exe"),
    {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd --filter @chemd/web dev"]
    }
  );

  assert.deepEqual(
    resolveSpawnInvocation("poetry.exe", ["--version"], "win32", "cmd.exe"),
    {
      command: "poetry.exe",
      args: ["--version"]
    }
  );
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

test("createDevDemoProcesses enables backend reload mode when requested", () => {
  const rootDir = "D:\\Code\\chemd";
  const processes = createDevDemoProcesses(
    rootDir,
    "win32",
    { reload: true },
    {
      CHEM_SERVICE_HOST: "127.0.0.1",
      CHEM_SERVICE_PORT: "18081"
    }
  );

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
      args: [
        "-m",
        "flask",
        "--app",
        "app",
        "run",
        "--reload",
        "--host",
        "127.0.0.1",
        "--port",
        "18081"
      ],
      cwd: "D:\\Code\\chemd\\services\\chem-service",
      url: "http://127.0.0.1:18081"
    }
  ]);
});
