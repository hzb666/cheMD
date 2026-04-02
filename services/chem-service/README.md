# chem-service

MVP chemistry HTTP service used by `apps/web` through `/api/chem/*`.

Current routes:

- `GET /healthz`
- `POST /ocr` (molecule OCR placeholder failure response)
- `POST /normalize` (molecule normalization fallback response)
- `POST /render` (molecule SVG fallback response)
- `GET|POST /structure` (session-scoped in-memory molecule structure cache, 5 minute TTL)

Notes:

- This service is still molecule-only; reaction OCR/render/save routes are not implemented here yet.
- Blank `smiles` / `molfile` inputs are rejected instead of being coerced into placeholder chemistry.
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
