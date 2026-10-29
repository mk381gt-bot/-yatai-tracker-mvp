#!/usr/bin/env bash
# Hermes をインストールする（何度実行しても OK。記憶と自分で作ったスキルは消さない）。
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERMES_HOME:-$HOME/hermes}"
BIN="$HOME/.local/bin"

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code が見つかりません。先にインストールしてください:"
  echo "  curl -fsSL https://claude.ai/install.sh | bash"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 が見つかりません。次を実行してから、もう一度どうぞ:"
  echo "  xcode-select --install"
  exit 1
fi

echo "Hermes を $DEST に入れます"
mkdir -p "$DEST/memory" "$DEST/.claude/hooks" "$DEST/.claude/skills" "$BIN"

# 仕組みの部分は最新版で上書きする
cp "$SRC/home/CLAUDE.md" "$DEST/CLAUDE.md"
cp "$SRC/home/.claude/settings.json" "$DEST/.claude/settings.json"
cp "$SRC/home/.claude/hooks/"*.py "$DEST/.claude/hooks/"
for skill in session-search learn; do
  mkdir -p "$DEST/.claude/skills/$skill"
  cp "$SRC/home/.claude/skills/$skill/"* "$DEST/.claude/skills/$skill/"
done

# 記憶は、まだないときだけ作る
for f in MEMORY.md USER.md; do
  [ -f "$DEST/memory/$f" ] || : > "$DEST/memory/$f"
done

cp "$SRC/bin/hermes" "$BIN/hermes"
chmod +x "$BIN/hermes"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    echo "PATH を ~/.zshrc に追加しました。新しいターミナルを開いてください。"
    ;;
esac

echo "完了！ ターミナルで  hermes  と打つと起動します。"
