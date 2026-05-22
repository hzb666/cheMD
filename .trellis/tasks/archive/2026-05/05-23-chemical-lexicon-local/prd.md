# 建立本地 chemical lexicon

## Goal

Add an offline chemical mention recognizer that future prose import code can use before optional external providers such as PubChem or CDE2.

## Scope

- Create `@chemd/chemical-lexicon`.
- Provide local synonym and abbreviation matching.
- Prefer maximum-span matches to reduce fragmented mentions.
- Add a provider interface for optional PubChem/CDE2 integrations.
- Keep Chemd parser, schemas, and typechecker unchanged.

## Acceptance

- Local recognition works without network access.
- Common aliases such as DCM, EtOAc, n-BuLi, and brine are recognized.
- Longer phrases win over shorter overlapping phrases.
- Formula-like candidates can be detected without asserting a PubChem identity.
