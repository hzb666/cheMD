# Chemd Source Repair Drivers

These drivers implement the `chemd agent-loop` external driver protocol.

The protocol is fixed:

- stdin: `chemd-agent-driver-request/v0.1`
- stdout: `chemd-agent-driver-response/v0.1`

`chemd-source-repair-driver.mjs` is the LLM-backed driver. It repairs invalid or
incomplete Chemd source from compiler diagnostics and returns a JSON driver
response whose `nextSource` is pure Chemd source.

Use either an OpenAI-compatible chat endpoint:

```bash
set OPENAI_API_KEY=...
set CHEMD_LLM_MODEL=gpt-4.1-mini
pnpm chemd agent-loop draft.chemd ^
  --driver node ^
  --driver-arg examples/source-first-demo/llm-driver/chemd-source-repair-driver.mjs ^
  --format text
```

Or mock the LLM output for deterministic local demos:

```bash
set CHEMD_LLM_MOCK_OUTPUT=<complete repaired chemd source>
pnpm chemd agent-loop draft.chemd ^
  --driver node ^
  --driver-arg examples/source-first-demo/llm-driver/chemd-source-repair-driver.mjs ^
  --format text
```

`mock-source-repair-driver.mjs` is deterministic and only handles the bundled
syntax and reference repair demos. It does not perform natural-language
authoring.
