// ========================================================================
// ボーン物理演算（FK + バネ減衰 + ヒットリアクション）
// motion-lab で使用
// ========================================================================

import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { BoneHierarchyEntry, PoseData, BonePhysics } from '@/types/motion';
import { getBoneMass } from '@/lib/bone-hierarchy';

const DEG = Math.PI / 180;
const ANG_DAMPING = 0.93;
const ANG_SPRING = 0.08;

export { DEG, ANG_DAMPING, ANG_SPRING };

export function applyPose(hierarchy: BoneHierarchyEntry[], pose: PoseData): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const entry of hierarchy) {
    const jp = entry.jointPoint;
    const a = pose[entry.bone] || { rx: 0, ry: 0, rz: 0 };
    const localRot = Quaternion.FromEulerAngles(a.rx * DEG, a.ry * DEG, a.rz * DEG);
    const rotMat = new Matrix();
    Matrix.FromQuaternionToRef(localRot, rotMat);
    const local = Matrix.Translation(-jp[0], -jp[1], -jp[2]).multiply(rotMat).multiply(Matrix.Translation(jp[0], jp[1], jp[2]));
    if (!entry.parent || !result[entry.parent]) {
      result[entry.bone] = Array.from(local.asArray());
    } else {
      result[entry.bone] = Array.from(local.multiply(Matrix.FromArray(result[entry.parent])).asArray());
    }
  }
  return result;
}

export function blendPoseData(a: PoseData, b: PoseData, t: number): PoseData {
  const r: PoseData = {};
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const aa = a[bone] || { rx: 0, ry: 0, rz: 0 }, bb = b[bone] || { rx: 0, ry: 0, rz: 0 };
    r[bone] = { rx: aa.rx * (1 - t) + bb.rx * t, ry: aa.ry * (1 - t) + bb.ry * t, rz: aa.rz * (1 - t) + bb.rz * t };
  }
  return r;
}

export function isLockedBone(bone: string): boolean {
  return bone.includes('root') || bone.includes('spine') ||
    bone.includes('foot') || bone.includes('toes') ||
    bone.includes('leg_twist') || bone.includes('leg_stretch') ||
    bone.includes('thigh') || bone.includes('knee');
}

export function initAngularPhysics(hierarchy: BoneHierarchyEntry[]): Record<string, BonePhysics> {
  const r: Record<string, BonePhysics> = {};
  for (const e of hierarchy) {
    r[e.bone] = { ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, mass: getBoneMass(e.bone), locked: isLockedBone(e.bone) };
  }
  return r;
}

export function stepAngularPhysics(physics: Record<string, BonePhysics>) {
  for (const bp of Object.values(physics)) {
    if (bp.locked) { bp.ox = 0; bp.oy = 0; bp.oz = 0; bp.vx = 0; bp.vy = 0; bp.vz = 0; continue; }
    bp.vx -= bp.ox * ANG_SPRING; bp.vy -= bp.oy * ANG_SPRING; bp.vz -= bp.oz * ANG_SPRING;
    bp.vx *= ANG_DAMPING; bp.vy *= ANG_DAMPING; bp.vz *= ANG_DAMPING;
    bp.ox += bp.vx; bp.oy += bp.vy; bp.oz += bp.vz;
    const max = 0.8;
    bp.ox = Math.max(-max, Math.min(max, bp.ox));
    bp.oy = Math.max(-max, Math.min(max, bp.oy));
    bp.oz = Math.max(-max, Math.min(max, bp.oz));
  }
}

export function applyHitImpulse(bone: string, force: Vector3, physics: Record<string, BonePhysics>, hierarchy: BoneHierarchyEntry[]) {
  const bp = physics[bone]; if (!bp || bp.locked) return;
  const inv = 1 / bp.mass;
  bp.vx += force.x * inv; bp.vy += force.y * inv; bp.vz += force.z * inv;
  const childrenOf: Record<string, string[]> = {};
  for (const e of hierarchy) childrenOf[e.bone] = e.children;
  const propagate = (b: string, s: number, d: number) => {
    if (d > 4 || s < 0.02) return;
    for (const c of (childrenOf[b] || [])) {
      const cp = physics[c]; if (!cp || cp.locked) continue;
      const ci = s / cp.mass;
      cp.vx += force.x * ci; cp.vy += force.y * ci; cp.vz += force.z * ci;
      propagate(c, s * 0.5, d + 1);
    }
  };
  propagate(bone, 0.5 * inv * bp.mass, 0);
}
