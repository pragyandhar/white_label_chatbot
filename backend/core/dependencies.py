# WHAT DOES THIS FILE DO: Dependency injection for FastAPI routes

# ================== IMPORTS ==================
import secrets

from fastapi import HTTPException, Request

from core.rag_service import RAGService
from core.middleware import RateLimiter
from config import ADMIN_API_SECRET
# ================== IMPORTS ==================

# Global service instance (initialized in main.py)
_service_instance = None
_rate_limiter_instance = None


def set_service(service: RAGService):
    global _service_instance
    _service_instance = service


def set_rate_limiter(rate_limiter: RateLimiter):
    global _rate_limiter_instance
    _rate_limiter_instance = rate_limiter


def get_service() -> RAGService:
    return _service_instance


def get_rate_limiter() -> RateLimiter:
    return _rate_limiter_instance


# ROLE: Guard every /api/admin/* route behind a shared secret so the admin API isn't wide open
def verify_admin_secret(request: Request) -> None:
    ''' Raise 401/503 unless X-Admin-Secret header matches ADMIN_API_SECRET '''

    # FLOW-1: Fail closed if no secret is configured — never leave admin routes open by accident
    if not ADMIN_API_SECRET:
        raise HTTPException(status_code=503, detail="Admin API is not configured")

    # FLOW-2: Compare header against the configured secret in constant time to avoid timing attacks
    provided = request.headers.get("X-Admin-Secret", "")
    if not secrets.compare_digest(provided, ADMIN_API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid or missing admin credentials")
