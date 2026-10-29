"""エージェント本体：Claude に考えさせ、ツールを実行し、結果を返す…を繰り返すループ。"""

from __future__ import annotations

import platform
import time
from pathlib import Path
from typing import Callable

import anthropic

from . import config
from .store import Memory, SessionDB, Skills
from .tools import SERVER_TOOLS, TOOLS, Toolbox

BETAS = [
    "server-side-fallback-2026-07-01",  # 安全判定で断られたら別モデルで自動リトライ
    "compact-2026-01-12",               # 会話が長くなったらサーバー側で自動要約
]

REFLECT_PROMPT = """（セッション終了前の振り返り）
ここまでの会話を見直して、次回以降の自分に残すべきことを保存してください。
- ユーザーの好み・事情で今後も役立つもの → memory(target=user)
- 環境の事実、うまくいった方法、ハマった点 → memory(target=memory)
- 何度も使えそうな手順や、苦労してたどり着いたやり方 → skill_manage で作成、または既存スキルを改善
すでに保存済みのものや、その場限りの情報は保存しないでください。
最後に、何を保存したかを1〜2行で報告してください（何もなければ「保存なし」）。"""

NUDGE = ("<reminder>ここまでで、今後も覚えておくべきこと（ユーザーの好み、環境の事実、再利用できる手順）が"
         "あれば memory / skill_manage で保存してください。なければ何もしなくて構いません。"
         "このリマインダーには返事をしないでください。</reminder>")


def build_system_prompt(memory: Memory, user: Memory, skills: Skills) -> str:
    # セッション開始時に一度だけ作って固定する（途中で変えるとプロンプトキャッシュが効かなくなる）。
    # 会話中に保存したメモは次のセッションから反映される。
    return f"""あなたは「Hermes」、ユーザーのコンピューター上で動く、使うほど賢くなるAIアシスタントです。
ユーザーと同じ言語で、簡潔に話してください。

## 進め方
- 手を動かして確かめる。推測で答えず、terminal / read_file / web_search で事実を確認する。
- 作業を始める前に、下のスキル一覧に関係しそうなものがあれば skill_view で読んで、その手順に従う。
- ユーザーが「前に」「この前の」と言ったら session_search で過去の会話を探す。
- 取り返しのつかない操作（削除、上書き、外部への送信・公開）は、実行前にユーザーに確認する。

## 学習のルール（あなたの一番の特徴）
- ユーザーについて分かった、長く使える情報（名前、好み、仕事、決めごと）は memory(target=user) に残す。
- 環境について分かったこと、うまくいったやり方、ハマった原因は memory(target=memory) に残す。
- 5手以上かかった作業や、試行錯誤の末に成功した作業は、終わったら skill_manage で手順書にする。
  次回は迷わず再現できるよう、具体的なコマンドや注意点まで書く。
- スキルを使ってみて間違いや不足があれば、その場で skill_manage(edit) で直す。
- メモは短い事実だけ。一時的な情報（今日の作業の途中経過など）は残さない。

## 長期メモ（自分用）
{memory.render() or "（まだありません）"}

## ユーザーについて
{user.render() or "（まだありません）"}

## スキル一覧
{skills.index()}

## 環境
- OS: {platform.system()} {platform.release()}
- 作業ディレクトリ: {Path.cwd()}
- セッション開始日: {time.strftime("%Y-%m-%d")}
"""


def _to_json(messages: list) -> list:
    """SDK のオブジェクトを含む会話履歴を、保存できる dict に変換する。"""
    out = []
    for m in messages:
        content = m["content"]
        if isinstance(content, list):
            content = [b if isinstance(b, dict) else b.model_dump(mode="json", exclude_none=True)
                       for b in content]
        out.append({"role": m["role"], "content": content})
    return out


