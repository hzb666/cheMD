from __future__ import annotations

import logging
from collections.abc import Callable
from html import escape
from typing import Any

from chem_service.reaction_layout import (
    _REACTION_DEFAULT_COMPONENT_GAP,
    _REACTION_DEFAULT_PLUS_GAP,
    _build_reaction_canvas_layout,
    _serialize_reaction_annotation_lines,
)
from chem_service.reaction_models import ReactionRenderConfig, ReactionRenderInput
from chem_service.reaction_svg_arrow import (
    _REACTION_ARROW_HEAD_HALF_HEIGHT,
    _REACTION_ARROW_HEAD_LENGTH,
    _REACTION_ARROW_HEAD_NOTCH_RATIO,
    ReactionArrowHeadGeometry,
    _build_reaction_arrow_head_path_data,
)
from chem_service.reaction_svg_layout import (
    _decorate_reaction_rdkit_svg,
    _render_reaction_annotation_text,
)

LOGGER = logging.getLogger(__name__)


def _build_reaction_smiles(reactants: list[str], products: list[str]) -> str:
    return f"{'.'.join(reactants)}>>{'.'.join(products)}"


def _build_reaction_fallback_svg(
    reaction: ReactionRenderInput,
    *,
    render_config: ReactionRenderConfig | None = None,
) -> str:
    # fallback SVG 必须保留与 RDKit 一致的 data-* 协议字段。
    resolved_render_config = render_config or ReactionRenderConfig(
        arrow_length=48,
        component_gap=_REACTION_DEFAULT_COMPONENT_GAP,
        plus_gap=_REACTION_DEFAULT_PLUS_GAP,
        show_conditions_below_arrow=True,
    )
    reactants_label = "  +  ".join(reaction.reactants) or "?"
    products_label = "  +  ".join(reaction.products) or "?"
    layout = _build_reaction_canvas_layout(
        reaction.reactants,
        reaction.products,
        reaction.conditions,
        render_config=resolved_render_config,
    )
    top_lines = layout.top_lines
    bottom_lines = layout.bottom_lines
    top_text = _serialize_reaction_annotation_lines(top_lines)
    bottom_text = _serialize_reaction_annotation_lines(bottom_lines)
    conditions_position = "below" if resolved_render_config.show_conditions_below_arrow else "above"
    rendered_arrow_length = layout.rendered_arrow_length
    canvas_width = layout.canvas_width
    canvas_height = layout.canvas_height
    content_y = layout.content_y
    arrow_y = layout.arrow_y
    arrow_start_x = layout.arrow_start_x
    arrow_center_x = layout.arrow_center_x
    products_x = layout.products_x
    arrow_notch_x = (
        arrow_start_x
        + rendered_arrow_length
        - (_REACTION_ARROW_HEAD_LENGTH * _REACTION_ARROW_HEAD_NOTCH_RATIO)
    )
    arrow_head_path = _build_reaction_arrow_head_path_data(
        ReactionArrowHeadGeometry(
            base_x=arrow_start_x + rendered_arrow_length - _REACTION_ARROW_HEAD_LENGTH,
            notch_x=arrow_notch_x,
            tip_x=arrow_start_x + rendered_arrow_length,
            center_y=arrow_y,
            half_height=_REACTION_ARROW_HEAD_HALF_HEIGHT,
        )
    )

    return "".join(
        [
            (
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_width:.1f}" '
                f'height="{canvas_height:.1f}" '
                f'viewBox="0 0 {canvas_width:.1f} {canvas_height:.1f}" role="img"'
            ),
            ' aria-label="Reaction fallback visualization"',
            f' data-arrow-length="{resolved_render_config.arrow_length}"',
            f' data-rendered-arrow-length="{rendered_arrow_length:.1f}"',
            f' data-component-gap="{resolved_render_config.component_gap}"',
            f' data-plus-gap="{resolved_render_config.plus_gap}"',
            f' data-conditions-position="{conditions_position}"',
            f' data-arrow-top-text="{escape(top_text, quote=True)}"',
            f' data-arrow-bottom-text="{escape(bottom_text, quote=True)}">',
            (
                f'<rect x="1" y="1" width="{canvas_width - 2.0:.1f}" '
                f'height="{canvas_height - 2.0:.1f}" rx="12" fill="#f8fafc" '
                'stroke="#cbd5e1"/>'
            ),
            (
                f'<text x="{arrow_start_x - resolved_render_config.component_gap:.1f}" '
                f'y="{content_y:.1f}" '
                'font-size="20" text-anchor="end" fill="#0f172a">'
            ),
            f"{escape(reactants_label, quote=True)}</text>",
            f'<text x="{products_x:.1f}" y="{content_y:.1f}" font-size="20" fill="#0f172a">',
            f"{escape(products_label, quote=True)}</text>",
            f'<line x1="{arrow_start_x:.1f}" y1="{arrow_y:.1f}" ',
            f'x2="{arrow_notch_x:.1f}" y2="{arrow_y:.1f}" ',
            'stroke="#0f172a" stroke-width="2.4" stroke-linecap="round"/>',
            f'<path d="{arrow_head_path}" ',
            'fill="#0f172a" stroke="none"/>',
            _render_reaction_annotation_text(
                top_lines=top_lines,
                bottom_lines=bottom_lines,
                center_x=arrow_center_x,
                arrow_y=arrow_y,
            ),
            "</svg>",
        ]
    )


