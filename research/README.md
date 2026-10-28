# ヒミコの決断のための資料集

縄文・弥生・古墳の地政学を、卑弥呼（2世紀後半〜3世紀中頃）の決断の材料として集めたもの。考古学の論文・年代測定・古気候・古代ゲノム・一次史料（倭人伝・記紀・風土記・中国と朝鮮の史書）を中心にしている。

AI エージェント（Codex・Claude Code など）向けの作業ルールは [AGENTS.md](./AGENTS.md)、全ファイルの目録は [catalog.json](./catalog.json)。

## どこから読むか

| 目的 | ファイル |
|---|---|
| 全体の要点をつかむ | [notes/01_geopolitics_jomon_yayoi_kofun.md](./notes/01_geopolitics_jomon_yayoi_kofun.md)（年表・地域勢力・決断マトリクス・論争点・文献） |
| 周辺の国と地域、個人研究の真偽 | [notes/02_neighbors_and_factcheck.md](./notes/02_neighbors_and_factcheck.md) |
| 倭人伝を読む | [原文](./sources/excerpts/sanguozhi_dongyi_original.md)・[現代語訳](./sources/excerpts/wajinden_hanzhuan_translation_ja.md) |
| 卑弥呼の時代の中国・半島の動き | [三国志 本紀・列伝の関連記事](./sources/excerpts/sanguozhi_related_annals.md) |
| 九州の在地伝承（甕依姫・磐井など） | [風土記逸文 九州](./sources/texts/fudoki/06_itsubun_kyushu_kurita1927.md) |
| 表で扱う | [data/](#data表データ) |
| 全文を探す | [sources/texts/](./sources/texts/README.md) |

## フォルダ

```
research/
├── AGENTS.md / CLAUDE.md   AI向けの作業ルール（CLAUDE.md は AGENTS.md へのリンク）
├── README.md               この目次
├── catalog.json            全ファイルの目録（種類・取得元・確かさ・ライセンス）
├── notes/                  調査ノート
├── data/                   表データ（CSV）
├── sources/
│   ├── excerpts/           倭人伝などの抜粋・訳
│   └── texts/              一次史料の全文・古典論文・底本画像
└── tools/                  目録の作成と整合性の検査
```

## data（表データ）

すべて UTF-8 の CSV。`source_refs` 列は根拠ファイルのパス（`;` 区切り）。

| ファイル | 行数 | 中身 |
|---|---|---|
| [timeline.csv](./data/timeline.csv) | 37 | 前10世紀〜732年の年表。年の幅・地域・確度つき |
| [sites.csv](./data/sites.csv) | 20 | 主な遺跡（纒向・箸墓・吉野ヶ里・平原・勒島・オケオなど） |
| [wa_place_identifications.csv](./data/wa_place_identifications.csv) | 13 | 倭人伝の国名をどこに当てるかの説と、和名類聚抄の郡郷名 |
| [factcheck.csv](./data/factcheck.csv) | 15 | 個人研究・独自の説の判定（○△✕？） |
| [decision_points.csv](./data/decision_points.csv) | 8 | ヒミコの決断の場面・根拠・選択肢・トレードオフ |
| [bibliography.csv](./data/bibliography.csv) | 23 | 主な論文・報告書・古典論文 |
| [wamyosho_townships.csv](./data/wamyosho_townships.csv) | 4,043 | 和名類聚抄の国・郡・郷名（**CC BY-NC-SA 4.0**） |

## 確かさのラベル
`[A]` 査読論文・原文で確認 ／ `[B]` 公的機関の解説で確認 ／ `[C]` 学説・解釈・論争中 ／ `[※]` 原典未確認。ファクトチェックは ○ △ ✕ ？。

## ライセンス
- 一次史料の原文と、栗田寛（1927）の底本画像、武田祐吉・内藤湖南・白鳥庫吉の著作は、著作権が切れている。
- **和名類聚抄のデータ（`sources/texts/wamyosho/`・`data/wamyosho_townships.csv`）は CC BY-NC-SA 4.0（非営利）。** 販売するゲームなど営利目的に使う場合は、元データの作成者の許諾が必要。
- notes・data（和名類聚抄を除く）・訳文は、Claude がこのプロジェクトのために書いたもの。

## 検査
```bash
cd research && python3 tools/build_catalog.py && python3 tools/check.py
```
