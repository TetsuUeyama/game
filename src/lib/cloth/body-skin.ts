/**
 * Body-skinned voxel mesh builder.
 *
 * synced / surface voxel を body bone (skeleton 既存ボーン) に hard-skin する。
 * 物理は一切適用しないので、body モーションと完全同期し遅延なし。
 *
 * gravity voxel は SpringClothSystem 側で別 mesh として扱う（揺れ物）。
 */
import {
  Scene, Mesh, Skeleton, VertexData,
  StandardMaterial, Color3,
} from '@babylonjs/core';
import { FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { GridWorldTransform } from './types';
import { HUMANOID_BONES } from './capsules';

/** 入力 voxel (色 + 位置のみ、behavior は呼び出し側で絞る) */
export interface BodySkinVoxel {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
}

/**
 * voxel ごとに最寄りの人体 bone を選び、1 枚の skinned mesh を構築する。
 * 各頂点は bone 1 本に weight 1.0 で hard-skin。
 */
export function buildBodySkinnedMesh(
  scene: Scene,
  name: string,
  voxels: BodySkinVoxel[],
  transform: GridWorldTransform,
  skeleton: Skeleton,
): Mesh | null {
  if (voxels.length === 0) return null;

  const humanSet = new Set(HUMANOID_BONES);
  const humanBoneIdx: number[] = [];
  const humanBonePos: Array<[number, number, number]> = [];
  for (let i = 0; i < skeleton.bones.length; i++) {
    const b = skeleton.bones[i];
    if (!humanSet.has(b.name)) continue;
    const p = b.getAbsolutePosition();
    humanBoneIdx.push(i);
    humanBonePos.push([p.x, p.y, p.z]);
  }
  if (humanBoneIdx.length === 0) {
    throw new Error('buildBodySkinnedMesh: no humanoid bones in skeleton');
  }

  const nearestBody = (wx: number, wy: number, wz: number): number => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < humanBonePos.length; i++) {
      const [bx, by, bz] = humanBonePos[i];
      const dx = bx - wx, dy = by - wy, dz = bz - wz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return humanBoneIdx[best];
  };

  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const matIdx: number[] = [];
  const matW: number[] = [];

  for (const voxel of voxels) {
    const [cwx, cwy, cwz] = transform.point(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
    const boneIdx = nearestBody(cwx, cwy, cwz);

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
  mesh.numBoneInfluencers = 1;

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}
