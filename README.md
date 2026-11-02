# 屋台トラッカー MVP

地域のお祭りで使う山車・屋台の現在位置共有システムです。

このMVPでは、山車側スマホで現在地をFirebase Realtime Databaseへ送り、観客側スマホで地図上の山車位置を見るところまでを確認します。

## できること

- 山車側スマホからGPS位置を送信する
- Firebase Realtime Databaseへ `lat` / `lng` / `name` / `status` / `updatedAt` を保存する
- 観客側ページで山車位置を地図表示する
- Firebaseの更新に合わせて、観客側マーカーをリロードなしで動かす
- 3分以上更新が止まった場合に、観客側へ警告を表示する
- 山車側で5m以上移動、または30秒以上経過した場合だけ送信する
- 観客側の地図に、トイレ・AED・避難場所・駐車場・本部・臨時トイレ・救護所を表示する（`pois.json`）
- 観客側に、山車付近の今後6時間の天気（気温・降水確率）を表示する
- 観客が地図を動かしたら山車への自動追従を止め、「山車の位置に戻る」で再開する

## できないこと

- 複数山車を一覧表示する
- 山車30台を管理する
- 管理画面から山車を追加・編集する
- ログインや認証で送信者を制限する
- 露店、協賛などを公開データから自動で表示する（手動追加は可能）
- 気象警報を表示する
- 経路案内や通知を出す
- 位置履歴を保存する

## ファイル構成

```txt
view.html                 観客用ページ
sender.html               山車側スマホ用の送信ページ
poi-builder.html          周辺情報（pois.json）を作る準備用ページ
pois.json                 観客マップに出す周辺情報（poi-builder.htmlで作る。無くても動く）
README.md                 この説明書
operation-checklist.md    当日運用チェックリスト
firebase-rules-notes.md   Firebase Security Rulesの注意メモ
test-log.md               実機テスト記録表
```

## Firebaseデータ構造

Realtime Databaseでは、次の構造を使います。

```json
{
  "dashiLocations": {
    "dashi01": {
      "name": "〇〇屋台",
      "lat": 34.768000,
      "lng": 137.998000,
      "status": "巡行中",
      "updatedAt": 1710000000000
    }
  }
}
```

## view.html の使い方

観客側で開くページです。

```txt
view.html?id=dashi01
```

`id` を省略した場合は `dashi01` を表示します。

表示されるもの:

- 国土地理院地図
- 山車の現在位置マーカー
- 山車名
- ステータス
- 最終更新時刻
- 3分以上更新停止時の警告
- 位置情報は目安である注意書き

## 周辺情報（pois.json）の作り方

祭りの**前日まで**に作っておきます。当日は公開APIにアクセスせず、`pois.json` を読むだけなので、APIが混雑・停止していても観客マップに影響しません。

1. PCまたはスマホで `poi-builder.html` を開く
2. 地図をタップして中心を決め、巡行ルートが入る半径を選ぶ
3. `公開データを集める` を押す
   - トイレ・AED・駐車場: OpenStreetMap（Overpass API）
   - 避難場所: 国土地理院 指定緊急避難場所データ（対応する災害の種類つき）
4. 不要な点（私有地の駐車場など）はタップして削除する
5. `追加モード` をONにして、本部・臨時トイレ・救護所など祭り独自の場所を追加する
6. `pois.json をダウンロード` を押し、`view.html` と同じ場所に置く

あとから直すときは、`既存の pois.json を開いて編集` で読み込めます。

注意:

- OpenStreetMapは有志が作る地図です。載っていない施設や古い情報があるので、**主要な場所は必ず現地で確認**してください。
- Overpass APIは混雑して失敗することがあります。その場合は時間をおいて再度押してください。
- 観客マップでは、トイレ・本部・救護所・AEDは最初から表示、避難場所・駐車場は最初は非表示です（ボタンで切り替え）。
- `pois.json` が無い場合は、山車だけを表示します。

天気について:

