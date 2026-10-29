"""設定まわり。データはすべて ~/.myhermes/ に保存する（環境変数 MYHERMES_HOME で変更可）。"""

import os
from pathlib import Path

HOME = Path(os.environ.get("MYHERMES_HOME", Path.home() / ".myhermes"))
MEMORY_FILE = HOME / "MEMORY.md"   # エージェント自身のメモ（環境・やり方・学んだこと）
USER_FILE = HOME / "USER.md"       # ユーザーについてのメモ（好み・呼び方など）
SKILLS_DIR = HOME / "skills"       # 自分で作ったスキル（手順書）
DB_FILE = HOME / "sessions.db"     # 過去の会話（検索用）

MODEL = os.environ.get("MYHERMES_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("MYHERMES_EFFORT", "high")  # low / medium / high / xhigh / max
MAX_TOKENS = 64000

# メモリが膨らみすぎないように上限を設ける（超えたら整理を促す）
MEMORY_CHAR_LIMIT = 4000
USER_CHAR_LIMIT = 2000

# 何往復ごとに「覚えておくべきことはない？」と促すか
NUDGE_EVERY = 8
# セッション終了時、ツールをこの回数以上使っていたら振り返り（学習）を行う
REFLECT_MIN_TOOL_CALLS = 5


def ensure_dirs() -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
