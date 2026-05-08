# 将来実装メモ: アプローチ B（Helena → QM プロポーション morph）

## 目的
Helena モデルを QM プロポーション（骨長・体型）に寄せた状態で voxel 化し、
characters-preview で QM と重ねて proportion 一致を視覚確認する。

## 用途
- Helena 由来の衣類を QM body に fit させる際の「最適な形」の参考
- voxel 比較で身体プロポーションの一致度を測定
- 将来的にスケーリング不要で衣類転送できる Helena base の基礎

## アプローチ B：Mesh Deform with body cage
1. FIXED QMRest Helena を使用（dress mesh data が posed visual に焼き込み済）
2. Helena body に Mesh Deform 不要、代わりに Shrinkwrap で QM 形状に morph
3. dress (および他衣類) に Mesh Deform を bind (cage = Helena body)
4. body の Shrinkwrap を有効化 → body が QM 形状に変形
5. Mesh Deform 経由で dress も追従（cage 形状変化に追従）
6. 各衣類の Mesh Deform を Apply

## 実装上の注意
- earlier に fit_helena_to_qm.py で同じことを試して「Helena fit」結果になった
  → 当時は QMRest の bake 修正前だった（dress mesh data が T-pose のままだった）
  → bake 修正後の FIXED QMRest なら正しく動く可能性大
- Mesh Deform の precision 設定が重要（cage の morph に追従できる解像度が必要）
- Helena は QM の約 2 倍のサイズ → cage 変形量が大きい、bind 精度に影響しないか要検証

## 実行コマンド例（雛形）
```powershell
$BL = "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
$ROOT = "C:\Users\user\developsecond\contactform"
$HELENA_REST = "F:\Helena_Douglas_1.10_QMRest.blend"
$QM = "E:\MOdel\要確認モデル\QueenMarika_Rigged_MustardUI.blend"

# fit_helena_to_qm.py を FIXED QMRest で実行
& $BL --background $QM `
  --python "$ROOT\scripts\blender\fitting\fit_helena_to_qm.py" -- `
  $HELENA_REST "Body" "Helena Default - Dress" `
  "Queen Marika Body" "QueenMarika_rig" `
  "F:\Helena_to_QM_default_dress_meshdeform.blend"
```

## 検証方法
- 出力 blend を Blender で開いて dress mesh が QM body 形状に追従しているか確認
- voxelize して characters-preview の helena_qmrest と比較
- 特に胸・ヒップが QM 形状に寄っているか
