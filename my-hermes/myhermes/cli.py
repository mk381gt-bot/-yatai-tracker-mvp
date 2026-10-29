"""ターミナルで話しかけるための画面。  使い方: myhermes [--continue] [--ask-all] [-q "質問"]"""

from __future__ import annotations

import argparse
import sys

import anthropic

from . import config
from .agent import Agent, build_system_prompt
from .store import Memory, SessionDB, Skills
from .tools import Toolbox

try:
    import readline  # noqa: F401  ↑キーで入力履歴を使えるようにする
except ImportError:
    pass

DIM, CYAN, YELLOW, RESET = "\033[2m", "\033[36m", "\033[33m", "\033[0m"

HELP = """コマンド:
  /memory   長期メモを表示        /skills   スキル一覧を表示
  /learn    今すぐ振り返って学習   /new      新しいセッションを始める
  /exit     終了（必要なら振り返ってから終わる）"""


def approve(what: str) -> bool:
    print(f"\n{YELLOW}⚠ 実行の確認:{RESET} {what}")
    try:
        return input("実行していい？ [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        return False


def show_tool(name: str, args: dict) -> None:
    preview = args.get("command") or args.get("path") or args.get("query") or args.get("name") or ""
    if name == "memory":
        preview = f"{args.get('action')} {args.get('target')}: {args.get('content') or args.get('old_text', '')}"
    print(f"\n{DIM}🔧 {name} {str(preview)[:120]}{RESET}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(prog="myhermes", description="自作の Hermes 風エージェント")
    parser.add_argument("-c", "--continue", dest="cont", action="store_true", help="前回の会話の続きから")
    parser.add_argument("--ask-all", action="store_true", help="すべてのコマンド実行前に確認する")
    parser.add_argument("-q", "--query", help="1回だけ質問して終わる")
    args = parser.parse_args()

    config.ensure_dirs()
    memory = Memory(config.MEMORY_FILE, config.MEMORY_CHAR_LIMIT)
    user = Memory(config.USER_FILE, config.USER_CHAR_LIMIT)
    skills = Skills(config.SKILLS_DIR)
    db = SessionDB(config.DB_FILE)
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY を環境変数から読む

    def start(resume: bool) -> Agent:
        previous = db.last_session() if resume else None
        session_id, messages = previous if previous else (db.new_session(), [])
        toolbox = Toolbox(memory, user, skills, db, session_id, approve, args.ask_all)
        return Agent(client, toolbox, build_system_prompt(memory, user, skills), db, session_id,
                     messages=messages,
                     on_text=lambda t: print(t, end="", flush=True),
                     on_tool=show_tool,
                     on_notice=lambda m: print(f"\n{YELLOW}{m}{RESET}"))

    def finish(agent: Agent) -> None:
        if agent.tool_calls >= config.REFLECT_MIN_TOOL_CALLS:
            print(f"{DIM}📚 今回の作業を振り返って学習しています…{RESET}")
            agent.reflect()
            print()

    agent = start(args.cont)

    if args.query:
        run(agent, args.query)
        finish(agent)
        return

    print(f"{CYAN}☤ Hermes{RESET}  {DIM}({config.MODEL} / /help でコマンド一覧){RESET}")
    if args.cont and agent.messages:
        print(f"{DIM}前回のセッションの続きです{RESET}")

    while True:
        try:
            text = input(f"\n{CYAN}あなた ›{RESET} ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            finish(agent)
            break
        if not text:
            continue
        if text in ("/exit", "/quit"):
            finish(agent)
            break
        if text == "/help":
            print(HELP)
        elif text == "/memory":
            print(f"--- 自分用 ---\n{memory.render() or '(なし)'}\n--- ユーザー ---\n{user.render() or '(なし)'}")
        elif text == "/skills":
            print(skills.index())
        elif text == "/learn":
            agent.reflect()
            print()
        elif text == "/new":
            finish(agent)
            agent = start(False)  # 新しいメモ・スキルを読み込み直して始める
            print(f"{DIM}新しいセッションを始めました{RESET}")
        else:
            run(agent, text)


def run(agent: Agent, text: str) -> None:
    print(f"\n{CYAN}Hermes ›{RESET} ", end="", flush=True)
    try:
        agent.turn(text)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}（中断しました）{RESET}")
        agent.save()
    except anthropic.AuthenticationError:
        sys.exit("APIキーが無効です。ANTHROPIC_API_KEY を確認してください。")
    except anthropic.RateLimitError:
        print(f"\n{YELLOW}（利用上限に達しました。少し待ってからもう一度どうぞ）{RESET}")
    except anthropic.APIConnectionError:
        print(f"\n{YELLOW}（ネットにつながりません）{RESET}")
    except anthropic.APIStatusError as e:
        print(f"\n{YELLOW}（APIエラー {e.status_code}: {e.message}）{RESET}")
    print()


if __name__ == "__main__":
    main()
