// ========================================================================
// モーションデータ変換（Blender→Babylon.js）
// realistic-viewer で使用
// ========================================================================

import { Matrix } from '@babylonjs/core';
import type { MotionData, RawMotionData } from '@/types/motion';

// viewer版SegmentsData（bb_min/bb_max/joint_spheres等の拡張フィールドを含む）
interface ViewerSegmentsData {
  voxel_size: number;
  grid: { gx: number; gy: number; gz: number };
  bone_positions: Record<string, { head_voxel: number[]; tail_voxel: number[] }>;
  segments: Record<string, { file: string; voxels: number }>;
}

interface ViewerBoneHierarchyEntry {
  bone: string;
  parent: string | null;
  jointPoint: number[];
}

export type { ViewerSegmentsData, ViewerBoneHierarchyEntry };

export function blenderToBabylonMatrix(m: number[]): Matrix {
  return Matrix.FromArray([
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]);
}

export const COORD_BLENDER_TO_VIEWER = Matrix.FromArray([
  1,  0,  0,  0,
  0,  0, -1,  0,
  0,  1,  0,  0,
  0,  0,  0,  1,
]);

export function processRawMotionData(raw: RawMotionData): MotionData {
  const coordInv = COORD_BLENDER_TO_VIEWER.clone();
  coordInv.invert();

  const hasEval = raw.bind_pose_eval && Object.keys(raw.bind_pose_eval).length > 0;
  const bindInvCache: Record<string, Matrix> = {};
  for (const [name, restMat] of Object.entries(raw.bind_pose_rest)) {
    let useMat = restMat;
    if (hasEval && raw.bind_pose_eval[name]) {
      const evalMat = raw.bind_pose_eval[name];
      let diff = 0;
      for (let i = 0; i < 16; i++) diff += Math.abs(restMat[i] - evalMat[i]);
      if (diff > 0.01) useMat = evalMat;
    }
    const bjsMat = blenderToBabylonMatrix(useMat);
    const inv = new Matrix();
    bjsMat.invertToRef(inv);
    bindInvCache[name] = inv;
  }

  const bones: MotionData['bones'] = {};
  for (const [boneName, animData] of Object.entries(raw.animated)) {
    const bindInv = bindInvCache[boneName];
    if (!bindInv) continue;

    const matrices: number[][] = [];
    for (const frameMat of animData.matrices) {
      const animBjs = blenderToBabylonMatrix(frameMat);
      const skinBjs = bindInv.multiply(animBjs);
      const viewerMat = coordInv.multiply(skinBjs).multiply(COORD_BLENDER_TO_VIEWER);
      matrices.push(Array.from(viewerMat.asArray()));
    }
    bones[boneName] = { matrices };
  }

  return { fps: raw.fps, frame_count: raw.frame_count, babylonFormat: true, bones };
}

export function resolveMotionBoneName(segName: string, motionBones: Set<string>): string | null {
  if (motionBones.has(segName)) return segName;
  let alt = segName.replace(/^c_/, '');
  if (motionBones.has(alt)) return alt;
  alt = segName.replace(/^c_/, '').replace(/_bend/, '');
  if (motionBones.has(alt)) return alt;
  return null;
}

export function applyMatPointBlender(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[1] + p[2] * m[2] + m[3],
    p[0] * m[4] + p[1] * m[5] + p[2] * m[6] + m[7],
    p[0] * m[8] + p[1] * m[9] + p[2] * m[10] + m[11],
  ];
}

export function applyMatPointBabylon(m: number[], p: number[]): number[] {
  return [
    p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
    p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
    p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14],
  ];
}

export function buildBoneHierarchyViewer(segData: ViewerSegmentsData): ViewerBoneHierarchyEntry[] {
  const bp = segData.bone_positions;
  const grid = segData.grid;
  const cx = grid.gx / 2, cy = grid.gy / 2;
  const scale = segData.voxel_size;
  const segmentBones = new Set(Object.keys(segData.segments));

  const bpKeys = new Set(Object.keys(bp));
  const segToBpName: Record<string, string> = {};
  for (const seg of segmentBones) {
    if (bpKeys.has(seg)) { segToBpName[seg] = seg; continue; }
    let alt = seg.replace(/^c_/, '');
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
    alt = seg.replace(/^c_/, '').replace(/_bend/, '');
    if (bpKeys.has(alt)) { segToBpName[seg] = alt; continue; }
  }
  const getBp = (seg: string) => bp[segToBpName[seg]];

  const tailMap = new Map<string, string>();
  for (const name of segmentBones) {
    const pos = getBp(name);
    if (!pos) continue;
    const t = pos.tail_voxel;
    tailMap.set(`${t[0]},${t[1]},${t[2]}`, name);
  }

  const parentOf: Record<string, string | null> = {};
  const children: Record<string, string[]> = {};
  for (const name of segmentBones) { parentOf[name] = null; children[name] = []; }
  for (const name of segmentBones) {
    const pos = getBp(name); if (!pos) continue;
    const h = pos.head_voxel;
    const parentName = tailMap.get(`${h[0]},${h[1]},${h[2]}`);
    if (parentName && parentName !== name) { parentOf[name] = parentName; children[parentName].push(name); }
  }

  const THRESHOLD = 20;
  const isAncestor = (bone: string, ancestor: string): boolean => {
    let cur = bone; const visited = new Set<string>();
    while (cur) { if (visited.has(cur)) return false; if (cur === ancestor) return true; visited.add(cur); cur = parentOf[cur]!; }
    return false;
  };
  for (let round = 0; round < 10; round++) {
    const orphanSet = new Set([...segmentBones].filter(n => !parentOf[n] && getBp(n)));
    if (orphanSet.size === 0) break;
    const inTree = new Set<string>();
    for (const n of segmentBones) { if (parentOf[n] || children[n].length > 0) inTree.add(n); }
    let attached = 0;
    for (const name of orphanSet) {
      const h = getBp(name)!.head_voxel;
      let bestParent: string | null = null, bestDist = THRESHOLD;
      for (const candidate of segmentBones) {
        if (candidate === name || !inTree.has(candidate) || isAncestor(candidate, name)) continue;
        const cPos = getBp(candidate);
        if (!cPos) continue;
        const t = cPos.tail_voxel;
        const d = Math.sqrt((t[0] - h[0]) ** 2 + (t[1] - h[1]) ** 2 + (t[2] - h[2]) ** 2);
        if (d < bestDist) { bestDist = d; bestParent = candidate; }
      }
      if (bestParent) { parentOf[name] = bestParent; children[bestParent].push(name); attached++; }
    }
    if (attached === 0) break;
  }

  const roots = [...segmentBones].filter(n => !parentOf[n]);
  const order: ViewerBoneHierarchyEntry[] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const bone = queue.shift()!;
    const pos = getBp(bone); if (!pos) continue;
    const h = pos.head_voxel;
    order.push({ bone, parent: parentOf[bone], jointPoint: [(h[0] - cx) * scale, h[2] * scale, -(h[1] - cy) * scale] });
    for (const child of children[bone]) queue.push(child);
  }
  return order;
}
