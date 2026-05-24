# Claude Code プロジェクト設定

## 重要: セッション開始時の確認事項

**毎回のセッション開始時、以下のファイルを最初に確認してください:**

```
src/character-move/UTILS_SYSTEM_REFACTORING.md
```

このファイルには以下が含まれています:
- 作業手順書（Phase 0〜4）
- 実装予定のタスクリスト
- 将来計画（IK+アニメーションブレンディング）
- 変更履歴

## 編集禁止ファイル

以下のファイルは **絶対に編集してはいけない**。人体構造の知識に基づいて手動で調整された設定値であり、AI が勝手に変更すると不正な動作になる。

- `src/GamePlay/GameSystem/CharacterMove/Config/JointLimitsConfig.ts` — ジョイント角度リミット設定（min/max 値）

## コード作成・修正時のルール

1. **作業前**: 作業手順書を確認し、該当タスクのチェックボックスを確認
2. **作業中**: 新しい発見・課題があれば作業手順書に追記
3. **作業後**: 完了したタスクのチェックボックスを `[x]` に更新
4. **変更履歴**: 重要な変更は変更履歴セクションに追記

## 必須: コード品質ルール

### 未使用変数の削除
**「宣言されていますが、その値が読み取られることはありません」エラーは必ず修正すること。**

コード修正後、以下のパターンが残っていないか確認:
- 使用されなくなった変数宣言
- 削除したコードで使われていた変数
- リファクタリング後の不要な変数

修正方法:
1. 変数が本当に不要なら削除
2. 将来使う予定があるなら `_` プレフィックスを付ける（例: `_unusedVar`）
3. 分割代入で不要な値は `_` で受ける（例: `const [_, needed] = array`）

**確認コマンド（必ず実行）**:
```bash
npx tsc --noEmit --noUnusedLocals 2>&1 | grep "TS6133\|TS6192"
```
※ 通常の `npx tsc --noEmit` では未使用変数エラーは表示されないため、必ず `--noUnusedLocals` オプションを付ける

## プロジェクト概要

- **言語**: TypeScript
- **フレームワーク**: Babylon.js（3Dゲームエンジン）
- **物理エンジン**: Havok
- **対象**: バスケットボールゲームのキャラクター制御システム

## 主要ディレクトリ構造

```
src/character-move/
├── ai/           # AI制御（状態別AI、分析）
├── config/       # 設定ファイル
├── controllers/  # コントローラー（Motion, Balance, Collision等）
├── entities/     # エンティティ（Character, Ball, Field）
├── motion/       # モーションデータ
├── physics/      # 物理計算（軌道計算等）
├── systems/      # システム（BallCatch, BalanceCollision等）
├── types/        # 型定義
├── utils/        # ユーティリティ関数
└── UTILS_SYSTEM_REFACTORING.md  # 作業手順書
```

## デバッグ時のルール

### コンソールログの使用制限
**コンソールログでの確認は基本的に行わない。**

デバッグでコンソールログを使用する必要がある場合は、以下の手順に従う：
1. **事前に全ての既存デバッグログを削除**する
2. **必要最小限のログのみ追加**する（問題箇所に絞る）
3. **調査完了後は必ず追加したログを削除**する

理由：
- 大量のログが出力されると問題の特定が困難になる
- 本番コードにデバッグログが残るリスクがある
- パフォーマンスに影響する

### 代替手段の検討
コンソールログの代わりに以下を検討：
- ブレークポイントによるデバッグ
- ユニットテストの作成
- コードの論理的な分析

## リファクタリング作業のルール

**重要: これは設計提案ではなく、コードを書き換えるリファクタ作業です。**

リファクタリング作業時は以下を遵守すること：

1. **途中で止めない**: 必ず全ステップを完了させる
2. **新規ファイルだけ作って元コードを残す行為は失敗**: 元ファイルの実装も必ず置き換える
3. **完了条件を満たすまで作業を続ける**

### リファクタリングの完了条件

以下の全てを満たすまで作業を続けること：

- [ ] 元ファイルに元の実装が一切残っていない
- [ ] 新規ファイルへ完全移譲されている
- [ ] 元ファイルはimport + orchestration（委譲呼び出し）のみ
- [ ] `npx tsc --noEmit` でコンパイルエラーがない
- [ ] `npx tsc --noEmit --noUnusedLocals` で未使用変数エラーがない

### リファクタリングの手順

