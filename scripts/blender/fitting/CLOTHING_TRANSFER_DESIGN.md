# 衣装転送パイプライン設計書（最終版）

**最終更新**: 2026-05-07 (v6 cloth-first 路線確定)
**ステータス**: v5 (body-first LBS) の限界判明、v6 (cloth-first) へアーキテクチャ転換
**優先度**: 最高

---

## 🔥 2026-05-07 最重要：Body-First → Cloth-First へのアーキテクチャ転換

### 結論
> **「Body 適合」ではなく「衣類構造保存型フィッティング」**

v1〜v5 系の根本問題：**Body を主、Cloth を従**として設計してきた。
v6 以降：**Cloth 構造を主、Body は接触点（拘束条件）として扱う**。

### Body-First (v1〜v5) の限界

```
Body → Cloth
↓
体型差分 = cloth 変形
```

すべての vertex を Body との位置関係で再計算するため：
- 胸が大きい → cup が前に押される → cup 形状が潰れる
- 腰幅違う → ベルトが伸ばされる → デザイン破綻
- 体型差ごとに個別調整地獄 → スケールしない

### Cloth-First (v6〜) の本質

```
Cloth 構造 → Body へ適応
↓
体型差分 = anchor 位置だけ変わる
↓
布構造が吸収（cloth が主役）
```

実際の服の挙動と同じ：
1. 接触点（密着部）だけ Body に従う
2. それ以外は布の局所構造で自然補間
3. 体型差は anchor 位置の変化で吸収、cloth 形状は維持

### アンカー領域 vs フリー領域の分離（核心）

| 領域 | 例 | 拘束 |
|---|---|---|
| **Anchor (密着)** | underbust / waist / shoulder strap / collar / 股下 | 強拘束、Body 表面に固定 |
| **Free (非密着)** | 胸カップ中央 / スカート裾 / フリル / 布たるみ | 弱拘束、cloth 構造維持 |

これを **vertex ごと** に判定し、**異なる処理**で位置決定する。

### 関連学術概念

- **PBD / XPBD** (Position Based Dynamics): 距離拘束で edge length 維持
- **ARAP** (As-Rigid-As-Possible): 局所剛性保持（薄い硬質シート）
- **Shape Matching**: 1-ring neighborhood の回転込み形状一致
- **Cage Deformation**: Anchor + Free の構造適応

### スケール性（multi-character 展開での真価）

```
Body-first:  キャラA→B, A→C, A→D ... 個別調整地獄
Cloth-first: cloth 構造 = 不変、anchor 条件 = キャラごと
           → 新キャラ追加で線形コスト
```

これが SaaS / avatar platform で最終的に重要な性質。

---

## v6 実装ロードマップ（2026-05-07 確定）

### Phase 1: Anchor + Distance Constraint + Collision (PBD 静的)
- 接触点抽出 (Helena cloth ↔ Helena body 距離)
- Anchor を QM body 表面に固定
- 残り vertex を PBD distance constraint で edge length 維持しつつ反復解
- 外向き collision guard
- 工数: 3-4 時間

### Phase 2: Anchor Strength Field
- vertex ごとの constraint strength（連続値）
  - strap, underbust = 1.0 (強)
  - breast cup center, skirt hem = 0.1〜0.3 (弱)
- binary anchor → 連続 strength
- 工数: 2-3 時間

### Phase 3: Local Shape Matching (True ARAP)
- distance constraint → shape matching (回転込み)
- 1-ring neighborhood の rest を current の最小回転で剛体一致
- 胸 cup・ベルト等の「薄い硬質シート」感
- 工数: 1 日

### Phase 4: Material Profile
- bra (leather/silk), bodysuit (latex), dress (cotton)
- material ごとに constraint stiffness 係数
- 工数: 半日

### 実装スキップ（body-first 系の延命）

❌ bone roll 補正
❌ anisotropic scaling refinement
❌ region pull/push parameter tuning
❌ EXTRA_Z_SHIFT chain extension