class Agent:
    def __init__(self, client: anthropic.Anthropic, toolbox: Toolbox, system: str,
                 db: SessionDB, session_id: int, messages: list | None = None,
                 on_text: Callable[[str], None] = print,
                 on_tool: Callable[[str, dict], None] = lambda name, args: None,
                 on_notice: Callable[[str], None] = print):
        self.client, self.toolbox, self.system = client, toolbox, system
        self.db, self.session_id = db, session_id
        self.messages: list = messages or []
        self.on_text, self.on_tool, self.on_notice = on_text, on_tool, on_notice
        self.user_turns = 0
        self.tool_calls = 0

    # --- 1回の API 呼び出し ------------------------------------------------

    def _call(self):
        for attempt in range(3):
            try:
                with self.client.beta.messages.stream(
                    model=config.MODEL,
                    max_tokens=config.MAX_TOKENS,
                    betas=BETAS,
                    fallbacks="default",
                    system=self.system,
                    tools=[*TOOLS, *SERVER_TOOLS],
                    messages=self.messages,
                    thinking={"type": "adaptive"},
                    output_config={"effort": config.EFFORT},
                    cache_control={"type": "ephemeral"},
                    context_management={"edits": [{"type": "compact_20260112"}]},
                ) as stream:
                    for text in stream.text_stream:
                        self.on_text(text)
                    return stream.get_final_message()
            except ValueError:
                # ツール入力の JSON が壊れていた（eager_input_streaming の副作用）。やり直す。
                self.on_notice("（ツール入力の受信に失敗したので再試行します）")
        raise RuntimeError("ツール入力の受信に3回失敗しました")

    # --- ユーザーの1発言を処理する -------------------------------------------

    def _repair(self) -> None:
        """中断などでツール結果が返っていない呼び出しがあれば、「中断」の結果で埋める（API がエラーにするため）。"""
        if not self.messages or self.messages[-1]["role"] != "assistant":
            return
        content = self.messages[-1]["content"]
        blocks = content if isinstance(content, list) else []
        ids = [b.id if not isinstance(b, dict) else b.get("id") for b in blocks
               if (b.type if not isinstance(b, dict) else b.get("type")) == "tool_use"]
        if ids:
            self.messages.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": i, "content": "ユーザーが中断しました", "is_error": True}
                for i in ids]})

    def turn(self, user_text: str, log: bool = True) -> str:
        self._repair()
        self.user_turns += 1
        content: list[dict] = [{"type": "text", "text": user_text}]
        if config.NUDGE_EVERY and self.user_turns % config.NUDGE_EVERY == 0:
            content.append({"type": "text", "text": NUDGE})
        self.messages.append({"role": "user", "content": content})
        if log:
            self.db.log(self.session_id, "user", user_text)

        final_text: list[str] = []
        while True:
            response = self._call()

            if response.stop_reason == "refusal":
                # 断られた応答は履歴に入れない（途中で切れたツール呼び出しを実行しないため）
                self.on_notice("（この依頼はモデルに断られました。言い方や内容を変えてみてください）")
                break

            self.messages.append({"role": "assistant", "content": response.content})
            final_text += [b.text for b in response.content if b.type == "text"]

            if response.stop_reason == "pause_turn":  # Web 検索などが長引いて一時停止 → 続きを頼む
                continue

            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if not tool_uses:
                if response.stop_reason == "max_tokens":
                    self.on_notice("（出力が上限に達して途中で止まりました。「続けて」と送ると再開します）")
                break

            results = []
            for block in tool_uses:
                if response.stop_reason == "max_tokens":
                    # 入力が途中で切れている可能性があるので実行しない
                    result, is_error = "エラー: 出力上限で入力が途中で切れました。小さく分けてやり直してください。", True
                else:
                    self.on_tool(block.name, block.input)
                    self.tool_calls += 1
                    result, is_error = self.toolbox.run(block.name, block.input)
                results.append({"type": "tool_result", "tool_use_id": block.id,
                                "content": result, "is_error": is_error})
            # 複数ツールの結果は1つのメッセージにまとめて返す
            self.messages.append({"role": "user", "content": results})

        answer = "\n".join(t for t in final_text if t.strip())
        if log:
            self.db.log(self.session_id, "assistant", answer)
        self.save()
        return answer

    def reflect(self) -> str:
        """会話を振り返って、メモとスキルを更新させる（Hermes の学習ループ）。"""
        return self.turn(REFLECT_PROMPT, log=False)

    def save(self) -> None:
        self.db.save_messages(self.session_id, _to_json(self.messages))
