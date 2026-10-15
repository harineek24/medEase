"""Server-side Credence Cloud SDK integration and short-lived login flows."""
import json
import os
import secrets
import threading
import time
import unicodedata
from datetime import date, datetime

import requests

BASE_URL = os.getenv("CREDENCE_API_BASE", "https://credenceid.com/cloudsdk/playground").rstrip("/")
LICENSE_KEY = os.getenv("CREDENCE_LICENSE_KEY", "")
PROFILE_ID = os.getenv("CREDENCE_PROFILE_ID", "")
ORIGIN = os.getenv("FRONTEND_URL", "").rstrip("/")

_lock = threading.Lock()
_tokens = {"access": None, "refresh": None, "expires": 0}
_flows = {}


class CredenceError(Exception):
    pass


def configured():
    return bool(LICENSE_KEY and PROFILE_ID and ORIGIN.startswith("https://")) or (
        bool(LICENSE_KEY and PROFILE_ID and ORIGIN.startswith("http://localhost"))
    )


def _request_token():
    if not (LICENSE_KEY and PROFILE_ID and ORIGIN):
        raise CredenceError("Credence login is not configured. Contact your clinic administrator.")
    headers = {"Content-Type": "application/json"}
    if _tokens["refresh"] and _tokens["expires"] > 0:
        response = requests.post(f"{BASE_URL}/v1/refresh", json={"refreshToken": _tokens["refresh"]}, headers=headers, timeout=10)
        if response.status_code == 401:
            _tokens.update(access=None, refresh=None, expires=0)
        else:
            response.raise_for_status()
            body = response.json()
            _tokens.update(access=body["accessToken"], refresh=body["refreshToken"], expires=time.time() + body.get("expiresIn", 900))
            return
    response = requests.post(
        f"{BASE_URL}/v1/setup", json={"licenseKey": LICENSE_KEY, "profileId": PROFILE_ID},
        headers={**headers, "Origin": ORIGIN}, timeout=10,
    )
    response.raise_for_status()
    body = response.json()
    _tokens.update(access=body["accessToken"], refresh=body["refreshToken"], expires=time.time() + body.get("expiresIn", 900))


def _token():
    with _lock:
        if not _tokens["access"] or _tokens["expires"] < time.time() + 60:
            _request_token()
        return _tokens["access"]


def _cloud_post(path, payload=None):
    response = requests.post(
        f"{BASE_URL}{path}", json=payload or {},
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}, timeout=15,
    )
    if response.status_code not in (200, 202):
        response.raise_for_status()
    return response


def start_flow(role, user):
    response = _cloud_post("/openid4vp/v1/mdoc/initiate")
    body = response.json()
    if not body.get("sessionId") or not body.get("walletUri"):
        raise CredenceError("Credence returned an incomplete verification request.")
    flow_token = secrets.token_urlsafe(32)
    _flows[flow_token] = {
        "role": role, "user": user, "session_id": body["sessionId"],
        "expires": time.time() + 300, "used": False,
    }
    return {"flow_token": flow_token, "wallet_uri": body["walletUri"]}


def _norm(value):
    if value is None:
        return ""
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def _date(value):
    if not value:
        return ""
    try:
        return (value if isinstance(value, date) else date.fromisoformat(str(value)[:10])).isoformat()
    except (ValueError, TypeError):
        return ""


def identity_matches(role, user, identity):
    """Require independent name + DOB match; never enroll an account from a credential alone."""
    if isinstance(identity, str):
        identity = json.loads(identity)
    given = identity.get("given_name") or identity.get("givenName") or identity.get("first_name")
    family = identity.get("family_name") or identity.get("familyName") or identity.get("last_name")
    birth = identity.get("birth_date") or identity.get("birthDate") or identity.get("date_of_birth")
    if role == "patient":
        name = (user.get("name") or "").strip().split()
        expected_given = user.get("first_name") or (name[0] if name else "")
        expected_family = user.get("last_name") or (" ".join(name[1:]) if len(name) > 1 else "")
    else:
        expected_given, expected_family = user.get("first_name"), user.get("last_name")
    return bool(
        _norm(given) and _norm(family) and _norm(expected_given) and _norm(expected_family)
        and _norm(given) == _norm(expected_given) and _norm(family) == _norm(expected_family)
        and _date(birth) and _date(user.get("date_of_birth")) == _date(birth)
    )


def poll_flow(flow_token):
    flow = _flows.get(flow_token)
    if not flow or flow["used"] or flow["expires"] < time.time():
        _flows.pop(flow_token, None)
        return {"status": "expired"}
    try:
        response = _cloud_post("/openid4vp/v1/mdoc/result", {"sessionId": flow["session_id"]})
    except requests.RequestException as exc:
        raise CredenceError("Credence verification service is temporarily unavailable.") from exc
    if response.status_code == 202:
        return {"status": "pending"}
    result = response.json()
    flow["used"] = True
    _flows.pop(flow_token, None)
    if not result.get("success") or not identity_matches(flow["role"], flow["user"], result.get("identity")):
        return {"status": "failed", "detail": "The verified identity does not match this MedEase account."}
    return {"status": "verified", "role": flow["role"], "user": flow["user"]}