これらは Phase 1+ で根本的に置換される。

---

## ⚠️ 2026-05-06 重要な方針変更（参考: v5 までの試行記録）

v2 (Offset 保存 Wrap) 実装後、**「offset で全部解こうとする設計が根本ミス」**と判明。

### 失敗の本質

```
find_nearest 距離 ≠ 解剖学的距離
```

tight 衣装 (bodysuit) は既に体表沿い → find_nearest = 数 mm のみ → cup 凹凸を表現できない。

### offset の正しい分解

| 物理量 | 用途 | 値 |
|---|---|---|
| **surface_offset** (法線方向の接触距離) | tight 衣装の食い込み防止 | 数 mm |
| **shape_offset** (形状/ボリューム差) | cup 凹凸、スカート広がり | cm スケール |

**1 つの offset で両方を表現することは不可能**。

### 結論：LBS が正解だった

v22 (LBS retargeting) は実は本質を捉えていた：
- bone matrix の構造で形状距離を **自然に表現**
- offset を別途測る必要なし

→ **「衣装は骨で動き、見た目は補正で作る」**

### v3 設計（LBS 主役 + 例外補正）

```
ベース: LBS（bone matrix retargeting）
補助:  scale 補正（必須）+ outward collision guard（必須） + base offset（食い込み防止）
例外:  shape 補正（胸ボリューム、スカート広がり等の特定部位のみ）
```

---

---

## 目的

ある character (例: Helena DAZ G8F) の clothing mesh を別 character (例: QM ARP rig) に **見た目・design feature を保ったまま** 転送し、voxel 化する。

ゴール条件：
- ✅ 元 design (cup 厚み, strap 形状, cutout) を保持
- ✅ target body 体型に解剖学的に追従
- ✅ pose 変化に robust
- ✅ 体型スケール差に対応
- ✅ body 内部貫通なし
- ✅ 完全決定論的（AI / 職人判断ゼロ）
- ✅ 衣装ごとの設定不要（自動分岐）

---

## 一行で言うと

> **「対応・座標系・スケール、この3つを固定すれば衣装は壊れない」**

我々が試行錯誤の末たどり着いた本質。すべての破綻はこの3軸のどれかが揺らいでいたために起きた。

---

## 過去の試行錯誤（学習履歴）

| 試行 | 手法 | 失敗パターン | 揺らいでいた軸 |
|---|---|---|---|
| v2 | Shrinkwrap NEAREST_SURFACEPOINT | cup 潰れ、strap が neck に飛ぶ | offset を 0 化（座標系を捨てる） |
| v2.1 | v22 fit + Inside-only push | 同上の symptom 残る | offset を保持しない |
| v3a | Mesh Deform 全身 cage | T-pose↔A-pose で arm 領域 cage 崩壊 | scale 未対応・対応不安定 |
| v3d | Mesh Deform torso-only cage | 同上、torso 限定で多少改善 | 同上 |
| TPS retarget | 解剖アンカー TPS | 部位精度 OK だが mustache 残存 | offset 保持なし |
| TPS+Push | 上記+inside-only push | 内蔵に引かれる、wing 状の余分 | 対応不安定（最寄り body 内部 mesh） |
| TPS+Push+OuterBVH | 外殻 BVH 使用 | 内蔵問題は緩和、wing/zigzag 残る | scale 未対応 |
| Hybrid (TPS+v2 merge) | 領域別に best-of-both | merge アーティファクト | 統合の境界が不連続 |
| Voxel align (Layer push) | voxel-level shell normal projection | max push 30 voxel で爆散 | 座標系 / 距離保持なし |
| Helena 元基準 validation | Helena 元 voxel との距離フィルタ | 過剰削除 (背中ほぼ消失) | 基準が source body 形状と一致しない |

**結論**: どれも個別の症状を追っているだけで本質を捉えていなかった。

---

## 最終設計：Offset 保存 Wrap

### 核心の式

