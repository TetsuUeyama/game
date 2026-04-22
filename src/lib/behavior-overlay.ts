import {
  Mesh, VertexData, Scene, Color3, StandardMaterial, Skeleton, Vector3,
  type Node as BabylonNode,
} from '@babylonjs/core';
import { parseVox } from '@/lib/vox-parser';
import { FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { EquipBehavior, BehaviorData } from '@/types/equip';
import {
  VoxelCloth, MIXAMO_HUMANOID_CAPSULES, HUMANOID_BONES,
  type ClothVoxel, type GridInfo as ClothGridInfo,
} from '@/lib/cloth';
import { defaultBlenderToGltfTransform } from '@/lib/cloth/mesh-builder';
import type { GridWorldTransform } from '@/lib/cloth/types';

export type GridInfo = ClothGridInfo;

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

interface ClassifiedVoxel {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  behavior: EquipBehavior;
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
  // up に直交化（完全直交でない場合に備える）
  const rightOrtho = rawRight.subtract(up.scale(Vector3.Dot(up, rawRight))).normalize();
  // 右手系: forward = right × up （検証: cross((1,0,0), (0,1,0)) = (0,0,1)）
  const forward = Vector3.Cross(rightOrtho, up).normalize();

  return { up, right: rightOrtho, forward, hips: hipsP };
}

// 旧: dynamic transform (skeleton 軸から grid→world を構築) は撤去。
// 理由: overlay mesh を body __root__ の子に parent するため、vertex は
// body mesh-local (= Blender→glTF 変換後) の空間に置く必要がある。
// __root__ の world matrix は Babylon が handedness 変換で設定するので、
// それを引き継げば LH/RH どちらでも body と overlay の world 位置が一致する。
// skeleton 軸検出は診断ログ用途でのみ使う。

function buildBehaviorLookup(data: BehaviorData): Map<string, EquipBehavior> {
  const map = new Map<string, EquipBehavior>();
  for (const k of data.surface ?? []) map.set(k, 'surface');
  for (const k of data.gravity ?? []) map.set(k, 'gravity');
  return map;
}

function nearestBoneIndex(
  wx: number, wy: number, wz: number,
  bonePositions: Array<[number, number, number]>,
  boneIndexMap: number[],
): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < bonePositions.length; i++) {
    const [bx, by, bz] = bonePositions[i];
    const dx = bx - wx, dy = by - wy, dz = bz - wz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return boneIndexMap[best];
}

// ----------------------------------------------------------------------
// Skinned voxel mesh (synced / surface 用): 最寄り人体ボーンに hard-skinning
// ----------------------------------------------------------------------
function buildSkinnedVoxelMesh(
  scene: Scene,
  name: string,
  voxels: ClassifiedVoxel[],
  transform: GridWorldTransform,
  skeleton: Skeleton,
  bonePositions: Array<[number, number, number]>,
  boneIndexMap: number[],
): Mesh | null {
  if (voxels.length === 0) return null;

  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const matIdx: number[] = [];
  const matW: number[] = [];

  for (const voxel of voxels) {
    // ボーン選択は body と同じ空間（transform 出力 = body mesh-local = glTF coord）で行う。
    // bone.getAbsolutePosition() も同じ空間を返すので整合する。
    const [cwx, cwy, cwz] = transform.point(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
    const boneIdx = nearestBoneIndex(cwx, cwy, cwz, bonePositions, boneIndexMap);

    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      const [nwx, nwy, nwz] = transform.dir(fn[0], fn[1], fn[2]);
      for (let vi = 0; vi < 4; vi++) {
        const [wx, wy, wz] = transform.point(
          voxel.x + fv[vi][0], voxel.y + fv[vi][1], voxel.z + fv[vi][2],
        );
        positions.push(wx, wy, wz);
        normals.push(nwx, nwy, nwz);
        colors.push(voxel.r, voxel.g, voxel.b, 1);
        matIdx.push(boneIdx, 0, 0, 0);
        matW.push(1, 0, 0, 0);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }

  if (positions.length === 0) return null;

  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  vd.matricesIndices = matIdx;
  vd.matricesWeights = matW;

  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 4;

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

export interface BehaviorOverlayHandle {
  meshes: Mesh[];
  stats: { synced: number; surface: number; gravity: number; total: number };
  dispose: () => void;
}

/**
 * セット内の voxel を分類し、synced/surface は body に追従する skinned mesh、
 * gravity は VoxelCloth (PBD 布シミュ) で描画する。
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
  const moving: ClassifiedVoxel[] = [];
  const stationary: ClassifiedVoxel[] = [];
  const allKeys = new Set<string>();

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
        const entry: ClassifiedVoxel = {
          x: v.x, y: v.y, z: v.z,
          r: col.r, g: col.g, b: col.b,
          behavior,
        };
        stats[behavior]++;
        stats.total++;
        allKeys.add(`${v.x},${v.y},${v.z}`);
        if (behavior === 'gravity') stationary.push(entry);
        else moving.push(entry);
      }
    } catch (e) {
      console.warn(`overlay part failed: ${part.key}`, e);
    }
  }

  // 人体ボーンのみ抽出（moving voxel の skinning 用）
  const humanSet = new Set(HUMANOID_BONES);
  const bonePositions: Array<[number, number, number]> = [];
  const boneIndexMap: number[] = [];
  for (let i = 0; i < skeleton.bones.length; i++) {
    const b = skeleton.bones[i];
    if (!humanSet.has(b.name)) continue;
    const p = b.getAbsolutePosition();
    bonePositions.push([p.x, p.y, p.z]);
    boneIndexMap.push(i);
  }

  const meshes: Mesh[] = [];
  let cloth: VoxelCloth | null = null;

  // 追従側: skinning
  if (moving.length > 0 && bonePositions.length > 0) {
    const movingMesh = buildSkinnedVoxelMesh(
      scene, `overlay_${setKey}_moving`, moving, transform, skeleton, bonePositions, boneIndexMap,
    );
    if (movingMesh) {
      if (options.parentNode) movingMesh.parent = options.parentNode;
      meshes.push(movingMesh);
    }
  }

  // 重力側: VoxelCloth ライブラリで PBD 布シミュ
  if (stationary.length > 0) {
    const clothVoxels: ClothVoxel[] = stationary.map((v) => ({
      x: v.x, y: v.y, z: v.z, r: v.r, g: v.g, b: v.b,
    }));
    cloth = new VoxelCloth(scene, {
      name: `overlay_${setKey}_cloth`,
      voxels: clothVoxels,
      grid,
      skeleton,
      anchorVoxelSet: allKeys,
      capsules: MIXAMO_HUMANOID_CAPSULES,
      gridTransform: transform,
    });
    if (options.parentNode) cloth.mesh.parent = options.parentNode;
    meshes.push(cloth.mesh);
  }

  return {
    meshes,
    stats,
    dispose: () => {
      if (cloth) { cloth.dispose(); cloth = null; }
      for (const m of meshes) {
        // cloth.mesh は既に dispose 済み。残りだけ処理
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
