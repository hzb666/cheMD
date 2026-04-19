import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const CHEMD_SCOPE = "@chemd/";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".json"];
const TS_INDEX_FILES = ["index.ts", "index.tsx", "index.js"];

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  resolveJsonModule: true
};

const isFile = (filePath) => {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const resolveExistingFile = (basePath) => {
  const candidates = [
    basePath,
    ...TS_EXTENSIONS.map((extension) => `${basePath}${extension}`),
    ...TS_INDEX_FILES.map((fileName) => path.join(basePath, fileName))
  ];

  return candidates.find((candidate) => existsSync(candidate) && isFile(candidate));
};

const resolveChemdPackage = (specifier) => {
  if (!specifier.startsWith(CHEMD_SCOPE)) {
    return undefined;
  }

  const [, packageName, ...subpathParts] = specifier.split("/");
  const subpath = subpathParts.join("/");
  const packageSrc = path.join(REPO_ROOT, "packages", packageName, "src");
  const basePath = subpath ? path.join(packageSrc, subpath) : path.join(packageSrc, "index");

  return resolveExistingFile(basePath);
};

const resolveRelativeImport = (specifier, parentURL) => {
  if (!specifier.startsWith(".") || !parentURL?.startsWith("file:")) {
    return undefined;
  }

  const parentPath = fileURLToPath(parentURL);
  const basePath = path.resolve(path.dirname(parentPath), specifier);

  return resolveExistingFile(basePath);
};

export const resolve = async (specifier, context, nextResolve) => {
  const localPath = resolveChemdPackage(specifier)
    ?? resolveRelativeImport(specifier, context.parentURL);

  if (localPath) {
    return {
      shortCircuit: true,
      url: pathToFileURL(localPath).href
    };
  }

  return nextResolve(specifier, context);
};

export const load = async (url, context, nextLoad) => {
  if (!url.endsWith(".ts") && !url.endsWith(".tsx")) {
    return nextLoad(url, context);
  }

  const fileName = fileURLToPath(url);
  const source = readFileSync(fileName, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions,
    fileName
  });

  return {
    format: "module",
    shortCircuit: true,
    source: output.outputText
  };
};
