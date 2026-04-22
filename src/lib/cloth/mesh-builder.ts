import { Mesh, VertexData, Scene, Color3, StandardMaterial } from '@babylonjs/core';
import { FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { ClothVoxel, GridInfo, GridWorldTransform } from './types';

export interface BuiltClothMesh {
  mesh: Mesh;
  vertexVoxelIdx: Int32Array;
  restPositions: Float32Array;
}

/**
 * Blender→glTF の軸変換 (x, z, -y)。Blender exporter が GLB に対して適用するのと
 * 同じ変換。この変換の出力 = GLB body の mesh-local 空間 = skeleton-local 空間。
 * overlay mesh を __root__ の子にする前提で使用する（__root__ が handedness 変換を担う）。
 */
export function defaultBlenderToGltfTransform(grid: GridInfo): GridWorldTransform {
  const s = grid.voxel_size;
  const [ox, oy, oz] = grid.grid_origin;
  return {
    point: (gx, gy, gz) => [ox + gx * s, oz + gz * s, -(oy + gy * s)],
    dir: (dx, dy, dz) => [dx, dz, -dy],
  };
}

/** ボクセル中心のワールド座標（transform 経由で dynamic） */
export function voxelCenterWorld(
  voxel: ClothVoxel | { x: number; y: number; z: number },
  transform: GridWorldTransform,
): [number, number, number] {
  return transform.point(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
}

/**
 * ボクセル群から1つの Babylon Mesh を構築する。
 * - 隣接面はカリング（内部面は描画しない）
 * - 各ボクセルは中心基準で `inflate` 倍にスケール描画 → 隙間隠し
 * - updatable=true で頂点バッファを毎フレ更新可能
 *
 * @returns mesh + 頂点 → voxel index マップ + 静止頂点座標
 */
export function buildClothMesh(
  scene: Scene,
  name: string,
  voxels: ClothVoxel[],
  transform: GridWorldTransform,
  inflate: number,
): BuiltClothMesh | null {
  if (voxels.length === 0) return null;

  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertexVoxelIdx: number[] = [];

  const inflateAt = (v: number) => 0.5 + (v - 0.5) * inflate;

  for (let i = 0; i < voxels.length; i++) {
    const voxel = voxels[i];
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      // 法線も grid→world の回転で同時変換（ハードコード禁止）
      const [nwx, nwy, nwz] = transform.dir(fn[0], fn[1], fn[2]);
      for (let vi = 0; vi < 4; vi++) {
        const [wx, wy, wz] = transform.point(
          voxel.x + inflateAt(fv[vi][0]),
          voxel.y + inflateAt(fv[vi][1]),
          voxel.z + inflateAt(fv[vi][2]),
        );
        positions.push(wx, wy, wz);
        normals.push(nwx, nwy, nwz);
        colors.push(voxel.r, voxel.g, voxel.b, 1);
        vertexVoxelIdx.push(i);
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

  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh, true);  // updatable=true

  const mat = new StandardMaterial(`${name}_mat`, scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0, 0, 0);
  mesh.material = mat;
  mesh.isPickable = false;

  return {
    mesh,
    vertexVoxelIdx: Int32Array.from(vertexVoxelIdx),
    restPositions: Float32Array.from(positions),
  };
}
