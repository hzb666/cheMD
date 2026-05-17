from __future__ import annotations

import re
from collections.abc import Callable, Iterator
from html.parser import HTMLParser

from chem_service.reaction_layout import (
    _REACTION_PARTICIPANT_FONT_SIZE,
    _estimate_svg_text_width,
)

_PATH_COMMAND_PARAM_COUNTS = {
    "M": 2,
    "L": 2,
    "H": 1,
    "V": 1,
    "C": 6,
    "S": 4,
    "Q": 4,
    "T": 2,
    "A": 7,
    "Z": 0,
}
_PATH_COMMAND_X_INDEXES = {
    "M": {0},
    "L": {0},
    "H": {0},
    "V": set(),
    "C": {0, 2, 4},
    "S": {0, 2},
    "Q": {0, 2},
    "T": {0},
    "A": {5},
    "Z": set(),
}
_REACTION_TIGHT_CROP_PADDING = 6.0


class _SvgElement:
    def __init__(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tag = tag
        self.attrib = {key: value or "" for key, value in attrs}
        self.children: list[_SvgElement] = []
        self.text_parts: list[str] = []

    def __iter__(self) -> Iterator[_SvgElement]:
        return iter(self.children)

    def itertext(self) -> Iterator[str]:
        yield from self.text_parts
        for child in self.children:
            yield from child.itertext()


class _SvgBoundsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.root: _SvgElement | None = None
        self.stack: list[_SvgElement] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        element = _SvgElement(tag, attrs)
        if self.stack:
            self.stack[-1].children.append(element)
        elif self.root is None:
            self.root = element
        self.stack.append(element)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        element = _SvgElement(tag, attrs)
        if self.stack:
            self.stack[-1].children.append(element)
        elif self.root is None:
            self.root = element

    def handle_endtag(self, tag: str) -> None:
        while self.stack:
            element = self.stack.pop()
            if element.tag == tag:
                break

    def handle_data(self, data: str) -> None:
        if self.stack:
            self.stack[-1].text_parts.append(data)


def _parse_svg_root(svg: str) -> _SvgElement | None:
    if _contains_xml_entity_declaration(svg):
        return None
    parser = _SvgBoundsParser()
    try:
        parser.feed(svg)
        parser.close()
    except Exception:
        return None
    return parser.root


def _extract_path_x_values(path_d: str) -> list[float]:
    tokens = re.findall(r"[A-Za-z]|-?\d+(?:\.\d+)?", path_d)
    x_values: list[float] = []
    index = 0
    current_command: str | None = None
    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            current_command = token
            index += 1
            if current_command.upper() == "Z":
                continue
        if current_command is None:
            break
        command_key = current_command.upper()
        param_count = _PATH_COMMAND_PARAM_COUNTS.get(command_key)
        if param_count is None or current_command != command_key:
            return []
        if index + param_count > len(tokens):
            break
        values = [float(tokens[index + offset]) for offset in range(param_count)]
        x_indexes = _PATH_COMMAND_X_INDEXES[command_key]
        x_values.extend(values[offset] for offset in x_indexes)
        index += param_count
    return x_values


def _parse_svg_number(value: str | None) -> float | None:
    if not isinstance(value, str):
        return None

    match = re.match(r"^-?\d+(?:\.\d+)?", value.strip())
    if match is None:
        return None

    return float(match.group(0))


def _parse_svg_translate_x(transform: str | None) -> float:
    if not isinstance(transform, str) or not transform.strip():
        return 0.0

    translate_match = re.search(
        r"translate\(\s*(-?\d+(?:\.\d+)?)\s*(?:[,\s]+-?\d+(?:\.\d+)?)?\s*\)",
        transform,
    )
    if translate_match is not None:
        return float(translate_match.group(1))

    matrix_match = re.search(
        r"matrix\(\s*1(?:\.0+)?\s*[,\s]+\s*0(?:\.0+)?\s*[,\s]+\s*0(?:\.0+)?\s*[,\s]+\s*1(?:\.0+)?\s*[,\s]+(-?\d+(?:\.\d+)?)",
        transform,
    )
    if matrix_match is not None:
        return float(matrix_match.group(1))

    return 0.0


def _merge_horizontal_bounds(
    current_bounds: tuple[float, float] | None,
    next_bounds: tuple[float, float] | None,
) -> tuple[float, float] | None:
    if next_bounds is None:
        return current_bounds
    if current_bounds is None:
        return next_bounds
    return (
        min(current_bounds[0], next_bounds[0]),
        max(current_bounds[1], next_bounds[1]),
    )


def _is_full_canvas_rect(
    element: _SvgElement,
    *,
    canvas_width: float,
    canvas_height: float,
) -> bool:
    x = _parse_svg_number(element.attrib.get("x")) or 0.0
    y = _parse_svg_number(element.attrib.get("y")) or 0.0
    width = _parse_svg_number(element.attrib.get("width"))
    height = _parse_svg_number(element.attrib.get("height"))
    if width is None or height is None:
        return False

    width_matches_canvas = (
        abs(width - canvas_width) <= 2.5 or abs(width - (canvas_width - 2.0)) <= 2.5
    )
    height_matches_canvas = (
        abs(height - canvas_height) <= 2.5 or abs(height - (canvas_height - 2.0)) <= 2.5
    )
    return abs(x) <= 1.5 and abs(y) <= 1.5 and width_matches_canvas and height_matches_canvas


def _estimate_svg_text_bounds(
    *,
    text: str,
    x: float,
    font_size: float,
    text_anchor: str,
) -> tuple[float, float]:
    text_width = _estimate_svg_text_width(text, font_size=font_size)
    if text_anchor == "end":
        return x - text_width, x
    if text_anchor == "middle":
        half_width = text_width / 2.0
        return x - half_width, x + half_width
    return x, x + text_width


def _extract_svg_path_bounds(path_d: str, *, translate_x: float) -> tuple[float, float] | None:
    x_values = _extract_path_x_values(path_d)
    if not x_values:
        return None
    return min(x_values) + translate_x, max(x_values) + translate_x


def _extract_svg_line_bounds(
    element: _SvgElement,
    *,
    translate_x: float,
) -> tuple[float, float] | None:
    x1 = _parse_svg_number(element.attrib.get("x1"))
    x2 = _parse_svg_number(element.attrib.get("x2"))
    if x1 is None or x2 is None:
        return None
    return min(x1, x2) + translate_x, max(x1, x2) + translate_x


def _extract_svg_rect_bounds(
    element: _SvgElement,
    *,
    translate_x: float,
    canvas_width: float,
    canvas_height: float,
) -> tuple[float, float] | None:
    if _is_full_canvas_rect(
        element,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
    ):
        return None
    x = _parse_svg_number(element.attrib.get("x")) or 0.0
    width = _parse_svg_number(element.attrib.get("width"))
    if width is None:
        return None
    return x + translate_x, x + width + translate_x


def _extract_svg_circle_bounds(
    element: _SvgElement,
    *,
    translate_x: float,
) -> tuple[float, float] | None:
    cx = _parse_svg_number(element.attrib.get("cx"))
    radius = _parse_svg_number(element.attrib.get("r"))
    if cx is None or radius is None:
        return None
    return cx - radius + translate_x, cx + radius + translate_x


def _extract_svg_ellipse_bounds(
    element: _SvgElement,
    *,
    translate_x: float,
) -> tuple[float, float] | None:
    cx = _parse_svg_number(element.attrib.get("cx"))
    radius_x = _parse_svg_number(element.attrib.get("rx"))
    if cx is None or radius_x is None:
        return None
    return cx - radius_x + translate_x, cx + radius_x + translate_x


def _extract_svg_text_bounds_from_element(
    element: _SvgElement,
    *,
    translate_x: float,
) -> tuple[float, float] | None:
    x = _parse_svg_number(element.attrib.get("x"))
    text = "".join(element.itertext()).strip()
    if x is None or not text:
        return None
    font_size = (
        _parse_svg_number(element.attrib.get("font-size")) or _REACTION_PARTICIPANT_FONT_SIZE
    )
    text_anchor = (element.attrib.get("text-anchor") or "start").strip().lower()
    return _estimate_svg_text_bounds(
        text=text,
        x=x + translate_x,
        font_size=font_size,
        text_anchor=text_anchor,
    )


def _extract_svg_element_horizontal_bounds(
    element: _SvgElement,
    *,
    translate_x: float,
    canvas_width: float,
    canvas_height: float,
) -> tuple[float, float] | None:
    tag = element.tag.rsplit("}", 1)[-1]
    extractor = _build_bounds_extractor(tag)
    if extractor is None:
        return None
    return extractor(
        element,
        translate_x=translate_x,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
    )


def _build_bounds_extractor(
    tag: str,
) -> Callable[..., tuple[float, float] | None] | None:
    extractors: dict[str, Callable[..., tuple[float, float] | None]] = {
        "path": lambda element, *, translate_x, **_kwargs: _extract_svg_path_bounds(
            element.attrib.get("d") or "",
            translate_x=translate_x,
        ),
        "line": lambda element, *, translate_x, **_kwargs: _extract_svg_line_bounds(
            element,
            translate_x=translate_x,
        ),
        "rect": _extract_svg_rect_bounds,
        "circle": lambda element, *, translate_x, **_kwargs: _extract_svg_circle_bounds(
            element,
            translate_x=translate_x,
        ),
        "ellipse": lambda element, *, translate_x, **_kwargs: _extract_svg_ellipse_bounds(
            element,
            translate_x=translate_x,
        ),
        "text": lambda element, *, translate_x, **_kwargs: _extract_svg_text_bounds_from_element(
            element,
            translate_x=translate_x,
        ),
    }
    return extractors.get(tag)


def _collect_svg_horizontal_bounds(
    element: _SvgElement,
    *,
    inherited_translate_x: float,
    canvas_width: float,
    canvas_height: float,
) -> tuple[float, float] | None:
    translate_x = inherited_translate_x + _parse_svg_translate_x(element.attrib.get("transform"))
    bounds = _extract_svg_element_horizontal_bounds(
        element,
        translate_x=translate_x,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
    )
    for child in element:
        bounds = _merge_horizontal_bounds(
            bounds,
            _collect_svg_horizontal_bounds(
                child,
                inherited_translate_x=translate_x,
                canvas_width=canvas_width,
                canvas_height=canvas_height,
            ),
        )
    return bounds


def _tighten_reaction_svg_horizontal_bounds(
    svg: str,
    *,
    padding: float = _REACTION_TIGHT_CROP_PADDING,
) -> str:
    # 仅收紧水平边界，保持垂直尺寸不变。
    view_box_match = re.search(
        r"viewBox=(['\"])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\1",
        svg,
    )
    if view_box_match is None:
        return svg

    canvas_min_x = float(view_box_match.group(2))
    canvas_min_y = float(view_box_match.group(3))
    canvas_width = float(view_box_match.group(4))
    canvas_height = float(view_box_match.group(5))

    root = _parse_svg_root(svg)
    if root is None:
        return svg

    content_bounds = _collect_svg_horizontal_bounds(
        root,
        inherited_translate_x=0.0,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
    )
    if content_bounds is None:
        return svg

    cropped_min_x = max(canvas_min_x, content_bounds[0] - padding)
    cropped_max_x = min(canvas_min_x + canvas_width, content_bounds[1] + padding)
    cropped_width = cropped_max_x - cropped_min_x
    if cropped_width <= 1.0:
        return svg
    if cropped_width >= canvas_width - 0.5 and abs(cropped_min_x - canvas_min_x) <= 0.5:
        return svg

    replacement = (
        f"viewBox={view_box_match.group(1)}{cropped_min_x:.1f} "
        f"{canvas_min_y:.1f} {cropped_width:.1f} {canvas_height:.1f}{view_box_match.group(1)}"
    )
    svg = f"{svg[: view_box_match.start()]}{replacement}{svg[view_box_match.end() :]}"

    width_match = re.search(r"width=(['\"])(\d+(?:\.\d+)?)(px)?\1", svg)
    if width_match is not None:
        suffix = width_match.group(3) or ""
        replacement = (
            f"width={width_match.group(1)}{cropped_width:.1f}{suffix}{width_match.group(1)}"
        )
        svg = f"{svg[: width_match.start()]}{replacement}{svg[width_match.end() :]}"

    return svg


def _contains_xml_entity_declaration(svg: str) -> bool:
    lowered = svg.lower()
    return "<!doctype" in lowered or "<!entity" in lowered
