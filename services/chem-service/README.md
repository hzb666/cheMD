# chem-service

MVP chemistry HTTP service used by `apps/web` through `/api/chem/*`.

Environment management:

- Full local demo stack can now be started from the repo root with `pnpm dev`.
- Add `--reload` to `pnpm dev` when you want the backend to auto-reload on Python file changes.
- If you only want the frontend shell, use `pnpm dev:web` at the repo root.
- Use Poetry for local setup.
- The virtualenv is pinned to `services/chem-service/.venv` via `poetry.toml`.
- Install dependencies with `poetry install`.
- Copy `.env.example` to `.env` or export the same variables in your shell.
- Run the app with `poetry run python app.py`.
- Run tests with `poetry run python -m unittest discover -s tests -p "test_*.py"`.
- Check provider readiness with `GET /healthz`.

Current routes:

- `GET /healthz`
- `POST /ocr` (molecule OCR provider route; placeholder-safe when provider is unavailable)
- `POST /reaction/ocr` (reaction OCR provider seam reserved; default placeholder failure response)
- `POST /normalize` (molecule normalization response, RDKit-first with fallback)
- `POST /render` (molecule SVG response plus normalized molecule payload, RDKit-first with fallback)
- `POST /reaction/render` (reaction SVG response, RDKit-first with fallback)
- `GET|POST /structure` (session-scoped in-memory molecule structure cache, 5 minute TTL)

Reaction intelligence worker / CLI:

- Reaction intelligence runs as a local worker/CLI path instead of a Flask route so heavy chemistry and layout dependencies do not leak into the web app startup path.
- Run a JSON job from `services/chem-service` with:
  - `poetry run python -m chem_service.reaction_intelligence.cli path/to/job.json --output path/to/artifact.json`
- The job can provide `reactionIds` plus `similarityEdges`, or `reactions` plus `edges`. Edges accept common endpoint keys such as `source`/`target`, `sourceReactionId`/`targetReactionId`, or `from`/`to`.
- The CLI always writes parseable artifact JSON. Optional provider failures are reported under `providers[]` with `status: "skipped"` or `status: "failed"` instead of pretending that computed chemistry or layout exists.
- TMAP is optional and lazily imported only when a multi-reaction layout has similarity edges. If `tmap` is not installed or its native extension cannot load, the artifact remains valid and reports `provider_unavailable`.
- TMAP is intended for large reaction-space overview maps. The app does not need to display TMAP by default; ordinary document-scale reaction graphs should continue to use normal map/graph rendering unless the product flow explicitly asks for a large projected reaction space.

Local startup modes:

- Full demo: run `pnpm dev` from the repo root. This starts `@chemd/web` on `http://127.0.0.1:2436` and `chem-service` on `http://127.0.0.1:18081`.
- Full demo with backend reload: run `pnpm dev --reload` from the repo root. The web app stays on Next.js dev mode, and `chem-service` switches to Flask reload mode.
- Frontend only: run `pnpm dev:web` from the repo root.
- Backend only: run `poetry run python app.py` inside `services/chem-service`.

Notes:

- This service now exposes molecule + reaction endpoint shapes; molecule / reaction render paths are RDKit-first, while OCR remains provider-driven with placeholder-safe fallback.
- This service is internal-only by default and should not be exposed directly to the public internet.
- Preferred deployment model is `apps/web -> chem-service` on a trusted network segment; if that is not true, configure `CHEM_SERVICE_ACCESS_KEY`.
- If `rdkit` is installed in the Python runtime, `/normalize`, `/render`, and `/reaction/render` will prefer RDKit results before falling back.
- RDKit reaction SVG post-processing now stacks arrow-top reagents and arrow-bottom render conditions (temperature, time, solvent, light, electrochemistry) into tighter multi-line labels, normalizes Celsius labels to `°C`, can compact short temperature/time tokens with commas, widens reagent/plus spacing, and redraws the arrow with a filled concave-base arrowhead when labels need more space.
- Molecule OCR can be switched with `CHEM_SERVICE_MOLECULE_OCR_PROVIDER`.
- Current supported molecule OCR provider keys are `decimer`, `molscribe`, and `molnextr`.
- Reaction OCR can be switched with `CHEM_SERVICE_REACTION_OCR_PROVIDER`.
- Supported reaction OCR provider keys are `rxnscribe`, `rxnim`, and `rxncaption`.
- `rxnscribe` now supports real remote HTTP invocation plus payload normalization.
- `rxnim` and `rxncaption` currently only expose remote seam + mapping skeleton.
- RxnScribe self-host config:
  - `CHEM_SERVICE_RXNSCRIBE_API_URL`
  - Optional timeout: `CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS`
  - Optional API key header: `CHEM_SERVICE_RXNSCRIBE_API_KEY`
