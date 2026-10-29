"""Claude Code やログインなしで動くテスト。  実行: python3 -m pytest tests"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME_SRC = ROOT / "home"


def run_py(script: Path, stdin: str = "", env: dict | None = None, args: list | None = None) -> str:
    proc = subprocess.run([sys.executable, str(script), *(args or [])], input=stdin, capture_output=True,
                          text=True, env={**os.environ, **(env or {})}, check=True)
    return proc.stdout


def test_settings_is_valid_json():
    settings = json.loads((HOME_SRC / ".claude/settings.json").read_text())
    assert {"SessionStart", "UserPromptSubmit"} <= settings["hooks"].keys()


def test_nudge_every_n_prompts(tmp_path):
    script = HOME_SRC / ".claude/hooks/nudge.py"
    env = {"CLAUDE_PROJECT_DIR": str(tmp_path), "HERMES_NUDGE_EVERY": "3"}
    payload = json.dumps({"session_id": "abc-123", "prompt": "やあ"})
    outputs = [run_py(script, payload, env) for _ in range(6)]
    assert [bool(o.strip()) for o in outputs] == [False, False, True, False, False, True]
    # 別セッションは別に数える
    assert run_py(script, json.dumps({"session_id": "other"}), env) == ""


def test_session_start_reports_caller_and_full_memory(tmp_path):
    script = HOME_SRC / ".claude/hooks/session_start.py"
    (tmp_path / "memory").mkdir()
    (tmp_path / "memory/USER.md").write_text("あ" * 1900)
    out = run_py(script, "{}", {"CLAUDE_PROJECT_DIR": str(tmp_path), "HERMES_CALLER_DIR": "/Users/ken/yatai"})
    assert "/Users/ken/yatai" in out and "USER.md" in out and "MEMORY.md" not in out
    # ホームから起動したときは何も言わない
    (tmp_path / "memory/USER.md").write_text("")
    assert run_py(script, "{}", {"CLAUDE_PROJECT_DIR": str(tmp_path), "HERMES_CALLER_DIR": str(tmp_path)}) == ""


def test_session_search(tmp_path):
    proj = tmp_path / "projects/-Users-ken-hermes"
    proj.mkdir(parents=True)
    lines = [
        {"type": "user", "sessionId": "s1", "timestamp": "2026-10-01T10:00:00Z", "cwd": "/Users/ken/hermes",
         "message": {"role": "user", "content": "山車の位置が Firebase に送られない"}},
        {"type": "assistant", "sessionId": "s1", "timestamp": "2026-10-01T10:01:00Z", "cwd": "/Users/ken/hermes",
         "message": {"role": "assistant", "content": [
             {"type": "thinking", "thinking": ""},
             {"type": "text", "text": "Firebase のセキュリティルールで書き込みが拒否されていました"}]}},
        {"type": "user", "sessionId": "s1", "timestamp": "2026-10-01T10:02:00Z", "isMeta": True,
         "message": {"role": "user", "content": "Firebase meta"}},
        {"type": "user", "sessionId": "s1", "timestamp": "2026-10-01T10:03:00Z",
         "message": {"role": "user", "content": [{"type": "tool_result", "content": "Firebase"}]}},
    ]
    (proj / "s1.jsonl").write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in lines) + "\nbroken{")
    script = HOME_SRC / ".claude/skills/session-search/search.py"
    env = {"CLAUDE_CONFIG_DIR": str(tmp_path)}

    out = run_py(script, env=env, args=["firebase"])
    assert out.count("[2026-10-01") == 2 and "meta" not in out
    assert out.index("10:01") < out.index("10:00")  # 新しい順
    assert "セキュリティルール" in run_py(script, env=env, args=["firebase", "ルール"])
    assert "見つかりませんでした" in run_py(script, env=env, args=["存在しない話題"])


def test_install_and_launcher(tmp_path):
    home = tmp_path / "home"
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    home.mkdir()
    # 本物の claude の代わりに、受け取った場所と引数を書き出すだけの偽物
    (fakebin / "claude").write_text('#!/usr/bin/env bash\necho "pwd=$PWD args=$* caller=$HERMES_CALLER_DIR"\n')
    (fakebin / "claude").chmod(0o755)
    env = {**os.environ, "HOME": str(home), "PATH": f"{fakebin}:{home}/.local/bin:{os.environ['PATH']}"}
    env.pop("HERMES_HOME", None)

    subprocess.run(["bash", str(ROOT / "install.sh")], env=env, check=True, capture_output=True)
    dest = home / "hermes"
    assert (dest / "CLAUDE.md").exists() and (dest / ".claude/skills/learn/SKILL.md").exists()
    assert (dest / "memory/USER.md").read_text() == ""

    # 再インストールしても記憶と自作スキルは残る
    (dest / "memory/USER.md").write_text("- 名前はケン\n")
    (dest / ".claude/skills/my-skill").mkdir()
    subprocess.run(["bash", str(ROOT / "install.sh")], env=env, check=True, capture_output=True)
    assert (dest / "memory/USER.md").read_text() == "- 名前はケン\n"
    assert (dest / ".claude/skills/my-skill").exists()

    project = tmp_path / "yatai"
    project.mkdir()
    out = subprocess.run(["hermes", "-c"], cwd=project, env=env, capture_output=True, text=True, check=True).stdout
    assert f"pwd={dest}" in out and f"--add-dir {project} -c" in out and f"caller={project}" in out
    out = subprocess.run(["hermes"], cwd=home, env=env, capture_output=True, text=True, check=True).stdout
    assert "--add-dir" not in out
