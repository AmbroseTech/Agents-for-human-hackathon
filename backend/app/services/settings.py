import copy

from sqlalchemy.orm import Session

from app.db.models import Setting
from app.domain import DEFAULT_SETTINGS


def get_all_settings(db: Session) -> dict:
    merged = copy.deepcopy(DEFAULT_SETTINGS)
    for row in db.query(Setting).all():
        if isinstance(row.value, dict) and isinstance(merged.get(row.key), dict):
            merged[row.key] = {**merged[row.key], **row.value}
        else:
            merged[row.key] = row.value
    return merged


def get_setting(db: Session, key: str) -> dict:
    return get_all_settings(db)[key]


def update_setting(db: Session, key: str, value: dict) -> dict:
    if key not in DEFAULT_SETTINGS:
        raise KeyError(f"Unknown setting '{key}'")
    row = db.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=value)
        db.add(row)
    else:
        row.value = {**(row.value or {}), **value}
    db.flush()
    return get_setting(db, key)
