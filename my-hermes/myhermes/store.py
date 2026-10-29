"""エージェントの「記憶」をつかさどる部分。

- Memory  : MEMORY.md / USER.md に短いメモを残す（毎セッションの最初に読み込む）
- Skills  : skills/<名前>/SKILL.md に手順書を残す（必要なときだけ中身を読む）
- Sessions: 過去の会話を SQLite に保存して全文検索できるようにする
"""

from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path


ENTRY_SEP = "\n§\n"  # メモの1項目ごとの区切り


# ---------------------------------------------------------------- Memory

class Memory:
    def __init__(self, path: Path, limit: int):
        self.path = path
        self.limit = limit

    def entries(self) -> list[str]:
        if not self.path.exists():
            return []
        text = self.path.read_text(encoding="utf-8").strip()
        return [e.strip() for e in text.split(ENTRY_SEP) if e.strip()] if text else []

    def render(self) -> str:
        return ENTRY_SEP.join(self.entries())

    def _save(self, entries: list[str]) -> str | None:
        text = ENTRY_SEP.join(entries)
        if len(text) > self.limit:
            return (f"上限 {self.limit} 文字を超えます（現在 {len(text)} 文字）。"
                    "古い項目を remove するか、replace でまとめてから追加してください。")
        self.path.write_text(text + "\n", encoding="utf-8")
        return None

    def add(self, content: str) -> str:
        content = content.strip()
        if not content:
            return "エラー: content が空です"
        entries = self.entries()
        if content in entries:
            return "すでに同じ内容があります"
        err = self._save(entries + [content])
        return f"エラー: {err}" if err else f"追加しました（{len(entries) + 1} 項目）"

    def replace(self, old_text: str, content: str) -> str:
        entries = self.entries()
        hits = [i for i, e in enumerate(entries) if old_text in e]
        if len(hits) != 1:
            return f"エラー: old_text に一致する項目が {len(hits)} 件です（ちょうど1件にしてください）"
        entries[hits[0]] = content.strip()
        err = self._save(entries)
        return f"エラー: {err}" if err else "置き換えました"

    def remove(self, old_text: str) -> str:
        entries = self.entries()
        hits = [i for i, e in enumerate(entries) if old_text in e]
        if len(hits) != 1:
            return f"エラー: old_text に一致する項目が {len(hits)} 件です（ちょうど1件にしてください）"
        del entries[hits[0]]
        self._save(entries)
        return "削除しました"


# ---------------------------------------------------------------- Skills

SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    meta: dict[str, str] = {}
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            for line in text[4:end].splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            return meta, text[end + 4:].lstrip("\n")
    return meta, text


class Skills:
    def __init__(self, root: Path):
        self.root = root

    def _file(self, name: str) -> Path:
        return self.root / name / "SKILL.md"

    def list(self) -> list[tuple[str, str]]:
        out = []
        for f in sorted(self.root.glob("*/SKILL.md")):
            meta, _ = _parse_frontmatter(f.read_text(encoding="utf-8"))
            out.append((f.parent.name, meta.get("description", "")))
        return out

    def index(self) -> str:
        items = self.list()
        return "\n".join(f"- {n}: {d}" for n, d in items) if items else "（まだスキルはありません）"

    def view(self, name: str) -> str:
        f = self._file(name)
        if not SKILL_NAME_RE.match(name) or not f.exists():
            return f"エラー: スキル '{name}' はありません"
        return f.read_text(encoding="utf-8")

    def create(self, name: str, description: str, content: str) -> str:
        if not SKILL_NAME_RE.match(name):
            return "エラー: name は英小文字・数字・ハイフンのみ（例: deploy-yatai）"
        f = self._file(name)
        if f.exists():
            return f"エラー: '{name}' はすでにあります。edit を使ってください"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f"---\nname: {name}\ndescription: {description.strip()}\n---\n\n{content.strip()}\n",
                     encoding="utf-8")
        return f"スキル '{name}' を作成しました"

    def edit(self, name: str, description: str | None, content: str) -> str:
        f = self._file(name)
        if not SKILL_NAME_RE.match(name) or not f.exists():
            return f"エラー: スキル '{name}' はありません"
        meta, _ = _parse_frontmatter(f.read_text(encoding="utf-8"))
        desc = (description or meta.get("description", "")).strip()
        f.write_text(f"---\nname: {name}\ndescription: {desc}\n---\n\n{content.strip()}\n", encoding="utf-8")
        return f"スキル '{name}' を更新しました"

    def delete(self, name: str) -> str:
        f = self._file(name)
        if not SKILL_NAME_RE.match(name) or not f.exists():
            return f"エラー: スキル '{name}' はありません"
        f.unlink()
        if not any(f.parent.iterdir()):
            f.parent.rmdir()
        return f"スキル '{name}' を削除しました"


