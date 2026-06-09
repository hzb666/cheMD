#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const demoRoot = path.resolve(import.meta.dirname, "..");
const guidePath = path.join(demoRoot, "docs", "llm-chemd-guide.md");
const examplesRoot = path.join(demoRoot, "llm-authoring");

const readUtf8 = (filePath) => readFileSync(filePath, "utf8");

const stripChemdFence = (value) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:chemd|text)?\s*\n([\s\S]*?)\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const cleanChemdSourceOutput = (value) => {
  const cleaned = stripChemdFence(value);
  const start = cleaned.trimStart();

  if (start.startsWith("{") || start.startsWith("[")) {
    throw new Error("LLM output looked like JSON; expected pure Chemd source.");
  }

  if (!/^module\s+[A-Za-z_][A-Za-z0-9_-]*/m.test(cleaned)) {
    throw new Error("LLM output did not contain a module declaration.");
  }

  if (!/\bmeta\s*\{/m.test(cleaned)) {
    throw new Error("LLM output did not contain a meta block.");
  }

  return `${cleaned.replace(/\s+$/u, "")}\n`;
};

const readFewShotExamples = () => {
  const entries = readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .slice(0, 3);

  return entries.flatMap((entry) => {
    const inputPath = path.join(examplesRoot, entry, "input.txt");
    const outputPath = path.join(examplesRoot, entry, "output.chemd");

    try {
      return [{
        input: readUtf8(inputPath).trim(),
        output: readUtf8(outputPath).trim()
      }];
    } catch {
      return [];
    }
  });
};

const buildPrompt = (inputText, guide, examples) => [
  "Follow the guide and examples. Generate one complete Chemd source file.",
  "",
  "# Guide",
  guide.trim(),
  "",
  "# Few-shot examples",
  ...examples.map((example, index) => [
    `## Example ${index + 1} input`,
    example.input,
    "",
    `## Example ${index + 1} output`,
    example.output
  ].join("\n")),
  "",
  "# Input",
  inputText.trim()
].join("\n");

const callOpenAiCompatibleChat = async (prompt) => {
  if (process.env.CHEMD_LLM_MOCK_OUTPUT !== undefined) {
    return process.env.CHEMD_LLM_MOCK_OUTPUT;
  }

  const apiKey = process.env.CHEMD_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY, CHEMD_LLM_API_KEY, or CHEMD_LLM_MOCK_OUTPUT.");
  }

  const baseUrl = process.env.CHEMD_LLM_BASE_URL ?? "https://api.openai.com/v1/chat/completions";
  const model = process.env.CHEMD_LLM_MODEL ?? "gpt-4.1-mini";
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "system",
        content: "You generate only valid chemd/program-v1 source. Never output JSON or markdown fences."
      }, {
        role: "user",
        content: prompt
      }],
      temperature: 0.2
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}: ${body}`);
  }

  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("LLM response did not include choices[0].message.content.");
  }

  return content;
};

const main = async () => {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: node examples/source-first-demo/llm-authoring/nl-to-chemd.mjs input.txt > draft.chemd");
  }

  const inputText = readUtf8(path.resolve(inputPath));
  const guide = readUtf8(guidePath);
  const examples = readFewShotExamples();
  const prompt = buildPrompt(inputText, guide, examples);
  const rawOutput = await callOpenAiCompatibleChat(prompt);
  process.stdout.write(cleanChemdSourceOutput(rawOutput));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
