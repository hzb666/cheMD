import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriRoot = resolve(desktopRoot, "src-tauri");
const outputPath = resolve(desktopRoot, "coverage/backend/lcov.info");
const localCargoLlvmCov = resolve(tauriRoot, "cargo-llvm-cov.exe");

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: tauriRoot,
  encoding: "utf8",
  stdio: options.stdio ?? "pipe",
  shell: false
});

const rustcVersion = run("rustc", ["-vV"]);

if (rustcVersion.status !== 0) {
  process.stderr.write(rustcVersion.stderr || "Unable to read rustc version.\n");
  process.exit(rustcVersion.status ?? 1);
}

const host = rustcVersion.stdout.match(/^host: (.+)$/m)?.[1] ?? "";
const allowWindowsGnu = process.env.CHEMD_ALLOW_WINDOWS_GNU_LLVM_COV === "1";

if (host === "x86_64-pc-windows-gnu" && !allowWindowsGnu) {
  process.stderr.write([
    "Desktop backend coverage is not available on the active Rust GNU toolchain.",
    "rustc reports host x86_64-pc-windows-gnu, and cargo-llvm-cov fails here because profiler_builtins is missing.",
    "Switch apps/desktop/src-tauri to stable-x86_64-pc-windows-msvc, or set CHEMD_ALLOW_WINDOWS_GNU_LLVM_COV=1 to force a retry.",
    ""
  ].join("\n"));
  process.exit(1);
}

const customCargoLlvmCov = process.env.CHEMD_CARGO_LLVM_COV;
const command = customCargoLlvmCov || "cargo";
const args = customCargoLlvmCov
  ? ["llvm-cov", "--lcov", "--output-path", outputPath]
  : ["llvm-cov", "--lcov", "--output-path", outputPath];

mkdirSync(dirname(outputPath), { recursive: true });

const result = run(command, args, { stdio: "inherit" });

if (result.status !== 0 && !customCargoLlvmCov && existsSync(localCargoLlvmCov)) {
  const fallback = run(localCargoLlvmCov, ["llvm-cov", "--lcov", "--output-path", outputPath], {
    stdio: "inherit"
  });
  process.exit(fallback.status ?? 1);
}

process.exit(result.status ?? 1);
