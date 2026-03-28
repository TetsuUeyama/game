// ========================================================================
// ボクセルメッシュ構築ユーティリティ（Babylon.js用）
// 全3Dページで共通使用
// ========================================================================

import {
  Mesh, VertexData, StandardMaterial, Scene,
  Effect, ShaderMaterial,
} from '@babylonjs/core';
import type { VoxModel, VoxelEntry, SegmentBundleData } from '@/types/vox';
import { parseVox, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

// ========================================================================
// VOXモデル → Babylon.jsメッシュ（StandardMaterial用、隣接面カリング付き）
// ========================================================================
export function buildVoxMesh(
  model: VoxModel, scene: Scene, name: string, scale: number = SCALE
): Mesh {
  const occupied = new Set<string>();
  for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);
  const cx = model.sizeX / 2, cy = model.sizeY / 2;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];

  for (const voxel of model.voxels) {
    const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
      const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        positions.push(
          (voxel.x + fv[vi][0] - cx) * scale,
          (voxel.z + fv[vi][2]) * scale,
          -(voxel.y + fv[vi][1] - cy) * scale,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(col.r, col.g, col.b, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }

  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh, true);
  return mesh;
}

// ========================================================================
// セグメントバンドル → ボーンごとのメッシュ（StandardMaterial用）
// realistic-viewer, motion-lab で共通使用
// ========================================================================
export function buildBundleMeshes(
  bundle: SegmentBundleData, scene: Scene, mat: StandardMaterial, scale: number
): Record<string, Mesh> {
  const cx = bundle.grid.gx / 2, cy = bundle.grid.gy / 2;
  const meshes: Record<string, Mesh> = {};

  for (const [boneName, flat] of Object.entries(bundle.segments)) {
    const numVoxels = flat.length / 4;
    if (numVoxels === 0) continue;

    const occupied = new Set<string>();
    for (let i = 0; i < numVoxels; i++) {
      occupied.add(`${flat[i * 4]},${flat[i * 4 + 1]},${flat[i * 4 + 2]}`);
    }

    const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
    for (let i = 0; i < numVoxels; i++) {
      const vx = flat[i * 4], vy = flat[i * 4 + 1], vz = flat[i * 4 + 2], ci = flat[i * 4 + 3];
      const col = bundle.palette[ci] ?? [0.8, 0.8, 0.8];
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = FACE_DIRS[f];
        if (occupied.has(`${vx + dx},${vy + dy},${vz + dz}`)) continue;
        const bi = positions.length / 3, fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        for (let vi = 0; vi < 4; vi++) {
          positions.push(
            (vx + fv[vi][0] - cx) * scale,
            (vz + fv[vi][2]) * scale,
            -(vy + fv[vi][1] - cy) * scale,
          );
          normals.push(fn[0], fn[2], -fn[1]);
          colors.push(col[0], col[1], col[2], 1);
        }
        indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
      }
    }

    if (positions.length === 0) continue;
    const vd = new VertexData();
    vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
    const mesh = new Mesh(`seg_${boneName}`, scene);
    vd.applyToMesh(mesh, false);
    mesh.material = mat;
    meshes[boneName] = mesh;
  }

  return meshes;
}

// ========================================================================
// VoxelEntry配列 → Unlitメッシュ（ShaderMaterial用）
// template-editor, equip-config/[partKey] で共通使用
// ========================================================================
export function buildVoxelMeshUnlit(
  voxels: VoxelEntry[], scene: Scene, name: string,
  cx: number, cy: number, scale: number = SCALE,
): Mesh {
  const occ = new Set<string>();
  for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];

  for (const vx of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occ.has(`${vx.x + dx},${vx.y + dy},${vx.z + dz}`)) continue;
      const bi = pos.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        pos.push(
          (vx.x + fv[vi][0] - cx) * scale,
          (vx.z + fv[vi][2]) * scale,
          -(vx.y + fv[vi][1] - cy) * scale,
        );
        nrm.push(fn[0], fn[2], -fn[1]);
        col.push(vx.r, vx.g, vx.b, 1);
      }
      idx.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }

  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

// ========================================================================
// Unlitシェーダーマテリアル作成（頂点カラーのみ）
// equip-config/[partKey], template-editor で共通使用
// ========================================================================
let _shaderIdx = 0;
export function createUnlitMaterial(scene: Scene, name?: string): ShaderMaterial {
  const id = name ?? `unlit_${_shaderIdx++}`;
  Effect.ShadersStore[id + 'VertexShader'] =
    `precision highp float;attribute vec3 position;attribute vec4 color;uniform mat4 worldViewProjection;varying vec4 vColor;void main(){gl_Position=worldViewProjection*vec4(position,1.0);vColor=color;}`;
  Effect.ShadersStore[id + 'FragmentShader'] =
    `precision highp float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;
  const mat = new ShaderMaterial(id, scene, { vertex: id, fragment: id }, {
    attributes: ['position', 'color'], uniforms: ['worldViewProjection'],
  });
  mat.backFaceCulling = false;
  return mat;
}

// ========================================================================
// VOXファイルをURLからロードしてメッシュを構築
// ========================================================================
export async function loadVoxMesh(
  scene: Scene, url: string, name: string, scale: number = SCALE, cacheBust?: string,
): Promise<Mesh> {
  const resp = await fetch(url + (cacheBust ?? `?v=${Date.now()}`));
  if (!resp.ok) throw new Error(`Failed: ${url}`);
  const model = parseVox(await resp.arrayBuffer());
  return buildVoxMesh(model, scene, name, scale);
}
