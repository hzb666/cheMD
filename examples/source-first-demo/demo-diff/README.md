# Demo Semantic Diff

This optional demo compares two Chemd source attempts:

```bash
pnpm chemd diff examples/source-first-demo/demo-diff/attempt-a.chemd examples/source-first-demo/demo-diff/attempt-b.chemd --format text
```

The point is source-first comparison: Chemd can show experiment variable changes
without converting the record into a JSON-first authoring flow.
