# chem-service

Python microservice providing `MolScribe + RDKit` capabilities for the chemd workbench.

## Architecture

```
app.py              Flask application factory and entrypoint
routes/
  ocr.py            POST /ocr  – image → smiles/molfile via MolScribe + RDKit
  normalize.py      POST /normalize – smiles/molfile → canonical smiles + normalized molfile
  render.py         POST /render – smiles/molfile → SVG
services/
  molscribe_service.py       MolScribe OCR integration (stub until model is wired)
  rdkit_normalize_service.py RDKit canonicalisation and standardisation
  rdkit_render_service.py    RDKit SVG renderer
```

## Running locally

```bash
pip install -r requirements.txt
python app.py
# Service runs on http://localhost:8765 by default
# Override port with CHEM_SERVICE_PORT env var
```

## API

### `POST /ocr`

Accepts `multipart/form-data` with a `file` field (JPEG, PNG, etc.).

Response:

```json
{
  "smiles": "CCO",
  "molfile": null,
  "confidence": 0.92,
  "warnings": []
}
```

### `POST /normalize`

Accepts JSON body with optional `smiles` and/or `molfile` fields.

Response:

```json
{
  "canonical_smiles": "CCO",
  "normalized_molfile": "...",
  "warnings": []
}
```

### `POST /render`

Accepts JSON body with optional `smiles`, `molfile`, `width`, and `height` fields.

Response:

```json
{
  "svg": "<svg .../>",
  "warnings": []
}
```

