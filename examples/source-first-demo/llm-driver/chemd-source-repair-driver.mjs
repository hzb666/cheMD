#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";

const RESPONSE_SCHEMA_VERSION = "chemd-agent-driver-response/v0.1";

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

  return `${cleaned.replace(/\s+$/u, "")}\n`;
};

const buildPrompt = (request) => [
  "You repair chemd source code.",
  "",
  "Rules:",
  "- Output only chemd source.",
  "- Do not output JSON.",
  "- Do not use markdown fences.",
  "- Preserve existing facts.",
  "- Do not invent missing scientific facts.",
  "- Fix only issues supported by compiler diagnostics or obvious syntax mistakes.",
  "- Keep references in chemd syntax, e.g. @rxn_main.",
  "",
  "Current source:",
  request.source,
  "",
  "Compiler diagnosis:",
  request.diagnosisText ?? JSON.stringify(request.diagnosis, null, 2),
  "",
  "Diagnostics:",
  JSON.stringify(request.diagnostics, null, 2)
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
        content: "You repair chemd/program-v1 source and return only source text."
      }, {
        role: "user",
        content: prompt
      }],
      temperature: 0
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

const respond = (payload) => {
  process.stdout.write(JSON.stringify({
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    ...payload
  }));
};

const main = async () => {
  const request = JSON.parse(readFileSync(0, "utf8"));
  const prompt = buildPrompt(request);
  const rawOutput = await callOpenAiCompatibleChat(prompt);
  const nextSource = cleanChemdSourceOutput(rawOutput);

  respond({
    action: "rewrite",
    nextSource,
    note: "repaired chemd source from compiler diagnostics"
  });
};

main().catch((error) => {
  respond({
    action: "stop",
    note: error instanceof Error ? error.message : String(error)
  });
});
