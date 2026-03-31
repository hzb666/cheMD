"""Placeholder MolScribe OCR service."""

from __future__ import annotations


class MolscribeService:
    """Stub for MolScribe OCR integration.

    In production this would load the MolScribe model and run inference.
    The stub returns a deterministic placeholder so the rest of the pipeline
    can be wired up and tested without the heavyweight model dependency.
    """

    def predict(self, image_bytes: bytes) -> dict:
        """Run OCR on raw image bytes.

        Args:
            image_bytes: Raw image file content (JPEG, PNG, etc.).

        Returns:
            A dict with ``smiles``, ``molfile``, ``confidence``, and
            ``warnings`` keys.
        """
        _ = image_bytes  # not used in stub
        return {
            "smiles": "CCO",
            "molfile": None,
            "confidence": 0.0,
            "warnings": ["MolScribe model not loaded – returning placeholder result"],
        }
