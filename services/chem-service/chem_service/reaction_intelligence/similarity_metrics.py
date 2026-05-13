from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from typing import Any


def cosine_score(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    dot = sum(float(a) * float(b) for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(float(value) * float(value) for value in left))
    right_norm = math.sqrt(sum(float(value) * float(value) for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return clamp_score(dot / (left_norm * right_norm))


def tanimoto_like_score(left: Any, right: Any) -> float:
    left_set = _coerce_fingerprint_set(left)
    right_set = _coerce_fingerprint_set(right)
    if left_set is not None and right_set is not None:
        union = left_set | right_set
        if not union:
            return 0.0
        return len(left_set & right_set) / len(union)

    left_vector = coerce_numeric_vector(left)
    right_vector = coerce_numeric_vector(right)
    if len(left_vector) != len(right_vector) or not left_vector:
        return 0.0

    dot = sum(a * b for a, b in zip(left_vector, right_vector, strict=True))
    denominator = (
        sum(value * value for value in left_vector)
        + sum(value * value for value in right_vector)
        - dot
    )
    if denominator <= 0:
        return 0.0
    return clamp_score(dot / denominator)


def reaction_center_score(left: str | None, right: str | None) -> float:
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    left_parts = {part for part in left.replace(">", ".").split(".") if part}
    right_parts = {part for part in right.replace(">", ".").split(".") if part}
    union = left_parts | right_parts
    if not union:
        return 0.0
    return len(left_parts & right_parts) / len(union)


def coerce_numeric_vector(value: Any) -> list[float]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return []
    vector: list[float] = []
    for item in value:
        if not isinstance(item, int | float):
            return []
        vector.append(float(item))
    return vector


def clamp_score(value: float) -> float:
    if math.isnan(value) or math.isinf(value):
        return 0.0
    return max(0.0, min(1.0, float(value)))


def unique_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def _coerce_fingerprint_set(value: Any) -> set[str] | None:
    if value is None:
        return set()
    if isinstance(value, str):
        return {token for token in value.split() if token}
    if not isinstance(value, Sequence):
        return None
    if all(isinstance(item, int) and item in {0, 1} for item in value):
        return {str(index) for index, bit in enumerate(value) if bit}
    if all(isinstance(item, int) for item in value):
        return {str(item) for item in value}
    return None
