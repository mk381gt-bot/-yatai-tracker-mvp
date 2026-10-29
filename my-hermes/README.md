# Hermes（自作版）

Nous Research の Hermes Agent の「**使うほど賢くなる**」仕組みを、Claude Code の上に自作したものです。
**Claude の Pro プランで動くので、API の追加料金はかかりません。**

## 何ができるか

| 機能 | 中身 |
|---|---|
| 作業する | コマンド実行・ファイル編集・Web検索（Claude Code の機能） |
| 覚える | `memory/USER.md`（あなたについて）と `memory/MEMORY.md`（自分用）。毎回起動時に読み込む |
| 手順書を作る | 苦労して成功した作業を `.claude/skills/<名前>/SKILL.md` に残し、次から自動で使う・直す |
| 思い出す | 過去の会話を全文検索（「前に話した〜」で自動で探す） |
| 学習ループ | 8回話しかけるごとに「覚えることない？」と促す。`/learn` で今すぐ振り返り |
| どこからでも | どのフォルダで `hermes` と打っても、記憶を持ったまま、そのフォルダで作業する |
| 安全装置 | `sudo`・`rm -rf`・強制 push は禁止。自分の設定ファイルは書き換えられない |

## Mac でのセットアップ（5分）

```bash
# 1. Claude Code を入れる（入っていなければ）
curl -fsSL https://claude.ai/install.sh | bash

# 2. Claude Code に Pro アカウントでログイン（ブラウザが開く）
claude
#    → ログインできたら /exit で終了

# 3. Hermes を入れる（このリポジトリを clone して）
git clone -b claude/my-hermes-agent https://github.com/mk381gt-bot/-yatai-tracker-mvp.git
cd ./-yatai-tracker-mvp/my-hermes
./install.sh
```

初回の起動時に「このフォルダを信頼しますか？」と聞かれたら、**Yes** を選んでください。

## 使い方

```bash
hermes          # 話しかける（どのフォルダからでも）
hermes -c       # 前回の続きから
```

会話中のコマンド:

- `/learn` 今すぐ振り返って、メモとスキルを更新
- 「スキル一覧見せて」「何を覚えてる？」と聞けば教えてくれます
- `/exit` 終了

最初に「僕の名前は○○。屋台トラッカーを作ってる」のように自己紹介すると、覚えてくれます。

## ファイルの置き場所（~/hermes）

```
~/hermes/
  CLAUDE.md                 Hermes の性格と学習のルール
  memory/USER.md            あなたについてのメモ（自由に編集してOK）
  memory/MEMORY.md          Hermes 自身のメモ
  .claude/skills/           スキル（手順書）。Hermes が自分で増やしていく
  .claude/hooks/            学習ループの仕組み
  .claude/settings.json     許可・禁止の設定
```

`install.sh` は何度実行しても大丈夫です。仕組みの部分だけ最新版になり、記憶と自作スキルは残ります。

## 注意

- Pro プランの使用量の上限は、普段の Claude（チャット）と共通です。重い作業を続けると、しばらく待つ必要が出ます。
- 月額プランのログインは**自分で使う場合だけ**です。他の人向けのサービスにはできません。

## テスト

```bash
python3 -m pytest tests
```
