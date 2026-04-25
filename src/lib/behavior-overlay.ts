

import {
  Mesh, Scene, Skeleton, Vector3,
  type Node as BabylonNode,
} from '@babylonjs/core';
import { parseVox } from '@/lib/vox-parser';
import type { EquipBehavior, BehaviorData } from '@/types/equip';
import {
  SpringClothSystem, MIXAMO_HUMANOID_CAPSULES,
  buildBodySkinnedMesh,
  type GridInfo as ClothGridInfo,
  type TaggedVoxel,
  type BodySkinVoxel,
} from '@/lib/cloth';
import { defaultBlenderToGltfTransform } from '@/lib/cloth/mesh-builder';

export type GridInfo = ClothGridInfo;

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

/**
 * スケルトンから実測で world 空間の up / right / forward を取得する。
 * 絶対ルール: forward をハードコードで仮定しない — ボーン位置から動的に計算する。
 */
export interface SkeletonAxes {
  up: Vector3;
  right: Vector3;
  forward: Vector3;
  hips: Vector3;
}

export function detectSkeletonAxes(skeleton: Skeleton): SkeletonAxes | null {
  const getBone = (name: string) => skeleton.bones.find(b => b.name === name);
  const hips = getBone('Hips');
  const head = getBone('Head') ?? getBone('Neck') ?? getBone('Spine2');
  const lRef = getBone('LeftShoulder') ?? getBone('LeftArm') ?? getBone('LeftUpLeg');
  const rRef = getBone('RightShoulder') ?? getBone('RightArm') ?? getBone('RightUpLeg');
  if (!hips || !head || !lRef || !rRef) return null;

  const hipsP = hips.getAbsolutePosition();
  const up = head.getAbsolutePosition().subtract(hipsP).normalize();
  const rawRight = rRef.getAbsolutePosition().subtract(lRef.getAbsolutePosition());
  const rightOrtho = rawRight.subtract(up.scale(Vector3.Dot(up, rawRight))).normalize();
  const forward = Vector3.Cross(rightOrtho, up).normalize();

  return { up, right: rightOrtho, forward, hips: hipsP };
}

function buildBehaviorLookup(data: BehaviorData): Map<string, EquipBehavior> {
  const map = new Map<string, EquipBehavior>();
  for (const k of data.surface ?? []) map.set(k, 'surface');
  for (const k of data.gravity ?? []) map.set(k, 'gravity');
  return map;
}

export interface BehaviorOverlayHandle {
  meshes: Mesh[];
  stats: { synced: number; surface: number; gravity: number; total: number };
  dispose: () => void;
}

/**
 * セット内の voxel を behavior で 2 つの mesh に分離して構築する。
 *
 *   - synced / surface: body bone に直接 hard-skin した mesh (遅延なし、物理なし)
 *   - gravity:          SpringClothSystem が管理する揺れ物 mesh (spring 物理)
 *
 * 分離する理由: 1 枚 mesh で共用すると cloth bone の存在が synced/surface にも
 * 影響して body motion と微妙にズレることがあるため。分離すれば body 追従分は
 * 完全に motion と一致する。
 *
 * parentNode を渡すと overlay mesh を GLB の __root__ の子にする。これにより
 * Babylon の handedness 変換（LH 時の root rotation+scale 反転）を overlay も継承し、
 * body と同じ world 位置に正しく揃う。parentNode 必須推奨。
 */
