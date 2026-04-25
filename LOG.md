Shrinkwrap＋Surface Deform（まずこれ）

精度と安定性のバランスがいい方法です。

手順
服モデルを選択
Blenderの「Shrinkwrap」モディファイア追加
Target：自分の体モデル
Mode：Nearest Surface Point or Project
少し浮かせる（Offset 0.01〜0.02）

👉 これで「表面に吸着」する

次に

「Surface Deform」モディファイア追加
Target：体モデル
Bind を押す

👉 これで「体の変形に追従」

最後にShrinkwrapは削除 or 弱める
特徴
体型違いにかなり強い
アニメーションにも対応
服の破綻が少ない
■ もっと雑に合わせたい：Data Transfer

「とりあえず近い形にしたい」ならこれ

手順
Data Transferモディファイア
Vertex Data → Vertex Groups or Shape
Mapping：Nearest Face Interpolated

👉 頂点の位置や法線を転写

特徴
一瞬でそれっぽくなる
精度は低め
トポロジー依存あり
■ ガチ調整：スカルプト＋プロポーショナル編集

結局これが一番確実な場面も多い

やること
Sculpt ModeでGrab / Smooth
Proportional Editingで微調整

👉 特に

肩
股関節
胸周り

ここは自動じゃほぼ崩れます

■ リグ付きの場合（重要）

もし両方にアーマチュアがあるなら：

方法
服を体と同じArmatureに設定
Weight Transfer（ウェイト転送）
手順
服にArmature Modifier追加（体と同じ）
Data Transferで
Vertex Groupsを転送

👉 これで「動き」が一致する

■ Cloth Simulationで自然にフィット（上級）

リアル志向ならこれ

手順
服にCloth
体にCollision
一度シミュレーション

👉 自然に落ちる

注意
重い
制御が難しい
ゲーム用途には不向き
■ よくある失敗

これめちゃ多いです👇

トポロジー違いすぎ → 変形破綻
スケール違う → 全部ズレる
原点位置違う → Shrinkwrap暴走
Applyしてない → 計算狂う

👉 Ctrl+AでScale適用は必須

■ 結論（実務おすすめ）

あなたの用途ならこれ一択👇

Shrinkwrap → Surface Deform → Weight Transfer → 微調整

■ もう一歩踏み込むなら

もし「完全自動でフィットしたい」なら：

Wrap系アドオン（有料）
リトポ前提のワークフロー

も検討領域です