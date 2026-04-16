from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from chem_service.structure_models import StructureSaveRequest


@dataclass(slots=True)
class StructureRecord:
    kind: str
    document_id: str
    block_id: str
    session_id: str
    smiles: str | None
    molfile: str | None
    reactants: list[str] | None
    products: list[str] | None
    conditions: list[str] | None
    reaction_smiles: str | None
    rxnfile: str | None
    source: str
    confidence: float | None
    updated_at: str
    expires_at: str


_CACHE: dict[str, StructureRecord] = {}


def _cache_key(document_id: str, block_id: str, session_id: str) -> str:
    # 结构缓存绑定 session/document/block 三元组；
    # 同一 block 在不同会话下允许并行存在。
    return f"{session_id}::{document_id}::{block_id}"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _prune_cache(*, cache: dict[str, StructureRecord]) -> None:
    # 先按过期时间清理，再做容量裁剪，避免活跃记录被旧垃圾挤掉。
    now = _utcnow()
    expired = [
        key for key, record in cache.items() if datetime.fromisoformat(record.expires_at) <= now
    ]
    for key in expired:
        cache.pop(key, None)


def _enforce_cache_limit(*, cache: dict[str, StructureRecord], max_entries: int) -> None:
    while len(cache) >= max_entries:
        oldest_key = next(iter(cache), None)
        if oldest_key is None:
            return
        cache.pop(oldest_key, None)


def _save_cache(
    *,
    cache: dict[str, StructureRecord],
    ttl_seconds: int,
    max_entries: int,
    request: StructureSaveRequest,
) -> StructureRecord:
    _prune_cache(cache=cache)
    _enforce_cache_limit(cache=cache, max_entries=max_entries)
    now = _utcnow()
    record = StructureRecord(
        kind=request.kind,
        document_id=request.document_id,
        block_id=request.block_id,
        session_id=request.session_id,
        smiles=getattr(request, "smiles", None),
        molfile=getattr(request, "molfile", None),
        reactants=getattr(request, "reactants", None),
        products=getattr(request, "products", None),
        conditions=getattr(request, "conditions", None),
        reaction_smiles=getattr(request, "reaction_smiles", None),
        rxnfile=getattr(request, "rxnfile", None),
        source=request.source,
        confidence=request.confidence,
        updated_at=now.isoformat(),
        expires_at=(now + timedelta(seconds=ttl_seconds)).isoformat(),
    )
    cache[_cache_key(request.document_id, request.block_id, request.session_id)] = record
    return record


def _serialize_structure_record(record: StructureRecord) -> dict[str, Any]:
    # 对外 payload 固定使用前端字段名；
    # 不把 dataclass 内部命名直接泄露给 route。
    base_payload: dict[str, Any] = {
        "kind": record.kind,
        "documentId": record.document_id,
        "blockId": record.block_id,
        "sessionId": record.session_id,
        "source": record.source,
        "confidence": record.confidence,
        "updatedAt": record.updated_at,
        "expiresAt": record.expires_at,
    }

    if record.kind == "reaction":
        base_payload.update(
            {
                "reactants": record.reactants or [],
                "products": record.products or [],
                "conditions": record.conditions or [],
                "reactionSmiles": record.reaction_smiles,
                "rxnfile": record.rxnfile,
            }
        )
    else:
        base_payload.update(
            {
                "smiles": record.smiles or "",
                "molfile": record.molfile,
            }
        )

    return base_payload
