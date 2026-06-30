# WHAT DOES THIS FILE DO: correction cache and CRUD — find, list, and create manual answer corrections

# ================== IMPORTS ==================
import threading
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select

from .connection import session_scope, normalize_query
from .models import Correction
from .audit import log_audit_action
# ================== IMPORTS ==================


# =========== VARIABLES : in-memory cache for corrections ===========
_corrections_cache: Optional[List[Tuple[str, Dict[str, Any]]]] = None
_corrections_cache_lock = threading.Lock()
# =========== VARIABLES : in-memory cache for corrections ===========


# =========== FUNCTION ===========
# ROLE: Clear corrections cache so next lookup reloads from DB
def _invalidate_corrections_cache() -> None:
    ''' Set cache to None — next call to _load_corrections_cache will hit DB '''

    # FLOW-1: Acquire lock and clear cache reference
    global _corrections_cache
    with _corrections_cache_lock:
        _corrections_cache = None
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Load or retrieve corrections as (normalized_q, dict) tuples for fuzzy matching
def _load_corrections_cache() -> List[Tuple[str, Dict[str, Any]]]:
    ''' Return cached corrections, loading from DB if cache is empty '''

    # FLOW-1: Acquire lock and return early if already cached
    global _corrections_cache
    with _corrections_cache_lock:
        if _corrections_cache is not None:
            return _corrections_cache

        # FLOW-2: Load active corrections from DB
        with session_scope() as session:
            rows = session.execute(
                select(Correction).where(Correction.is_active.is_(True)).order_by(Correction.updated_at.desc())
            ).scalars().all()

        # FLOW-3: Store as (norm_question, dict) tuples for fast comparison
        _corrections_cache = [
            (row.question_norm, {"id": row.id, "question": row.question, "question_norm": row.question_norm, "corrected_answer": row.corrected_answer})
            for row in rows
        ]
        return _corrections_cache
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Find the best-matching correction for a question using fuzzy similarity
def find_best_correction(question: str, threshold: float = 0.90) -> Optional[Dict[str, Any]]:
    ''' Return correction dict if similarity is above threshold, otherwise None '''

    # FLOW-1: Normalize question so comparison is consistent
    q_norm = normalize_query(question)
    if not q_norm:
        return None

    # FLOW-2: Load cached corrections
    cache = _load_corrections_cache()

    # FLOW-3: Compare against each correction, tracking the highest ratio
    best_match = None
    best_ratio = 0.0
    for stored_norm, row_dict in cache:
        ratio = SequenceMatcher(None, q_norm, stored_norm).ratio()  # USE: SequenceMatcher for fuzzy string comparison
        if ratio >= threshold and ratio > best_ratio:
            best_ratio = ratio
            best_match = row_dict

    return best_match
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return all active corrections for the admin panel
def list_corrections(limit: int = 100) -> List[Dict[str, Any]]:
    ''' Return active correction records ordered newest first '''

    # FLOW-1: Query active corrections
    with session_scope() as session:
        rows = session.execute(
            select(Correction).where(Correction.is_active.is_(True)).order_by(Correction.updated_at.desc()).limit(limit)
        ).scalars().all()

        # FLOW-2: Return as list of dicts
        return [{"id": r.id, "question": r.question, "corrected_answer": r.corrected_answer, "admin_note": r.admin_note, "approved_by": r.approved_by} for r in rows]
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Create a correction manually from the admin panel
def create_direct_correction(question: str, corrected_answer: str, admin_note: str = "", approved_by: str = "admin") -> Dict[str, Any]:
    ''' Insert correction, log the action, invalidate cache, return new record '''

    # FLOW-1: Normalize question for future fuzzy matching
    q_norm = normalize_query(question)

    # FLOW-2: Insert correction record and log the admin action
    with session_scope() as session:
        row = Correction(
            question=question, question_norm=q_norm,
            corrected_answer=corrected_answer, admin_note=admin_note,
            approved_by=approved_by, is_active=True,
        )
        session.add(row)
        log_audit_action(session, "correction_created", f"Q: {question[:100]}", admin_id=approved_by)

        # FLOW-3: Flush and capture result before session closes
        session.flush()
        result = {"id": row.id, "question": row.question, "corrected_answer": row.corrected_answer}

    # FLOW-4: Invalidate cache so correction takes effect immediately
    _invalidate_corrections_cache()
    return result
# =========== FUNCTION ===========
