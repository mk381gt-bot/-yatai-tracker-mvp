# sources — 一次史料

ヒミコの決断の資料集（[その1](../notes/01_geopolitics_jomon_yayoi_kofun.md)・[その2](../notes/02_neighbors_and_factcheck.md)）の、一次史料を集めたフォルダ。

| ファイル | 中身 | どう作ったか |
|---|---|---|
| [excerpts/sanguozhi_dongyi_original.md](./excerpts/sanguozhi_dongyi_original.md) | 『三国志』魏書 東夷伝の全文（夫餘・高句麗・東沃沮・挹婁・濊・韓・**倭人**）。校異の注つき | npm の三国志テキストから機械的に抽出（**簡体字・裴注なし**） |
| [excerpts/wajinden_hanzhuan_translation_ja.md](./excerpts/wajinden_hanzhuan_translation_ja.md) | 倭人条の全文と韓伝の重要部分（帯方郡・崎離営の戦い・弁辰の鉄）の現代語訳、要点の表 | 訳は Claude |
| [excerpts/sanguozhi_related_annals.md](./excerpts/sanguozhi_related_annals.md) | 明帝紀・三少帝紀・公孫氏伝・呉主伝の関連記事（公孫氏の滅亡、正始4年の倭の遣使、正始7年の韓の降伏、呉の夷洲遠征など） | 同上から抽出 |
| [excerpts/other_sources_key_passages.md](./excerpts/other_sources_key_passages.md) | 後漢書・晋書・宋書・三国史記・広開土王碑・日本書紀・古事記の重要箇所と訳、校合に使う本 | 記憶で書いたあと原文と照合（広開土王碑だけ未照合） |
| [texts/](./texts/README.md) | 全文テキスト（古事記・日本書紀・風土記・中国と朝鮮の史書・古典論文・和名類聚抄）と底本画像 | Wikisource・青空文庫・国会図書館・古辞書データセット |

## 注意
- excerpts の三国志は元データに誤字がある（例：「正始元年」が「正治元年」）。気づいた所には校異を付けたが、全文は照合していない。研究・引用には中華書局本などと照合すること。
- 元データ：npm `chinese-history-classics-sanguozhi@1.0.1`（ISC ライセンス）。
- 原文はいずれも古典でパブリックドメイン。訳・注は Claude が書いたもの。
