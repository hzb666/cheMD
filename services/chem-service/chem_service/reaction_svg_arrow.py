from __future__ import annotations

import re
from dataclasses import dataclass
from html import escape

_REACTION_ARROW_HEAD_LENGTH = 12.0
_REACTION_ARROW_HEAD_HALF_HEIGHT = 5.0
_REACTION_ARROW_HEAD_NOTCH_RATIO = 0.78
_REACTION_ARROW_HEAD_CORNER_RADIUS = 0.5
_SVG_PATH_RE = re.compile(r"<path\b[^>]*\bd=(['\"])(?P<d>.*?)\1[^>]*/?>", re.DOTALL)
_SVG_ATTR_RE = re.compile(r"(?P<name>[\w:-]+)=(['\"])(?P<value>.*?)\2", re.DOTALL)
_HORIZONTAL_PATH_RE = re.compile(
    r"^\s*M\s*(?P<x1>-?\d+(?:\.\d+)?)\s*,\s*(?P<y1>-?\d+(?:\.\d+)?)\s*L\s*(?P<x2>-?\d+(?:\.\d+)?)\s*,\s*(?P<y2>-?\d+(?:\.\d+)?)\s*$"
)
_TRIANGLE_PATH_RE = re.compile(
    r"^\s*M\s*(?P<x1>-?\d+(?:\.\d+)?)\s*,\s*(?P<y1>-?\d+(?:\.\d+)?)\s*L\s*(?P<x2>-?\d+(?:\.\d+)?)\s*,\s*(?P<y2>-?\d+(?:\.\d+)?)\s*L\s*(?P<x3>-?\d+(?:\.\d+)?)\s*,\s*(?P<y3>-?\d+(?:\.\d+)?)\s*$"
)
_DEFAULT_ARROW_STYLE = (
    "fill:none;stroke:#000000;stroke-width:2.0px;"
    "stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
)


@dataclass(frozen=True, slots=True)
class ReactionArrowHeadGeometry:
    base_x: float
    notch_x: float
    tip_x: float
    center_y: float
    half_height: float
    corner_radius: float = _REACTION_ARROW_HEAD_CORNER_RADIUS


@dataclass(slots=True)
class ReactionArrowGeometry:
    shaft_element: str
    head_element: str | None
    shaft_style: str
    head_style: str
    x1: float
    x2: float
    y: float
    head_width: float
    head_half_height: float


def _extract_svg_attribute(element: str, name: str) -> str | None:
    for match in _SVG_ATTR_RE.finditer(element):
        if match.group("name") == name:
            return match.group("value")
    return None


def _parse_svg_style(style: str) -> dict[str, str]:
    declarations: dict[str, str] = {}
    for part in style.split(";"):
        declaration = part.strip()
        if not declaration or ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        declarations[name.strip()] = value.strip()
    return declarations


def _serialize_svg_style(declarations: dict[str, str]) -> str:
    return ";".join(f"{name}:{value}" for name, value in declarations.items())


def _build_reaction_arrow_head_path_data(geometry: ReactionArrowHeadGeometry) -> str:
    radius = max(
        0.0,
        min(
            geometry.corner_radius,
            geometry.half_height - 0.2,
            (geometry.tip_x - geometry.base_x) * 0.45,
        ),
    )
    top_y = geometry.center_y - geometry.half_height
    bottom_y = geometry.center_y + geometry.half_height

    return (
        f"M {geometry.tip_x:.1f},{geometry.center_y:.1f} "
        f"L {geometry.base_x + radius:.1f},{top_y:.1f} "
        f"Q {geometry.base_x:.1f},{top_y:.1f} "
        f"{geometry.base_x:.1f},{top_y + radius:.1f} "
        f"L {geometry.notch_x:.1f},{geometry.center_y:.1f} "
        f"L {geometry.base_x:.1f},{bottom_y - radius:.1f} "
        f"Q {geometry.base_x:.1f},{bottom_y:.1f} "
        f"{geometry.base_x + radius:.1f},{bottom_y:.1f} Z"
    )