- Remote molecule OCR config:
  - `CHEM_SERVICE_DECIMER_API_URL`
  - `CHEM_SERVICE_DECIMER_TIMEOUT_SECONDS`
  - `CHEM_SERVICE_DECIMER_API_KEY`
  - `CHEM_SERVICE_MOLSCRIBE_API_URL`
  - `CHEM_SERVICE_MOLSCRIBE_TIMEOUT_SECONDS`
  - `CHEM_SERVICE_MOLSCRIBE_API_KEY`
  - `CHEM_SERVICE_MOLNEXTR_API_URL`
  - `CHEM_SERVICE_MOLNEXTR_TIMEOUT_SECONDS`
  - `CHEM_SERVICE_MOLNEXTR_API_KEY`
- Reserved remote reaction OCR seams:
  - `CHEM_SERVICE_RXNIM_API_URL`
  - `CHEM_SERVICE_RXNIM_TIMEOUT_SECONDS`
  - `CHEM_SERVICE_RXNIM_API_KEY`
  - `CHEM_SERVICE_RXNCAPTION_API_URL`
  - `CHEM_SERVICE_RXNCAPTION_TIMEOUT_SECONDS`
  - `CHEM_SERVICE_RXNCAPTION_API_KEY`
- Remote provider payload notes:
  - `rxnscribe` is normalized from richer official-style reaction entity output into `reactants/products/conditions`.
  - `molscribe`, `decimer`, and `molnextr` expect remote payloads that mirror each project's Python inference result shape closely enough for `chem-service` to map them.
  - `rxnim` and `rxncaption` currently only reserve the seam; they return a safe failed response until a provider-specific mapper is implemented.
- Blank `smiles` / `molfile` inputs are rejected instead of being coerced into placeholder chemistry.
- Blank reaction side arrays are rejected; RDKit/fallback reaction SVG is returned only after route validation passes.
- This service currently returns safe fallback outputs when configured OCR providers or the RDKit runtime are unavailable.
- The Next.js app uses `/render` directly for preview hydration, while `/normalize` remains available for standalone normalization flows.
- Default CORS only allows `http://127.0.0.1:2436` and `http://localhost:2436`.
- Protected endpoints are `/ocr`, `/reaction/ocr`, `/normalize`, `/render`, and `/reaction/render`.
- If `CHEM_SERVICE_ACCESS_KEY` is set, callers must send it as `X-Chem-Service-Key`.
- If `CHEM_SERVICE_ACCESS_KEY` is not set, protected endpoints only accept loopback/internal requests while `CHEM_SERVICE_INTERNAL_ONLY=true` (default).
- Local regression tests:
  - `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
- Runtime limits can be adjusted with:
  - `CHEM_SERVICE_MAX_UPLOAD_BYTES`
  - `CHEM_SERVICE_MAX_CONTENT_LENGTH`
  - `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH`
  - `CHEM_SERVICE_CACHE_MAX_ENTRIES`
  - `CHEM_SERVICE_ALLOW_ORIGINS`
  - `CHEM_SERVICE_HOST`
  - `CHEM_SERVICE_PORT`
- Default OCR upload contract is `5 MiB` raw image size.
- The base64 limit and `MAX_CONTENT_LENGTH` default are derived from that raw-image limit so web/API defaults stay aligned.
