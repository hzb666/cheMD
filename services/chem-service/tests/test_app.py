from __future__ import annotations

from tests.support import ChemServiceAppTestCase


class ChemServiceImportTest(ChemServiceAppTestCase):
    def test_module_imports_under_python3(self) -> None:
        self.assertIsNotNone(self.module.app)
