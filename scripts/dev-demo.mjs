import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const resolveCommand = (command, platform = process.platform) => {
  if (platform === "win32") {
    if (command === "pnpm") {
      return "pnpm.cmd";
    }

    if (command === "poetry") {
      return "poetry.exe";
    }
  }

  return command;
};

export const resolvePnpmEntrypoint = (
  env = process.env,
  platform = process.platform
) => {
  if (platform !== "win32") {
    return null;
  }

  const pathModule = path.win32;
  const npmExecPath = env.npm_execpath;
  if (
    npmExecPath &&
    pathModule.basename(npmExecPath).toLowerCase() === "pnpm.cjs"
  ) {
    return npmExecPath;
  }

  const appData = env.APPDATA;
  if (appData) {
    return pathModule.join(appData, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs");
  }

  throw new Error("Unable to resolve pnpm.cjs for Windows dev startup.");
};

export const resolvePnpmInvocation = (
  platform = process.platform,
  env = process.env
) => {
  if (platform === "win32") {
    return {
      command: "node",
      args: [resolvePnpmEntrypoint(env, platform)]
    };
  }

  return {
    command: "pnpm",
    args: []
  };
};

export const resolveChemServiceCommand = (
  platform = process.platform
) => {
  return resolveCommand("poetry", platform);
};

export const resolveSpawnInvocation = (
  command,
  args
) => {
  return {
    command,
    args
  };
};

const resolveRootDir = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const createDevDemoProcesses = (
  rootDir = resolveRootDir(),
  platform = process.platform,
  env = process.env
) => {
  const pnpmInvocation = resolvePnpmInvocation(platform, env);

  return [
    {
      name: "web",
      command: pnpmInvocation.command,
      args: [...pnpmInvocation.args, "--filter", "@chemd/web", "dev"],
      cwd: rootDir,
      url: "http://127.0.0.1:2436"
    },
    {
      name: "chem-service",
      command: resolveChemServiceCommand(platform),
      args: ["run", "python", "app.py"],
      cwd: path.join(rootDir, "services", "chem-service"),
      url: "http://127.0.0.1:18081"
    }
  ];
};

const childProcesses = [];
let shuttingDown = false;

const terminateChildren = (signal = "SIGINT") => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of childProcesses) {
    if (child.exitCode !== null || child.killed) {
      continue;
    }

    try {
      child.kill(signal);
    } catch {
      // Ignore teardown errors on already-closing child processes.
    }
  }
};

const run = () => {
  const processes = createDevDemoProcesses();

  console.log("Starting chemd demo stack...");
  for (const processConfig of processes) {
    console.log(`- ${processConfig.name}: ${processConfig.url}`);
  }
  console.log("Use Ctrl+C to stop both services.");

  const handleShutdownSignal = (signal) => {
    terminateChildren(signal);
  };

  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);

  let remaining = processes.length;

  for (const processConfig of processes) {
    const invocation = resolveSpawnInvocation(
      processConfig.command,
      processConfig.args
    );
    const child = spawn(invocation.command, invocation.args, {
      cwd: processConfig.cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        FORCE_COLOR: process.env.FORCE_COLOR ?? "1"
      }
    });

    childProcesses.push(child);

    child.on("error", (error) => {
      console.error(`[${processConfig.name}] failed to start: ${error.message}`);
      process.exitCode = 1;
      terminateChildren();
    });

    child.on("exit", (code, signal) => {
      remaining -= 1;

      if (!shuttingDown) {
        if (code && code !== 0) {
          console.error(`[${processConfig.name}] exited with code ${code}. Stopping demo stack.`);
          process.exitCode = code;
        } else if (signal) {
          console.error(`[${processConfig.name}] exited with signal ${signal}. Stopping demo stack.`);
          process.exitCode = 1;
        } else {
          console.error(`[${processConfig.name}] exited. Stopping demo stack.`);
        }

        terminateChildren();
      }

      if (remaining === 0) {
        process.off("SIGINT", handleShutdownSignal);
        process.off("SIGTERM", handleShutdownSignal);
        process.exit(process.exitCode ?? 0);
      }
    });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
