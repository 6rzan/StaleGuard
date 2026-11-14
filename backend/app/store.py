"""SQLite persistence: one row per check holding the Check JSON."""

import sqlite3
from contextlib import closing
from pathlib import Path

from .models import Check


def init(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, created_at TEXT, data TEXT)"
        )


def save(path: Path, check: Check) -> None:
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute(
            "INSERT INTO checks (id, created_at, data) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            (check.id, check.created_at, check.model_dump_json()),
        )


def get(path: Path, check_id: str) -> Check | None:
    with closing(sqlite3.connect(path)) as conn:
        row = conn.execute("SELECT data FROM checks WHERE id = ?", (check_id,)).fetchone()
    return Check.model_validate_json(row[0]) if row else None


def list_recent(path: Path, limit: int) -> list[Check]:
    with closing(sqlite3.connect(path)) as conn:
        rows = conn.execute(
            "SELECT data FROM checks ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)
        ).fetchall()
    return [Check.model_validate_json(r[0]) for r in rows]
