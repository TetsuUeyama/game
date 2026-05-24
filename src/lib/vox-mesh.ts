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

// ========================================================================
// 外部空間 (exterior) オラクル
// 中空 shell の内側 face を skip するための flood fill ベース判定
//   1. 全 chunks の voxel を統一 world grid に展開
//   2. bbox 6 面の境界 cell を seed に flood fill
//   3. exterior に達した cell に隣接する face のみ「外向き face」として描画する
// 中空 shell の内側 cell は exterior に届かない → 内向き face は skip される
// ========================================================================
export type ExteriorOracle = {
  // 隣接 cell の世界座標を渡して exterior かを判定する
  // exterior == true なら、そこに面した face は描画する (= 外側に露出している)
  isExteriorWorldCell: (worldX: number, worldY: number, worldZ: number) => boolean;
  // デバッグ統計
  stats: { gx: number; gy: number; gz: number; cells: number; voxels: number; exteriorCells: number; ms: number; internalSeeds?: number };
};

export function buildExteriorOracle(
  chunks: Array<{ origin: [number, number, number]; voxels: Array<{ x: number; y: number; z: number }> }>,
  voxelSize: number,
  pad: number = 2,
  // 内蔵 voxel の world 中心座標。これらの voxel に隣接する empty cell を exterior seed として
  // 追加し、閉じた口腔内 cavity を exterior 扱いにする (内蔵 voxel face を可視化)。
  internalVoxelWorldCenters?: Array<[number, number, number]>,
): ExteriorOracle {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 1. 世界座標 bbox を求める
  let minWX = Infinity, maxWX = -Infinity;
  let minWY = Infinity, maxWY = -Infinity;
  let minWZ = Infinity, maxWZ = -Infinity;
  let totalVoxels = 0;
  for (const c of chunks) {
    for (const v of c.voxels) {
      const wx = c.origin[0] + v.x * voxelSize;
      const wy = c.origin[1] + v.y * voxelSize;
      const wz = c.origin[2] + v.z * voxelSize;
      if (wx < minWX) minWX = wx; if (wx > maxWX) maxWX = wx;
      if (wy < minWY) minWY = wy; if (wy > maxWY) maxWY = wy;
      if (wz < minWZ) minWZ = wz; if (wz > maxWZ) maxWZ = wz;
      totalVoxels++;
    }
  }
  const refOx = minWX - pad * voxelSize;
  const refOy = minWY - pad * voxelSize;
  const refOz = minWZ - pad * voxelSize;
  const gx = Math.ceil((maxWX - minWX) / voxelSize) + 2 * pad + 1;
  const gy = Math.ceil((maxWY - minWY) / voxelSize) + 2 * pad + 1;
  const gz = Math.ceil((maxWZ - minWZ) / voxelSize) + 2 * pad + 1;
  const gxgy = gx * gy;
  const N = gx * gy * gz;

  // 2. occupancy + state 配列 (1 = voxel, 2 = exterior, 0 = unvisited interior)
  const state = new Uint8Array(N);
  for (const c of chunks) {
    const ox = Math.round((c.origin[0] - refOx) / voxelSize);
    const oy = Math.round((c.origin[1] - refOy) / voxelSize);
    const oz = Math.round((c.origin[2] - refOz) / voxelSize);
    for (const v of c.voxels) {
      const x = ox + v.x;
      const y = oy + v.y;
      const z = oz + v.z;
      if (x < 0 || x >= gx || y < 0 || y >= gy || z < 0 || z >= gz) continue;
      state[z * gxgy + y * gx + x] = 1;
    }
  }

  // 3. flood fill (DFS with stack-as-array, faster than BFS in JS)
  const stack: number[] = [];
  // seed: bbox 6 境界面の空 cell すべて
  // (pad >= 1 で boundary cells は必ず空、確実に exterior の起点になる)
  for (let z = 0; z < gz; z += gz - 1) {
    for (let y = 0; y < gy; y++) {
      for (let x = 0; x < gx; x++) {
        const i = z * gxgy + y * gx + x;
        if (state[i] === 0) { state[i] = 2; stack.push(i); }
      }
    }
  }
  for (let y = 0; y < gy; y += gy - 1) {
    for (let z = 1; z < gz - 1; z++) {
      for (let x = 0; x < gx; x++) {
        const i = z * gxgy + y * gx + x;
        if (state[i] === 0) { state[i] = 2; stack.push(i); }
      }
    }
  }
  for (let x = 0; x < gx; x += gx - 1) {
    for (let z = 1; z < gz - 1; z++) {
      for (let y = 1; y < gy - 1; y++) {
        const i = z * gxgy + y * gx + x;
        if (state[i] === 0) { state[i] = 2; stack.push(i); }
      }
    }
  }

  // 内蔵 voxel の隣接 empty cell を追加 exterior seed として stack に push
  // 閉じた口腔内 cavity を exterior 扱いにし、内蔵 voxel face を可視化
  let internalSeedCount = 0;
  if (internalVoxelWorldCenters) {
    const invVsLocal = 1 / voxelSize;
    for (const [iwx, iwy, iwz] of internalVoxelWorldCenters) {
      const cx = Math.round((iwx - refOx) * invVsLocal);
      const cy = Math.round((iwy - refOy) * invVsLocal);
      const cz = Math.round((iwz - refOz) * invVsLocal);
      if (cx < 1 || cx >= gx - 1 || cy < 1 || cy >= gy - 1 || cz < 1 || cz >= gz - 1) continue;
      const ci = cz * gxgy + cy * gx + cx;
      // 隣接 6 cell が empty (state=0) なら exterior seed として追加
      const neighbors = [ci - 1, ci + 1, ci - gx, ci + gx, ci - gxgy, ci + gxgy];
      for (const ni of neighbors) {
        if (state[ni] === 0) { state[ni] = 2; stack.push(ni); internalSeedCount++; }
      }
    }
  }

  let exteriorCount = stack.length;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % gx;
    const yz = (i / gx) | 0;
    const y = yz % gy;
    const z = (yz / gy) | 0;
    if (x > 0)        { const ni = i - 1;     if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
    if (x < gx - 1)   { const ni = i + 1;     if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
    if (y > 0)        { const ni = i - gx;    if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
    if (y < gy - 1)   { const ni = i + gx;    if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
    if (z > 0)        { const ni = i - gxgy;  if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
    if (z < gz - 1)   { const ni = i + gxgy;  if (state[ni] === 0) { state[ni] = 2; stack.push(ni); exteriorCount++; } }
  }

  const invVs = 1 / voxelSize;
  // [fix] world coordinate を cell index に変換する際、呼び出し側が cell center
  //       (corner + 0.5*vs) を渡してくると `Math.round((N+0.5))` が N+1 に切り上がる
  //       off-by-one。Math.floor なら center (N+0.5) も corner (N) もどちらも cell N に
  //       マップされる。FP 誤差で隠れる場合と顕在化する場合があり、後者で body が
  //       透けて見える原因になっていた。
  const isExteriorWorldCell = (wx: number, wy: number, wz: number): boolean => {
    const x = Math.floor((wx - refOx) * invVs);
    const y = Math.floor((wy - refOy) * invVs);
    const z = Math.floor((wz - refOz) * invVs);
    if (x < 0 || x >= gx || y < 0 || y >= gy || z < 0 || z >= gz) return true; // bbox 外 = exterior
    return state[z * gxgy + y * gx + x] === 2;
  };

  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    isExteriorWorldCell,
    stats: { gx, gy, gz, cells: N, voxels: totalVoxels, exteriorCells: exteriorCount, ms, internalSeeds: internalSeedCount },
  };
}