① 新規ファイル作成（Manager, Controller, Utils等）
② 元ファイルのロジックを新規ファイルに移動
③ 元ファイルを薄いラッパー（委譲のみ）に変更
④ 不要なimport・メソッド・プロパティを削除

**③と④を忘れないこと！** 新規ファイルを作っただけでは未完了。

## 現在の優先タスク

1. Phase 0: クリーンアップ（console.log削除、DEBUGコメント削除）
2. Phase 1: 基本ユーティリティ（normalizeAngle, TeamUtils, GoalUtils）
3. Phase 2: リスク判定システム（DefenderStateUtils, RiskAssessmentSystem）
4. Phase 3: 既存コード置き換え
5. Phase 4: 統合・最適化

## 衣装フィッティング作業時のセッション開始ルール (2026-05-13 追加)

衣装転送 / QM フィット / cloth-first / ARAP / ボクセル化に関わる作業を開始する際、
コードを書く前に必ず以下を実行する。本日 (2026-05-13) のセッションで
「最終ゴール理解不足のまま中間段階に手を出す」失敗が起きたため、再発防止として追加。

### 必読 (順序固定)

1. `C:\Users\user\.claude\projects\C--Users-user-developsecond-contactform\memory\MEMORY.md`
2. 上記 MEMORY.md からリンクされている関連メモリのうち、衣装転送・QM フィット・cloth-first 系:
   - `project_cloth_first_v6_design.md`
   - `feedback_cloth_first_evaluation.md`
   - 該当キャラの `project_<name>_pipeline.md`
3. 設計書: `scripts/blender/fitting/CLOTHING_TRANSFER_DESIGN.md`
4. 設計図: `public/image/やりたいこと.png`

### 必須確認 (作業前)

- 最終ゴールをユーザー発言から明示確認する (推測で決めない)
- 不明確なら「最終ゴールは X で正しいですか?」と質問してから着手
- 上記必読を読まずに手を動かさない

### 冒頭報告フォーマット

作業開始前のメッセージで以下を明記する:
- 読了したファイルリスト
- 認識した最終ゴール (1 文)
- 既存設計との整合性チェック結果
- 着手する Step / Phase

### 違反した場合

本日のセッションのように「最終ゴール理解不足のまま中間段階に手を出す」失敗が
再発し、ユーザーに余計な軌道修正負荷をかける。厳守。

## 衣装フィット作業 - 現状継続情報 (2026-05-14)

### ユーザー方針 (重要、過去資産との関係)

ユーザー指示で **以下を「無いものとして」扱う** (2026-05-13 確定 / 2026-05-21 shrinkwrap 物理削除):
- 過去の衣装フィット設計・実装 (cloth-first v6, ARAP)
- 設計書 `CLOTHING_TRANSFER_DESIGN.md` および設計図 `public/image/やりたいこと.png`
- 過去 memory の `project_cloth_first_v6_design.md` / `feedback_cloth_first_evaluation.md` 系
- 試行版ボクセル (qm_mustardui 配下の v2/v16/v18/_cf/_arap 等 suffix を持つもの)

**QM 体形フィット (shrinkwrap_helena_to_qm_body) は 2026-05-21 に物理削除済み**。

**さらに 2026-05-21 確定: transplant も `--no-lbs` フラグ必須**。`--no-lbs` 無しの transplant は LBS retarget で各 vertex を `T = M_qm_bone @ M_src_bone^-1` で変換し source rest 空間 → QM rest 空間へ移動するため、ボディが QM プロポーションへ変形する。これも除去したい挙動なので、新キャラ voxelize でも常に `--no-lbs` を付ける。

結果: source rest 位置のメッシュ + QM ボーン名 + QM rig 親子付け の状態で voxelize される。メッシュ形状はソースキャラ完全保持、bone weight は QM ボーン名で参照可能、skeleton.json は QM rest pose で出力 (mesh と bone の位置が不一致だが、`/qm-mustardui-preview` の静的 voxel 表示には影響なし)。

**残す資産: ボクセル化ロジック (`scripts/blender/voxelize/voxelize_mustardui.py`) と LBS retarget (`scripts/blender/fitting/transplant_qm_armature_to_helena.py`、ただし `--no-lbs` で呼ぶ)**

### 最終目標 (2026-05-14 ユーザー訂正)