export async function loadBehaviorOverlay(
  scene: Scene,
  setKey: string,
  grid: GridInfo,
  skeleton: Skeleton | null = null,
  options: { parentNode?: BabylonNode } = {},
): Promise<BehaviorOverlayHandle> {
  // Defensive: 旧 overlay メッシュの残骸を一掃
  for (const m of [...scene.meshes]) {
    if (m.name.startsWith('overlay_')) m.dispose();
  }

  if (!skeleton) throw new Error('loadBehaviorOverlay: skeleton is required');

  // --- 診断ログ: skeleton 軸を実測して出力（位置計算には使わない、検証用） ---
  const axes = detectSkeletonAxes(skeleton);
  if (axes) {
    const fmt = (v: Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
    console.log('[behavior-overlay] skeleton axes (skeleton-local = glTF coord):');
    console.log(`  up      = ${fmt(axes.up)}`);
    console.log(`  right   = ${fmt(axes.right)}`);
    console.log(`  forward = ${fmt(axes.forward)}`);
    console.log(`  hips    = ${fmt(axes.hips)}`);
    console.log(`  parentNode = ${options.parentNode?.name ?? '(none, mesh will be un-parented)'}`);
  }

  // overlay の vertex は body mesh-local (= Blender→glTF 変換後) 空間に置く。
  // parent を __root__ にすることで、root が持つ handedness 変換を body と同様に継承する。
  const transform = defaultBlenderToGltfTransform(grid);

  const manifestResp = await fetch(`/api/equip-manifest?set=${encodeURIComponent(setKey)}`);
  if (!manifestResp.ok) throw new Error(`manifest not found: ${setKey}`);
  const parts: PartEntry[] = await manifestResp.json();

  const stats = { synced: 0, surface: 0, gravity: 0, total: 0 };
  const bodyVoxels: BodySkinVoxel[] = [];   // synced + surface
  const gravityVoxels: TaggedVoxel[] = [];  // gravity のみ

  for (const part of parts) {
    try {
      const [voxResp, behResp] = await Promise.all([
        fetch(part.file),
        fetch(`/api/equip-behavior?partKey=${encodeURIComponent(part.key)}&setKey=${encodeURIComponent(setKey)}`),
      ]);
      if (!voxResp.ok) continue;
      const model = parseVox(await voxResp.arrayBuffer());
      let behData: BehaviorData = { surface: [], gravity: [] };
      if (behResp.ok) behData = await behResp.json();
      const behaviorMap = buildBehaviorLookup(behData);

      for (const v of model.voxels) {
        const origKey = `${v.x},${v.y},${v.z}`;
        const behavior = behaviorMap.get(origKey) ?? 'synced';
        const col = model.palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
        const entry = {
          x: v.x, y: v.y, z: v.z,
          r: col.r, g: col.g, b: col.b,
        };
        if (behavior === 'gravity') {
          gravityVoxels.push({ ...entry, behavior });
        } else {
          bodyVoxels.push(entry);
        }
        stats[behavior]++;
        stats.total++;
      }
    } catch (e) {
      console.warn(`overlay part failed: ${part.key}`, e);
    }
  }

  const meshes: Mesh[] = [];
  let cloth: SpringClothSystem | null = null;

  // 1. body 追従分 (synced + surface): 単純 hard-skin
  if (bodyVoxels.length > 0) {
    const t0 = performance.now();
    const bodyMesh = buildBodySkinnedMesh(
      scene, `overlay_${setKey}_body`, bodyVoxels, transform, skeleton,
    );
    if (bodyMesh) {
      if (options.parentNode) bodyMesh.parent = options.parentNode;
      meshes.push(bodyMesh);
      console.log(`[behavior-overlay] bodyMesh: ${bodyVoxels.length} voxels (${(performance.now() - t0).toFixed(1)}ms)`);
    }
  }

  // 2. 揺れ物 (gravity): SpringClothSystem で cloth bone + spring 物理
  if (gravityVoxels.length > 0) {
    const t0 = performance.now();
    cloth = new SpringClothSystem(
      scene, gravityVoxels, transform, skeleton, `overlay_${setKey}_cloth`,
      {
        parentNode: options.parentNode,
        capsules: MIXAMO_HUMANOID_CAPSULES,
      },
    );
    console.log(`[behavior-overlay] cloth: ${cloth.voxelCount} voxels, ${cloth.boneCount} cloth bones (${(performance.now() - t0).toFixed(1)}ms)`);
    meshes.push(cloth.mesh);
  }

  return {
    meshes,
    stats,
    dispose: () => {
      if (cloth) { cloth.dispose(); cloth = null; }
      for (const m of meshes) {
        if (!m.isDisposed()) m.dispose();
      }
      meshes.length = 0;
    },
  };
}

/**
 * skinned-voxel-demo の outfit.key から /api/equip-manifest の setKey へのマッピング。
 */
export function outfitKeyToSetKey(outfitKey: string): string | null {
  if (outfitKey === 'nude') return null;
  if (outfitKey === 'qm_default') return 'special__qm_default';
  return `qm__${outfitKey}`;
}
