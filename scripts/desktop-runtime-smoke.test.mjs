import assert from "node:assert/strict";
import test from "node:test";

import {
  checkDesktopRuntimePreconditions,
  getPostgresDatabaseUrl,
  runDesktopRuntimeSmoke,
  runDesktopRuntimeSmokeCli,
  summarizePostgresTarget
} from "./desktop-runtime-smoke.mjs";

const createLogger = () => {
  const lines = [];
  return {
    lines,
    log(message) {
      lines.push(String(message));
    },
    error(message) {
      lines.push(String(message));
    }
  };
};

const createPassingDesktopCheck = (calls) => () => {
  calls.push("desktop-check");
  return {
    ok: true,
    checks: [{ name: "desktop scripts", status: "pass", detail: "ok" }]
  };
};

test("getPostgresDatabaseUrl prefers Chemd env and falls back to DATABASE_URL", () => {
  assert.equal(
    getPostgresDatabaseUrl({
      CHEMD_POSTGRES_DATABASE_URL: " postgres://chemd ",
      DATABASE_URL: "postgres://fallback"
    }),
    "postgres://chemd"
  );
  assert.equal(
    getPostgresDatabaseUrl({ DATABASE_URL: " postgres://fallback " }),
    "postgres://fallback"
  );
});

test("summarizePostgresTarget redacts passwords and avoids full URL logging", () => {
  const summary = summarizePostgresTarget(
    "postgres://chemd:super-secret@localhost:15432/chemd"
  );

  assert.match(summary, /host=localhost/u);
  assert.match(summary, /database=chemd/u);
  assert.match(summary, /password=\[REDACTED\]/u);
  assert.doesNotMatch(summary, /super-secret/u);
  assert.doesNotMatch(summary, /postgres:\/\/chemd/u);
});

test("checkDesktopRuntimePreconditions reports missing dist as warn only", () => {
  const files = new Map([
    [
      "D:\\repo\\apps\\desktop\\package.json",
      JSON.stringify({
        scripts: {
          build: "vite build",
          typecheck: "tsc",
          "tauri:build": "tauri build"
        }
      })
    ],
    [
      "D:\\repo\\apps\\desktop\\src-tauri\\tauri.conf.json",
      JSON.stringify({ build: { frontendDist: "../dist" } })
    ]
  ]);

  const result = checkDesktopRuntimePreconditions({
    rootDir: "D:\\repo",
    fileExists: (filePath) => files.has(filePath),
    readTextFile: (filePath) => files.get(filePath)
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.find((check) => check.name === "desktop dist artifact")?.status,
    "warn"
  );
});

test("runDesktopRuntimeSmoke skips without PostgreSQL env and exits cleanly", async () => {
  const calls = [];
  const logger = createLogger();

  const result = await runDesktopRuntimeSmoke({
    rootDir: "D:\\repo",
    envLoader: () => {
      calls.push("env-loader");
      return { env: {}, loadedFiles: [] };
    },
    desktopCheck: createPassingDesktopCheck(calls),
    withClient: async () => {
      throw new Error("must not connect");
    },
    logger
  });

  assert.deepEqual(calls, ["env-loader", "desktop-check"]);
  assert.deepEqual(result, { status: "skipped", reason: "missing-postgres-env" });
  assert.match(logger.lines.join("\n"), /SKIP desktop runtime smoke/u);
});

test("runDesktopRuntimeSmoke redacts env while running smoke in order", async () => {
  const calls = [];
  const logger = createLogger();

  const result = await runDesktopRuntimeSmoke({
    rootDir: "D:\\repo",
    envLoader: () => {
      calls.push("env-loader");
      return {
        env: {
          CHEMD_POSTGRES_DATABASE_URL:
            "postgres://chemd:super-secret@localhost:15432/chemd"
        },
        loadedFiles: [".env.local"]
      };
    },
    desktopCheck: createPassingDesktopCheck(calls),
    withClient: async ({ operation }) => {
      calls.push("with-client");
      return operation({ query: async () => ({ rows: [] }) });
    },
    postgresSmoke: async () => {
      calls.push("postgres-smoke");
      return {
        experimentId: "exp-1",
        revisionId: "rev-1",
        compileRunId: "rev-1::compile",
        ragChunks: 1,
        firstChunkId: "chunk-1"
      };
    },
    logger
  });

  assert.deepEqual(calls, [
    "env-loader",
    "desktop-check",
    "with-client",
    "postgres-smoke"
  ]);
  assert.equal(result.status, "passed");
  const output = logger.lines.join("\n");
  assert.doesNotMatch(output, /super-secret/u);
  assert.doesNotMatch(output, /postgres:\/\/chemd/u);
  assert.match(output, /host=localhost/u);
});

test("runDesktopRuntimeSmoke fails before database work on desktop preflight failure", async () => {
  await assert.rejects(
    () =>
      runDesktopRuntimeSmoke({
        envLoader: () => ({
          env: { DATABASE_URL: "postgres://chemd:secret@localhost/chemd" },
          loadedFiles: []
        }),
        desktopCheck: () => ({
          ok: false,
          checks: [{ name: "desktop scripts", status: "fail", detail: "missing build" }]
        }),
        withClient: async () => {
          throw new Error("must not connect");
        },
        logger: createLogger()
      }),
    /Desktop runtime preflight failed/u
  );
});

test("runDesktopRuntimeSmokeCli maps failures to exit code 1 and message", async () => {
  const logger = createLogger();
  const exitCode = await runDesktopRuntimeSmokeCli({
    runner: async () => {
      throw new Error("database unavailable");
    },
    logger
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.lines, ["database unavailable"]);
});