**任意のソースモデル (Helena / Anna / Rachel / 今後追加されるキャラ) の衣装を**
**QM 体型にフィット・ボクセル化する汎用パイプラインの構築**。
個別キャラ対応ではなく、新キャラ追加 = config 1 個追加で動くシステムが目標。

スコープ衣装種: bra / bodysuit / swimsuit / stockings / pants / panties / corset。
最初の検証ターゲット: Rachel Casual Thong (panties)。これが通ったら Helena/Anna に config を増やす。

### 2026-05-14 セッション結果 (継続中)

**判明した真因 (確定)**: QM body は **thickness 構造の二重 shell mesh**
- 24328 verts: outer-facing 11217 + inner-facing 5522 + neutral 7589
- 13795 outer face + 2737 inner face + 2837 neutral face
- voxelize 後に内部空隙が残り、ビューアで「表面 Body の下に細い小さな Body」と見える
- **mesh の face 削除 (inner-face を直接消す) は voxelize Pass 2 parity を破壊して悪化**

**対処: voxel-level flood fill (採用済)**:
- `tmp/fill_body_interior.py` で body voxel の外側から BFS flood fill
- 到達しない empty cells = 内部空隙 → solid 充填
- 全 QM 系 body.vox 修正完了:
  - `qm_mustardui/body.vox` (657 KB, +67% voxel)
  - `helena_qm_compare/qm/body.vox`, `anna_qm_compare/qm/body.vox`, `rachel_qm_compare/qm/body.vox`
  - 元ファイルは `*.beforeFloodFill.bak.vox` 保管

**衣装フィット試行 V1-V15 (全て失敗)**:
- Shrinkwrap (PROJECT/NEAREST), Cloth simulation, anchor, pre-scale など mesh deformation 系を 15 通り試行
- ユーザー判定で全て不採用。V8 (股間 anchor) が最良だが体型差で全体ズレ
- 詳細: memory `project_qm_clothing_fit_attempts_2026_05_14.md`
- 教訓 (memory): `feedback_mesh_deformation_clothing_fit.md` — mesh deformation を 2-3 回試して失敗したら即別ルートに切替

**次セッションの方針 (ユーザー認可待ち)**:
- A. QM 既存衣装 (Default Panties など) を直接 voxel 化 ← 最速・確実
- B. Voxel-level retarget (Rachel body+thong を Rachel scale voxelize → bone 経由で QM transfer)
- C. QM body voxel の bone region から panties 範囲抽出 → dilation

ユーザーは「mesh deformation 以外の方法に切替」を要求 (V15 後)。

### 試行残骸クリーンアップ完了 (2026-05-14 セッション末尾)

以下すべて削除済:
- `public/box5/qm_mustardui/rachel_casual_thong_{route1,route5,v7-v15}*.vox` + 対応 `.weights.json` (合計 40 ファイル)
- `tmp/v{12..15}*.py`, `tmp/route{1,5}*.py`, `tmp/extract_qm_outer_shell.py`,
  `tmp/build_qm_body_outerskin.py`, `tmp/voxelize_qm_body_clean.py` (9 ファイル)
- `F:/ContactFormModel/qm_thong_v{7..13}*.blend` (9 ファイル、~2GB)
- `tmp/qm_thong_v15.blend`, `tmp/qm_thong_v14_clean.blend`, `tmp/qm_body_clean.blend`, `tmp/qm_body_outerskin.blend` (~1.5GB)
- `src/app/route1-check/page.tsx` (V8/V11-V15 切替 viewer)

合計約 3.5GB を解放。次セッションは clean state から方針 A/B/C を選択して着手すること。

### 残す資産 (再利用可)

- `tmp/fill_body_interior.py` — voxel 内部空隙充填 (新キャラ voxelize 後に必ず実行)
- `tmp/inspect_body_outer_vox.py` — body voxel の Z slice 分析
- 既存資産: `scripts/blender/voxelize/voxelize_mustardui.py` のみ (CLAUDE.md 既存指示通り)

### 進めるとき守ること

- 推測で対症療法しない
- 視覚情報は私には届かないので、MCP / socket 経由で数値・screenshot で確認してから判断
- 「動いた」と「設計成功」を混同しない
- **Mesh deformation 系 (shrinkwrap, cloth, anchor) は 2-3 回試して失敗したら即別ルートに切替** (今回 15 回試して時間浪費した教訓)
- 新キャラの body.vox 生成後は必ず `fill_body_interior.py` で flood fill 充填する
