# ローカルAI導入・保守事業 計画書（たたき台）一式

AI実務室（みーぴー）が、社外にデータを出せない中小企業向けに「ローカルAIの導入＋月額の保守点検」を提供するための計画書群です。

- 作成日：2026-11-07（たたき台 v0.1）
- 読み方：まず [business-plan.md](business-plan.md)（まとめ）を読み、気になる項目の個別ファイルを開いてください。
- 差し替え方：各ファイルは独立しています。1ファイルを書き換えたら、`business-plan.md` の該当節だけ直せば整合します。

## 表記ルール

| 表記 | 意味 |
|---|---|
| **仮決め：** | みーぴーさんの判断前に、作業を進めるため仮に決めたもの。必ず「理由／別案」を併記。全件を [08-open-issues.md](08-open-issues.md) に集約 |
| **［調査］** | Web等で確認した情報。出典は [sources.md](sources.md) |
| **［推定］** | 調べきれず、前提を置いて見積もった数字・判断 |
| **［要確認］** | 契約・申込・購入の前に一次情報で確かめるべきもの |

## 構成（要件 → 設計 → タスク）

| # | フォルダ／ファイル | 内容 |
|---|---|---|
| 1 要件 | [01-requirements/01-business-overview.md](01-requirements/01-business-overview.md) | 誰に・何を・なぜ今 |
| | [01-requirements/02-competition-strengths.md](01-requirements/02-competition-strengths.md) | 競合と自分の強み |
| | [01-requirements/03-service-requirements.md](01-requirements/03-service-requirements.md) | サービスの要件（機能・非機能） |
| 2 リスク | [02-risk/01-security-risks.md](02-risk/01-security-risks.md) | 情報漏えい・モデル改ざん・故障停止 |
| | [02-risk/02-contract.md](02-risk/02-contract.md) | 責任範囲・契約書の要点（免責・賠償上限・SLA） |
| | [02-risk/03-laws.md](02-risk/03-laws.md) | 守るべき法律・ガイドライン |
| | [02-risk/04-insurance.md](02-risk/04-insurance.md) | サイバー保険・賠償責任保険 |
| 3 設計 | [03-design/01-architecture.md](03-design/01-architecture.md) | 全体構成と「ローカル／クラウド使い分け」 |
| | [03-design/02-inference-engine.md](03-design/02-inference-engine.md) | 推論エンジン比較表 |
| | [03-design/03-models.md](03-design/03-models.md) | モデル比較表 |
| | [03-design/04-ui.md](03-design/04-ui.md) | 管理画面（利用者画面）比較表 |
| | [03-design/05-hardware.md](03-design/05-hardware.md) | 機材の目安 |
| | [03-design/06-remote-maintenance.md](03-design/06-remote-maintenance.md) | 遠隔点検の仕組みとセキュリティ |
| 4 保守 | [04-maintenance/01-menu.md](04-maintenance/01-menu.md) | 保守点検メニューと頻度 |
| | [04-maintenance/02-checklist-template.md](04-maintenance/02-checklist-template.md) | 点検チェックリスト雛形 |
| 5 価格 | [05-pricing/01-plans.md](05-pricing/01-plans.md) | 段階プラン |
| | [05-pricing/02-financials.md](05-pricing/02-financials.md) | 稼働上限・1年目／3年目収支 |
| 6 顧客 | [06-first-customer/01-candidates.md](06-first-customer/01-candidates.md) | 最初の顧客像3候補と推奨 |
| | [06-first-customer/02-poc-plan.md](06-first-customer/02-poc-plan.md) | 実証（PoC）の進め方 |
| 7 タスク | [07-tasks/01-roadmap-tasks.md](07-tasks/01-roadmap-tasks.md) | 立ち上げタスクと工数 |
| 8 論点 | [08-open-issues.md](08-open-issues.md) | 未解決の論点・仮決め一覧 |
| まとめ | [business-plan.md](business-plan.md) | 読みやすい事業計画書 |
| 出典 | [sources.md](sources.md) | 調査の出典一覧 |
