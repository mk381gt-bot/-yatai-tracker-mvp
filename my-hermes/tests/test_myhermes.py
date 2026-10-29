"""APIキーなしで動くテスト。API 通信は偽のサーバー応答（SSE）に差し替える。"""

import json

import anthropic
import httpx2 as httpx
import pytest

from myhermes.agent import Agent, build_system_prompt
from myhermes.store import Memory, SessionDB, Skills
from myhermes.tools import Toolbox, validate


@pytest.fixture
def parts(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "skills").mkdir()
    return (Memory(tmp_path / "MEMORY.md", 300), Memory(tmp_path / "USER.md", 300),
            Skills(tmp_path / "skills"), SessionDB(tmp_path / "s.db"))


def test_memory_add_replace_remove(parts):
    mem = parts[0]
    assert "追加" in mem.add("Mac は zsh")
    assert "すでに" in mem.add("Mac は zsh")
    assert mem.replace("zsh", "Mac のシェルは zsh") == "置き換えました"
    assert mem.entries() == ["Mac のシェルは zsh"]
    assert "上限" in mem.add("あ" * 400)
    assert mem.remove("シェル") == "削除しました"
    assert mem.entries() == []


def test_skills(parts):
    skills = parts[2]
    assert "エラー" in skills.create("Bad Name", "x", "y")
    assert "作成" in skills.create("deploy-yatai", "屋台トラッカーを公開する", "1. firebase deploy")
    assert skills.index() == "- deploy-yatai: 屋台トラッカーを公開する"
    assert "firebase deploy" in skills.view("deploy-yatai")
    assert "更新" in skills.edit("deploy-yatai", None, "1. npm run build\n2. firebase deploy")
    assert "屋台トラッカーを公開する" in skills.view("deploy-yatai")
    assert "削除" in skills.delete("deploy-yatai")
    assert skills.list() == []


def test_session_search_japanese(parts):
    db = parts[3]
    old = db.new_session()
    db.log(old, "user", "山車の位置が更新されない問題を調べて")
    db.log(old, "assistant", "Firebase のルール設定が原因でした")
    now = db.new_session()
    assert "Firebase" in db.search("ルール設定", exclude_session=now)
    assert "山車" in db.search("山車", exclude_session=now)  # 3文字未満は LIKE で探す
    assert db.search("ルール設定", exclude_session=old) == "見つかりませんでした"


def test_validate():
    assert validate("terminal", {"command": "ls"}) is None
    assert "必須" in validate("terminal", {})
    assert "型" in validate("terminal", {"command": "ls", "timeout": "10"})
    assert "enum" not in (validate("memory", {"action": "add", "target": "x"}) or "")
    assert validate("memory", {"action": "add", "target": "x"}) is not None


def test_dangerous_command_needs_approval(parts):
    asked = []
    tb = Toolbox(*parts, session_id=1, approve=lambda w: asked.append(w) or False, always_ask=False)
    out, err = tb.run("terminal", {"command": "echo hi"})
    assert "hi" in out and not err and asked == []
    out, err = tb.run("terminal", {"command": "rm -rf /tmp/nothing-here"})
    assert err and "拒否" in out and asked


# ---------------------------------------------------------------- 偽サーバー

def sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)


def message_events(blocks, stop_reason):
    events = [{"type": "message_start", "message": {
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": [], "stop_reason": None, "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 0}}}]
    for i, b in enumerate(blocks):
        if b["type"] == "text":
            events += [{"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}},
                       {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": b["text"]}}]
        else:
            events += [{"type": "content_block_start", "index": i, "content_block": {
                           "type": "tool_use", "id": b["id"], "name": b["name"], "input": {}}},
                       {"type": "content_block_delta", "index": i, "delta": {
                           "type": "input_json_delta", "partial_json": json.dumps(b["input"])}}]
        events.append({"type": "content_block_stop", "index": i})
    events += [{"type": "message_delta", "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                "usage": {"output_tokens": 5}},
               {"type": "message_stop"}]
    return sse(events)


def test_agent_loop_runs_tools_and_learns(parts):
    memory, user, skills, db = parts
    replies = [
        message_events([{"type": "text", "text": "覚えておきます。"},
                        {"type": "tool_use", "id": "t1", "name": "memory",
                         "input": {"action": "add", "target": "user", "content": "名前はケン"}}], "tool_use"),
        message_events([{"type": "text", "text": "保存しました！"}], "end_turn"),
    ]
    requests = []

    def handler(request: httpx.Request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, text=replies.pop(0), headers={"content-type": "text/event-stream"})

    client = anthropic.Anthropic(api_key="test", http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    session_id = db.new_session()
    tb = Toolbox(memory, user, skills, db, session_id, approve=lambda w: True, always_ask=False)
    out = []
    agent = Agent(client, tb, build_system_prompt(memory, user, skills), db, session_id, on_text=out.append)

    answer = agent.turn("僕の名前はケンです。覚えてね")

    assert user.entries() == ["名前はケン"]
    assert "保存しました" in answer and "".join(out) == "覚えておきます。保存しました！"
    first, second = requests
    assert first["model"] == "claude-opus-5-5" and first["thinking"] == {"type": "adaptive"}
    assert first["fallbacks"] == "default"
    assert all(t.get("eager_input_streaming") for t in first["tools"] if "input_schema" in t)
    tool_result = second["messages"][-1]["content"][0]
    assert tool_result["tool_use_id"] == "t1" and not tool_result["is_error"]
    # 会話は保存され、続きから再開できる
    sid, saved = db.last_session()
    assert sid == session_id and len(saved) == 4
    assert "ケン" in db.search("ケンです")


def test_repair_after_interrupt(parts):
    memory, user, skills, db = parts
    tb = Toolbox(memory, user, skills, db, 1, approve=lambda w: True, always_ask=False)
    agent = Agent(None, tb, "", db, 1, messages=[
        {"role": "user", "content": "ls して"},
        {"role": "assistant", "content": [{"type": "tool_use", "id": "t9", "name": "terminal",
                                           "input": {"command": "ls"}}]}])
    agent._repair()
    assert agent.messages[-1]["content"][0]["tool_use_id"] == "t9"