def _find_reaction_arrow_shaft(svg: str) -> tuple[str, float, float, float, str] | None:
    shaft_candidate: tuple[str, float, float, float, str] | None = None
    # 箭头轴线按最长水平 path 识别，带 class 元素不参与几何重算。
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
        if abs(y1 - y2) > 0.5 or x2 <= x1 or x2 - x1 < 40:
            continue
        if shaft_candidate is None or (x2 - x1) > (shaft_candidate[2] - shaft_candidate[1]):
            shaft_candidate = (
                element,
                x1,
                x2,
                y1,
                _extract_svg_attribute(element, "style") or _DEFAULT_ARROW_STYLE,
            )
    return shaft_candidate


def _find_reaction_arrow_head(
    svg: str,
    *,
    shaft_element: str,
    shaft_x2: float,
    shaft_y: float,
    shaft_style: str,
) -> tuple[str | None, str, float, float]:
    head_element: str | None = None
    head_style = shaft_style
    head_width = 5.0
    head_half_height = 2.9

    for match in _SVG_PATH_RE.finditer(svg):
        element = match.group(0)
        if element == shaft_element or "class=" in element:
            continue
        geometry = _TRIANGLE_PATH_RE.match(match.group("d").strip())
        if geometry is None:
            continue
        points = [
            (float(geometry.group("x1")), float(geometry.group("y1"))),
            (float(geometry.group("x2")), float(geometry.group("y2"))),
            (float(geometry.group("x3")), float(geometry.group("y3"))),
        ]
        tip = points[1]
        if abs(tip[0] - shaft_x2) > 8 or abs(tip[1] - shaft_y) > 4:
            continue
        head_element = element
        head_style = _extract_svg_attribute(element, "style") or shaft_style
        head_width = max(abs(tip[0] - points[0][0]), abs(tip[0] - points[2][0]), head_width)
        head_half_height = max(
            abs(tip[1] - points[0][1]),
            abs(tip[1] - points[2][1]),
            head_half_height,
        )
        break

    return head_element, head_style, head_width, head_half_height


def _find_reaction_arrow(svg: str) -> ReactionArrowGeometry | None:
    shaft_candidate = _find_reaction_arrow_shaft(svg)
    if shaft_candidate is None:
        return None

    shaft_element, x1, x2, y, shaft_style = shaft_candidate
    head_element, head_style, head_width, head_half_height = _find_reaction_arrow_head(
        svg,
        shaft_element=shaft_element,
        shaft_x2=x2,
        shaft_y=y,
        shaft_style=shaft_style,
    )

    return ReactionArrowGeometry(
        shaft_element=shaft_element,
        head_element=head_element,
        shaft_style=shaft_style,
        head_style=head_style,
        x1=x1,
        x2=x2,
        y=y,
        head_width=head_width,
        head_half_height=head_half_height,
    )


def _render_reaction_arrow_paths(arrow: ReactionArrowGeometry, *, arrow_end_x: float) -> str:
    shaft_style = _parse_svg_style(arrow.shaft_style)
    shaft_style["fill"] = "none"
    shaft_style["stroke-linecap"] = "round"
    shaft_style["stroke-linejoin"] = "round"

    head_style = _parse_svg_style(arrow.head_style)
    head_fill = head_style.get("stroke") or shaft_style.get("stroke") or "#000000"
    head_style["fill"] = head_fill
    head_style["stroke"] = "none"
    head_style["stroke-linecap"] = "round"
    head_style["stroke-linejoin"] = "round"
    head_length = max(_REACTION_ARROW_HEAD_LENGTH, arrow.head_width * 2.0)
    head_half_height = max(_REACTION_ARROW_HEAD_HALF_HEIGHT, arrow.head_half_height * 1.7)
    notch_x = arrow_end_x - (head_length * _REACTION_ARROW_HEAD_NOTCH_RATIO)
    base_x = arrow_end_x - head_length
    head_path = _build_reaction_arrow_head_path_data(
        ReactionArrowHeadGeometry(
            base_x=base_x,
            notch_x=notch_x,
            tip_x=arrow_end_x,
            center_y=arrow.y,
            half_height=head_half_height,
        )
    )
    shaft = (
        f"<path d='M {arrow.x1:.1f},{arrow.y:.1f} L {notch_x:.1f},{arrow.y:.1f}' "
        f"style='{escape(_serialize_svg_style(shaft_style), quote=True)}' />"
    )
    head = (
        f"<path d='{head_path}' "
        f"style='{escape(_serialize_svg_style(head_style), quote=True)}' />"
    )
    return f"{shaft}{head}"