```
[原ソース空間]
offset_local = (cloth_vertex - body_surface_point) を TBN frame に投影

[ターゲット空間]
new_pos = target_body_surface + offset_local（scaled）を target TBN frame で再構築
```

これで cup 厚みも strap も cutout も保持される。Shrinkwrap が cup を潰すのは「offset を 0 にしてしまう」だけで、保持すれば問題ない。

### 3 軸固定原則

| 軸 | 何を固定するか | なぜ |
|---|---|---|
| **対応** | source の triangle index + barycentric coords を vertex ごと cache | フレーム間で別 face にジャンプしない、ノイズ消失 |
| **座標系** | offset を TBN frame (Tangent-Bitangent-Normal) で記録 | world 空間依存をなくし、pose/orientation 変化に robust |
| **スケール** | bone length 比で offset をスケーリング | 体型差（胸サイズ・足太さ）で見た目を維持 |

---

## 完成版パイプライン

### 全体フロー

```
[1] Weight Transfer (POLYINTERP_NEAREST)
    ↓
[2] Compute correspondence (一回だけ実行 → cache)
    - 各 cloth vertex → source body の (face_idx, barycentric, offset_TBN, scale_ratio)
    ↓
[3] Outfit type detection (per-region + variance)
    ↓
[4] Reproject to target
    - 対応 face 取得 (source face_idx → target face_idx mapping)
    - target TBN で offset 再投影
    - scale 適用
    ↓
[5] Collision guard (outward-only push)
    ↓
[6] Voxelize
```

### 各ステップ詳細

#### [1] Weight Transfer

Blender 標準 `data_transfer` を使用：

```python
bpy.ops.object.data_transfer(
    data_type='VGROUP_WEIGHTS',
    vert_mapping='POLYINTERP_NEAREST',
    layers_select_src='ALL',
    layers_select_dst='NAME',
    mix_mode='REPLACE'
)
bpy.ops.object.vertex_group_normalize_all()
```

**利点**: bone 名手動 mapping 辞書（旧方式）が不要になる。target body の weights を cloth に自動転送。

#### [2] Correspondence + Offset 計算

```python
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

EPS_AREA = 1e-6

def compute_TBN(v0, v1, v2):
    """三角形から TBN frame 構築。一貫した右手系を保証。"""
    edge1 = v1 - v0
    edge2 = v2 - v0
    N = edge1.cross(edge2).normalized()
    T = edge1.normalized()
    # Gram-Schmidt: T を N と直交化
    T = (T - T.dot(N) * N).normalized()
    B = N.cross(T).normalized()
    # 右手系強制
    if (T.cross(B)).dot(N) < 0:
        B = -B
    return T, B, N

def compute_barycentric(p, v0, v1, v2):
    """3D point の barycentric coords (重心座標)。"""
    n = (v1 - v0).cross(v2 - v0)
    n2 = n.dot(n)
    if n2 < 1e-12:
        return Vector((1.0, 0.0, 0.0))
    u = ((v2 - v1).cross(p - v1)).dot(n) / n2
    v = ((v0 - v2).cross(p - v2)).dot(n) / n2
    w = 1.0 - u - v
    return Vector((u, v, w))

def safe_face_lookup(point, bvh, mesh_faces):
    """face area 崩壊時の fallback 付き lookup。"""
    nearest_loc, normal, face_idx, dist = bvh.find_nearest(point)
    face = mesh_faces[face_idx]
    if face.area < EPS_AREA:
        # k-nearest 候補から area 最大を選択
        # (Blender BVHTree には range query 直接ないので別途実装要)
        face_idx = find_largest_area_face_nearby(point, bvh, mesh_faces, dist * 2.0)
    return face_idx, nearest_loc, normal

def vertex_scale_ratio(weights, src_arm, tgt_arm, bone_name_map):
    """bone weights から blended scale ratio を算出。"""
    total_w = 0
    weighted_scale = 0
    for bone_idx, w in weights:
        s_name = bone_names[bone_idx]
        t_name = bone_name_map.get(s_name)
        if t_name is None: continue
        s_bone = src_arm.bones.get(s_name)
        t_bone = tgt_arm.bones.get(t_name)
        if s_bone is None or t_bone is None: continue
        s_len = (s_bone.tail_local - s_bone.head_local).length
        t_len = (t_bone.tail_local - t_bone.head_local).length
        if s_len > 1e-6:
            weighted_scale += w * (t_len / s_len)
            total_w += w
    return weighted_scale / total_w if total_w > 0 else 1.0

# === メインループ ===
correspondence = {}
for v_idx, v in enumerate(cloth.data.vertices):
    wp = cloth.matrix_world @ v.co
    face_idx, nearest_loc, normal = safe_face_lookup(wp, src_body_bvh, src_body_faces)
    face = src_body_faces[face_idx]
    v0, v1, v2 = [src_body_world_verts[i] for i in face.vertices[:3]]
    bary = compute_barycentric(nearest_loc, v0, v1, v2)
    T, B, N = compute_TBN(v0, v1, v2)
    delta = wp - nearest_loc
    offset_local = Vector((delta.dot(T), delta.dot(B), delta.dot(N)))
    scale = vertex_scale_ratio(v.groups, src_arm, tgt_arm, bone_name_map)
    correspondence[v_idx] = {
        'face_idx': face_idx,
        'bary': list(bary),
        'offset_local': list(offset_local),
        'scale': scale,
    }
```

