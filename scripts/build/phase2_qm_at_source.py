"""Phase 2 — QM ボーン階層を **QM rest pose のまま** 各骨を source 体型サイズに
リサイズする。

Phase 2 の目的:
  - ポーズ = QM rest pose（source が A-pose 等でも T-pose 等の QM 基準に統一）
  - サイズ = 各 bone を source の対応 deform bone の長さに合わせる
  - 階層構造 = QM のもの

各 bone は:
  - 方向 (direction) = QM の rest pose 方向（変えない、これがポーズ統一）
  - 長さ (length) = source 対応 bone の長さ（リサイズ）。source 側に対応無し、または
    source bone が異常に短い marker bone の場合は QM 長さを保持
  - 位置 (head) = 親骨の new_tail に追従（connected の場合）、または親 head からの
    QM 相対オフセットを保持（non-connected の場合）

Output: `/build` panel 3「QM @ source proportions」

Usage:
  blender --background --python phase2_qm_at_source.py -- \\
          <source_skel.json> <qm_skel.json> <vg_rename.json> <out_skel.json> \\
          [--qm-full <qm_skeleton_full.json>]
"""
import json
import math
import os
import sys


# Source bone が QM bone のこの比率未満なら marker と判定し QM 長さを保持
MARKER_THRESHOLD = 0.5
# Connected 判定: 親 tail と子 head の距離がこれ未満なら connected
CONNECTED_EPSILON = 0.001  # 1mm


def vec_sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vec_add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vec_scale(v, s):
    return [v[0] * s, v[1] * s, v[2] * s]


def vec_norm(v):
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def main(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = argv[1:]
    qm_full_path = None
    args_clean = []
    i = 0
    while i < len(argv):
        if argv[i] == "--qm-full" and i + 1 < len(argv):
            qm_full_path = argv[i + 1]; i += 2; continue
        args_clean.append(argv[i]); i += 1
    if len(args_clean) < 4:
        print(__doc__); sys.exit(1)
    src_path, qm_path, cfg_path, out_path = args_clean[0], args_clean[1], args_clean[2], args_clean[3]

    with open(src_path, encoding="utf-8") as f: src = json.load(f)
    with open(qm_path, encoding="utf-8") as f: qm = json.load(f)
    with open(cfg_path, encoding="utf-8") as f: cfg = json.load(f)

    vg_rename = cfg.get("vg_rename", {})
    # phase2_length_scale: {qm_bone: scale_relative_to_qm_length}.
    # When set, overrides source-bone length with qm_length * scale. Useful when source
    # rig defines a bone over a different anatomical region than QM (e.g. Helena pectoral
    # spans whole chest vs QM breast_l covers only breast).
    length_scale_cfg = cfg.get("phase2_length_scale", {})
    src_dict = {b["name"]: b for b in src["bones"]}

    if qm_full_path and os.path.exists(qm_full_path):
        with open(qm_full_path, encoding="utf-8") as f: qm_full = json.load(f)
        qm_dict = {b["name"]: b for b in qm_full["bones"]}
        print(f"  using full QM hierarchy: {len(qm_dict)} bones (incl. non-deform)")
    else:
        qm_dict = {b["name"]: b for b in qm["bones"]}
        print(f"  using deform-only QM hierarchy: {len(qm_dict)} bones")

    # qm_to_src: pick longest source bone as representative per QM bone
    qm_to_src = {}
    src_groups = {}
    for src_name, qm_name in vg_rename.items():
        if src_name not in src_dict: continue
        src_groups.setdefault(qm_name, []).append(src_name)
    for qm_name, cands in src_groups.items():
        def blen(n):
            b = src_dict[n]
            return vec_norm(vec_sub(b["tail_rest"], b["head_rest"]))
        qm_to_src[qm_name] = max(cands, key=blen)

    cache = {}

    def compute_bone(name):
        if name in cache: return cache[name]
        if name not in qm_dict: return None
        qb = qm_dict[name]
        qm_head = qb["head_rest"]
        qm_tail = qb["tail_rest"]
        qm_dir_un = vec_sub(qm_tail, qm_head)
        qm_len = vec_norm(qm_dir_un)
        qm_dir = (
            [qm_dir_un[0] / qm_len, qm_dir_un[1] / qm_len, qm_dir_un[2] / qm_len]
            if qm_len > 1e-9 else [0.0, 0.0, 1.0]
        )

        # === RESIZE: pick source bone's length where available ===
        new_len = qm_len
        kind = "kept_qm_length"
        # phase2_length_scale takes precedence — explicit per-bone scale over QM length
        if name in length_scale_cfg:
            new_len = qm_len * float(length_scale_cfg[name])
            kind = "scale_override"
        elif name in qm_to_src:
            src_b = src_dict[qm_to_src[name]]
            src_len = vec_norm(vec_sub(src_b["tail_rest"], src_b["head_rest"]))
            if qm_len > 1e-9 and src_len >= MARKER_THRESHOLD * qm_len:
                new_len = src_len
                kind = "resized"
            else:
                kind = "marker_kept"

        # === POSITION: walk parent chain in QM pose with new lengths ===
        parent_name = qb.get("parent")
        if parent_name is None or parent_name not in qm_dict:
            new_head = list(qm_head)
        else:
            parent_new_head, parent_new_tail, _ = compute_bone(parent_name)
            parent_qm = qm_dict[parent_name]
            parent_qm_tail = parent_qm["tail_rest"]
            parent_qm_head = parent_qm["head_rest"]
            # Connected: child.qm_head == parent.qm_tail → follow parent's new tail
            if vec_norm(vec_sub(qm_head, parent_qm_tail)) < CONNECTED_EPSILON:
                new_head = list(parent_new_tail)
            else:
                # Not connected: preserve offset from parent's head (parent's translation
                # applies, but QM-rest relative offset is kept since both poses are QM)
                offset = vec_sub(qm_head, parent_qm_head)
                new_head = vec_add(parent_new_head, offset)

        # Direction is ALWAYS the QM rest direction (pose unification to QM)
        new_tail = vec_add(new_head, vec_scale(qm_dir, new_len))

        cache[name] = (new_head, new_tail, kind)
        return cache[name]

    out_bones = []
    counts = {"resized": 0, "marker_kept": 0, "kept_qm_length": 0, "scale_override": 0}
    for qm_bone in qm["bones"]:
        new_head, new_tail, kind = compute_bone(qm_bone["name"])
        counts[kind] = counts.get(kind, 0) + 1
        out_bones.append({
            "name": qm_bone["name"],
            "parent": qm_bone.get("parent"),
            "use_deform": qm_bone.get("use_deform", True),
            "head_rest": new_head,
            "tail_rest": new_tail,
        })

    out = {
        "armature": qm.get("armature", "QueenMarika_rig") + "_at_source",
        "bone_count": len(out_bones),
        "bones": out_bones,
    }
    out_dir = os.path.dirname(out_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)

    print(f"  QM bones: {len(out_bones)}")
    print(f"    scale_override (config explicit scale): {counts.get('scale_override', 0)}")
    print(f"    resized (source length applied): {counts.get('resized', 0)}")
    print(f"    marker_kept (src too short, QM length kept): {counts.get('marker_kept', 0)}")
    print(f"    kept_qm_length (unmapped):       {counts.get('kept_qm_length', 0)}")
    print(f"  -> {out_path}")


if __name__ == "__main__":
    main(sys.argv)
