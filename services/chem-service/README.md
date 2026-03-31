# chem-service

MVP chemistry HTTP service used by `apps/web` through `/api/chem/*`.

Current routes:

- `GET /healthz`
- `POST /ocr` (MolScribe fallback response)
- `POST /normalize` (RDKit fallback response)
- `POST /render` (SVG fallback response)
- `GET|POST /structure` (in-memory structure cache, 5 minute TTL)

Notes:

- This service currently returns safe fallback outputs when MolScribe/RDKit runtime is unavailable.
- The Next.js app still uses these routes end-to-end for OCR/normalize/render/cache orchestration.
