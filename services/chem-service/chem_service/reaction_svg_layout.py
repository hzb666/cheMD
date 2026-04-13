from __future__ import annotations

from html import escape

from chem_service.reaction_layout import (
    _REACTION_ANNOTATION_FONT_SIZE,
    _REACTION_ANNOTATION_LINE_HEIGHT,
    _REACTION_BOTTOM_ANNOTATION_GAP,
    _REACTION_TOP_ANNOTATION_GAP,
    _estimate_svg_text_block_width,
    _serialize_reaction_annotation_lines,
    _split_reaction_annotation_lines,
)
from chem_service.reaction_models import ReactionRenderConfig
from chem_service.reaction_svg_arrow import (
    ReactionArrowGeometry,
    _find_reaction_arrow,
    _render_reaction_arrow_paths,
)
from chem_service.reaction_svg_bounds import _tighten_reaction_svg_horizontal_bounds
from chem_service.reaction_svg_spacing import (
    _expand_reactant_spacing,
    _expand_svg_width,
    _translate_product_side_paths,
)


def _render_reaction_annotation_text(
    *,
    top_lines: list[str],
    bottom_lines: list[str],
    center_x: float,
    arrow_y: float,
) -> str:
    parts: list[str] = []
    annotation_attributes = (
        'class="chemd-reaction-annotation" '
        'pointer-events="none" '
        'style="user-select:none;-webkit-user-select:none"'
    )
    if top_lines:
        top_start_y = (
            arrow_y
            - _REACTION_TOP_ANNOTATION_GAP
            - (_REACTION_ANNOTATION_LINE_HEIGHT * (len(top_lines) - 1))
        )
        for index, line in enumerate(top_lines):
            y = top_start_y + (index * _REACTION_ANNOTATION_LINE_HEIGHT)
            parts.append(
                f'<text x="{center_x:.1f}" y="{y:.1f}" text-anchor="middle" '
                f"{annotation_attributes} "
                'dominant-baseline="text-after-edge" '
                f'font-size="{_REACTION_ANNOTATION_FONT_SIZE:.0f}" fill="#000000">'
                f"{escape(line, quote=True)}</text>"
            )
    if bottom_lines:
        bottom_start_y = arrow_y + _REACTION_BOTTOM_ANNOTATION_GAP
        for index, line in enumerate(bottom_lines):
            y = bottom_start_y + (index * _REACTION_ANNOTATION_LINE_HEIGHT)
            parts.append(
                f'<text x="{center_x:.1f}" y="{y:.1f}" text-anchor="middle" '
                f"{annotation_attributes} "
                'dominant-baseline="hanging" '
                f'font-size="{_REACTION_ANNOTATION_FONT_SIZE:.0f}" fill="#000000">'
                f"{escape(line, quote=True)}</text>"
            )
    return "".join(parts)


