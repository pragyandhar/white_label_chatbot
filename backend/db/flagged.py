# WHAT DOES THIS FILE DO: flagged response lifecycle — create, list, approve, and reject

# ================== IMPORTS ==================
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import select

from .connection import session_scope, normalize_query
from .models import FlaggedResponse, Correction
from .audit import log_audit_action
from .corrections import _invalidate_corrections_cache
# ================== IMPORTS ==================


# =========== FUNCTION ===========
# ROLE: Save a new flagged response from tester feedback
def create_flagged_response(
    question: str,
    chatbot_answer: str,
    tester_answer_raw: str,
    tester_verdict: str = "wrong",
    tester_note: str = "",
    tester_id: str = "",
    chat_id: str = "",
) -> Dict[str, Any]:
    ''' Insert flagged response and return its ID and pending status '''

    # FLOW-1: Normalize the question so it can be matched later
    q_norm = normalize_query(question)

    # FLOW-2: Insert record in pending state
    with session_scope() as session:
        row = FlaggedResponse(
            question=question, question_norm=q_norm,
            chatbot_answer=chatbot_answer, tester_verdict=tester_verdict,
            tester_answer_raw=tester_answer_raw, tester_note=tester_note,
            tester_id=tester_id, chat_id=chat_id, status="pending",
        )
        session.add(row)

        # FLOW-3: Flush to get ID before session closes
        session.flush()
        return {"id": row.id, "status": "pending"}
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: List flagged responses, optionally filtered by status
def list_flagged_responses(status: str = "pending", limit: int = 50) -> List[Dict[str, Any]]:
    ''' Return flagged responses ordered newest first, filtered by status if given '''

    # FLOW-1: Build base query ordered by creation time
    with session_scope() as session:
        query = select(FlaggedResponse).order_by(FlaggedResponse.created_at.desc())

        # FLOW-2: Apply status filter only if a value was provided
        if status:
            query = query.where(FlaggedResponse.status == status)

        # FLOW-3: Execute and return as dicts
        rows = session.execute(query.limit(limit)).scalars().all()
        return [
            {"id": r.id, "question": r.question, "chatbot_answer": r.chatbot_answer,
             "tester_answer_raw": r.tester_answer_raw, "tester_note": r.tester_note,
             "tester_id": r.tester_id, "status": r.status}
            for r in rows
        ]
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Approve a flagged response and create a correction from it
def approve_flagged_response(flagged_id: int, reviewed_by: str = "admin", improved_answer: str = "") -> Dict[str, Any]:
    ''' Mark as approved, create linked correction, log action, invalidate cache '''

    # FLOW-1: Load the flagged response
    with session_scope() as session:
        row = session.get(FlaggedResponse, flagged_id)
        if not row:
            return {"error": "Not found"}

        # FLOW-2: Mark as approved with reviewer info
        row.status = "approved"
        row.reviewed_by = reviewed_by
        row.reviewed_at = datetime.now(timezone.utc)

        # FLOW-3: Store improved answer if admin provided one
        if improved_answer:
            row.tester_answer_improved = improved_answer

        # FLOW-4: Pick improved answer if available, else use tester's answer
        final_answer = improved_answer or row.tester_answer_raw

        # FLOW-5: Create a linked correction from this flagged response
        correction = Correction(
            question=row.question, question_norm=row.question_norm,
            corrected_answer=final_answer, approved_by=reviewed_by,
            source_flagged_id=flagged_id, is_active=True,
        )
        session.add(correction)
        log_audit_action(session, "flagged_approved", f"Flagged #{flagged_id}: {row.question[:80]}", admin_id=reviewed_by)

        # FLOW-6: Flush and collect result before session closes
        session.flush()
        result = {"id": row.id, "status": "approved", "correction_id": correction.id}

    # FLOW-7: Invalidate corrections cache so the new correction is picked up
    _invalidate_corrections_cache()
    return result
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Reject a flagged response without creating a correction
def reject_flagged_response(flagged_id: int, reviewed_by: str = "admin") -> Dict[str, Any]:
    ''' Mark flagged response as rejected and log to audit trail '''

    # FLOW-1: Load flagged response
    with session_scope() as session:
        row = session.get(FlaggedResponse, flagged_id)
        if not row:
            return {"error": "Not found"}

        # FLOW-2: Mark rejected with reviewer info
        row.status = "rejected"
        row.reviewed_by = reviewed_by
        row.reviewed_at = datetime.now(timezone.utc)
        log_audit_action(session, "flagged_rejected", f"Flagged #{flagged_id}: {row.question[:80]}", admin_id=reviewed_by)

        return {"id": row.id, "status": "rejected"}
# =========== FUNCTION ===========
