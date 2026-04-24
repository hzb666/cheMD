from __future__ import annotations

from typing import Any
from unittest.mock import patch

import chem_service.molecule_ocr as molecule_ocr
import chem_service.molecule_rendering as molecule_rendering
from tests.support import ChemServiceAppTestCase


class ChemServiceMoleculeRenderingTest(ChemServiceAppTestCase):
    def test_ocr_placeholder_response_is_marked_failed(self) -> None:
        response = self.client.post("/ocr", json={"imageBase64": "YWJj", "mimeType": "image/png"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["kind"], "molecule")
        self.assertEqual(payload["provider"], "placeholder")
        self.assertTrue(payload["placeholder"])
        self.assertEqual(payload["candidates"], [])
        self.assertNotIn("structure", payload)
        self.assertIn("placeholder", payload["warnings"][0].lower())
        self.assertIn("molecule ocr provider is not enabled", payload["warnings"][0].lower())

    def test_ocr_returns_provider_structure_when_available(self) -> None:
        with patch.object(
            self.module,
            "_run_molecule_ocr_with_provider",
            return_value={
                "status": "ok",
                "structure": {
                    "smiles": "CCO",
                    "molfile": "mock-molfile",
                },
                "confidence": 0.91,
                "warnings": [],
            },
        ) as ocr_mock:
            response = self.client.post(
                "/ocr",
                json={"imageBase64": "YWJj", "mimeType": "image/png"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["kind"], "molecule")
        self.assertFalse(payload["placeholder"])
        self.assertEqual(payload["structure"]["smiles"], "CCO")
        self.assertEqual(payload["structure"]["molfile"], "mock-molfile")
        self.assertEqual(payload["normalized"]["smiles"], "CCO")
        self.assertEqual(payload["confidence"], 0.91)
        ocr_mock.assert_called_once()

    def test_ocr_dispatches_to_decimer_provider_when_enabled(self) -> None:
        with patch.object(self.module, "_MOLECULE_OCR_PROVIDER", "decimer"):
            with patch.object(
                self.module,
                "_run_molecule_ocr_with_decimer",
                return_value={
                    "status": "ok",
                    "structure": {
                        "smiles": "CCO",
                    },
                    "confidence": None,
                    "warnings": [],
                },
            ) as decimer_mock:
                response = self.client.post(
                    "/ocr",
                    json={"imageBase64": "YWJj", "mimeType": "image/png"},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["structure"]["smiles"], "CCO")
        decimer_mock.assert_called_once()

    def test_ocr_returns_structured_error_when_remote_provider_fails(self) -> None:
        with patch.object(self.module, "_MOLECULE_OCR_PROVIDER", "decimer"):
            with patch.object(
                self.module,
                "_run_molecule_ocr_with_decimer",
                side_effect=RuntimeError("provider timeout with internal details"),
            ):
                response = self.client.post(
                    "/ocr",
                    json={"imageBase64": "YWJj", "mimeType": "image/png"},
                )

        self.assertEqual(response.status_code, 502)
        payload = response.get_json()
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["kind"], "molecule")
        self.assertEqual(payload["provider"], "decimer")
        self.assertEqual(payload["error"]["code"], "remote_ocr_provider_failed")
        self.assertNotIn("internal details", payload["error"]["message"])

    def test_decimer_remote_payload_accepts_uppercase_smiles_key(self) -> None:
        payload = molecule_ocr._map_remote_molecule_payload(
            "DECIMER",
            {
                "SMILES": "CCO",
                "confidence": 0.63,
                "warnings": ["hand-drawn mode"],
            },
        )

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["kind"], "molecule")
        self.assertEqual(payload["provider"], "DECIMER")
        self.assertEqual(payload["structure"]["smiles"], "CCO")
        self.assertEqual(payload["confidence"], 0.63)
        self.assertEqual(payload["warnings"], ["hand-drawn mode"])

    def test_ocr_dispatches_to_molnextr_provider_when_enabled(self) -> None:
        with patch.object(self.module, "_MOLECULE_OCR_PROVIDER", "molnextr"):
            with patch.object(
                self.module,
                "_run_molecule_ocr_with_molnextr",
                return_value={
                    "status": "ok",
                    "structure": {
                        "smiles": "CCO",
                        "molfile": "mock-molfile",
                    },
                    "confidence": 0.77,
                    "warnings": [],
                },
            ) as molnextr_mock:
                response = self.client.post(
                    "/ocr",
                    json={"imageBase64": "YWJj", "mimeType": "image/png"},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["structure"]["smiles"], "CCO")
        self.assertEqual(payload["structure"]["molfile"], "mock-molfile")
        self.assertEqual(payload["confidence"], 0.77)
        molnextr_mock.assert_called_once()

    def test_normalize_rejects_blank_inputs(self) -> None:
        response = self.client.post("/normalize", json={"smiles": "   "})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], "smiles or molfile is required")

    def test_render_rejects_blank_inputs(self) -> None:
        response = self.client.post("/render", json={"smiles": "   "})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], "smiles or molfile is required")

    def test_normalize_prefers_rdkit_path_when_available(self) -> None:
        with patch.object(
            self.module,
            "_normalize_with_rdkit",
            return_value={
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "warnings": [],
            },
        ) as normalize_mock:
            response = self.client.post("/normalize", json={"smiles": " CCO "})

        self.assertEqual(response.status_code, 200)
        normalize_mock.assert_called_once_with("CCO", None)
        self.assertEqual(
            response.get_json(),
            {
                "kind": "molecule",
                "provider": "rdkit",
                "candidates": [],
                "placeholder": False,
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "normalized": {
                    "canonicalSmiles": "CCO",
                    "normalizedMolfile": "rdkit-molfile",
                },
                "warnings": [],
            },
        )

    def test_render_prefers_rdkit_path_when_available(self) -> None:
        with patch.object(
            self.module,
            "_render_with_rdkit",
            return_value={
                "svg": "<svg>rdkit</svg>",
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "warnings": [],
            },
        ) as render_mock:
            response = self.client.post("/render", json={"smiles": " CCO "})

        self.assertEqual(response.status_code, 200)
        render_mock.assert_called_once_with("CCO", None, None)
        self.assertEqual(
            response.get_json(),
            {
                "kind": "molecule",
                "provider": "rdkit",
                "candidates": [],
                "placeholder": False,
                "svg": "<svg>rdkit</svg>",
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "normalized": {
                    "canonicalSmiles": "CCO",
                    "normalizedMolfile": "rdkit-molfile",
                },
                "warnings": [],
            },
        )

    def test_render_fallback_includes_normalized_payload(self) -> None:
        with patch.object(self.module, "_render_with_rdkit", return_value=None):
            response = self.client.post("/render", json={"smiles": " CCO "})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "kind": "molecule",
                "provider": "fallback",
                "candidates": [],
                "placeholder": False,
                "svg": molecule_rendering._build_molecule_fallback_svg("CCO"),
                "canonicalSmiles": "CCO",
                "normalizedMolfile": None,
                "normalized": {
                    "canonicalSmiles": "CCO",
                    "normalizedMolfile": None,
                },
                "warnings": ["RDKit render fallback is active."],
            },
        )

    def test_render_passes_render_options_to_rdkit_path(self) -> None:
        render_options = {
            "profileId": "publication-acs",
            "structure": {"backgroundColor": "#00000000"},
            "export": {"transparentBackground": True},
        }
        with patch.object(
            self.module,
            "_render_with_rdkit",
            return_value={
                "svg": "<svg>rdkit</svg>",
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "warnings": [],
            },
        ) as render_mock:
            response = self.client.post(
                "/render",
                json={
                    "smiles": "CCO",
                    "renderOptions": render_options,
                },
            )

        self.assertEqual(response.status_code, 200)
        render_mock.assert_called_once_with("CCO", None, render_options)

    def test_normalize_preserves_molfile_format_for_rdkit(self) -> None:
        molfile = "\n  RDKit          2D\n\n  1  0  0  0  0  0            999 V2000\n"
        with patch.object(
            self.module,
            "_normalize_with_rdkit",
            return_value={
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "warnings": [],
            },
        ) as normalize_mock:
            response = self.client.post("/normalize", json={"molfile": molfile})

        self.assertEqual(response.status_code, 200)
        normalize_mock.assert_called_once_with(None, molfile)

    def test_render_preserves_molfile_format_for_rdkit(self) -> None:
        molfile = "\n  RDKit          2D\n\n  1  0  0  0  0  0            999 V2000\n"
        with patch.object(
            self.module,
            "_render_with_rdkit",
            return_value={
                "svg": "<svg>rdkit</svg>",
                "canonicalSmiles": "CCO",
                "normalizedMolfile": "rdkit-molfile",
                "warnings": [],
            },
        ) as render_mock:
            response = self.client.post("/render", json={"molfile": molfile})

        self.assertEqual(response.status_code, 200)
        render_mock.assert_called_once_with(None, molfile, None)

    def test_render_with_rdkit_returns_normalized_payload_alongside_svg(self) -> None:
        class FakeChemModule:
            @staticmethod
            def MolFromMolBlock(molfile: str, sanitize: bool = True) -> None:
                return None

            @staticmethod
            def MolFromSmiles(smiles: str) -> dict[str, str]:
                return {"smiles": smiles}

            @staticmethod
            def MolToSmiles(molecule: dict[str, str], canonical: bool = True) -> str:
                return molecule["smiles"]

            @staticmethod
            def MolToMolBlock(molecule: dict[str, str]) -> str:
                return "mock-molfile"

        class FakeDrawer:
            def __init__(self, width: int, height: int) -> None:
                self.width = width
                self.height = height
                self.molecule: dict[str, str] | None = None

            def drawOptions(self) -> Any:
                return type("Options", (), {"clearBackground": True})()

            def FinishDrawing(self) -> None:
                return None

            def GetDrawingText(self) -> str:
                return f"<svg width='{self.width}' height='{self.height}'>{self.molecule}</svg>"

        class FakeDrawModule:
            MolDraw2DSVG = FakeDrawer

            @staticmethod
            def PrepareAndDrawMolecule(drawer: FakeDrawer, molecule: dict[str, str]) -> None:
                drawer.molecule = molecule

        payload = molecule_rendering._render_with_rdkit(
            "CCO",
            None,
            None,
            try_import_rdkit=lambda: (FakeChemModule, FakeDrawModule, object()),
        )

        self.assertIsNotNone(payload)
        self.assertEqual(payload["canonicalSmiles"], "CCO")
        self.assertEqual(payload["normalizedMolfile"], "mock-molfile")
        self.assertIn("<svg", payload["svg"])