**output**: `correspondence.json` (cache、per cloth vertex の対応情報)

#### [3] Outfit Type Detection

```python
# 部位別 offset 統計（cloth vertex の bone weights から region 振り分け）
REGION_BONES = {
    'torso':  {'DEF-spine', 'DEF-spine-1', 'DEF-chest', 'pectoral.L', 'pectoral.R'},
    'leg':    {'thigh.bend.L', 'thigh.bend.R', 'shin.bend.L', 'shin.bend.R'},
    'arm':    {'upper_arm.bend.L', 'upper_arm.bend.R', 'forearm.bend.L', 'forearm.bend.R'},
    'head':   {'head', 'neck'},
}

def classify_region(top_bone):
    for region, bones in REGION_BONES.items():
        if top_bone in bones:
            return region
    return 'other'

regions = {r: [] for r in REGION_BONES}
for v_idx, c in correspondence.items():
    top_bone = cloth.vertex_groups[cloth.data.vertices[v_idx].groups[0].group].name
    region = classify_region(top_bone)
    if region != 'other':
        offset_n = c['offset_local'][2]  # N 成分のみ
        regions[region].append(offset_n)

import statistics
type_per_region = {}
for region, offsets in regions.items():
    if len(offsets) < 5:
        type_per_region[region] = 'unknown'
        continue
    med = statistics.median(offsets)
    var = statistics.variance(offsets) if len(offsets) > 1 else 0
    if med < 0.005 and var < 0.000016:    # < 5mm and < 4mm std
        type_per_region[region] = 'tight'
    elif med > 0.030 or var > 0.0009:     # > 30mm or > 30mm std
        type_per_region[region] = 'loose'
    else:
        type_per_region[region] = 'semi'

# 全 region tight → tight 衣装
# torso=tight, leg=loose → skirt 形状（部位ごと別処理）
overall_type = 'tight' if all(t == 'tight' for t in type_per_region.values()) else 'mixed'
```

#### [4] Reproject to Target

