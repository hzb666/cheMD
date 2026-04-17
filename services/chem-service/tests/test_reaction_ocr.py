from __future__ import annotations

import unittest
from typing import Any
from unittest.mock import patch

import chem_service.remote_provider as remote_provider
import chem_service.reaction_ocr as reaction_ocr
from tests.support import ChemServiceAppTestCase


class ChemServiceReactionOcrRouteTest(ChemServiceAppTestCase):
    def test_reaction_ocr_placeholder_response_is_marked_failed(self) -> None:
        response = self.client.post("/reaction/ocr", json={"imageBase64": "abc"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "failed")
        self.assertNotIn("reaction", payload)
        self.assertIn("placeholder", payload["warnings"][0].lower())

    def test_reaction_ocr_dispatches_to_rxnscribe_provider_when_enabled(self) -> None:
        with patch.object(self.module, "_REACTION_OCR_PROVIDER", "rxnscribe"):
            with patch.object(
                self.module,
                "_run_reaction_ocr_with_rxnscribe",
                return_value={
                    "status": "ok",
                    "reaction": {
                        "reactants": ["CCO"],
                        "products": ["CC=O"],
                        "conditions": ["heat"],
                    },
                    "confidence": 0.81,
                    "warnings": [],
                },
            ) as rxnscribe_mock:
                response = self.client.post(
                    "/reaction/ocr",
                    json={"imageBase64": "YWJj", "mimeType": "image/png"},
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["reaction"]["reactants"], ["CCO"])
        self.assertEqual(payload["reaction"]["products"], ["CC=O"])
        self.assertEqual(payload["reaction"]["conditions"], ["heat"])
        self.assertEqual(payload["confidence"], 0.81)
        rxnscribe_mock.assert_called_once()

    def test_reaction_ocr_rejects_unknown_provider_key(self) -> None:
        with patch.object(self.module, "_REACTION_OCR_PROVIDER", "unknown-provider"):
            response = self.client.post(
                "/reaction/ocr",
                json={"imageBase64": "YWJj", "mimeType": "image/png"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "failed")
        self.assertIn("unknown reaction ocr provider", payload["warnings"][0].lower())


class ChemServiceReactionOcrModuleTest(unittest.TestCase):
    def test_request_remote_provider_normalizes_official_style_payload(self) -> None:
        captured: dict[str, Any] = {}

        def fake_request_remote_json(**kwargs: Any) -> dict[str, Any]:
            captured.update(kwargs)
            return {
                "reactions": [
                    {
                        "reactants": [{"smiles": "CCO"}],
                        "conditions": [{"text": "air"}, {"text": "80 C"}],
                        "products": [{"smiles": "CC(=O)O"}],
                    }
                ],
                "confidence": 0.82,
                "warnings": ["low contrast"],
            }

        payload = reaction_ocr._request_remote_reaction_provider(
            "RxnScribe",
            remote_provider.RemoteOcrProviderRequest(
                image_bytes=b"abc",
                mime_type="image/png",
                api_url="https://rxnscribe.test/predict",
                timeout_seconds=45,
                api_key="rxn-key",
            ),
            request_remote_json=fake_request_remote_json,
        )

        self.assertEqual(captured["url"], "https://rxnscribe.test/predict")
        self.assertEqual(captured["timeout_seconds"], 45)
        self.assertEqual(captured["api_key"], "rxn-key")
        self.assertEqual(captured["payload"]["imageBase64"], "YWJj")
        self.assertEqual(captured["payload"]["mimeType"], "image/png")
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["reaction"]["reactants"], ["CCO"])
        self.assertEqual(payload["reaction"]["products"], ["CC(=O)O"])
        self.assertEqual(payload["reaction"]["conditions"], ["air", "80 C"])
        self.assertEqual(payload["confidence"], 0.82)
        self.assertEqual(payload["warnings"], ["low contrast"])

    def test_rxnscribe_remote_payload_accepts_condition_text_arrays(self) -> None:
        payload = reaction_ocr._map_remote_rxnscribe_payload(
            {
                "reactions": [
                    {
                        "reactants": [{"smiles": "CCO"}],
                        "conditions": [{"text": ["CIBcat", "(1.4 equiv)"]}],
                        "products": [{"smiles": "CC(=O)O"}],
                    }
                ]
            }
        )

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["reaction"]["reactants"], ["CCO"])
        self.assertEqual(payload["reaction"]["products"], ["CC(=O)O"])
        self.assertEqual(payload["reaction"]["conditions"], ["CIBcat", "(1.4 equiv)"])
