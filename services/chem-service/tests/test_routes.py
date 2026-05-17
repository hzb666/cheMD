from __future__ import annotations

import os
from unittest.mock import patch

from tests.support import ChemServiceAppTestCase


class ChemServiceRoutesTest(ChemServiceAppTestCase):
    def test_healthz_reports_provider_status_without_leaking_secrets(self) -> None:
        with patch.object(self.module, "_MOLECULE_OCR_PROVIDER", "molscribe"):
            with patch.object(self.module, "_MOLSCRIBE_API_URL", "http://127.0.0.1:18081/predict"):
                with patch.object(self.module, "_REACTION_OCR_PROVIDER", "rxnscribe"):
                    with patch.object(
                        self.module,
                        "_RXNSCRIBE_API_URL",
                        "http://127.0.0.1:18082/predict",
                    ):
                        with patch.object(self.module, "_RXNSCRIBE_API_KEY", "rxnscribe-secret"):
                            response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["ocr"]["provider"], "molscribe")
        self.assertTrue(payload["ocr"]["configured"])
        self.assertEqual(payload["ocr"]["molecule"]["provider"], "molscribe")
        self.assertTrue(payload["ocr"]["molecule"]["configured"])
        self.assertEqual(payload["ocr"]["reaction"]["provider"], "rxnscribe")
        self.assertTrue(payload["ocr"]["reaction"]["configured"])
        self.assertNotIn("rxnscribe-secret", str(payload))

    def test_healthz_reports_remote_provider_readiness_for_molnextr_and_rxnim(self) -> None:
        with patch.object(self.module, "_MOLECULE_OCR_PROVIDER", "molnextr"):
            with patch.object(self.module, "_MOLNEXTR_API_URL", "http://127.0.0.1:18083/predict"):
                with patch.object(self.module, "_REACTION_OCR_PROVIDER", "rxnim"):
                    with patch.object(
                        self.module, "_RXNIM_API_URL", "http://127.0.0.1:18084/predict"
                    ):
                        response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["ocr"]["molecule"]["provider"], "molnextr")
        self.assertTrue(payload["ocr"]["molecule"]["configured"])
        self.assertEqual(payload["ocr"]["reaction"]["provider"], "rxnim")
        self.assertTrue(payload["ocr"]["reaction"]["configured"])

    def test_render_escapes_svg_payload(self) -> None:
        response = self.client.post("/render", json={"smiles": '"><script>alert("x")</script>'})

        self.assertEqual(response.status_code, 200)
        svg = response.get_json()["svg"]
        self.assertNotIn("<script>", svg)
        self.assertIn("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;", svg)

    def test_render_falls_back_when_rdkit_import_raises_os_error(self) -> None:
        with patch.object(self.module, "_RDKIT_MODULES", None):
            with patch.object(self.module, "_RDKIT_IMPORT_FAILED", False):
                with patch.object(
                    self.module.importlib,
                    "import_module",
                    side_effect=OSError("dll load failed"),
                ):
                    response = self.client.post("/render", json={"smiles": "CCO"})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("<svg", payload["svg"])
        self.assertEqual(payload["warnings"], ["RDKit render fallback is active."])

    def test_ocr_rejects_large_base64_payload(self) -> None:
        oversized_payload = "a" * (self.module._MAX_IMAGE_BASE64_LENGTH + 1)

        response = self.client.post("/ocr", json={"imageBase64": oversized_payload})

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json()["message"], "imageBase64 is too large")

    def test_ocr_error_response_does_not_reflect_payload(self) -> None:
        response = self.client.post("/ocr", json={"imageBase64": "<script>alert(1)</script>"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"message": "imageBase64 is invalid"})
        self.assertNotIn("<script>", response.get_data(as_text=True))

    def test_reaction_ocr_size_error_response_does_not_reflect_payload(self) -> None:
        oversized_payload = "<script>" + ("a" * self.module._MAX_IMAGE_BASE64_LENGTH)
        response = self.client.post(
            "/reaction/ocr",
            json={"imageBase64": oversized_payload},
        )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json(), {"message": "imageBase64 is too large"})
        self.assertNotIn("<script>", response.get_data(as_text=True))

    def test_cors_only_reflects_allowed_origin(self) -> None:
        allowed = self.client.options("/ocr", headers={"Origin": "http://127.0.0.1:2436"})
        blocked = self.client.options("/ocr", headers={"Origin": "https://evil.example"})

        self.assertEqual(allowed.status_code, 204)
        self.assertEqual(
            allowed.headers.get("Access-Control-Allow-Origin"),
            "http://127.0.0.1:2436",
        )
        self.assertIsNone(blocked.headers.get("Access-Control-Allow-Origin"))

    def test_protected_endpoints_reject_external_requests_in_internal_mode(self) -> None:
        response = self.client.post(
            "/ocr",
            json={"imageBase64": "YWJj"},
            environ_overrides={"REMOTE_ADDR": "8.8.8.8"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("internal-only", response.get_json()["message"])

    def test_protected_endpoints_ignore_spoofed_forwarded_for_header(self) -> None:
        response = self.client.post(
            "/render",
            json={"smiles": "CCO"},
            headers={"X-Forwarded-For": "127.0.0.1"},
            environ_overrides={"REMOTE_ADDR": "8.8.8.8"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertIn("internal-only", response.get_json()["message"])

    def test_protected_endpoints_require_access_key_when_configured(self) -> None:
        with patch.object(self.module, "_CHEM_SERVICE_ACCESS_KEY", "secret-key"):
            blocked = self.client.post("/render", json={"smiles": "CCO"})
            allowed = self.client.post(
                "/render",
                json={"smiles": "CCO"},
                headers={"X-Chem-Service-Key": "secret-key"},
            )

        self.assertEqual(blocked.status_code, 403)
        self.assertIn("access denied", blocked.get_json()["message"])
        self.assertEqual(allowed.status_code, 200)

    def test_invalid_integer_env_values_fall_back_to_defaults(self) -> None:
        previous_cache_max_entries = os.environ.get("CHEM_SERVICE_CACHE_MAX_ENTRIES")
        previous_port = os.environ.get("CHEM_SERVICE_PORT")

        try:
            os.environ["CHEM_SERVICE_CACHE_MAX_ENTRIES"] = "invalid"
            os.environ["CHEM_SERVICE_PORT"] = "0"

            self.assertEqual(self.module._read_int_env("CHEM_SERVICE_CACHE_MAX_ENTRIES", 256), 256)
            self.assertEqual(self.module._read_int_env("CHEM_SERVICE_PORT", 18081), 18081)
        finally:
            if previous_cache_max_entries is None:
                os.environ.pop("CHEM_SERVICE_CACHE_MAX_ENTRIES", None)
            else:
                os.environ["CHEM_SERVICE_CACHE_MAX_ENTRIES"] = previous_cache_max_entries

            if previous_port is None:
                os.environ.pop("CHEM_SERVICE_PORT", None)
            else:
                os.environ["CHEM_SERVICE_PORT"] = previous_port