- [Open-Meteo](https://open-meteo.com/) の予報を山車の位置で取得し、30分ごとに更新します。APIキーは不要です。
- Open-Meteoの無料APIは非商用向けです。営利目的で使う場合は利用条件を確認してください。
- 天気が取得できなくても、山車の表示には影響しません。

## sender.html の使い方

山車側スマホで開くページです。

```txt
sender.html?id=dashi01
```

基本操作:

1. 山車側スマホで `sender.html?id=dashi01` を開く
2. 山車名と状況を確認する
3. `GPS状態確認` を押して位置が取れるか確認する
4. `送信開始` を押す
5. ブラウザの位置情報利用を許可する
6. 送信中は画面を開いたままにする
7. 終了時に `停止` を押す

送信条件:

- 前回送信地点から5m以上移動した
- 前回送信から30秒以上経過した

どちらかを満たしたときだけFirebaseへ送信します。1秒ごとの連続送信はしません。

## Firebase設定の貼り方

`view.html` と `sender.html` の中にある `firebaseConfig` を、FirebaseコンソールのWebアプリ設定に合わせます。

例:

```js
const firebaseConfig = {
  apiKey: "ここにFirebaseのapiKey",
  authDomain: "yatai-tracker-mvp.firebaseapp.com",
  databaseURL: "https://yatai-tracker-mvp-default-rtdb.firebaseio.com",
  projectId: "yatai-tracker-mvp",
  storageBucket: "yatai-tracker-mvp.firebasestorage.app",
  messagingSenderId: "285283040023",
  appId: "1:285283040023:web:af6de79936a5d0db321552"
};
```

FirebaseのAPIキーは秘密鍵ではありません。重要なのは、Realtime DatabaseのSecurity Rulesで読み書きを適切に制限することです。

## PCでの確認手順

1. `view.html?id=dashi01` をブラウザで開く
2. Firebase Realtime Databaseに `dashiLocations/dashi01` を手入力する
3. `lat` / `lng` / `updatedAt` を変更する
4. `view.html` のマーカーがリロードなしで動くことを確認する

PCではGPS取得できない場合があります。送信側の実確認はスマホで行ってください。

## スマホでの確認手順

1. スマホで `sender.html?id=dashi01` を開く
2. 位置情報の利用を許可する
3. `GPS状態確認` を押す
4. 緯度、経度、GPS精度が表示されることを確認する
5. `送信開始` を押す
6. Firebaseの `dashiLocations/dashi01` が更新されることを確認する
7. 別端末または別タブの `view.html?id=dashi01` でマーカーが動くことを確認する

## 屋外実機テスト手順

1. 山車側スマホを満充電にする
2. モバイルバッテリーを接続する
3. 画面スリープ設定を確認する
4. 屋外で `sender.html?id=dashi01` を開く
5. `GPS状態確認` を押す
6. `送信開始` を押す
7. 5m以上移動してFirebase更新を確認する
8. 同じ場所で30秒以上待ってFirebase更新を確認する
9. `view.html?id=dashi01` のマーカー反映を確認する
10. 画面スリープ、通信不安定、発熱、バッテリー消耗を確認する

## よくあるトラブル

### 地図が出ない

- 通信できているか確認する
- Leafletと国土地理院タイルを読み込めるネットワークか確認する
- ブラウザを再読み込みする

### Firebaseを読み込めない

- `firebaseConfig` の `databaseURL` を確認する
- Realtime Databaseが作成済みか確認する
- Security Rulesで読み取りが許可されているか確認する

### 位置情報が取れない

- ブラウザで位置情報を許可しているか確認する
- 屋外へ移動する
- 端末の位置情報設定をONにする
- iPhoneの場合はSafari、Androidの場合はChromeで試す

### 送信されない

- `送信開始` を押しているか確認する
- Firebase書き込み権限があるか確認する
- 5m移動または30秒経過の条件を満たしているか確認する
- 画面がスリープしていないか確認する

### 観客側の時刻が古い

- 山車側スマホの通信状態を確認する
- `sender.html` が開いたままか確認する
- バッテリー切れ、画面スリープ、熱停止を確認する

## 当日運用の注意点

- 位置情報は目安です。実際の山車位置とずれる場合があります。
- 山車側スマホは画面を開いたままにしてください。
- モバイルバッテリーを接続してください。
- 電波が弱い場所では送信が遅れることがあります。
- スマホが熱くなった場合は直射日光を避けてください。
- 観客には「更新が止まる場合がある」「位置は目安」と案内してください。

## Firebase Security Rulesについて

テスト中は読み書きを広く許可している場合がありますが、そのまま本番使用しないでください。

本番前には必ずSecurity Rulesを見直し、誰でも勝手に位置を書き換えられないようにしてください。詳しくは `firebase-rules-notes.md` を確認してください。
