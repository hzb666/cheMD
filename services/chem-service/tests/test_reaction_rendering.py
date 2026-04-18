# ruff: noqa: E501
from __future__ import annotations

import re
import unittest
from unittest.mock import patch

import chem_service.reaction_models as reaction_models
import chem_service.reaction_rendering as reaction_rendering
import chem_service.reaction_svg_layout as reaction_svg_layout
from tests.support import ChemServiceAppTestCase


class ChemServiceReactionRenderingRouteTest(ChemServiceAppTestCase):
    def test_reaction_render_returns_svg_for_minimal_payload(self) -> None:
        with patch.object(self.module, "_render_reaction_with_rdkit", return_value=None):
            response = self.client.post(
                "/reaction/render",
                json={
                    "reactants": ["CCO"],
                    "products": ["CC(=O)O"],
                    "conditions": ["air"],
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("<svg", payload["svg"])
        self.assertEqual(payload["renderer"], "fallback")
        self.assertEqual(payload["kind"], "reaction")
        self.assertFalse(payload["placeholder"])
        self.assertEqual(payload["provider"], "fallback")
        self.assertIn('data-arrow-top-text="air"', payload["svg"])
        self.assertEqual(
            payload["reaction"],
            {
                "reactants": ["CCO"],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
            },
        )

    def test_reaction_render_accepts_empty_reactant_side(self) -> None:
        response = self.client.post(
            "/reaction/render",
            json={
                "reactants": [],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(
            payload["reaction"],
            {
                "reactants": [],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
            },
        )
        self.assertIn("<svg", payload["svg"])

    def test_reaction_render_rejects_non_array_conditions(self) -> None:
        response = self.client.post(
            "/reaction/render",
            json={
                "reactants": ["CCO"],
                "products": ["CC(=O)O"],
                "conditions": "air",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json(),
            {"message": "conditions must be a string array"},
        )

    def test_reaction_render_trims_payload_before_building_contract(self) -> None:
        response = self.client.post(
            "/reaction/render",
            json={
                "reactants": [" CCO ", " O=O "],
                "products": [" CC(=O)O "],
                "conditions": [" air ", " 80 C "],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(
            payload["reaction"],
            {
                "reactants": ["CCO", "O=O"],
                "products": ["CC(=O)O"],
                "conditions": ["air", "80 C"],
            },
        )
        self.assertIn("<svg", payload["svg"])
        self.assertIn('data-arrow-top-text="air"', payload["svg"])
        self.assertIn('data-arrow-bottom-text="80 °C"', payload["svg"])

    def test_reaction_render_prefers_rdkit_path_when_available(self) -> None:
        with patch.object(
            self.module,
            "_render_reaction_with_rdkit",
            return_value={
                "svg": "<svg>rdkit-reaction</svg>",
                "warnings": [],
                "renderer": "rdkit",
                "reaction": {
                    "reactants": ["CCO"],
                    "products": ["CC(=O)O"],
                    "conditions": ["air"],
                },
            },
        ) as render_mock:
            response = self.client.post(
                "/reaction/render",
                json={
                    "reactants": [" CCO "],
                    "products": [" CC(=O)O "],
                    "conditions": [" air "],
                },
            )

        self.assertEqual(response.status_code, 200)
        render_mock.assert_called_once_with(["CCO"], ["CC(=O)O"], ["air"], None)
        self.assertEqual(
            response.get_json(),
            {
                "kind": "reaction",
                "provider": "rdkit",
                "candidates": [
                    {
                        "provider": "rdkit",
                        "reaction": {
                            "reactants": ["CCO"],
                            "products": ["CC(=O)O"],
                            "conditions": ["air"],
                        },
                        "confidence": None,
                    }
                ],
                "placeholder": False,
                "svg": "<svg>rdkit-reaction</svg>",
                "warnings": [],
                "renderer": "rdkit",
                "reaction": {
                    "reactants": ["CCO"],
                    "products": ["CC(=O)O"],
                    "conditions": ["air"],
                },
                "normalized": {
                    "reactants": ["CCO"],
                    "products": ["CC(=O)O"],
                    "conditions": ["air"],
                },
            },
        )

    def test_reaction_render_returns_fallback_when_rdkit_payload_is_unavailable(self) -> None:
        with patch.object(self.module, "_render_reaction_with_rdkit", return_value=None):
            response = self.client.post(
                "/reaction/render",
                json={
                    "reactants": ["CCO"],
                    "products": ["CC(=O)O"],
                    "conditions": ["air"],
                    "renderOptions": {"layout": "compact"},
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["renderer"], "fallback")
        self.assertEqual(payload["warnings"], ["RDKit reaction render fallback is active."])
        self.assertIn("<svg", payload["svg"])
        self.assertIn('data-arrow-top-text="air"', payload["svg"])
        self.assertIn('data-component-gap="24"', payload["svg"])

    def test_reaction_render_fallback_consumes_reaction_render_options(self) -> None:
        response = self.client.post(
            "/reaction/render",
            json={
                "reactants": ["CCO"],
                "products": ["CC(=O)O"],
                "conditions": ["air"],
                "renderOptions": {
                    "profileId": "publication-acs",
                    "reaction": {
                        "arrowLength": 72,
                        "componentGap": 24,
                        "plusGap": 18,
                        "showConditionsBelowArrow": False,
                    },
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn('data-arrow-length="72"', payload["svg"])
        self.assertIn('data-component-gap="24"', payload["svg"])
        self.assertIn('data-plus-gap="18"', payload["svg"])
        self.assertIn('data-conditions-position="above"', payload["svg"])

    def test_reaction_rdkit_path_uses_dynamic_canvas_for_long_reactions(self) -> None:
        class FakeDrawer:
            created: list[tuple[int, int]] = []

            def __init__(self, width: int, height: int) -> None:
                self.width = width
                self.height = height
                FakeDrawer.created.append((width, height))

            def drawOptions(self):
                return type("Options", (), {"clearBackground": True})()

            def DrawReaction(self, reaction) -> None:
                self.reaction = reaction

            def FinishDrawing(self) -> None:
                return None

            def GetDrawingText(self) -> str:
                return (
                    "<svg xmlns='http://www.w3.org/2000/svg' "
                    f"width='{self.width}px' height='{self.height}px' "
                    f"viewBox='0 0 {self.width} {self.height}'></svg>"
                )

        class FakeDrawModule:
            MolDraw2DSVG = FakeDrawer

        class FakeReactionsModule:
            @staticmethod
            def ReactionFromSmarts(smarts: str, useSmiles: bool = True):
                return {"smarts": smarts, "useSmiles": useSmiles}

        FakeDrawer.created.clear()
        with patch.object(
            self.module,
            "_try_import_rdkit",
            return_value=(object(), FakeDrawModule, FakeReactionsModule),
        ):
            response = self.client.post(
                "/reaction/render",
                json={
                    "reactants": ["CCO", "CCCCCCCC", "c1ccccc1Br", "CCN(CC)CC"],
                    "products": ["CC(=O)O", "c1ccccc1O"],
                    "conditions": ["tert-butyl lithium", "dichloromethane", "120 C", "24 h"],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(FakeDrawer.created)
        self.assertGreater(FakeDrawer.created[0][0], 540)
        self.assertGreaterEqual(FakeDrawer.created[0][1], 160)
        self.assertEqual(response.get_json()["renderer"], "rdkit")


class ChemServiceReactionRenderingModuleTest(unittest.TestCase):
    def test_reaction_svg_annotations_split_reagents_and_render_conditions(self) -> None:
        svg = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 540 160'>
<path d='M 279.0,80.0 L 367.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 362.1,82.8 L 367.0,80.0 L 362.1,77.2' style='fill:none;stroke:#000000;stroke-width:2.0px' />
</svg>"""

        decorated = reaction_svg_layout._decorate_reaction_rdkit_svg(
            svg,
            conditions=["NaBH4", "EtOH", "80 C", "4 h", "hv", "electrolysis"],
            render_config=reaction_models.ReactionRenderConfig(
                arrow_length=48,
                component_gap=16,
                plus_gap=12,
                show_conditions_below_arrow=True,
            ),
        )

        self.assertIn('data-arrow-top-text="NaBH4"', decorated)
        self.assertIn('data-arrow-bottom-text="EtOH; 80 °C, 4 h; hv; electrolysis"', decorated)
        self.assertIn(">NaBH4</text>", decorated)
        self.assertIn(">EtOH</text>", decorated)
        self.assertIn(">80 °C, 4 h</text>", decorated)
        self.assertIn(">hv</text>", decorated)
        self.assertIn(">electrolysis</text>", decorated)
        self.assertIn('font-size="16"', decorated)
        self.assertIn('dominant-baseline="text-after-edge"', decorated)
        self.assertIn('dominant-baseline="hanging"', decorated)
        self.assertIn('class="chemd-reaction-annotation"', decorated)
        self.assertIn('style="user-select:none;-webkit-user-select:none"', decorated)
        self.assertIn('fill="#000000"', decorated)
        self.assertNotIn("|", decorated)

    def test_reaction_svg_annotations_redraw_arrow_when_labels_need_more_space(self) -> None:
        svg = """<svg xmlns='http://www.w3.org/2000/svg' width='540px' height='160px' viewBox='0 0 540 160'>
<rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='540.0' height='160.0' x='0.0' y='0.0'> </rect>
<path d='M 279.0,80.0 L 367.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 362.1,82.8 L 367.0,80.0 L 362.1,77.2' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 391.0,88.7 L 443.7,58.3' style='fill:none;stroke:#000000;stroke-width:2.0px' />
</svg>"""

        decorated = reaction_svg_layout._decorate_reaction_rdkit_svg(
            svg,
            conditions=[
                "tert-butyl lithium",
                "very long reagent label",
                "dichloromethane",
                "80 C",
                "18 h",
                "blue LED",
            ],
            render_config=reaction_models.ReactionRenderConfig(
                arrow_length=48,
                component_gap=16,
                plus_gap=12,
                show_conditions_below_arrow=True,
            ),
        )

        self.assertIn('data-rendered-arrow-length="', decorated)
        self.assertIn("<rect", decorated)
        self.assertNotIn("M 279.0,80.0 L 367.0,80.0", decorated)
        self.assertIn("d='M 279.0,80.0 L ", decorated)
        self.assertNotIn("<polygon", decorated)
        self.assertIn("stroke:none", decorated)
        self.assertIn("fill:#000000", decorated)
        self.assertIn("Q ", decorated)
        self.assertIn(" Z'", decorated)

    def test_reaction_svg_expands_plus_and_component_spacing(self) -> None:
        svg = """<svg xmlns='http://www.w3.org/2000/svg' width='540px' height='160px' viewBox='0 0 540 160'>
<path class='bond-0' d='M 38.0,80.0 L 100.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 120.0,70.0 L 120.0,90.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 110.0,80.0 L 130.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path class='bond-1' d='M 150.0,80.0 L 210.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 240.0,80.0 L 320.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 315.0,85.0 L 320.0,80.0 L 315.0,75.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path class='bond-2' d='M 350.0,80.0 L 420.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
</svg>"""

        decorated = reaction_svg_layout._decorate_reaction_rdkit_svg(
            svg,
            conditions=["NaBH4"],
            render_config=reaction_models.ReactionRenderConfig(
                arrow_length=48,
                component_gap=24,
                plus_gap=20,
                show_conditions_below_arrow=True,
            ),
        )

        self.assertIn("translate(8.0,0)", decorated)
        self.assertIn("translate(16.0,0)", decorated)
        self.assertIn("translate(24.0,0)", decorated)
        self.assertIn('data-arrow-start-x="264.0"', decorated)
        self.assertIn('data-arrow-end-x="344.0"', decorated)

    def test_reaction_svg_tight_crop_trims_rdkit_canvas_whitespace(self) -> None:
        svg = """<svg xmlns='http://www.w3.org/2000/svg' width='540px' height='160px' viewBox='0 0 540 160'>
<rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='540.0' height='160.0' x='0.0' y='0.0'> </rect>
<path class='bond-0' d='M 38.0,80.0 L 100.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 120.0,70.0 L 120.0,90.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 110.0,80.0 L 130.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path class='bond-1' d='M 150.0,80.0 L 210.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 240.0,80.0 L 320.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path d='M 315.0,85.0 L 320.0,80.0 L 315.0,75.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
<path class='bond-2' d='M 350.0,80.0 L 420.0,80.0' style='fill:none;stroke:#000000;stroke-width:2.0px' />
</svg>"""

        decorated = reaction_svg_layout._decorate_reaction_rdkit_svg(
            svg,
            conditions=["NaBH4"],
            render_config=reaction_models.ReactionRenderConfig(
                arrow_length=48,
                component_gap=24,
                plus_gap=20,
                show_conditions_below_arrow=True,
            ),
        )

        view_box_match = re.search(r"viewBox=['\"]([0-9.]+) ([0-9.]+) ([0-9.]+) ([0-9.]+)['\"]", decorated)
        width_match = re.search(r"width=['\"]([0-9.]+)(px)?['\"]", decorated)
        self.assertIsNotNone(view_box_match)
        self.assertIsNotNone(width_match)
        self.assertIn("translate(8.0,0)", decorated)
        self.assertGreater(float(view_box_match.group(1)), 0.0)
        self.assertEqual(float(view_box_match.group(2)), 0.0)
        self.assertLess(float(view_box_match.group(3)), 540.0)
        self.assertEqual(float(view_box_match.group(4)), 160.0)
        self.assertEqual(float(width_match.group(1)), float(view_box_match.group(3)))

    def test_reaction_fallback_svg_expands_canvas_for_long_reactions(self) -> None:
        svg = reaction_rendering._build_reaction_fallback_svg(
            reaction_models.ReactionRenderInput(
                reactants=["CCO", "CCCCCCCC", "c1ccccc1Br", "CCN(CC)CC"],
                products=["CC(=O)O", "c1ccccc1O"],
                conditions=["tert-butyl lithium", "dichloromethane", "120 C", "24 h"],
            ),
            render_config=reaction_models.ReactionRenderConfig(
                arrow_length=48,
                component_gap=24,
                plus_gap=20,
                show_conditions_below_arrow=True,
            ),
        )

        view_box_match = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', svg)
        width_match = re.search(r'width="([0-9.]+)"', svg)
        height_match = re.search(r'height="([0-9.]+)"', svg)
        self.assertIsNotNone(view_box_match)
        self.assertIsNotNone(width_match)
        self.assertIsNotNone(height_match)
        self.assertGreater(float(view_box_match.group(1)), 540.0)
        self.assertGreaterEqual(float(view_box_match.group(2)), 160.0)
        self.assertEqual(float(width_match.group(1)), float(view_box_match.group(1)))
        self.assertEqual(float(height_match.group(1)), float(view_box_match.group(2)))

    def test_reaction_render_payload_preserves_empty_warning_list(self) -> None:
        payload = reaction_rendering._build_reaction_render_payload(
            reaction_models.ReactionRenderInput(
                reactants=["CCO"],
                products=["CC(=O)O"],
                conditions=["air"],
            ),
            svg="<svg>rdkit</svg>",
            renderer="rdkit",
            warnings=[],
        )

        self.assertEqual(payload["warnings"], [])
