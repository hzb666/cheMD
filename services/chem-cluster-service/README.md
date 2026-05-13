# Chemd Cluster Service

Offline reaction-map layout worker for Desktop IDE production batches.

This service is intentionally outside `apps/desktop` and the app runtime. It can
be run as a batch tool against graph/layout JSON and returns data compatible
with `@chemd/reaction-map` `ReactionMapWorkerLayoutOutput` on success.

## Usage

Run from the repository root:

```bash
python -m unittest discover services/chem-cluster-service/tests
```

Run the worker from the service directory:

```bash
cd services/chem-cluster-service
python -m chem_cluster_service.cli --input input.json --output layout.json --engine fallback --pretty
```

Supported input shapes:

- `ReactionMapWorkerLayoutInput` from `@chemd/reaction-map`.
- `ReactionMapLayout` artifact with schema
  `chemd-reaction-cluster-layout/v0.1`.
- Training graph-style JSON with `reaction_features` and optional
  `reaction_similarity_edges` / `explicit_edges`.

## Output Contract

Successful runs write a direct `ReactionMapWorkerLayoutOutput` JSON object:

```json
{
  "layout_engine": "worker",
  "layout_engine_version": "deterministic-fallback/v0.1",
  "positions": [{ "reaction_entity_id": "rxn-a", "x": 64.0, "y": 0.0 }],
  "mst_edges": [],
  "warnings": ["deterministic_fallback_layout_used"]
}
```

When `tmap` is unavailable, the default `--engine auto --missing-tmap skip`
returns a classified SKIP envelope with exit code `0`:

```json
{
  "status": "SKIP",
  "code": "tmap_dependency_missing",
  "message": "Python package 'tmap' is not importable in this environment.",
  "artifact": null
}
```

Use `--missing-tmap error` to classify missing `tmap` as `ERROR` with exit code
`2`, or `--missing-tmap fallback` to emit the deterministic worker artifact.

## Runtime Boundary

This worker is an offline/batch tool. Desktop authoring must not import it or
depend on `tmap`; worker failures are reported through JSON classification and
do not block IDE editing, compile, preview, or save paths.
