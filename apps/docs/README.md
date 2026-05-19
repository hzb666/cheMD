# Chemd Docs

This app hosts the bilingual Chemd language and codebase documentation. Content lives under `content/docs/en` and `content/docs/zh`; keep the two trees mirrored unless a page is intentionally language-specific.

## Development

```bash
pnpm dev
```

Open http://localhost:3000 after the server starts.

## Content Rules

- Use current source code as the source of truth for syntax, diagnostics, CLI commands, and package APIs.
- Keep navigation order explicit in each `meta.json`.
- Prefer one visible page per concept. If an older page is kept for direct links, do not also expose it as a duplicate navigation entry.
- Every user-facing syntax pattern should include a short explanation and a runnable or copyable example.
- Update English and Chinese pages together.

## Verification

```bash
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/docs build
```
