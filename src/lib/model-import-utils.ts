// ========================================================================
// モデルインポート用ユーティリティ
// model-import で使用
// ========================================================================

import {
  Vector3, Color3, Mesh, StandardMaterial, AbstractMesh, Bone, Skeleton, Matrix,
} from '@babylonjs/core';
import type { VoxelEntry } from '@/types/vox';
import { parseVox } from '@/lib/vox-parser';

type TemplateCategory =
  | 'body' | 'hair' | 'upper_body' | 'lower_body' | 'footwear'
  | 'gloves' | 'full_body_suit' | 'accessory' | 'exclude';

interface PartConfig {
  category: TemplateCategory;
  visible: boolean;
}

interface TPoseStatus {
  detected: boolean;
  isTPose: boolean;
  leftArmAngle: number;
  rightArmAngle: number;
  poseType: 'T-pose' | 'A-pose' | 'other';
}

interface DeformBounds {
  minY: number;
  modelH: number;
  centerX: number;
  centerZ: number;
}

export type { TemplateCategory, PartConfig, TPoseStatus, DeformBounds };

export function guessCategory(name: string): TemplateCategory {
  const n = name.toLowerCase();
  if (/body|skin|torso/.test(n)) return 'body';
  if (/hair|bangs|ponytail|braid/.test(n)) return 'hair';
  if (/shoe|boot|foot|feet|sandal/.test(n)) return 'footwear';
  if (/glove|gauntlet|hand_wear/.test(n)) return 'gloves';
  if (/pant|trouser|skirt|leg_wear|shorts|stocking|legging/.test(n)) return 'lower_body';
  if (/shirt|jacket|coat|vest|top|chest|armor|bra|corset/.test(n)) return 'upper_body';
  if (/suit|bodysuit|leotard/.test(n)) return 'full_body_suit';
  if (/necklace|earring|ring|belt|buckle|strap|cape|cloak|scarf|ribbon|bow|crown|tiara|helmet|hat|mask|visor|glasses|wing/.test(n)) return 'accessory';
  if (/armature|skeleton|bone|rig|root|null|empty/.test(n)) return 'exclude';
  return 'accessory';
}

export function detectTPose(skeletons: Skeleton[]): TPoseStatus | null {
  if (skeletons.length === 0) return null;
  const leftPats = [/left.*upper.*arm/i, /left.*arm$/i, /l_upperarm/i, /leftarm/i, /arm\.l/i, /upperarm\.l/i];
  const rightPats = [/right.*upper.*arm/i, /right.*arm$/i, /r_upperarm/i, /rightarm/i, /arm\.r/i, /upperarm\.r/i];

  let leftBone: Bone | null = null, rightBone: Bone | null = null;
  for (const sk of skeletons) {
    for (const bone of sk.bones) {
      if (!leftBone) for (const p of leftPats) { if (p.test(bone.name)) { leftBone = bone; break; } }
      if (!rightBone) for (const p of rightPats) { if (p.test(bone.name)) { rightBone = bone; break; } }
      if (leftBone && rightBone) break;
    }
    if (leftBone && rightBone) break;
  }
  if (!leftBone && !rightBone) return { detected: false, isTPose: false, leftArmAngle: 0, rightArmAngle: 0, poseType: 'other' };

  const getAngle = (bone: Bone | null) => {
    if (!bone) return 0;
    const dir = new Vector3();
    const pm = bone.getParent()?.getWorldMatrix() ?? Matrix.Identity();
    const fm = bone.getLocalMatrix().multiply(pm);
    Vector3.TransformNormalToRef(new Vector3(0, 1, 0), fm, dir);
    dir.normalize();
    const hLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
    return Math.atan2(Math.abs(dir.y), hLen) * (180 / Math.PI);
  };

  const la = getAngle(leftBone), ra = getAngle(rightBone);
  const avg = (la + ra) / 2;
  let poseType: TPoseStatus['poseType'] = 'other';
  if (avg <= 15) poseType = 'T-pose';
  else if (avg >= 25 && avg <= 55) poseType = 'A-pose';
  return { detected: true, isTPose: poseType === 'T-pose', leftArmAngle: Math.round(la), rightArmAngle: Math.round(ra), poseType };
}

export async function loadTemplateVox(url: string): Promise<VoxelEntry[]> {
  try {
    const resp = await fetch(url + `?v=${Date.now()}`);
    if (!resp.ok) return [];
    const { voxels, palette } = parseVox(await resp.arrayBuffer());
    return voxels.map(v => {
      const c = palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
      return { x: v.x, y: v.y, z: v.z, r: c.r, g: c.g, b: c.b };
    });
  } catch { return []; }
}

