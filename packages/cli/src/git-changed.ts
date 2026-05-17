import { spawnSync } from "node:child_process";

const CHEMD_GLOBS = ["*.chemd", "*.chemd.md"] as const;

export interface GitChangedFile {
  status: string;
  path: string;
  previousPath?: string;
}

export interface GitRunResult {
  error?: Error;
  signal?: string | null;
  status: number | null;
  stderr?: string;
  stdout?: string;
}

export type GitRunner = (
  args: string[],
  options: { cwd: string }
) => GitRunResult;

const normalizeGitPath = (filePath: string): string => filePath.replaceAll("\\", "/");

const defaultGitRunner: GitRunner = (args, options) => spawnSync("git", args, {
  cwd: options.cwd,
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024
});

const assertSafeBaseRef = (base: string) => {
  if (!base || base.startsWith("-")) {
    throw new Error("Git base ref must be non-empty and cannot start with '-'.");
  }
};

const formatGitFailure = (result: GitRunResult): string => {
  if (result.error) {
    return result.error.message;
  }

  const stderr = result.stderr ? String(result.stderr).trim() : "";
  if (stderr) {
    return stderr;
  }

  if (result.signal) {
    return `git command terminated by signal ${result.signal}`;
  }

  return "git command failed";
};

const runGitChecked = (gitRunner: GitRunner, args: string[], cwd: string): string => {
  const result = gitRunner(args, { cwd });
  const status = result.status;

  if (status !== 0) {
    throw new Error(`${formatGitFailure(result)} (${["git", ...args].join(" ")})`);
  }

  return String(result.stdout ?? "");
};

const parseDiffNameStatus = (output: string): GitChangedFile[] => {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const records: GitChangedFile[] = [];

  for (let index = 0; index < tokens.length;) {
    const rawStatus = tokens[index];
    index += 1;

    if (rawStatus.startsWith("R") || rawStatus.startsWith("C")) {
      const previousPath = normalizeGitPath(tokens[index]);
      const filePath = normalizeGitPath(tokens[index + 1]);
      index += 2;
      records.push({ status: rawStatus[0], path: filePath, previousPath });
    } else {
      const filePath = normalizeGitPath(tokens[index]);
      index += 1;
      records.push({ status: rawStatus[0], path: filePath });
    }
  }

  return records;
};

const parseUntrackedFiles = (output: string): GitChangedFile[] =>
  output
    .split("\0")
    .filter((filePath) => filePath.length > 0)
    .map((filePath) => ({
      status: "?",
      path: normalizeGitPath(filePath)
    }));

const uniqueRecords = (records: GitChangedFile[]): GitChangedFile[] => {
  const byPath = new Map<string, GitChangedFile>();

  for (const record of records) {
    byPath.set(record.path, record);
  }

  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
};

export const discoverChangedChemdFiles = ({
  base,
  cwd,
  gitRunner = defaultGitRunner
}: {
  base: string;
  cwd: string;
  gitRunner?: GitRunner;
}): GitChangedFile[] => {
  assertSafeBaseRef(base);

  const tracked = runGitChecked(
    gitRunner,
    [
      "diff",
      "--name-status",
      "-z",
      "--find-renames",
      "--find-copies",
      "--diff-filter=ACMRTD",
      base,
      "--",
      ...CHEMD_GLOBS
    ],
    cwd
  );
  const untracked = runGitChecked(
    gitRunner,
    ["ls-files", "--others", "--exclude-standard", "-z", "--", ...CHEMD_GLOBS],
    cwd
  );

  return uniqueRecords([
    ...parseDiffNameStatus(tracked),
    ...parseUntrackedFiles(untracked)
  ]);
};

export const readGitFileAtRef = ({
  base,
  cwd,
  filePath,
  gitRunner = defaultGitRunner
}: {
  base: string;
  cwd: string;
  filePath: string;
  gitRunner?: GitRunner;
}): string => {
  assertSafeBaseRef(base);
  return runGitChecked(gitRunner, ["show", `${base}:${normalizeGitPath(filePath)}`], cwd);
};
