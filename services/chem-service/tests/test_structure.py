from __future__ import annotations

from tests.support import ChemServiceAppTestCase


class ChemServiceStructureRouteTest(ChemServiceAppTestCase):
    def test_structure_cache_is_scoped_by_session_and_kind(self) -> None:
        save_response = self.client.post(
            "/structure",
            json={
                "kind": "reaction",
                "documentId": "doc-1",
                "blockId": "rxn-1",
                "sessionId": "session-a",
                "reactants": ["CCO"],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
                "source": "manual",
            },
        )
        same_session = self.client.get(
            "/structure?documentId=doc-1&blockId=rxn-1&sessionId=session-a"
        )
        other_session = self.client.get(
            "/structure?documentId=doc-1&blockId=rxn-1&sessionId=session-b"
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.get_json()["kind"], "reaction")
        self.assertEqual(same_session.status_code, 200)
        self.assertTrue(same_session.get_json()["found"])
        self.assertEqual(same_session.get_json()["record"]["kind"], "reaction")
        self.assertEqual(same_session.get_json()["record"]["reactants"], ["CCO"])
        self.assertEqual(other_session.status_code, 200)
        self.assertFalse(other_session.get_json()["found"])

    def test_structure_cache_accepts_reactions_with_an_empty_side(self) -> None:
        save_response = self.client.post(
            "/structure",
            json={
                "kind": "reaction",
                "documentId": "doc-1",
                "blockId": "rxn-open",
                "sessionId": "session-a",
                "reactants": [],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
                "source": "manual",
            },
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.get_json()["products"], ["CC(=O)O"])
        self.assertEqual(save_response.get_json()["reactants"], [])

    def test_structure_cache_persists_molecule_records_with_session_id(self) -> None:
        save_response = self.client.post(
            "/structure",
            json={
                "documentId": "doc-2",
                "blockId": "mol-1",
                "sessionId": "session-mol",
                "smiles": "CCO",
                "molfile": "mock-molfile",
                "source": "manual",
            },
        )
        get_response = self.client.get(
            "/structure?documentId=doc-2&blockId=mol-1&sessionId=session-mol"
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.get_json()["kind"], "molecule")
        self.assertEqual(get_response.status_code, 200)
        payload = get_response.get_json()
        self.assertTrue(payload["found"])
        self.assertEqual(payload["record"]["smiles"], "CCO")
        self.assertEqual(payload["record"]["molfile"], "mock-molfile")

    def test_structure_rejects_invalid_kind(self) -> None:
        response = self.client.post(
            "/structure",
            json={
                "kind": "unknown",
                "documentId": "doc-3",
                "blockId": "mol-2",
                "sessionId": "session-invalid-kind",
                "smiles": "CCO",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], "kind must be molecule or reaction")

    def test_structure_rejects_non_numeric_confidence(self) -> None:
        response = self.client.post(
            "/structure",
            json={
                "documentId": "doc-4",
                "blockId": "mol-3",
                "sessionId": "session-invalid-confidence",
                "smiles": "CCO",
                "confidence": "high",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], "confidence must be a number")

    def test_structure_rejects_non_array_reaction_conditions(self) -> None:
        response = self.client.post(
            "/structure",
            json={
                "kind": "reaction",
                "documentId": "doc-5",
                "blockId": "rxn-invalid-conditions",
                "sessionId": "session-invalid-conditions",
                "reactants": ["CCO"],
                "products": ["CC(=O)O"],
                "conditions": "air",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["message"], "conditions must be a string array")