def _decorate_reaction_rdkit_svg(
    svg: str,
    *,
    conditions: list[str],
    render_config: ReactionRenderConfig,
) -> str:
    # 装饰顺序固定为协议标注、几何重算、最后裁剪 viewBox。
    top_lines, bottom_lines = _split_reaction_annotation_lines(
        conditions,
        show_conditions_below_arrow=render_config.show_conditions_below_arrow,
    )
    top_text = _serialize_reaction_annotation_lines(top_lines)
    bottom_text = _serialize_reaction_annotation_lines(bottom_lines)
    conditions_position = "below" if render_config.show_conditions_below_arrow else "above"
    decorated_svg = svg.replace(
        "<svg ",
        (
            '<svg role="img" aria-label="Reaction RDKit visualization"'
            f' data-arrow-length="{render_config.arrow_length}"'
            f' data-component-gap="{render_config.component_gap}"'
            f' data-plus-gap="{render_config.plus_gap}"'
            f' data-conditions-position="{conditions_position}"'
            f' data-arrow-top-text="{escape(top_text, quote=True)}"'
            f' data-arrow-bottom-text="{escape(bottom_text, quote=True)}" '
        ),
        1,
    )

    if not (top_lines or bottom_lines) or "</svg>" not in decorated_svg:
        return decorated_svg

    view_box_marker = 'viewBox="'
    if view_box_marker in decorated_svg:
        start = decorated_svg.index(view_box_marker) + len(view_box_marker)
        end = decorated_svg.index('"', start)
        view_box = decorated_svg[start:end].split()
    else:
        view_box = []

    width = 540.0
    height = 160.0
    if len(view_box) == 4:
        try:
            width = float(view_box[2])
            height = float(view_box[3])
        except ValueError:
            width = 540.0
            height = 160.0

    arrow = _find_reaction_arrow(decorated_svg)

    if arrow is None:
        conditions_svg = _render_reaction_annotation_text(
            top_lines=top_lines,
            bottom_lines=bottom_lines,
            center_x=width / 2.0,
            arrow_y=height / 2.0,
        )
        return _tighten_reaction_svg_horizontal_bounds(
            decorated_svg.replace("</svg>", f"{conditions_svg}</svg>", 1)
        )

    decorated_svg, reactant_spacing_delta = _expand_reactant_spacing(
        decorated_svg,
        arrow=arrow,
        component_gap=render_config.component_gap,
        plus_gap=render_config.plus_gap,
    )
    desired_arrow_length = max(
        arrow.x2 - arrow.x1,
        float(render_config.arrow_length),
        _estimate_svg_text_block_width(top_lines) + 20.0 if top_lines else 0.0,
        _estimate_svg_text_block_width(bottom_lines) + 20.0 if bottom_lines else 0.0,
    )
    arrow_delta = max(0.0, desired_arrow_length - (arrow.x2 - arrow.x1))
    arrow_start_x = arrow.x1 + reactant_spacing_delta
    arrow_end_x = arrow.x2 + reactant_spacing_delta + arrow_delta

    if reactant_spacing_delta + arrow_delta > 0:
        decorated_svg = _translate_product_side_paths(
            decorated_svg,
            delta_x=reactant_spacing_delta + arrow_delta,
            cutoff_x=arrow.x2 + 1.0,
            excluded_elements={
                element for element in (arrow.shaft_element, arrow.head_element) if element
            },
        )
        decorated_svg = _expand_svg_width(
            decorated_svg, delta_x=reactant_spacing_delta + arrow_delta
        )

    decorated_svg = decorated_svg.replace(arrow.shaft_element, "", 1)
    if arrow.head_element:
        decorated_svg = decorated_svg.replace(arrow.head_element, "", 1)

    shifted_arrow = ReactionArrowGeometry(
        shaft_element=arrow.shaft_element,
        head_element=arrow.head_element,
        shaft_style=arrow.shaft_style,
        head_style=arrow.head_style,
        x1=arrow_start_x,
        x2=arrow.x2 + reactant_spacing_delta,
        y=arrow.y,
        head_width=arrow.head_width,
        head_half_height=arrow.head_half_height,
    )
    rendered_arrow = _render_reaction_arrow_paths(shifted_arrow, arrow_end_x=arrow_end_x)
    annotation_svg = _render_reaction_annotation_text(
        top_lines=top_lines,
        bottom_lines=bottom_lines,
        center_x=(arrow_start_x + arrow_end_x) / 2.0,
        arrow_y=arrow.y,
    )
    rendered_arrow_attrs = (
        f'data-rendered-arrow-length="{arrow_end_x - arrow_start_x:.1f}" '
        f'data-arrow-start-x="{arrow_start_x:.1f}" '
        f'data-arrow-end-x="{arrow_end_x:.1f}" '
        "data-arrow-bottom-text="
    )
    decorated_svg = decorated_svg.replace(
        "data-arrow-bottom-text=",
        rendered_arrow_attrs,
        1,
    )
    return _tighten_reaction_svg_horizontal_bounds(
        decorated_svg.replace("</svg>", f"{rendered_arrow}{annotation_svg}</svg>", 1)
    )
