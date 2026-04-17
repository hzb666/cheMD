from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

APP_PATH = SERVICE_ROOT / "app.py"


def load_app_module():
    os.environ["CHEM_SERVICE_ALLOW_ORIGINS"] = "http://127.0.0.1:2436,http://localhost:2436"
    spec = importlib.util.spec_from_file_location("chem_service_test_app", APP_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load chem-service app from {APP_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


chem_service_app = load_app_module()


class ChemServiceAppTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = chem_service_app
        cls.client = cls.module.app.test_client()

    def setUp(self) -> None:
        from chem_service import structure_store

        structure_store._CACHE.clear()
