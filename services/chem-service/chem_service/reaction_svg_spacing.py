from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from chem_service.reaction_layout import (
    _REACTION_BASE_COMPONENT_GAP,
    _REACTION_BASE_PLUS_GAP,
)
from chem_service.reaction_svg_bounds import _extract_path_x_values

_SVG_PATH_RE = re.compile(r"<path\b[^>]*\bd=(['\"])(?P<d>.*?)\1[^>]*/?>", re.DOTALL)
_HORIZONTAL_PATH_RE = re.compile(
    r"^\s*M\s*(?P<x1>-?\d+(?:\.\d+)?)\s*,\s*(?P<y1>-?\d+(?:\.\d+)?)\s*L\s*(?P<x2>-?\d+(?:\.\d+)?)\s*,\s*(?P<y2>-?\d+(?:\.\d+)?)\s*$"
)


class ReactionArrowLike(Protocol):
    shaft_element: str
    head_element: str | None
    x1: float
    x2: float


@dataclass(slots=True)
class ReactionPlusGeometry:
    vertical_element: str
    horizontal_element: str
    center_x: float
    center_y: float


def _collect_reaction_plus_candidates(
    svg: str,
    *,
    max_x: float,
) -> tuple[list[tuple[str, float, float]], list[tuple[str, float, float]]]:
    vertical_candidates: list[tuple[str, float, float]] = []
    horizontal_candidates: list[tuple[str, float, float]] = []

    # 仅在箭头左侧识别加号，避免误判产物侧十字结构。
    for match in _SVG_PATH_RE.finditer(svg):
        element = match.group(0)
        if "class=" in element:
            continue
        geometry = _HORIZONTAL_PATH_RE.match(match.group("d").strip())
        if geometry is None:
            continue
        x1 = float(geometry.group("x1"))
        y1 = float(geometry.group("y1"))
        x2 = float(geometry.group("x2"))
        y2 = float(geometry.group("y2"))
        if max(x1, x2) >= max_x:
            continue

        if abs(x1 - x2) < 0.5:
            length = abs(y2 - y1)
            if 8.0 <= length <= 30.0:
                vertical_candidates.append((element, x1, (y1 + y2) / 2.0))
            continue

        if abs(y1 - y2) < 0.5:
            length = abs(x2 - x1)
            if 8.0 <= length <= 30.0:
                horizontal_candidates.append((element, (x1 + x2) / 2.0, y1))

    return vertical_candidates, horizontal_candidates


def _match_reaction_plus_candidates(
    vertical_candidates: list[tuple[str, float, float]],
    horizontal_candidates: list[tuple[str, float, float]],
) -> list[ReactionPlusGeometry]:
    plus_signs: list[ReactionPlusGeometry] = []
    used_horizontal_indexes: set[int] = set()
    for vertical_element, vertical_center_x, vertical_center_y in vertical_candidates:
        for index, (horizontal_element, horizontal_center_x, horizontal_center_y) in enumerate(
            horizontal_candidates
        ):
            if index in used_horizontal_indexes:
                continue
            if (
                abs(vertical_center_x - horizontal_center_x) <= 1.5
                and abs(vertical_center_y - horizontal_center_y) <= 1.5
            ):
                plus_signs.append(
                    ReactionPlusGeometry(
                        vertical_element=vertical_element,
                        horizontal_element=horizontal_element,
                        center_x=vertical_center_x,
                        center_y=vertical_center_y,
                    )
                )
                used_horizontal_indexes.add(index)
                break
    return plus_signs


def _find_reaction_plus_signs(svg: str, *, max_x: float) -> list[ReactionPlusGeometry]:
    vertical_candidates, horizontal_candidates = _collect_reaction_plus_candidates(
        svg,
        max_x=max_x,
    )
    plus_signs = _match_reaction_plus_candidates(vertical_candidates, horizontal_candidates)
    plus_signs.sort(key=lambda plus: plus.center_x)
    return plus_signs


def _translate_selected_paths(svg: str, element_shifts: dict[str, float]) -> str:
    if not element_shifts:
        return svg

    def replacer(match: re.Match[str]) -> str:
        element = match.group(0)
        shift_x = element_shifts.get(element, 0.0)
        if abs(shift_x) < 0.05:
            return element
        return f'<g transform="translate({shift_x:.1f},0)">{element}</g>'

    return _SVG_PATH_RE.sub(replacer, svg)