export function computeModelBounds(
  meshMap: Map<string, AbstractMesh[]>,
  partsCfg: Record<string, PartConfig>,
): DeformBounds | null {
  let targets: AbstractMesh[] = [];
  for (const [name, meshes] of meshMap) {
    if (partsCfg[name]?.category === 'body' && partsCfg[name]?.visible) targets.push(...meshes);
  }
  if (targets.length === 0) {
    for (const [name, meshes] of meshMap) {
      if (partsCfg[name]?.visible && partsCfg[name]?.category !== 'exclude') targets.push(...meshes);
    }
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const mesh of targets) {
    if (!(mesh instanceof Mesh)) continue;
    const pos = mesh.getVerticesData('position');
    if (!pos) continue;
    const wm = mesh.getWorldMatrix();
    for (let i = 0; i < pos.length; i += 3) {
      const wp = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
      minX = Math.min(minX, wp.x); maxX = Math.max(maxX, wp.x);
      minY = Math.min(minY, wp.y); maxY = Math.max(maxY, wp.y);
      minZ = Math.min(minZ, wp.z); maxZ = Math.max(maxZ, wp.z);
    }
  }
  if (!isFinite(minY)) return null;
  return { minY, modelH: maxY - minY, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

export function chibiDeform(
  px: number, py: number, pz: number,
  b: DeformBounds,
  headScale?: number,
): [number, number, number] {
  let x = px, y = py, z = pz;
  const t = b.modelH > 0 ? Math.max(0, Math.min(1, (y - b.minY) / b.modelH)) : 0.5;

  if (t > 0.85) {
    const ht = (t - 0.85) / 0.15;
    const s = headScale ?? (1.5 + ht * 0.3);
    x = b.centerX + (x - b.centerX) * s;
    z = b.centerZ + (z - b.centerZ) * s;
    y = y + ht * b.modelH * 0.06;
  } else if (t > 0.50) {
    x = b.centerX + (x - b.centerX) * 1.1;
    z = b.centerZ + (z - b.centerZ) * 1.1;
  } else {
    const legT = t / 0.50;
    const f = 0.70 * legT + 0.30 * legT * legT;
    y = b.minY + f * 0.50 * b.modelH;
    x = b.centerX + (x - b.centerX) * 1.1;
    z = b.centerZ + (z - b.centerZ) * 1.1;
    const sign = x > b.centerX ? 1.0 : -1.0;
    x += sign * 0.06 * (1.0 - legT);
  }

  return [x, y, z];
}

export function voxelizeMesh(
  mesh: AbstractMesh,
  gridX: number, gridY: number, gridZ: number,
  offX: number, offY: number, offZ: number,
  scale: number,
  deform?: { bounds: DeformBounds; headScale?: number },
): VoxelEntry[] {
  if (!(mesh instanceof Mesh)) return [];
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  const colors = mesh.getVerticesData('color');
  if (!positions || !indices) return [];

  const voxelSet = new Map<string, VoxelEntry>();
  const wm = mesh.getWorldMatrix();

  for (let i = 0; i < indices.length; i += 3) {
    const tv: Vector3[] = [], tc: { r: number; g: number; b: number }[] = [];
    for (let vi = 0; vi < 3; vi++) {
      const idx = indices[i + vi];
      tv.push(Vector3.TransformCoordinates(new Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]), wm));
      if (colors) tc.push({ r: colors[idx * 4], g: colors[idx * 4 + 1], b: colors[idx * 4 + 2] });
      else {
        const mat = mesh.material;
        const dc = mat && 'diffuseColor' in mat ? (mat as StandardMaterial).diffuseColor : new Color3(0.7, 0.7, 0.7);
        tc.push({ r: dc.r, g: dc.g, b: dc.b });
      }
    }
    const e0 = tv[1].subtract(tv[0]).length(), e1 = tv[2].subtract(tv[1]).length(), e2 = tv[0].subtract(tv[2]).length();
    const steps = Math.max(Math.ceil(Math.max(e0, e1, e2) / scale), 1);
    for (let si = 0; si <= steps; si++) {
      for (let sj = 0; sj <= steps - si; sj++) {
        const u = si / steps, v = sj / steps, w = 1 - u - v;
        if (w < 0) continue;
        const px = tv[0].x * w + tv[1].x * u + tv[2].x * v;
        const py = tv[0].y * w + tv[1].y * u + tv[2].y * v;
        const pz = tv[0].z * w + tv[1].z * u + tv[2].z * v;
        let rx = px, ry = py, rz = pz;
        if (deform) [rx, ry, rz] = chibiDeform(px, py, pz, deform.bounds, deform.headScale);
        const vx = Math.round(rx / scale + offX);
        const vy = Math.round(-rz / scale + offY);
        const vz = Math.round(ry / scale + offZ);
        if (vx < 0 || vy < 0 || vz < 0 || vx >= gridX || vy >= gridY || vz >= gridZ) continue;
        const key = `${vx},${vy},${vz}`;
        if (!voxelSet.has(key)) {
          voxelSet.set(key, { x: vx, y: vy, z: vz,
            r: tc[0].r * w + tc[1].r * u + tc[2].r * v,
            g: tc[0].g * w + tc[1].g * u + tc[2].g * v,
            b: tc[0].b * w + tc[1].b * u + tc[2].b * v,
          });
        }
      }
    }
  }
  return Array.from(voxelSet.values());
}
