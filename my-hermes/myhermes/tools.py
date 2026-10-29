"""エージェントが使える道具（ツール）の定義と実行。

ツールを増やしたいときは TOOLS にスキーマを足して、Toolbox に同名のメソッドを書くだけ。
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Callable

from .store import Memory, SessionDB, Skills


def _tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {
        "name": name,
        "description": description,
        # ストリーミング中に大きな入力（ファイル本文など）を待たずに受け取る。
        # その代わりAPI側の検証がなくなるので、validate() で自前チェックする。
        "eager_input_streaming": True,
        "input_schema": {"type": "object", "properties": properties, "required": required},
    }


TOOLS: list[dict] = [
    _tool("terminal",
          "シェルコマンドを実行して標準出力・標準エラーを返す。ファイル操作、git、パッケージ導入、"
          "スクリプト実行など何でも。危険なコマンドはユーザーの承認が必要。",
          {"command": {"type": "string", "description": "bash で実行するコマンド"},
           "timeout": {"type": "integer", "description": "秒（既定 120）"}},
          ["command"]),
    _tool("read_file",
          "テキストファイルを行番号付きで読む。",
          {"path": {"type": "string"},
           "offset": {"type": "integer", "description": "開始行（1始まり）"},
           "limit": {"type": "integer", "description": "読む行数（既定 500）"}},
          ["path"]),
    _tool("write_file",
          "テキストファイルを丸ごと書き込む（なければ作る、あれば上書き）。",
          {"path": {"type": "string"}, "content": {"type": "string"}},
          ["path", "content"]),
    _tool("memory",
          "長期メモを編集する。target=memory は自分用（環境の事実、うまくいったやり方、注意点）、"
          "target=user はユーザーについて（好み、呼び方、仕事内容）。次回以降のセッションで毎回読まれる。"
          "短く、事実だけを書く。その場限りの情報は書かない。",
          {"action": {"type": "string", "enum": ["add", "replace", "remove"]},
           "target": {"type": "string", "enum": ["memory", "user"]},
           "content": {"type": "string", "description": "add/replace で書く内容"},
           "old_text": {"type": "string", "description": "replace/remove で対象項目を特定する一部の文字列"}},
          ["action", "target"]),
    _tool("skill_list", "保存済みスキル（手順書）の一覧を返す。", {}, []),
    _tool("skill_view", "スキルの中身を読む。関係ありそうなスキルは作業前に必ず読む。",
          {"name": {"type": "string"}}, ["name"]),
    _tool("skill_manage",
          "スキルを作成・更新・削除する。何度も使えそうな手順、試行錯誤して分かったコツ、"
          "ユーザーが決めたやり方を、次回そのまま再現できる手順書として残す。",
          {"action": {"type": "string", "enum": ["create", "edit", "delete"]},
           "name": {"type": "string", "description": "英小文字とハイフン（例: deploy-yatai）"},
           "description": {"type": "string", "description": "いつ使うスキルかを1文で"},
           "content": {"type": "string", "description": "Markdown の手順書本文（create/edit）"}},
          ["action", "name"]),
    _tool("session_search",
          "過去のセッションの会話を全文検索する。『前に話した〜』『以前やった〜』のときに使う。",
          {"query": {"type": "string", "description": "空白区切りのキーワード"},
           "limit": {"type": "integer"}},
          ["query"]),
]

# Anthropic 側で動くツール（実装不要）
SERVER_TOOLS: list[dict] = [
    {"type": "web_search_20260209", "name": "web_search"},
    {"type": "web_fetch_20260209", "name": "web_fetch"},
]

_TYPES = {"string": str, "integer": int, "boolean": bool}


def validate(name: str, args: object) -> str | None:
    """入力がスキーマどおりかをざっくり確認する。問題があればエラー文を返す。"""
    schema = next((t["input_schema"] for t in TOOLS if t["name"] == name), None)
    if schema is None:
        return f"未知のツール: {name}"
    if not isinstance(args, dict):
        return "入力がオブジェクトではありません"
    for key in schema["required"]:
        if key not in args:
            return f"必須項目 {key} がありません"
    for key, value in args.items():
        prop = schema["properties"].get(key)
        if prop is None:
            return f"不明な項目 {key}"
        expected = _TYPES.get(prop["type"])
        if expected and (not isinstance(value, expected) or (expected is int and isinstance(value, bool))):
            return f"{key} の型が違います（{prop['type']} が必要）"
        if "enum" in prop and value not in prop["enum"]:
            return f"{key} は {prop['enum']} のどれかにしてください"
    return None


# 実行前に必ず確認するコマンドのパターン
DANGEROUS = re.compile(
    r"\brm\s+-[a-z]*[rf]|\bsudo\b|\bmkfs|\bdd\s+if=|>\s*/dev/sd|\bshutdown\b|\breboot\b|"
    r"\bchmod\s+-R\b|\bchown\s+-R\b|\bgit\s+push\b.*--force|\bgit\s+reset\s+--hard|:\(\)\s*\{"
)

MAX_OUTPUT = 20000


class Toolbox:
    def __init__(self, memory: Memory, user: Memory, skills: Skills, db: SessionDB,
                 session_id: int, approve: Callable[[str], bool], always_ask: bool):
        self.mem, self.user_mem, self.skills, self.db = memory, user, skills, db
        self.session_id = session_id
        self.approve = approve        # 危険な操作をユーザーに確認する関数
        self.always_ask = always_ask  # True なら全コマンドを確認する
        self.cwd = Path.cwd()

    def run(self, name: str, args: dict) -> tuple[str, bool]:
        """ツールを実行して (結果, エラーかどうか) を返す。"""
        err = validate(name, args)
        if err:
            return f"入力エラー: {err}", True
        try:
            result = getattr(self, name)(**args)
        except Exception as e:  # ツールの失敗はエージェントに伝えて立て直させる
            return f"{type(e).__name__}: {e}", True
        if len(result) > MAX_OUTPUT:
            result = result[:MAX_OUTPUT] + f"\n…（{len(result) - MAX_OUTPUT} 文字省略）"
        return result, result.startswith("エラー")

    # --- 各ツール -------------------------------------------------------

    def terminal(self, command: str, timeout: int = 120) -> str:
        if (self.always_ask or DANGEROUS.search(command)) and not self.approve(command):
            return "エラー: ユーザーが実行を拒否しました。別の方法を考えるか、理由を説明してください。"
        proc = subprocess.run(["bash", "-lc", command], cwd=self.cwd, capture_output=True,
                              text=True, timeout=timeout)
        out = proc.stdout + (f"\n[stderr]\n{proc.stderr}" if proc.stderr else "")
        return f"{out.strip()}\n[exit {proc.returncode}]".strip()

    def read_file(self, path: str, offset: int = 1, limit: int = 500) -> str:
        p = (self.cwd / path).expanduser()
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(offset, 1) - 1
        chunk = lines[start:start + limit]
        body = "\n".join(f"{i:>5}\t{line}" for i, line in enumerate(chunk, start + 1))
        rest = len(lines) - (start + len(chunk))
        return body + (f"\n…（残り {rest} 行）" if rest > 0 else "")

    def write_file(self, path: str, content: str) -> str:
        p = (self.cwd / path).expanduser()
        if p.exists() and not self.approve(f"上書き: {p}"):
            return "エラー: ユーザーが上書きを拒否しました"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"{p} に {len(content)} 文字書き込みました"

    def memory(self, action: str, target: str, content: str = "", old_text: str = "") -> str:
        store = self.mem if target == "memory" else self.user_mem
        if action == "add":
            return store.add(content)
        if action == "replace":
            return store.replace(old_text, content)
        return store.remove(old_text)

    def skill_list(self) -> str:
        return self.skills.index()

    def skill_view(self, name: str) -> str:
        return self.skills.view(name)

    def skill_manage(self, action: str, name: str, description: str = "", content: str = "") -> str:
        if action == "create":
            if not description or not content:
                return "エラー: create には description と content が必要です"
            return self.skills.create(name, description, content)
        if action == "edit":
            if not content:
                return "エラー: edit には content（新しい本文全体）が必要です"
            return self.skills.edit(name, description or None, content)
        return self.skills.delete(name)

    def session_search(self, query: str, limit: int = 8) -> str:
        return self.db.search(query, limit, exclude_session=self.session_id)
