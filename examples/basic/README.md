# Basic Examples

These examples keep the source and expected CLI output small enough to inspect
in a review.

- `experiment-before.chemd` and `experiment-after.chemd` demonstrate semantic
  experiment diffing.
- `agent-audit.chemd` demonstrates a source-preserved agent audit block.

Run them from the repository root:

```bash
pnpm chemd diff examples/basic/experiment-before.chemd examples/basic/experiment-after.chemd
pnpm chemd validate examples/basic/agent-audit.chemd
```
