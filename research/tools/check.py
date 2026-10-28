#!/usr/bin/env python3
"""資料集の整合性を検査する（research/ で実行）:
    python3 tools/check.py

1. Markdown の相対リンクの行き先が存在するか
2. data/*.csv の source_refs / url_or_path に書いたパスが存在するか
3. catalog.json が全ファイルを載せているか（漏れがあれば build_catalog.py を実行）
問題があれば終了コード1。
"""
import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
problems = []

for d, dirs, files in os.walk("."):
    dirs[:] = [x for x in dirs if not x.startswith((".", "__"))]
    for name in files:
        if not name.endswith(".md"):
            continue
        path = os.path.join(d, name)
        text = open(path, encoding="utf-8").read()
        for target in re.findall(r"\]\(([^)\s]+)\)", text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            dest = os.path.normpath(os.path.join(d, target.split("#")[0]))
            if not os.path.exists(dest):
                problems.append(f"broken link: {path} -> {target}")

for f in glob.glob("data/*.csv"):
    for i, row in enumerate(csv.DictReader(open(f, encoding="utf-8")), 2):
        for p in (row.get("source_refs") or row.get("url_or_path") or "").split(";"):
            p = p.strip()
            if p and not p.startswith("http") and not os.path.exists(p):
                problems.append(f"missing ref: {f}:{i} -> {p}")

catalog = {e["path"] for e in json.load(open("catalog.json", encoding="utf-8"))["files"]}
for d, dirs, files in os.walk("."):
    dirs[:] = [x for x in dirs if not x.startswith((".", "__"))]
    for name in files:
        rel = os.path.relpath(os.path.join(d, name)).replace(os.sep, "/")
        if rel == ".gitignore":
            continue
        if rel not in catalog:
            problems.append(f"not in catalog.json: {rel} (run tools/build_catalog.py)")

for p in problems:
    print(p)
print(f"{len(problems)} problem(s)")
sys.exit(1 if problems else 0)
