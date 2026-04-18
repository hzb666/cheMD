# Bootstrap: Fill Project Development Guidelines

## Purpose

Welcome to Trellis! This is your first task.

AI agents use `.trellis/spec/` to understand YOUR project's coding conventions.
**Starting from scratch = AI writes generic code that doesn't match your project style.**

Filling these guidelines is a one-time setup that pays off for every future AI session.

---

## Your Task

Fill in the guideline files based on your **existing codebase**.

### Package: @chemd/web (`spec/web/`)

- Frontend guidelines: `.trellis/spec/web/frontend/`

### Package: @chemd/compiler (`spec/compiler/`)

- Backend guidelines: `.trellis/spec/compiler/backend/`

- Frontend guidelines: `.trellis/spec/compiler/frontend/`

### Package: @chemd/core (`spec/core/`)

- Backend guidelines: `.trellis/spec/core/backend/`

- Frontend guidelines: `.trellis/spec/core/frontend/`

### Package: @chemd/exporter-training (`spec/exporter-training/`)

- Backend guidelines: `.trellis/spec/exporter-training/backend/`

- Frontend guidelines: `.trellis/spec/exporter-training/frontend/`

### Package: @chemd/parser (`spec/parser/`)

- Backend guidelines: `.trellis/spec/parser/backend/`

- Frontend guidelines: `.trellis/spec/parser/frontend/`

### Package: @chemd/render-profile (`spec/render-profile/`)

- Backend guidelines: `.trellis/spec/render-profile/backend/`

- Frontend guidelines: `.trellis/spec/render-profile/frontend/`

### Package: @chemd/renderer-docx (`spec/renderer-docx/`)

- Backend guidelines: `.trellis/spec/renderer-docx/backend/`

- Frontend guidelines: `.trellis/spec/renderer-docx/frontend/`

### Package: @chemd/renderer-html (`spec/renderer-html/`)

- Backend guidelines: `.trellis/spec/renderer-html/backend/`

- Frontend guidelines: `.trellis/spec/renderer-html/frontend/`

### Package: @chemd/renderer-json (`spec/renderer-json/`)

- Backend guidelines: `.trellis/spec/renderer-json/backend/`

- Frontend guidelines: `.trellis/spec/renderer-json/frontend/`

### Package: @chemd/resolver (`spec/resolver/`)

- Backend guidelines: `.trellis/spec/resolver/backend/`

- Frontend guidelines: `.trellis/spec/resolver/frontend/`


### Thinking Guides (Optional)

The `.trellis/spec/guides/` directory contains thinking guides that are already
filled with general best practices. You can customize them for your project if needed.

---

## How to Fill Guidelines

### Step 0: Import from Existing Specs (Recommended)

Many projects already have coding conventions documented. **Check these first** before writing from scratch:

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

If any of these exist, read them first and extract the relevant coding conventions into the corresponding `.trellis/spec/` files. This saves significant effort compared to writing everything from scratch.

### Step 1: Analyze the Codebase

Ask AI to help discover patterns from actual code:

- "Read all existing config files (CLAUDE.md, .cursorrules, etc.) and extract coding conventions into .trellis/spec/"
- "Analyze my codebase and document the patterns you see"
- "Find error handling / component / API patterns and document them"

### Step 2: Document Reality, Not Ideals

Write what your codebase **actually does**, not what you wish it did.
AI needs to match existing patterns, not introduce new ones.

- **Look at existing code** - Find 2-3 examples of each pattern
- **Include file paths** - Reference real files as examples
- **List anti-patterns** - What does your team avoid?

---

## Completion Checklist

- [ ] Guidelines filled for your project type
- [ ] At least 2-3 real code examples in each guideline
- [ ] Anti-patterns documented

When done:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

---

## Why This Matters

After completing this task:

1. AI will write code that matches your project style
2. Relevant `/trellis:before-*-dev` commands will inject real context
3. `/trellis:check-*` commands will validate against your actual standards
4. Future developers (human or AI) will onboard faster
