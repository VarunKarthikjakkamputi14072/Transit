"""Analytics router for Transit."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RequestLog

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/usage")
def get_usage(
    period: str = Query("24h", pattern="^(24h|7d|30d)$"),
    db: Session = Depends(get_db)
):
    now = datetime.utcnow()
    if period == "24h":
        start_time = now - timedelta(hours=24)
    elif period == "7d":
        start_time = now - timedelta(days=7)
    else:
        start_time = now - timedelta(days=30)

    # 1. Total requests
    today_start = now - timedelta(hours=24)
    week_start = now - timedelta(days=7)
    
    today_reqs = db.scalar(select(func.count(RequestLog.id)).where(RequestLog.timestamp >= today_start)) or 0
    week_reqs = db.scalar(select(func.count(RequestLog.id)).where(RequestLog.timestamp >= week_start)) or 0

    # 2. Hourly requests
    hourly_query = (
        select(
            func.date_trunc('hour', RequestLog.timestamp).label('hour'),
            func.count(RequestLog.id).label('count')
        )
        .where(RequestLog.timestamp >= start_time)
        .group_by('hour')
        .order_by('hour')
    )
    hourly_results = db.execute(hourly_query).all()
    hourly_data = [{"hour": row.hour.strftime("%H:%M") if period == "24h" else row.hour.strftime("%m-%d %H:%M"), "requests": row.count} for row in hourly_results]

    # 3. Requests by endpoint
    endpoint_query = (
        select(
            RequestLog.endpoint,
            func.count(RequestLog.id).label('count')
        )
        .where(RequestLog.timestamp >= start_time)
        .group_by(RequestLog.endpoint)
    )
    endpoint_results = db.execute(endpoint_query).all()
    by_endpoint = [{"endpoint": row.endpoint, "requests": row.count} for row in endpoint_results]

    # 4. Recent logs
    recent_query = (
        select(RequestLog)
        .order_by(desc(RequestLog.timestamp))
        .limit(100)
    )
    recent_logs = db.execute(recent_query).scalars().all()
    recent = [{
        "timestamp": log.timestamp.isoformat(),
        "endpoint": log.endpoint,
        "status": log.status_code,
        "latency_ms": log.response_time_ms
    } for log in recent_logs]

    return {
        "today": today_reqs,
        "week": week_reqs,
        "hourly": hourly_data,
        "by_endpoint": by_endpoint,
        "recent": recent
    }