```python
def reproject_with_collision_guard(point, tgt_body_bvh, MIN_OFFSET=0.002):
    """body 内部に押し込まない。outward only push。"""
    nearest_loc, nearest_normal, _, _ = tgt_body_bvh.find_nearest(point)
    delta = point - nearest_loc
    signed_dist = delta.dot(nearest_normal)
    if signed_dist < MIN_OFFSET:
        # 内部 or 近すぎ → 法線方向に押し戻す
        return nearest_loc + nearest_normal * MIN_OFFSET
    return point  # 外側に十分離れている → 触らない

# Source face → Target face mapping
# 案 A: TPS map で source face center → target nearest face
# 案 B: bone-anatomy ベース（cloth bone weights から target 該当 region face 候補化）
# 案 C: source/target body topology が同じ場合は direct face index mapping

# Reproject loop
for v_idx, c in correspondence.items():
    src_face_idx = c['face_idx']
    bary = Vector(c['bary'])
    offset_local = Vector(c['offset_local'])
    scale = c['scale']

    # Map source face → target face (TBD: implement mapping function)
    tgt_face_idx = map_face_src_to_tgt(src_face_idx, src_body, tgt_body, tps_data)
    tgt_face = tgt_body_faces[tgt_face_idx]
    tv0, tv1, tv2 = [tgt_body_world_verts[i] for i in tgt_face.vertices[:3]]

    # Target body point at same barycentric
    tgt_p = bary[0] * tv0 + bary[1] * tv1 + bary[2] * tv2

    # Target TBN
    T_t, B_t, N_t = compute_TBN(tv0, tv1, tv2)

    # Apply scale-corrected offset
    scaled = offset_local * scale
    new_pos = tgt_p + scaled[0] * T_t + scaled[1] * B_t + scaled[2] * N_t

    # Collision guard (outward only)
    new_pos = reproject_with_collision_guard(new_pos, tgt_body_bvh)

    # Write back
    cloth.data.vertices[v_idx].co = cloth.matrix_world.inverted() @ new_pos
```

**Type 別調整**:

```python
# Tight: scale 補正は控えめ、collision guard 強め
# Semi:  region mask で部位別 offset 制御
# Loose: scale 補正そのまま、collision guard 緩め
```

#### [5] 最終 Collision 補正

reproject 後の最終 pass：すべての vertex で outward-only push を再確認。

#### [6] Voxelize

既存 `voxelize_mustardui.py` でそのまま voxelize。

---

## 実装ファイル構成

```
config/
  clothing_retarget_helena_to_qm.json    # bone 名 mapping (Weight Transfer 不要だが scale 計算で必要)

scripts/blender/fitting/
  CLOTHING_TRANSFER_DESIGN.md            # この設計書
  weight_transfer.py                     # Step 1
  compute_correspondence.py              # Step 2 (correspondence.json 出力)
  detect_clothing_type.py                # Step 3 (per-region type 判定)
  reproject_offset_tbn.py                # Step 4 (TBN 再投影 + scale + collision guard)
  finalize_collision.py                  # Step 5 (任意の最終補正)
  batch_outfits_to_qm_v2.sh              # 全 outfit バッチ
```

各スクリプト独立、output 中間ファイル (correspondence.json) で decoupled。

---

## 落とし穴と対策（実装時 checklist）

### ① TBN 向き反転対策

```python
# 必ず Gram-Schmidt + 右手系強制
T = (T - T.dot(N) * N).normalized()
B = N.cross(T).normalized()
if (T.cross(B)).dot(N) < 0:
    B = -B
```

❌ 対策しないと: offset 符号が反転、cup が内側に刺さる、フレーム間でパタつく。

### ② Barycentric 面崩壊対策

```python
if face.area < EPS_AREA:
    # fallback to k-nearest with area filter
    face_idx = find_largest_area_face_nearby(...)
```

❌ 対策しないと: 細長い退化三角形で精度崩壊。

### ③ Scale 補正

```python
scale = vertex_scale_ratio(v.bone_weights, src_arm, tgt_arm, bone_map)
scaled_offset = offset_local * scale
```

❌ 対策しないと: 胸/太もも/腕の体型差で見た目が破綻（Helena 30mm cup → QM では相対 50% 厚い）。

### ④ Outward-only Push (Collision Guard)

```python
if signed_dist < MIN_OFFSET:
    return nearest_loc + nearest_normal * MIN_OFFSET  # 外向きにのみ移動
return point  # 既に外側なら何もしない
```

