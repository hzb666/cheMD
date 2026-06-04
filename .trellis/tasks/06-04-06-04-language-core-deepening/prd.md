# Chemd Language Core Deepening

## Goal

Improve Chemd as a chemistry experiment programming language without adding IDE, training export, or device-control scope.

## Scope

- Condition expression AST and typed condition diagnostics
- Step parameter and quantity type precision
- Procedure state and effect model
- Standard step family contracts
- Module build graph and affected-module checks
- Compiler-grade diagnostics and explanations
- Semantic diff precision
- Language contract fixtures and documentation coverage gates

## Non-Goals

- Device execution or instrument control
- IDE editor work
- Training/RAG export changes
- Database or service integration

## Trellis Cycle

Each phase follows the same loop:

1. Survey existing code and tests
2. Specify the phase contract
3. Add failing tests and CLI smoke cases
4. Implement the smallest complete behavior
5. Refactor local structure
6. Run package tests, typechecks, CLI checks, and docs coverage
7. Review for remaining gaps
8. Commit and record the phase

## Acceptance

- Core language features are represented in AST or typed semantic graph, not only string heuristics.
- Compiler diagnostics have stable codes, facts, spans, and machine-readable JSON.
- CLI exposes the language-layer capabilities with deterministic text and JSON output.
- Docs coverage and marked examples remain valid.
- Remaining gaps are P2/P3 backlog items, not P0/P1 language correctness issues.
