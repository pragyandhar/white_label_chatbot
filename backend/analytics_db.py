# WHAT DOES THIS FILE DO: ChatLog model and analytics query functions for the admin dashboard

# ================== IMPORTS ==================
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, func, select, text
from sqlalchemy.orm import Mapped, mapped_column

from workflow_db import Base, session_scope, UploadDocument, UploadChunk, FlaggedResponse
# ================== IMPORTS ==================


# =========== VARIABLES : logging ===========
logger = logging.getLogger("analytics_db")
# =========== VARIABLES : logging ===========


# =========== ORM MODEL ===========

class ChatLog(Base):
    __tablename__ = "chat_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    route: Mapped[str] = mapped_column(String(24), nullable=False, default="rag", index=True)
    sources_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    response_time_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    department_slug: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)

    # accountability columns — populated by the chat pipeline for CSV exports
    blocked_word_matched: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    correction_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

# =========== ORM MODEL ===========


# =========== FUNCTION ===========
# ROLE: Write one chat interaction to the log table
def log_chat(
    question: str,
    answer: str = "",
    route: str = "rag",
    sources_count: int = 0,
    response_time_ms: float = 0.0,
    session_id: Optional[str] = None,
    department_slug: Optional[str] = None,
    blocked_word_matched: Optional[str] = None,
    correction_id: Optional[int] = None,
) -> None:
    ''' Insert a chat log row, silently skip if anything goes wrong '''

    # FLOW-1: Wrap in try/except so a logging failure never blocks the chat response
    try:
        with session_scope() as session:
            row = ChatLog(
                question=question[:1000],
                answer=(answer or "")[:2000],
                route=route,
                sources_count=sources_count,
                response_time_ms=response_time_ms,
                session_id=session_id,
                department_slug=department_slug,
                blocked_word_matched=blocked_word_matched,
                correction_id=correction_id,
            )
            session.add(row)

    except Exception as exc:
        logger.warning(f"chat log write failed: {exc}")
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Pull high-level KPI counts for the main dashboard cards, scoped to the requested period
def get_dashboard_metrics(period: str = "today", date_from: Optional[str] = None, date_to: Optional[str] = None) -> Dict[str, Any]:
    ''' Return chat, session, and engagement metrics for the given period '''

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # FLOW-1: Resolve period window
    if period == "week":
        period_start = today_start - timedelta(days=6)
        label = "This Week"
        trend_days = 7
    elif period == "month":
        period_start = today_start - timedelta(days=29)
        label = "This Month"
        trend_days = 30
    elif period == "custom" and date_from:
        try:
            period_start = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
            label = f"{date_from} – {date_to or 'now'}"
            trend_days = max(1, (now - period_start).days + 1)
        except Exception:
            period_start = today_start
            label = "Today"
            trend_days = 1
    else:
        period_start = today_start
        label = "Today"
        trend_days = 1

    active_5min = now - timedelta(minutes=5)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)

    # FLOW-2: Query all metrics in one session
    with session_scope() as session:
        # ── Chat counts for period ───────────────────────────────────────────
        queries_period = session.scalar(
            select(func.count(ChatLog.id)).where(ChatLog.created_at >= period_start)
        ) or 0

        cache_period = session.scalar(
            select(func.count(ChatLog.id)).where(
                ChatLog.created_at >= period_start, ChatLog.route == "cache"
            )
        ) or 0

        blocked_period = session.scalar(
            select(func.count(ChatLog.id)).where(
                ChatLog.created_at >= period_start, ChatLog.route == "blocked"
            )
        ) or 0

        correction_period = session.scalar(
            select(func.count(ChatLog.id)).where(
                ChatLog.created_at >= period_start, ChatLog.route == "correction"
            )
        ) or 0

        avg_latency = float(session.scalar(
            select(func.avg(ChatLog.response_time_ms)).where(ChatLog.created_at >= period_start)
        ) or 0.0)

        # ── Session counts via raw SQL (avoids circular import with sessions_db) ──
        sessions_period = session.execute(
            text("SELECT COUNT(*) FROM visitor_sessions WHERE started_at >= :s"),
            {"s": period_start}
        ).scalar() or 0

        active_now = session.execute(
            text("SELECT COUNT(*) FROM visitor_sessions WHERE last_seen_at >= :s"),
            {"s": active_5min}
        ).scalar() or 0

        dau = session.execute(
            text("SELECT COUNT(*) FROM visitor_sessions WHERE last_seen_at >= :s"),
            {"s": last_24h}
        ).scalar() or 0

        wau = session.execute(
            text("SELECT COUNT(*) FROM visitor_sessions WHERE last_seen_at >= :s"),
            {"s": last_7d}
        ).scalar() or 0

        mau = session.execute(
            text("SELECT COUNT(*) FROM visitor_sessions WHERE last_seen_at >= :s"),
            {"s": last_30d}
        ).scalar() or 0

        # ── Docs and chunks ──────────────────────────────────────────────────
        docs_count = session.scalar(
            select(func.count(UploadDocument.id)).where(UploadDocument.is_active.is_(True))
        ) or 0
        chunks_count = session.scalar(
            select(func.count(UploadChunk.id)).where(UploadChunk.is_active.is_(True))
        ) or 0

        # ── Trend data: daily buckets ────────────────────────────────────────
        trend_rows = session.execute(
            text("""
                SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS bucket, COUNT(*) AS cnt
                FROM chat_logs
                WHERE created_at >= :s
                GROUP BY bucket ORDER BY bucket
            """),
            {"s": period_start}
        ).all()
        counts_map = {}
        for r in trend_rows:
            day_key = r.bucket.date().isoformat() if hasattr(r.bucket, 'date') else str(r.bucket)[:10]
            counts_map[day_key] = int(r.cnt)

        trend_data = []
        for i in range(max(trend_days, 1)):
            d = (period_start + timedelta(days=i)).date()
            trend_data.append({"label": d.isoformat(), "queries": counts_map.get(d.isoformat(), 0)})

    # FLOW-3: Derived metrics
    cache_hit_rate = round(cache_period / queries_period * 100, 1) if queries_period > 0 else 0.0
    blocked_rate = round(blocked_period / queries_period * 100, 1) if queries_period > 0 else 0.0
    correction_rate = round(correction_period / queries_period * 100, 1) if queries_period > 0 else 0.0
    avg_queries_per_user = round(queries_period / sessions_period, 1) if sessions_period > 0 else 0.0

    return {
        "period_label": label,
        # ── Fields expected by OverviewTab ───────────────────────────────────
        "queries_today": queries_period,
        "sessions_today": sessions_period,
        "active_users_now": active_now,
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "avg_queries_per_user": avg_queries_per_user,
        "cache_hit_rate_today": cache_hit_rate,
        "avg_latency_ms_today": round(avg_latency, 1),
        "feedback_today": {"up": 0, "down": 0, "total": 0},
        "high_intent_users": 0,
        "biz_metrics": {"apply_clicks": 0, "brochure_downloads": 0, "call_clicks": 0},
        "trend_data": trend_data,
        # ── Legacy field names kept for backward compat ──────────────────────
        "total_chats": queries_period,
        "chats_today": queries_period,
        "chats_this_week": queries_period if period == "week" else 0,
        "avg_response_ms": round(avg_latency, 1),
        "blocked_count": blocked_period,
        "blocked_rate": blocked_rate,
        "correction_count": correction_period,
        "correction_rate": correction_rate,
        "documents_count": docs_count,
        "chunks_count": chunks_count,
    }
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return daily chat counts for the last N days for a line chart
def get_chat_volume_by_day(days: int = 30) -> List[Dict[str, Any]]:
    ''' Return list of {date, count} for each day in range, zeroing out empty days '''

    # FLOW-1: Calculate the start of the date range
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    # FLOW-2: Query daily counts grouped by truncated date — PostgreSQL specific
    with session_scope() as session:
        rows = session.execute(
            select(
                func.date_trunc("day", ChatLog.created_at).label("day"),
                func.count(ChatLog.id).label("count"),
            )
            .where(ChatLog.created_at >= start_date)
            .group_by(func.date_trunc("day", ChatLog.created_at))
            .order_by(func.date_trunc("day", ChatLog.created_at))
        ).all()

    # FLOW-3: Build lookup dict so we can fill in missing days with zero
    counts_by_day = {row.day.date().isoformat(): row.count for row in rows}

    # FLOW-4: Generate full date range and merge with actual counts
    result = []
    for i in range(days):
        day = (start_date + timedelta(days=i)).date().isoformat()
        result.append({"date": day, "count": counts_by_day.get(day, 0)})

    return result
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return the most frequently asked questions
def get_top_questions(limit: int = 10) -> List[Dict[str, Any]]:
    ''' Return top N questions by frequency, skipping blocked ones '''

    # FLOW-1: Group by question text, exclude blocked route, sort by count
    with session_scope() as session:
        rows = session.execute(
            select(ChatLog.question, func.count(ChatLog.id).label("count"))
            .where(ChatLog.route != "blocked")
            .group_by(ChatLog.question)
            .order_by(func.count(ChatLog.id).desc())
            .limit(limit)
        ).all()

    # FLOW-2: Return as simple list of dicts
    return [{"question": row.question, "count": row.count} for row in rows]
# =========== FUNCTION ===========


# =========== FUNCTION ===========
# ROLE: Return response quality and moderation metrics
def get_quality_metrics() -> Dict[str, Any]:
    ''' Return flagged counts and route breakdown for the review panel '''

    # FLOW-1: Query flagged response table counts
    with session_scope() as session:
        flagged_total = session.scalar(select(func.count(FlaggedResponse.id))) or 0
        flagged_pending = session.scalar(
            select(func.count(FlaggedResponse.id)).where(FlaggedResponse.status == "pending")
        ) or 0

        # FLOW-2: Break down chat log routes to see how traffic is being handled
        rag_count = session.scalar(select(func.count(ChatLog.id)).where(ChatLog.route == "rag")) or 0
        correction_count = session.scalar(select(func.count(ChatLog.id)).where(ChatLog.route == "correction")) or 0
        blocked_count = session.scalar(select(func.count(ChatLog.id)).where(ChatLog.route == "blocked")) or 0

    return {
        "flagged_total": flagged_total,
        "flagged_pending": flagged_pending,
        "route_breakdown": {
            "rag": rag_count,
            "correction": correction_count,
            "blocked": blocked_count,
        },
    }
# =========== FUNCTION ===========