def _build_reaction_render_payload(
    reaction: ReactionRenderInput,
    *,
    svg: str | None = None,
    render_config: ReactionRenderConfig | None = None,
    warnings: list[str] | None = None,
    renderer: str = "fallback",
) -> dict[str, Any]:
    resolved_render_config = render_config or ReactionRenderConfig(
        arrow_length=48,
        component_gap=_REACTION_DEFAULT_COMPONENT_GAP,
        plus_gap=_REACTION_DEFAULT_PLUS_GAP,
        show_conditions_below_arrow=True,
    )
    return {
        "svg": svg
        or _build_reaction_fallback_svg(
            reaction,
            render_config=resolved_render_config,
        ),
        "renderer": renderer,
        "reaction": {
            "reactants": reaction.reactants,
            "products": reaction.products,
            "conditions": reaction.conditions,
        },
        "warnings": (
            warnings if warnings is not None else ["RDKit reaction render fallback is active."]
        ),
    }


def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    if not isinstance(value, (int, float)):
        return default
    return max(minimum, min(int(value), maximum))


def _read_reaction_render_config(render_options: dict[str, Any] | None) -> ReactionRenderConfig:
    reaction_options = render_options.get("reaction") if isinstance(render_options, dict) else None
    if not isinstance(reaction_options, dict):
        reaction_options = {}

    return ReactionRenderConfig(
        arrow_length=_clamp_int(reaction_options.get("arrowLength"), 48, 24, 180),
        component_gap=_clamp_int(
            reaction_options.get("componentGap"), _REACTION_DEFAULT_COMPONENT_GAP, 0, 64
        ),
        plus_gap=_clamp_int(reaction_options.get("plusGap"), _REACTION_DEFAULT_PLUS_GAP, 0, 64),
        show_conditions_below_arrow=(
            reaction_options.get("showConditionsBelowArrow")
            if isinstance(reaction_options.get("showConditionsBelowArrow"), bool)
            else True
        ),
    )


def _render_reaction_with_rdkit(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
    *,
    try_import_rdkit: Callable[[], tuple[Any, Any, Any] | None],
) -> dict[str, Any] | None:
    from chem_service import molecule_rendering

    reaction_input = ReactionRenderInput(
        reactants=reactants,
        products=products,
        conditions=conditions,
    )
    rdkit_modules = try_import_rdkit()
    if rdkit_modules is None:
        LOGGER.info("RDKit reaction render fallback: RDKit is unavailable.")
        return None

    _, draw_module, reactions_module = rdkit_modules
    try:
        reaction = reactions_module.ReactionFromSmarts(
            _build_reaction_smiles(reactants, products),
            useSmiles=True,
        )
    except (AttributeError, TypeError, ValueError, RuntimeError) as error:
        LOGGER.warning("RDKit reaction render failed to build reaction: %s", error)
        return None

    if reaction is None:
        LOGGER.warning("RDKit reaction render returned an empty reaction object.")
        return None

    fallback_config = _read_reaction_render_config(render_options)
    background_config = molecule_rendering._read_render_background_config(render_options)
    canvas_layout = _build_reaction_canvas_layout(
        reactants,
        products,
        conditions,
        render_config=fallback_config,
    )
    try:
        drawer = draw_module.MolDraw2DSVG(
            int(round(canvas_layout.canvas_width)),
            int(round(canvas_layout.canvas_height)),
        )
        if background_config["transparent_background"]:
            try:
                drawer.drawOptions().clearBackground = False
            except (AttributeError, TypeError) as error:
                LOGGER.debug("RDKit reaction drawer does not support clearBackground: %s", error)
        drawer.DrawReaction(reaction)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
    except (AttributeError, TypeError, ValueError, RuntimeError) as error:
        LOGGER.warning("RDKit reaction render failed while drawing SVG: %s", error)
        return None

    return _build_reaction_render_payload(
        reaction_input,
        svg=_decorate_reaction_rdkit_svg(
            svg,
            conditions=conditions,
            render_config=fallback_config,
        ),
        render_config=fallback_config,
        warnings=[],
        renderer="rdkit",
    )
