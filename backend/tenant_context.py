"""Request scoped identity used by database row-level security."""

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Principal:
    user_id: int
    role: str
    clinic_id: Optional[int] = None
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None


_principal: ContextVar[Optional[Principal]] = ContextVar("medease_principal", default=None)


def current_principal() -> Optional[Principal]:
    return _principal.get()


def set_principal(principal: Optional[Principal]):
    return _principal.set(principal)


def reset_principal(token) -> None:
    _principal.reset(token)
