// ========================================================================
// ボーン階層構築（ARP_HIERARCHY ベース）
// motion-lab で使用
// ========================================================================

import type { SegmentsData } from '@/types/vox';
import type { BoneHierarchyEntry } from '@/types/motion';

export function getBoneMass(bone: string): number {
  if (bone.includes('root') || bone.includes('spine')) return 5.0;
  if (bone.includes('thigh')) return 4.0;
  if (bone.includes('leg')) return 3.0;
  if (bone.includes('shoulder') || bone.includes('neck')) return 2.0;
  if (bone.includes('arm') || bone.includes('forearm')) return 1.5;
  if (bone.includes('head')) return 1.5;
  if (bone.includes('hand') || bone.includes('foot')) return 1.0;
  if (bone.includes('breast')) return 0.5;
  if (bone.includes('ear') || bone.includes('jaw')) return 0.3;
  return 1.0;
}

export const ARP_HIERARCHY: Record<string, string> = {
  'c_spine_01_bend.x': 'c_root_bend.x',
  'c_spine_02_bend.x': 'c_spine_01_bend.x',
  'c_spine_03_bend.x': 'c_spine_02_bend.x',
  'neck.x': 'c_spine_03_bend.x', 'head.x': 'neck.x', 'jawbone.x': 'head.x',
  'c_ear_01.l': 'head.x', 'c_ear_01.r': 'head.x',
  'c_ear_02.l': 'c_ear_01.l', 'c_ear_02.r': 'c_ear_01.r',
  'breast.l': 'c_spine_03_bend.x', 'breast.r': 'c_spine_03_bend.x',
  'shoulder.l': 'c_spine_03_bend.x',
  'c_arm_twist.l': 'shoulder.l', 'c_arm_twist_2.l': 'shoulder.l',
  'c_arm_stretch.l': 'c_arm_twist_2.l', 'elbow.l': 'c_arm_stretch.l',
  'c_forearm_stretch.l': 'c_arm_stretch.l',
  'c_forearm_twist_2.l': 'c_forearm_stretch.l', 'c_forearm_twist.l': 'c_forearm_twist_2.l',
  'hand.l': 'c_forearm_twist.l',
  'shoulder.r': 'c_spine_03_bend.x',
  'c_arm_twist.r': 'shoulder.r', 'c_arm_twist_2.r': 'shoulder.r',
  'c_arm_stretch.r': 'c_arm_twist_2.r', 'elbow.r': 'c_arm_stretch.r',
  'c_forearm_stretch.r': 'c_arm_stretch.r',
  'c_forearm_twist_2.r': 'c_forearm_stretch.r', 'c_forearm_twist.r': 'c_forearm_twist_2.r',
  'hand.r': 'c_forearm_twist.r',
  'c_thigh_twist.l': 'c_root_bend.x', 'c_thigh_twist_2.l': 'c_thigh_twist.l',
  'c_thigh_stretch.l': 'c_thigh_twist_2.l', 'knee.l': 'c_thigh_stretch.l',
  'c_leg_stretch.l': 'c_thigh_stretch.l', 'c_leg_twist_2.l': 'c_leg_stretch.l',
  'c_leg_twist.l': 'c_leg_twist_2.l', 'foot.l': 'c_leg_twist.l', 'toes_01.l': 'foot.l',
  'c_thigh_twist.r': 'c_root_bend.x', 'c_thigh_twist_2.r': 'c_thigh_twist.r',
  'c_thigh_stretch.r': 'c_thigh_twist_2.r', 'knee.r': 'c_thigh_stretch.r',
  'c_leg_stretch.r': 'c_thigh_stretch.r', 'c_leg_twist_2.r': 'c_leg_stretch.r',
  'c_leg_twist.r': 'c_leg_twist_2.r', 'foot.r': 'c_leg_twist.r', 'toes_01.r': 'foot.r',
  'thumb1.l': 'hand.l', 'c_thumb2.l': 'thumb1.l', 'c_thumb3.l': 'c_thumb2.l',
  'c_index1_base.l': 'hand.l', 'index1.l': 'c_index1_base.l', 'c_index2.l': 'index1.l', 'c_index3.l': 'c_index2.l',
  'c_middle1_base.l': 'hand.l', 'middle1.l': 'c_middle1_base.l', 'c_middle2.l': 'middle1.l', 'c_middle3.l': 'c_middle2.l',
  'c_ring1_base.l': 'hand.l', 'ring1.l': 'c_ring1_base.l', 'c_ring2.l': 'ring1.l', 'c_ring3.l': 'c_ring2.l',
  'c_pinky1_base.l': 'hand.l', 'pinky1.l': 'c_pinky1_base.l', 'c_pinky2.l': 'pinky1.l', 'c_pinky3.l': 'c_pinky2.l',
  'thumb1.r': 'hand.r', 'c_thumb2.r': 'thumb1.r', 'c_thumb3.r': 'c_thumb2.r',
  'c_index1_base.r': 'hand.r', 'index1.r': 'c_index1_base.r', 'c_index2.r': 'index1.r', 'c_index3.r': 'c_index2.r',
  'c_middle1_base.r': 'hand.r', 'middle1.r': 'c_middle1_base.r', 'c_middle2.r': 'middle1.r', 'c_middle3.r': 'c_middle2.r',
  'c_ring1_base.r': 'hand.r', 'ring1.r': 'c_ring1_base.r', 'c_ring2.r': 'ring1.r', 'c_ring3.r': 'c_ring2.r',
  'c_pinky1_base.r': 'hand.r', 'pinky1.r': 'c_pinky1_base.r', 'c_pinky2.r': 'pinky1.r', 'c_pinky3.r': 'c_pinky2.r',
};

export function buildBoneHierarchyARP(segData: SegmentsData): BoneHierarchyEntry[] {
  const bp = segData.bone_positions, grid = segData.grid;
  const cx = grid.gx / 2, cy = grid.gy / 2, scale = segData.voxel_size;
  const segs = new Set(Object.keys(segData.segments));
  const bpKeys = new Set(Object.keys(bp));
  const resolve = (seg: string) => {
    if (bpKeys.has(seg)) return seg;
    let a = seg.replace(/^c_/, ''); if (bpKeys.has(a)) return a;
    a = seg.replace(/^c_/, '').replace(/_bend/, ''); if (bpKeys.has(a)) return a;
    return null;
  };
  const getBp = (seg: string) => { const n = resolve(seg); return n ? bp[n] : null; };
  const parentOf: Record<string, string | null> = {};
  const childrenOf: Record<string, string[]> = {};
  for (const s of segs) {
    const p = ARP_HIERARCHY[s];
    parentOf[s] = (p && segs.has(p)) ? p : null;
    childrenOf[s] = [];
  }
  for (const [n, p] of Object.entries(parentOf)) { if (p) childrenOf[p]?.push(n); }
  const roots = [...segs].filter(n => !parentOf[n]);
  const order: BoneHierarchyEntry[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const bone = queue.shift()!;
    const pos = getBp(bone);
    const h = pos ? pos.head_voxel : [cx, cy, 0];
    order.push({ bone, parent: parentOf[bone], jointPoint: [(h[0] - cx) * scale, h[2] * scale, -(h[1] - cy) * scale], children: childrenOf[bone] });
    for (const child of childrenOf[bone]) queue.push(child);
  }
  return order;
}
