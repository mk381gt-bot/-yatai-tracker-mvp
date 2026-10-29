"""セッション開始時に、呼び出し元フォルダと記憶の状態を Claude に伝える。

ここで print したものは、Claude Code が会話の最初に文脈として渡してくれる。
"""

import os
import sys
from pathlib import Path

LIMITS = {"MEMORY.md": 4000, "USER.md": 2000}


def main() -> None:
    sys.stdin.read()  # 入力（JSON）は使わないが読み捨てておく
    home = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
    lines = []

    caller = os.environ.get("HERMES_CALLER_DIR")
    if caller and Path(caller).resolve() != home.resolve():
        lines.append(f"呼び出し元フォルダ: {caller}（ユーザーの作業対象はここです）")

    for name, limit in LIMITS.items():
        f = home / "memory" / name
        size = len(f.read_text(encoding="utf-8")) if f.exists() else 0
        if size > limit * 0.8:
            lines.append(f"memory/{name} が {size}/{limit} 文字です。手が空いたら整理してください。")

    if lines:
        print("\n".join(lines))


if __name__ == "__main__":
    main()