❌ 対策しないと: 法線方向 push が body 内部に押し込む場合あり。

---

## Source/Target Topology 不一致への対応

Helena_Final_Public.blend (DAZ G8F base) と QM ARP rig は **異なる body topology** を持つ。
そのため `map_face_src_to_tgt(src_face_idx)` の実装が必要。

### 候補 1: TPS による map

既存の `tps_retarget.py` で構築した TPS field を使い、source face center を target world に map → nearest target face を取得。

```python
src_face_center = compute_face_center(src_face)
tgt_world = tps_apply(src_face_center, tps_data)
_, _, tgt_face_idx, _ = tgt_body_bvh.find_nearest(tgt_world)
return tgt_face_idx
```

問題: nearest が face area 崩壊や内蔵 mesh に hit する可能性 → safe_face_lookup を target 側にも適用。

### 候補 2: Bone anatomy ベース

cloth vertex の bone weights から「どの bone が dominant か」を識別し、target body の同 bone 領域内 face を候補化。

```python
top_bone_src = find_top_bone(v.weights)
top_bone_tgt = bone_map[top_bone_src]
candidate_faces = tgt_body_faces_weighted_to(top_bone_tgt)
return nearest_face_in(candidate_faces, src_face_center_mapped)
```

候補 1 + 2 の hybrid が安定。

---

## 衣装タイプ別処理フロー

| Type | Position | Scale | Collision Guard |
|---|---|---|---|
| **Tight** (bodysuit, shirt) | TBN offset 小 + 強い collision guard | 強め | 厳格 (MIN_OFFSET 2mm) |
| **Semi** (panties, corset) | 部位 mask で TBN offset 部分的 | 部位別 | 中庸 (MIN_OFFSET 5mm) |
| **Loose** (dress, skirt) | TBN offset 完全保持 + TPS 局所補完 | そのまま | 緩い (MIN_OFFSET 10mm) |

判定は per-region で行い、混在 (mixed) の場合は region ごとに上記処理を適用。

---

## 旧スクリプトの位置づけ

| 旧スクリプト | 新設計での役割 |
|---|---|
| `tps_retarget.py` | **補助**（loose 衣装の局所 TPS、または face mapping 用） |
| `push_inside_only.py` | **廃止**（reproject_offset_tbn.py の collision guard に統合） |
| `merge_clothing_voxels.py` | **不要**（offset 保持で 1 パス完結） |
| `validate_voxels_by_helena.py` | **不要**（offset 保持で異物原理的に発生しない） |
| `align_clothing_by_layer.py` | **任意**（voxel-level の最終 polish 用） |

---

## 評価指標

新パイプラインの成果は以下で評価：

1. **Cup 厚み保持**: source の cup 厚み[mm] / target の cup 厚み[mm] が 0.9〜1.1 倍内
2. **体表貫通率**: 全 voxel 中、body 内部 voxel の割合 < 1%
3. **Coverage 完全性**: source voxel 数 / target voxel 数 が 0.85〜1.15 倍内
4. **異物率**: 期待領域外 voxel < 5%
5. **対称性**: L/R 対称な衣装で voxel 数の左右差 < 3%

---

## 任意の追加改善

| 項目 | 内容 |
|---|---|
| LOD 対応 | 低ポリ source でも破綻しないよう face area threshold 動的調整 |
| Cache binary 化 | correspondence.json → numpy npz でロード高速化 |
| GPU 化 | 大規模 outfit (qipao 10k+ verts) で compute shader |
| 物理シム連携 | loose 衣装で cloth swing bone を併用 |

---

## 開発履歴サマリー

- **2026-05-06 早朝**: TPS/Push/Hybrid 試行、各種破綻パターン蓄積
- **2026-05-06 午後**: 「offset 保存」概念到達 → 設計確定
- **次フェーズ**: 完成版パイプライン実装

---

## 一行まとめ（再掲）

> **「対応・座標系・スケール、この3つを固定すれば衣装は壊れない」**
