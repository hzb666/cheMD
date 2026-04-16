from __future__ import annotations

import re

from chem_service.reaction_models import ReactionCanvasLayout, ReactionRenderConfig

_SOLVENT_ALIASES = {
    "etoh",
    "ethanol",
    "meoh",
    "methanol",
    "h2o",
    "water",
    "dcm",
    "dichloromethane",
    "thf",
    "tetrahydrofuran",
    "mecn",
    "acetonitrile",
    "dmf",
    "dmso",
    "toluene",
    "etoac",
    "ethyl acetate",
}
_LIGHT_PATTERNS = ("hv", "hν", "light", "led", "photochemical", "photoredox", "irradiation")
_ELECTRO_PATTERNS = (
    "electro",
    "electrolysis",
    "electrochemical",
    "current",
    "constant current",
    "ma",
    "amp",
    "anode",
    "cathode",
    "cell",
    "voltage",
)
_TEMPERATURE_RE = re.compile(r"^-?\d+(?:\.\d+)?\s*(?:c|°c|k|f)$", re.IGNORECASE)
_TIME_RE = re.compile(r"^-?\d+(?:\.\d+)?\s*(?:h|hr|hrs|min|mins)$", re.IGNORECASE)
_PRESSURE_RE = re.compile(r"^-?\d+(?:\.\d+)?\s*(?:bar|atm|psi)$", re.IGNORECASE)
_REACTION_ANNOTATION_FONT_SIZE = 16.0
_REACTION_ANNOTATION_LINE_HEIGHT = 20.0
_REACTION_TOP_ANNOTATION_GAP = 10.0
_REACTION_BOTTOM_ANNOTATION_GAP = 10.0
_REACTION_COMPACT_BOTTOM_ANNOTATION_MAX_LENGTH = 12
_REACTION_DEFAULT_COMPONENT_GAP = 24
_REACTION_DEFAULT_PLUS_GAP = 20
_REACTION_BASE_COMPONENT_GAP = 16.0
_REACTION_BASE_PLUS_GAP = 12.0
_REACTION_BASE_CANVAS_WIDTH = 540.0
_REACTION_BASE_CANVAS_HEIGHT = 160.0
_REACTION_SIDE_PADDING = 36.0
_REACTION_MIN_PARTICIPANT_WIDTH = 72.0
_REACTION_MAX_PARTICIPANT_WIDTH = 180.0
_REACTION_PARTICIPANT_FONT_SIZE = 12.0
_REACTION_BASELINE_Y = 74.0
_REACTION_BOTTOM_PADDING = 28.0


def _normalize_reaction_annotation_token(value: str) -> str:
    normalized = " ".join(value.strip().split())
    temperature_match = re.fullmatch(
        r"(?P<value>-?\d+(?:\.\d+)?)\s*°?\s*(?P<unit>[cCfFkK])",
        normalized,
    )
    if temperature_match is None:
        return normalized

    unit = temperature_match.group("unit").upper()
    value = temperature_match.group("value")
    if unit == "C":
        return f"{value} °C"
    return f"{value} {unit}"


def _is_reaction_bottom_annotation(value: str) -> bool:
    normalized = _normalize_reaction_annotation_token(value)
    lowered = normalized.lower()
    if lowered in _SOLVENT_ALIASES:
        return True
    if (
        _TEMPERATURE_RE.fullmatch(normalized)
        or _TIME_RE.fullmatch(normalized)
        or _PRESSURE_RE.fullmatch(normalized)
    ):
        return True
    if any(pattern in lowered for pattern in _LIGHT_PATTERNS):
        return True
    if any(pattern in lowered for pattern in _ELECTRO_PATTERNS):
        return True
    return False


def _is_reaction_compactable_bottom_annotation(value: str) -> bool:
    normalized = _normalize_reaction_annotation_token(value)
    return bool(
        (_TEMPERATURE_RE.fullmatch(normalized) or _TIME_RE.fullmatch(normalized))
        and len(normalized) <= _REACTION_COMPACT_BOTTOM_ANNOTATION_MAX_LENGTH
    )


def _compact_reaction_bottom_annotation_lines(items: list[str]) -> list[str]:
    lines: list[str] = []
    index = 0
    while index < len(items):
        current = items[index]
        if index + 1 < len(items):
            following = items[index + 1]
            combined = f"{current}, {following}"
            if (
                _is_reaction_compactable_bottom_annotation(current)
                and _is_reaction_compactable_bottom_annotation(following)
                and len(combined) <= 20
            ):
                lines.append(combined)
                index += 2
                continue
        lines.append(current)
        index += 1

    return lines


