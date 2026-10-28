#!/usr/bin/env python3
"""research/catalog.json を作り直す。

使い方（research/ で実行）:
    python3 tools/build_catalog.py

ファイルを追加したら、下の RULES に1行足してから実行する。
どのルールにも当てはまらないファイルがあるとエラーで止まる。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WS_ZH = "https://zh.wikisource.org/wiki/"
AOZORA = "https://www.aozora.gr.jp/"
PD = "public-domain"

# (パスの正規表現, メタデータ)。上から順に最初に当たったものを使う。
# kind: index / note / excerpt / translation / primary_text / study / dataset / scan / data / tool
# origin: fetched（機械的に取得）/ transcribed（Claude が画像から書き起こし）/
#         authored（Claude が執筆）/ authored_verified（記憶で書いてから原文と照合）
RULES = [
    (r"^(AGENTS|CLAUDE|README)\.md$", dict(kind="index", origin="authored", license="project")),
    (r"^catalog\.json$", dict(kind="index", origin="generated", license="project")),
    (r"^\.gitignore$", dict(kind="tool", origin="authored", license="project")),
    (r"^tools/", dict(kind="tool", origin="authored", license="project")),
    (r"^notes/01_", dict(kind="note", title="資料集その1：縄文・弥生・古墳の地政学", origin="authored", license="project",
                         topics=["chronology", "genetics", "climate", "iron", "warfare", "regional_powers", "yamatai"])),
    (r"^notes/02_", dict(kind="note", title="資料集その2：周辺世界と個人研究のファクトチェック", origin="authored", license="project",
                         topics=["korea", "china", "taiwan", "ryukyu", "hokkaido", "southeast_asia", "india", "factcheck"])),
    (r"^data/wamyosho_townships\.csv$", dict(kind="data", title="和名類聚抄 郡郷名（CSV）", origin="fetched",
                                            license="CC BY-NC-SA 4.0", source_url="https://dataset.kojisho.com/hzwm-kwrs-wamyo-dataset")),
    (r"^data/", dict(kind="data", origin="authored", license="project")),
    (r"^sources/(texts/)?README\.md$", dict(kind="index", origin="authored", license="project")),
    (r"^sources/excerpts/sanguozhi_dongyi_original\.md$", dict(kind="primary_text", work="三国志 魏書 巻30 東夷伝", language="lzh-Hans",
        origin="fetched", license=PD, source_url="https://www.npmjs.com/package/chinese-history-classics-sanguozhi",
        caveat="簡体字・裴注なし・底本不明。正治元年など誤字あり")),
    (r"^sources/excerpts/wajinden_hanzhuan_translation_ja\.md$", dict(kind="translation", work="倭人条・韓伝（抄）現代語訳", language="ja", origin="authored", license="project")),
    (r"^sources/excerpts/sanguozhi_related_annals\.md$", dict(kind="excerpt", work="三国志 本紀・列伝（抄）", language="lzh-Hans", origin="fetched", license=PD,
        source_url="https://www.npmjs.com/package/chinese-history-classics-sanguozhi")),
    (r"^sources/excerpts/other_sources_key_passages\.md$", dict(kind="excerpt", work="後漢書・晋書・宋書・三国史記・広開土王碑・日本書紀（抄）", language="lzh+ja",
        origin="authored_verified", license="project", caveat="広開土王碑だけ原文未照合")),
    (r"^sources/texts/kojiki/kojiki_original\.md$", dict(kind="primary_text", work="古事記", compiled=712, language="lzh-ja", origin="fetched", license=PD, source_url=WS_ZH + "古事記")),
    (r"^sources/texts/kojiki/.*_takeda_aozora\.txt$", dict(kind="translation", work="古事記（武田祐吉）", language="ja-old", origin="fetched", license=PD, source_url=AOZORA + "index_pages/person1349.html",
        caveat="Shift_JIS→UTF-8変換のみ。ルビは《》")),
    (r"^sources/texts/nihonshoki/", dict(kind="primary_text", work="日本書紀", compiled=720, language="lzh", origin="fetched", license=PD, source_url=WS_ZH + "日本書紀")),
    (r"^sources/texts/fudoki/06_", dict(kind="primary_text", work="風土記逸文（九州）", language="lzh+ja-old", origin="transcribed", license=PD,
        source_url="https://dl.ndl.go.jp/pid/1210472", caveat="Claude が画像から読んだ書き起こし。scans_kurita1927_kyushu/ で要確認")),
    (r"^sources/texts/fudoki/scans_", dict(kind="scan", work="栗田寛『古風土記逸文』1927", origin="fetched", license=PD, source_url="https://dl.ndl.go.jp/pid/1210472")),
    (r"^sources/texts/fudoki/", dict(kind="primary_text", work="風土記", compiled=713, language="lzh", origin="fetched", license=PD, source_url=WS_ZH + "古風土記")),
    (r"^sources/texts/chinese_histories/", dict(kind="primary_text", language="lzh", origin="fetched", license=PD)),
    (r"^sources/texts/korean_histories/", dict(kind="primary_text", work="三国史記", compiled=1145, language="lzh", origin="fetched", license=PD, source_url=WS_ZH + "三國史記/卷02")),
    (r"^sources/texts/other/sendai", dict(kind="primary_text", work="先代旧事本紀", language="lzh", origin="fetched", license=PD, source_url=WS_ZH + "先代舊事本紀")),
    (r"^sources/texts/other/kogo", dict(kind="primary_text", work="古語拾遺", compiled=807, language="lzh", origin="fetched", license=PD, source_url=WS_ZH + "古語拾遺")),
    (r"^sources/texts/studies/naito", dict(kind="study", work="内藤湖南『卑彌呼考』1910（近畿説）", language="ja-old", origin="fetched", license=PD, source_url=AOZORA + "cards/000284/card4643.html")),
    (r"^sources/texts/studies/shiratori", dict(kind="study", work="白鳥庫吉『倭女王卑彌呼考』1910（九州説）", language="ja-old", origin="fetched", license=PD, source_url=AOZORA + "cards/000603/card52230.html")),
    (r"^sources/texts/wamyosho/", dict(kind="dataset", work="和名類聚抄（古活字版）国郡部", compiled=935, language="lzh", origin="fetched",
        license="CC BY-NC-SA 4.0", source_url="https://dataset.kojisho.com/hzwm-kwrs-wamyo-dataset", caveat="非営利。営利利用は作成者の許諾が必要")),
]

CHINESE = {
    "houhanshu_085": ("後漢書 巻85 東夷列伝", 432, "後漢書/卷85"),
    "jinshu_003": ("晋書 巻3 武帝紀", 648, "晉書/卷003"),
    "jinshu_097": ("晋書 巻97 四夷伝", 648, "晉書/卷097"),
    "songshu_097": ("宋書 巻97 夷蛮伝", 488, "宋書/卷97"),
    "liangshu_054": ("梁書 巻54 諸夷伝", 636, "梁書/卷54"),
    "suishu_081": ("隋書 巻81 東夷伝", 636, "隋書/卷81"),
    "beishi_094": ("北史 巻94", 659, "北史/卷094"),
    "hanyuan": ("翰苑 蕃夷部（魏略逸文を含む）", 660, "翰苑"),
}


def first_heading(path):
    if not path.endswith(".md"):
        return None
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("# "):
                return line[2:].strip()
    return None


def main():
    entries = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if not x.startswith((".", "__")))
        for name in sorted(files):
            full = os.path.join(d, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            if rel.startswith("tools/__pycache__"):
                continue
            meta = next((dict(m) for pat, m in RULES if re.search(pat, rel)), None)
            if meta is None:
                sys.exit(f"catalog: no rule for {rel} — add one to RULES in tools/build_catalog.py")
            if rel.startswith("sources/texts/chinese_histories/"):
                key = next(k for k in CHINESE if name.startswith(k))
                work, compiled, page = CHINESE[key]
                meta.update(work=work, compiled=compiled, source_url=WS_ZH + page)
            if rel.startswith("sources/texts/kojiki/") and rel.endswith("_aozora.txt"):
                card = {"annotated": "001518/card51731", "translation": "001518/card51732", "commentary": "001349/card51728"}
                meta["source_url"] = AOZORA + "cards/" + next(v for k, v in card.items() if k in name) + ".html"
            if rel.startswith("sources/texts/nihonshoki/"):
                meta["volume"] = int(re.search(r"(\d+)", name).group(1))
            entry = {"path": rel, **meta, "bytes": os.path.getsize(full)}
            title = meta.get("title") or first_heading(full)
            if title:
                entry["title"] = title
            entries.append(entry)
    out = {
        "description": "ヒミコの決断のための資料集（縄文・弥生・古墳の地政学）。各ファイルの種類・取得元・確かさ・ライセンス。",
        "generated_by": "tools/build_catalog.py",
        "legend": {
            "kind": "index/note/excerpt/translation/primary_text/study/dataset/scan/data/tool",
            "origin": "fetched=機械的に取得 / transcribed=Claudeが画像から書き起こし / authored=Claudeが執筆 / authored_verified=記憶で書いて原文と照合 / generated=スクリプトが生成",
            "language": "lzh=漢文, lzh-Hans=簡体字の漢文, ja=現代日本語, ja-old=旧字旧仮名",
        },
        "files": entries,
    }
    with open(os.path.join(ROOT, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"catalog.json: {len(entries)} files")


if __name__ == "__main__":
    main()
