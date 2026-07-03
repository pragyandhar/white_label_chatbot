# WHAT DOES THIS FILE DO: Analytics endpoints that power the admin dashboard charts and KPI cards

# ================== IMPORTS ==================
from fastapi import APIRouter, Query

from analytics_db import get_dashboard_metrics, get_chat_volume_by_day, get_top_questions, get_quality_metrics, get_recent_chats
# ================== IMPORTS ==================


router = APIRouter()


# =========== FUNCTION ===========
# ROLE: Return high-level KPI metrics for the main dashboard header cards
@router.get("/analytics/metrics")
@router.get("/analytics/summary")
def dashboard_metrics(
    period: str = Query(default="today"),
    date_from: str = Query(default=None, alias="from"),
    date_to: str = Query(default=None, alias="to"),
):
    ''' Return chat, session, and engagement KPIs for the requested period '''
    return get_dashboard_metrics(period=period, date_from=date_from, date_to=date_to)
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return daily chat volume data for a line chart
@router.get("/analytics/chat-volume")
def chat_volume(days: int = Query(default=30, ge=1, le=90)):
    ''' Return list of {date, count} for each day in last N days '''
    return {"items": get_chat_volume_by_day(days=days)}
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return the most frequently asked questions
@router.get("/analytics/top-questions")
def top_questions(limit: int = Query(default=10, ge=1, le=50)):
    ''' Return top N questions by frequency '''
    return {"items": get_top_questions(limit=limit)}
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return quality and moderation metrics for the review panel
@router.get("/analytics/quality")
def quality_metrics():
    ''' Return flagged counts, pending reviews, and route breakdown '''
    return get_quality_metrics()
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return recent chat logs for the All Chats view in the admin Visitor Sessions tab
@router.get("/analytics/chats")
def recent_chats(limit: int = Query(default=300, ge=1, le=1000)):
    ''' Return most recent chat log entries ordered newest first '''
    return get_recent_chats(limit=limit)
# =========== FUNCTION ===========
