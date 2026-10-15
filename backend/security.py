"""Authentication/session helpers. Tokens are opaque and stored hashed at rest."""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request

import medatabase as db
from tenant_context import Principal

SESSION_COOKIE = "medease_session"
SESSION_TTL_HOURS = 12


def issue_session(user: dict, role: str) -> str:
    token = secrets.token_urlsafe(48)
    clinic_id = user.get("clinic_id")
    patient_id = user.get("id") if role == "patient" else None
    doctor_id = user.get("id") if role == "doctor" else None
    db.create_auth_session(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        user_id=int(user["id"]), role=role, clinic_id=clinic_id,
        patient_id=patient_id, doctor_id=doctor_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    )
    return token


def revoke_session(token: str) -> None:
    db.revoke_auth_session(hashlib.sha256(token.encode()).hexdigest())


def principal_for_request(request: Request) -> Optional[Principal]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or len(token) > 256:
        return None
    record = db.get_auth_session(hashlib.sha256(token.encode()).hexdigest())
    if not record:
        return None
    return Principal(
        user_id=record["user_id"], role=record["role"],
        clinic_id=record.get("clinic_id"), patient_id=record.get("patient_id"),
        doctor_id=record.get("doctor_id"),
    )


def require_principal(request: Request) -> Principal:
    principal = getattr(request.state, "principal", None)
    if principal is None:
        raise HTTPException(status_code=401, detail="Sign-in required")
    return principal


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_TTL_HOURS * 3600,
        httponly=True, secure=os.getenv("COOKIE_SECURE", "true" if os.getenv("ENVIRONMENT") == "production" else "false").lower() == "true",
        samesite="lax", path="/",
    )