# ---------------------------------------------------------------- Sessions

class SessionDB:
    """会話ログ。検索用に trigram 全文検索（日本語でも部分一致できる）を使う。"""

    def __init__(self, path: Path):
        self.conn = sqlite3.connect(path)
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at REAL NOT NULL,
                title TEXT,
                messages_json TEXT
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                session_id UNINDEXED, role UNINDEXED, created_at UNINDEXED, content,
                tokenize = 'trigram'
            );
        """)

    def new_session(self) -> int:
        cur = self.conn.execute("INSERT INTO sessions (started_at) VALUES (?)", (time.time(),))
        self.conn.commit()
        return cur.lastrowid

    def last_session(self) -> tuple[int, list] | None:
        row = self.conn.execute(
            "SELECT id, messages_json FROM sessions WHERE messages_json IS NOT NULL ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return (row[0], json.loads(row[1])) if row else None

    def log(self, session_id: int, role: str, text: str) -> None:
        if not text.strip():
            return
        self.conn.execute(
            "INSERT INTO messages_fts (session_id, role, created_at, content) VALUES (?, ?, ?, ?)",
            (session_id, role, time.time(), text),
        )
        if role == "user":
            self.conn.execute("UPDATE sessions SET title = ? WHERE id = ? AND title IS NULL",
                              (text[:60], session_id))
        self.conn.commit()

    def save_messages(self, session_id: int, messages: list) -> None:
        self.conn.execute("UPDATE sessions SET messages_json = ? WHERE id = ?",
                          (json.dumps(messages, ensure_ascii=False), session_id))
        self.conn.commit()

    def search(self, query: str, limit: int = 8, exclude_session: int | None = None) -> str:
        terms = [t for t in query.split() if t]
        if not terms:
            return "エラー: query が空です"
        exclude = exclude_session if exclude_session is not None else -1
        # trigram は3文字以上の語でしか MATCH できないので、短い語は LIKE で探す
        if all(len(t) >= 3 for t in terms):
            match = " AND ".join('"' + t.replace('"', '""') + '"' for t in terms)
            rows = self.conn.execute(
                "SELECT session_id, role, created_at, snippet(messages_fts, 3, '【', '】', '…', 24) "
                "FROM messages_fts WHERE messages_fts MATCH ? AND session_id != ? "
                "ORDER BY rank LIMIT ?", (match, exclude, limit)).fetchall()
        else:
            where = " AND ".join("content LIKE ?" for _ in terms)
            rows = self.conn.execute(
                f"SELECT session_id, role, created_at, substr(content, 1, 200) FROM messages_fts "
                f"WHERE {where} AND session_id != ? ORDER BY created_at DESC LIMIT ?",
                (*[f"%{t}%" for t in terms], exclude, limit)).fetchall()
        if not rows:
            return "見つかりませんでした"
        lines = []
        for sid, role, ts, text in rows:
            day = time.strftime("%Y-%m-%d %H:%M", time.localtime(float(ts)))
            lines.append(f"[session {sid} / {day} / {role}] {text}")
        return "\n".join(lines)
