# chem-service

MVP chemistry HTTP service used by `apps/web` through `/api/chem/*`.

Environment management:

- Use Poetry for local setup.
- The virtualenv is pinned to `services/chem-service/.venv` via `poetry.toml`.
- Install dependencies with `poetry install`.
- Copy `.env.example` to `.env` or export the same variables in your shell.
- Run the app with `poetry run python app.py`.
- Run tests with `poetry run python -m unittest discover -s tests -p "test_*.py"`.
- Check provider readiness with `GET /healthz`.

Current routes:

- `GET /healthz`
- `POST /ocr` (molecule OCR placeholder failure response)
- `POST /reaction/ocr` (reaction OCR placeholder failure response)
- `POST /normalize` (molecule normalization fallback response)
- `POST /render` (molecule SVG fallback response)
- `POST /reaction/render` (reaction SVG fallback response)
- `GET|POST /structure` (session-scoped in-memory molecule structure cache, 5 minute TTL)

Notes:

- This service now exposes molecule + reaction endpoint shapes, but provider integration is still placeholder/fallback-first.
- If `rdkit` is installed in the Python runtime, `/normalize` and `/render` will prefer RDKit results before falling back.
- Molecule OCR can be switched with `CHEM_SERVICE_MOLECULE_OCR_PROVIDER`.
- Current supported molecule OCR provider keys are `mathpix`, `molscribe`, and `decimer`.
- External API route for v0.1 should prefer `mathpix`.
- Mathpix credentials:
  - `CHEM_SERVICE_MATHPIX_APP_ID`
  - `CHEM_SERVICE_MATHPIX_APP_KEY`
  - Optional endpoint override: `CHEM_SERVICE_MATHPIX_API_URL`
  - Optional timeout: `CHEM_SERVICE_MATHPIX_TIMEOUT_SECONDS`
- MolScribe runtime resolution order is:
  - `CHEM_SERVICE_MOLSCRIBE_CHECKPOINT_PATH`
  - Hugging Face repo/file from `CHEM_SERVICE_MOLSCRIBE_HF_REPO` + `CHEM_SERVICE_MOLSCRIBE_HF_FILE`
- MolScribe device can be forced with `CHEM_SERVICE_MOLSCRIBE_DEVICE` and defaults to `cpu`.
- Blank `smiles` / `molfile` inputs are rejected instead of being coerced into placeholder chemistry.
- Blank reaction side arrays are rejected; fallback reaction SVG is returned only after route validation passes.
- This service currently returns safe fallback outputs when MolScribe/RDKit runtime is unavailable.
- The Next.js app still uses these routes end-to-end for OCR/normalize/render/cache orchestration.
- Default CORS only allows `http://127.0.0.1:2436` and `http://localhost:2436`.
- Local regression tests:
  - `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
- Runtime limits can be adjusted with:
  - `CHEM_SERVICE_MAX_CONTENT_LENGTH`
  - `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH`
  - `CHEM_SERVICE_CACHE_MAX_ENTRIES`
  - `CHEM_SERVICE_ALLOW_ORIGINS`
  - `CHEM_SERVICE_HOST`
  - `CHEM_SERVICE_PORT`

Current local note:

- For v0.1, external OCR via `mathpix` is now the preferred route because it avoids local model/runtime friction on this machine.

- `MolScribe` currently resolves to `torch==1.13.1` during Poetry dependency resolution.
- On this machine only `Python 3.14` is installed, and Poetry cannot install that torch build for this interpreter.
- `DECIMER` currently resolves to `tensorflow==2.20.0` during Poetry dependency resolution.
- Poetry cannot install that tensorflow build for the current `Python 3.14` environment either.
- Practical next step for Mathpix is just configuring API credentials before enabling `CHEM_SERVICE_MOLECULE_OCR_PROVIDER=mathpix`.
- When Mathpix is configured, `/healthz` will report `"ocr": {"provider": "mathpix", "configured": true}` without leaking secrets.
- Practical next step for local models is to add a `Python 3.10/3.11` interpreter and point a dedicated Poetry env at it before enabling `CHEM_SERVICE_MOLECULE_OCR_PROVIDER=molscribe` or `decimer`.
