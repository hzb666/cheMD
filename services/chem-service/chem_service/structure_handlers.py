from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from chem_service.structure_models import (
    MoleculeStructureSaveRequest,
    ReactionStructureSaveRequest,
)


@dataclass(frozen=True, slots=True)
class StructureReadContext:
    request_obj: Any
    jsonify: Callable[..., Any]
    cache: dict[str, Any]
    cache_key: Callable[[str, str, str], str]
    prune_cache: Callable[[], None]
    serialize_structure_record: Callable[[Any], dict[str, Any]]


@dataclass(frozen=True, slots=True)
class StructureWriteContext:
    request_obj: Any
    jsonify: Callable[..., Any]
    coerce_string_list: Callable[..., list[str] | None]
    save_cache: Callable[..., Any]
    serialize_structure_record: Callable[[Any], dict[str, Any]]


def _read_confidence(
    value: Any,
    *,
    context: StructureWriteContext,
) -> tuple[float | None, Any | None]:
    if value is None:
        return None, None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, (context.jsonify({"message": "confidence must be a number"}), 400)
    return float(value), None


def _handle_structure_get_request(context: StructureReadContext) -> Any:
    # GET 缓存查询必须带 documentId/blockId/sessionId 三元组。
    context.prune_cache()
    document_id = context.request_obj.args.get("documentId", type=str)
    block_id = context.request_obj.args.get("blockId", type=str)
    session_id = context.request_obj.args.get("sessionId", type=str)
    if not document_id or not block_id or not session_id:
        return context.jsonify({"message": "documentId, blockId, and sessionId are required"}), 400

    record = context.cache.get(context.cache_key(document_id, block_id, session_id))
    if not record:
        return context.jsonify({"found": False})

    return context.jsonify(
        {
            "found": True,
            "record": context.serialize_structure_record(record),
        }
    )


def _save_reaction_structure(
    payload: dict[str, Any],
    *,
    context: StructureWriteContext,
) -> Any:
    # conditions 允许缺省为空数组，但不接受全空字符串列表。
    reactants = payload.get("reactants")
    products = payload.get("products")
    conditions = payload.get("conditions")
    reaction_smiles = payload.get("reactionSmiles")
    rxnfile = payload.get("rxnfile")
    source = payload.get("source", "manual")
    confidence = payload.get("confidence")

    normalized_reactants = context.coerce_string_list(reactants, allow_empty=True)
    normalized_products = context.coerce_string_list(products, allow_empty=True)
    if normalized_reactants is None or normalized_products is None:
        return context.jsonify({"message": "reactants and products are required"}), 400

    if conditions is None:
        normalized_conditions = []
    elif not isinstance(conditions, list):
        return context.jsonify({"message": "conditions must be a string array"}), 400
    else:
        normalized_conditions = context.coerce_string_list(conditions) or []
        if conditions and not normalized_conditions:
            return context.jsonify({"message": "conditions must be a non-empty string array"}), 400

    conf, confidence_error = _read_confidence(confidence, context=context)
    if confidence_error is not None:
        return confidence_error
    record = context.save_cache(
        ReactionStructureSaveRequest(
            document_id=payload["documentId"],
            block_id=payload["blockId"],
            session_id=payload["sessionId"],
            reactants=normalized_reactants,
            products=normalized_products,
            conditions=normalized_conditions,
            reaction_smiles=reaction_smiles if isinstance(reaction_smiles, str) else None,
            rxnfile=rxnfile if isinstance(rxnfile, str) else None,
            source=source if isinstance(source, str) else "manual",
            confidence=conf,
        )
    )
    return context.jsonify(context.serialize_structure_record(record))


def _save_molecule_structure(
    payload: dict[str, Any],
    *,
    context: StructureWriteContext,
) -> Any:
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")
    source = payload.get("source", "manual")
    confidence = payload.get("confidence")

    if not isinstance(smiles, str) or not smiles.strip():
        return context.jsonify({"message": "smiles is required"}), 400

    conf, confidence_error = _read_confidence(confidence, context=context)
    if confidence_error is not None:
        return confidence_error
    record = context.save_cache(
        MoleculeStructureSaveRequest(
            document_id=payload["documentId"],
            block_id=payload["blockId"],
            session_id=payload["sessionId"],
            smiles=smiles.strip(),
            molfile=molfile if isinstance(molfile, str) else None,
            source=source if isinstance(source, str) else "manual",
            confidence=conf,
        )
    )
    return context.jsonify(context.serialize_structure_record(record))


def _handle_structure_post_request(context: StructureWriteContext) -> Any:
    # 先校验 document/block/session 作用域，再按 kind 分发。
    payload = context.request_obj.get_json(silent=True) or {}
    document_id = payload.get("documentId")
    block_id = payload.get("blockId")
    session_id = payload.get("sessionId")

    if (
        not isinstance(document_id, str)
        or not isinstance(block_id, str)
        or not isinstance(session_id, str)
    ):
        return context.jsonify({"message": "documentId, blockId, and sessionId are required"}), 400

    scoped_payload = {
        **payload,
        "documentId": document_id,
        "blockId": block_id,
        "sessionId": session_id,
    }
    kind = payload.get("kind", "molecule")
    if kind not in {"molecule", "reaction"}:
        return context.jsonify({"message": "kind must be molecule or reaction"}), 400

    if kind == "reaction":
        return _save_reaction_structure(
            scoped_payload,
            context=context,
        )
    return _save_molecule_structure(
        scoped_payload,
        context=context,
    )
