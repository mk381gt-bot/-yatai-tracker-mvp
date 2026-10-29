# myhermes — 自作の Hermes 風エージェント

Nous Research の Hermes Agent の考え方（**使うほど賢くなる**）を、約700行の Python で自作したものです。
頭脳は Claude（Anthropic API）です。

## 何ができるか

| 機能 | 中身 |
|---|---|
| 道具を使う | コマンド実行・ファイル読み書き・Web検索・Webページ取得 |
| 長期メモ | `~/.myhermes/MEMORY.md`（自分用）と `USER.md`（あなたについて）。毎回最初に読み込む |
| スキル | 苦労して成功した手順を `~/.myhermes/skills/<名前>/SKILL.md` に手順書として保存し、次から再利用・改善する |
| 過去の会話検索 | 全会話を SQLite に保存。「前に話した〜」で検索（日本語の部分一致OK） |
| 学習ループ | 8往復ごとに「覚えることない？」と促す＋終了時に作業を振り返ってメモ・スキルを更新 |
| 安全装置 | `rm -rf`・`sudo`・強制 push などは実行前に必ず確認。ファイル上書きも確認 |
| 長い会話 | サーバー側で自動要約（compaction）。断られたら別モデルで自動リトライ |

## Mac でのセットアップ

```bash
# 1. このフォルダに移動して、インストール（Python 3.10 以上）
cd my-hermes
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# 2. APIキーを設定（https://console.anthropic.com で発行）
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc

# 3. 起動
myhermes
```

## 使い方

```bash
myhermes              # 話しかける
myhermes -c           # 前回の続きから
myhermes -q "質問"    # 1回だけ聞く
myhermes --ask-all    # すべてのコマンドを実行前に確認する（慎重モード）
```

会話中のコマンド: `/memory` メモを見る、`/skills` スキル一覧、`/learn` 今すぐ学習、`/new` 新しい会話、`/exit` 終了

## 設定（環境変数）

| 変数 | 既定値 | 意味 |
|---|---|---|
| `MYHERMES_MODEL` | `claude-opus-5-5` | 使うモデル |
| `MYHERMES_EFFORT` | `high` | 考える深さ（low / medium / high / xhigh / max）。下げると安く速くなる |
| `MYHERMES_HOME` | `~/.myhermes` | メモ・スキル・会話ログの保存先 |

## ファイル構成

```
myhermes/
  config.py   設定
  store.py    記憶（メモ・スキル・会話DB）
  tools.py    道具の定義と実行 ← 道具を増やすならここ
  agent.py    考える→道具を使う→結果を見る のループと、学習ループ
  cli.py      ターミナル画面
tests/        APIキーなしで動くテスト（python -m pytest tests）
```

## 道具の増やし方

`tools.py` の `TOOLS` にスキーマを1つ足し、`Toolbox` に同じ名前のメソッドを書くだけです。

```python
_tool("get_time", "今の時刻を返す。", {}, []),
...
def get_time(self) -> str:
    return time.strftime("%H:%M")
```

## 本家 Hermes Agent との違い（今後の拡張候補）

- Telegram / Slack などから話しかける機能（ゲートウェイ）はまだない
- 「毎朝○○して」のような定期実行はまだない
- 使えるモデルは Claude のみ
