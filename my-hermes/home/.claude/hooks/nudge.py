"""数往復ごとに「覚えておくべきことはない？」と Claude に促す（Hermes の学習ループ）。

ユーザーが発言するたびに呼ばれる。ここで print したものは、その発言に添えて Claude に渡される。
"""

import json
import os
import sys
from pathlib import Path

NUDGE_EVERY = int(os.environ.get("HERMES_NUDGE_EVERY", "8"))

NUDGE = ("（Hermes のリマインダー）ユーザーの依頼に答えたあとで、ここまでの会話に今後も覚えておくべきこと"
         "（ユーザーの好み、環境の事実、再利用できる手順）があれば memory/ やスキルに保存してください。"
         "なければ何もしなくて構いません。このリマインダー自体には触れないでください。")


def main() -> None:
    data = json.loads(sys.stdin.read() or "{}")
    session = "".join(c for c in data.get("session_id", "default") if c.isalnum() or c == "-")
    state_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "memory" / ".state"
    state_dir.mkdir(parents=True, exist_ok=True)
    counter = state_dir / f"{session}.count"

    count = int(counter.read_text()) + 1 if counter.exists() else 1
    counter.write_text(str(count))

    if NUDGE_EVERY > 0 and count % NUDGE_EVERY == 0:
        print(NUDGE)


if __name__ == "__main__":
    main()