def _split_reaction_annotation_lines(
    conditions: list[str],
    *,
    show_conditions_below_arrow: bool,
) -> tuple[list[str], list[str]]:
    # 下方注释区只放温度、时间、溶剂等短条件；
    # 其余条件保持在箭头上方，避免语义主次被打乱。
    normalized = [_normalize_reaction_annotation_token(item) for item in conditions if item.strip()]
    if not normalized:
        return [], []

    if not show_conditions_below_arrow:
        return normalized, []

    top_items: list[str] = []
    bottom_items: list[str] = []
    for item in normalized:
        if _is_reaction_bottom_annotation(item):
            bottom_items.append(item)
        else:
            top_items.append(item)

    return top_items, _compact_reaction_bottom_annotation_lines(bottom_items)


def _serialize_reaction_annotation_lines(lines: list[str]) -> str:
    return "; ".join(lines)


def _estimate_svg_text_width(
    label: str,
    *,
    font_size: float = _REACTION_ANNOTATION_FONT_SIZE,
) -> float:
    if not label:
        return 0.0
    return len(label) * font_size * 0.62


def _estimate_svg_text_block_width(
    lines: list[str],
    *,
    font_size: float = _REACTION_ANNOTATION_FONT_SIZE,
) -> float:
    if not lines:
        return 0.0
    return max(_estimate_svg_text_width(line, font_size=font_size) for line in lines)


def _estimate_reaction_participant_span(
    participants: list[str],
    *,
    component_gap: int,
    plus_gap: int,
) -> float:
    if not participants:
        return _REACTION_MIN_PARTICIPANT_WIDTH

    participant_widths = [
        max(
            _REACTION_MIN_PARTICIPANT_WIDTH,
            min(
                _REACTION_MAX_PARTICIPANT_WIDTH,
                _estimate_svg_text_width(item, font_size=_REACTION_PARTICIPANT_FONT_SIZE) * 0.58,
            ),
        )
        for item in participants
    ]
    interstitial_gap = max(float(component_gap), _REACTION_BASE_COMPONENT_GAP) + max(
        float(plus_gap), _REACTION_BASE_PLUS_GAP
    )
    return sum(participant_widths) + max(0, len(participants) - 1) * interstitial_gap


def _build_reaction_canvas_layout(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    *,
    render_config: ReactionRenderConfig,
) -> ReactionCanvasLayout:
    # 箭头长度至少要容纳条件文字块；否则后续 SVG 装饰会把注释压进参与物区域。
    top_lines, bottom_lines = _split_reaction_annotation_lines(
        conditions,
        show_conditions_below_arrow=render_config.show_conditions_below_arrow,
    )
    annotation_width = max(
        _estimate_svg_text_block_width(top_lines),
        _estimate_svg_text_block_width(bottom_lines),
    )
    rendered_arrow_length = max(
        float(render_config.arrow_length),
        annotation_width + 20.0 if annotation_width > 0 else 0.0,
    )
    reactant_span = _estimate_reaction_participant_span(
        reactants,
        component_gap=render_config.component_gap,
        plus_gap=render_config.plus_gap,
    )
    product_span = _estimate_reaction_participant_span(
        products,
        component_gap=render_config.component_gap,
        plus_gap=render_config.plus_gap,
    )
    top_block_height = (
        _REACTION_TOP_ANNOTATION_GAP + (_REACTION_ANNOTATION_LINE_HEIGHT * len(top_lines))
        if top_lines
        else 0.0
    )
    bottom_block_height = (
        _REACTION_BOTTOM_ANNOTATION_GAP + (_REACTION_ANNOTATION_LINE_HEIGHT * len(bottom_lines))
        if bottom_lines
        else 0.0
    )
    content_y = top_block_height + _REACTION_BASELINE_Y
    canvas_height = max(
        _REACTION_BASE_CANVAS_HEIGHT,
        content_y + bottom_block_height + _REACTION_BOTTOM_PADDING,
    )
    arrow_start_x = _REACTION_SIDE_PADDING + reactant_span + float(render_config.component_gap)
    arrow_end_x = arrow_start_x + rendered_arrow_length
    canvas_width = max(
        _REACTION_BASE_CANVAS_WIDTH,
        arrow_end_x + float(render_config.component_gap) + product_span + _REACTION_SIDE_PADDING,
    )

    return ReactionCanvasLayout(
        top_lines=top_lines,
        bottom_lines=bottom_lines,
        rendered_arrow_length=rendered_arrow_length,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        content_y=content_y,
        arrow_y=content_y - 8.0,
        arrow_start_x=arrow_start_x,
        arrow_center_x=arrow_start_x + (rendered_arrow_length / 2.0),
        products_x=arrow_end_x + float(render_config.component_gap),
    )