def _expand_reactant_spacing(
    svg: str,
    *,
    arrow: ReactionArrowLike,
    component_gap: int,
    plus_gap: int,
) -> tuple[str, float]:
    # reactant 侧位移按加号分段累计，禁止整体平移。
    plus_signs = _find_reaction_plus_signs(svg, max_x=arrow.x1 - 2.0)
    plus_delta = max(0.0, float(plus_gap) - _REACTION_BASE_PLUS_GAP)
    component_delta = max(0.0, float(component_gap) - _REACTION_BASE_COMPONENT_GAP)
    if not plus_signs and component_delta <= 0:
        return svg, component_delta

    plus_centers = [plus.center_x for plus in plus_signs]
    plus_element_shifts: dict[str, float] = {}
    for index, plus in enumerate(plus_signs):
        shift_x = (index * 2.0 + 1.0) * plus_delta
        plus_element_shifts[plus.vertical_element] = shift_x
        plus_element_shifts[plus.horizontal_element] = shift_x

    excluded_elements = {
        element for element in (arrow.shaft_element, arrow.head_element) if element
    }
    element_shifts: dict[str, float] = {}
    for match in _SVG_PATH_RE.finditer(svg):
        element = match.group(0)
        if element in excluded_elements:
            continue
        x_values = _extract_path_x_values(match.group("d"))
        if not x_values or min(x_values) >= arrow.x1:
            continue
        if element in plus_element_shifts:
            shift_x = plus_element_shifts[element]
        else:
            midpoint_x = (min(x_values) + max(x_values)) / 2.0
            segment_index = sum(1 for center_x in plus_centers if center_x < midpoint_x)
            shift_x = segment_index * plus_delta * 2.0
        if shift_x > 0:
            element_shifts[element] = shift_x

    return (
        _translate_selected_paths(svg, element_shifts),
        component_delta + (len(plus_signs) * plus_delta * 2.0),
    )


def _translate_product_side_paths(
    svg: str,
    *,
    delta_x: float,
    cutoff_x: float,
    excluded_elements: set[str],
) -> str:
    element_shifts: dict[str, float] = {}
    for match in _SVG_PATH_RE.finditer(svg):
        element = match.group(0)
        if element in excluded_elements:
            continue
        x_values = _extract_path_x_values(match.group("d"))
        if not x_values or min(x_values) < cutoff_x:
            continue
        element_shifts[element] = delta_x

    return _translate_selected_paths(svg, element_shifts)


def _expand_svg_width(svg: str, *, delta_x: float) -> str:
    if delta_x <= 0:
        return svg

    view_box_match = re.search(
        r"viewBox=(['\"])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\1",
        svg,
    )
    if view_box_match is not None:
        width = float(view_box_match.group(4)) + delta_x
        replacement = (
            f"viewBox={view_box_match.group(1)}{view_box_match.group(2)} "
            f"{view_box_match.group(3)} {width:.1f} "
            f"{view_box_match.group(5)}{view_box_match.group(1)}"
        )
        svg = f"{svg[: view_box_match.start()]}{replacement}{svg[view_box_match.end() :]}"

    width_match = re.search(r"width=(['\"])(\d+(?:\.\d+)?)(px)?\1", svg)
    if width_match is not None:
        width = float(width_match.group(2)) + delta_x
        suffix = width_match.group(3) or ""
        replacement = f"width={width_match.group(1)}{width:.1f}{suffix}{width_match.group(1)}"
        svg = f"{svg[: width_match.start()]}{replacement}{svg[width_match.end() :]}"

    rect_match = re.search(r"(<rect\b[^>]*\bwidth=)(['\"])(\d+(?:\.\d+)?)(\2)", svg)
    if rect_match is not None:
        width = float(rect_match.group(3)) + delta_x
        replacement = f"{rect_match.group(1)}{rect_match.group(2)}{width:.1f}{rect_match.group(2)}"
        svg = f"{svg[: rect_match.start()]}{replacement}{svg[rect_match.end() :]}"

    return svg
