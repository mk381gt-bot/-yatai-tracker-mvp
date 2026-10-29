"""Claude Code の過去の会話ログ（~/.claude/projects/*/*.jsonl）をキーワードで探す。

使い方: python3 search.py キーワード1 [キーワード2 ...] [--limit 10]
すべてのキーワードを含む発言を、新しい順に表示する（大文字小文字は区別しない）。
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

PROJECTS = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "projects"


def message_text(entry: dict) -> str:
    content = entry.get("message", {}).get("content", "")
    if isinstance(content, str):
        return content
    return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")


def search(terms: list[str], limit: int, current_session: str | None = None) -> list[dict]:
    terms = [t.lower() for t in terms]
    hits = []
    for log in PROJECTS.glob("*/*.jsonl"):
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") not in ("user", "assistant") or entry.get("isMeta"):
                continue
            if current_session and entry.get("sessionId") == current_session:
                continue
            text = message_text(entry).strip()
            # コマンドやシステムが差し込んだ文（< で始まる）は会話ではないので除く
            if not text or text.startswith("<"):
                continue
            low = text.lower()
            if all(t in low for t in terms):
                pos = low.find(terms[0])
                start = max(pos - 80, 0)
                snippet = ("…" if start else "") + text[start:start + 240].replace("\n", " ")
                hits.append({"time": entry.get("timestamp", ""), "role": entry["type"],
                             "folder": entry.get("cwd", log.parent.name), "text": snippet})
    hits.sort(key=lambda h: h["time"], reverse=True)
    return hits[:limit]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("terms", nargs="+")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    hits = search(args.terms, args.limit, os.environ.get("CLAUDE_SESSION_ID"))
    if not hits:
        print("見つかりませんでした。言い換えや、短いキーワードで試してください。")
        return
    for h in hits:
        print(f"[{h['time'][:16].replace('T', ' ')} / {h['role']} / {h['folder']}]\n  {h['text']}\n")


if __name__ == "__main__":
    main()
