---
name: session-search
description: 過去のセッションの会話を検索する。ユーザーが「前に話した」「この前やった」「以前の」と言ったときや、過去の経緯を確かめたいときに使う。
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/search.py *)
---

過去の会話ログをキーワードで検索します。

```bash
python3 ${CLAUDE_SKILL_DIR}/search.py キーワード1 キーワード2 --limit 10
```

- すべてのキーワードを含む発言が、新しい順に出ます。
- 見つからなければ、言い換えたり、キーワードを減らしたりして2〜3回試してください。
- 結果をそのまま貼らず、ユーザーの質問に答える形でまとめてください。
