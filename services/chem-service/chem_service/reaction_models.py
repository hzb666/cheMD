from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ReactionRenderConfig:
    arrow_length: int = 48
    component_gap: int = 24
    plus_gap: int = 20
    show_conditions_below_arrow: bool = True


@dataclass(frozen=True, slots=True)
class ReactionCanvasLayout:
    top_lines: list[str]
    bottom_lines: list[str]
    rendered_arrow_length: float
    canvas_width: float
    canvas_height: float
    content_y: float
    arrow_y: float
    arrow_start_x: float
    arrow_center_x: float
    products_x: float


@dataclass(frozen=True, slots=True)
class ReactionRenderInput:
    reactants: list[str]
    products: list[str]
    conditions: list[str]
