// ========================================================================
// ボクセル処理ユーティリティ
// template-editor で使用
// ========================================================================

import type { VoxelEntry } from '@/types/vox';

const NEIGHBORS_6: [number, number, number][] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

export function buildOccSet(voxels: { x: number; y: number; z: number }[]): Set<string> {
  const s = new Set<string>();
  for (const v of voxels) s.add(`${v.x},${v.y},${v.z}`);
  return s;
}

export function findSurface(voxels: { x: number; y: number; z: number }[], occ: Set<string>) {
  return voxels.filter(v => NEIGHBORS_6.some(([dx, dy, dz]) => !occ.has(`${v.x + dx},${v.y + dy},${v.z + dz}`)));
}

export function filterRegion<T extends { x: number; z: number }>(
  voxels: T[], reg: { zMin: number; zMax: number; xMin: number; xMax: number }
): T[] {
  return voxels.filter(v => v.z >= reg.zMin && v.z < reg.zMax && v.x >= reg.xMin && v.x < reg.xMax);
}

export function generateShell(
  surfaceVoxels: { x: number; y: number; z: number }[],
  bodyOcc: Set<string>, offset: number,
  sizeX: number, sizeY: number, sizeZ: number,
  color: [number, number, number],
): VoxelEntry[] {
  const shellSet = new Set<string>();
  let frontier: { x: number; y: number; z: number }[] = [];
  for (const v of surfaceVoxels) {
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
      const key = `${nx},${ny},${nz}`;
      if (!bodyOcc.has(key) && !shellSet.has(key)) {
        shellSet.add(key); frontier.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  for (let d = 2; d <= offset; d++) {
    const next: { x: number; y: number; z: number }[] = [];
    for (const f of frontier) {
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = f.x + dx, ny = f.y + dy, nz = f.z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
        const key = `${nx},${ny},${nz}`;
        if (!bodyOcc.has(key) && !shellSet.has(key)) { shellSet.add(key); next.push({ x: nx, y: ny, z: nz }); }
      }
    }
    frontier = next;
  }
  return Array.from(shellSet).map(k => {
    const [x, y, z] = k.split(',').map(Number);
    return { x, y, z, r: color[0], g: color[1], b: color[2] };
  });
}

export function generateHairCap(
  headVoxels: { x: number; y: number; z: number }[],
  bodyOcc: Set<string>,
  sizeX: number, sizeY: number, sizeZ: number,
  color: [number, number, number],
): VoxelEntry[] {
  if (headVoxels.length === 0) return [];
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of headVoxels) { sumX += v.x; sumY += v.y; sumZ += v.z; }
  const n = headVoxels.length;
  const cx = sumX / n, cy = sumY / n, cz = sumZ / n;
  let maxR = 0;
  for (const v of headVoxels) {
    const r = Math.sqrt((v.x - cx) ** 2 + (v.y - cy) ** 2 + (v.z - cz) ** 2);
    if (r > maxR) maxR = r;
  }
  const innerR = maxR + 0.5, outerR = maxR + 3.5;
  const result: VoxelEntry[] = [];
  const mnX = Math.max(0, Math.floor(cx - outerR)), mxX = Math.min(sizeX - 1, Math.ceil(cx + outerR));
  const mnY = Math.max(0, Math.floor(cy - outerR)), mxY = Math.min(sizeY - 1, Math.ceil(cy + outerR));
  const mnZ = Math.max(0, Math.floor(cz - 2)), mxZ = Math.min(sizeZ - 1, Math.ceil(cz + outerR));
  for (let x = mnX; x <= mxX; x++) {
    for (let y = mnY; y <= mxY; y++) {
      for (let z = mnZ; z <= mxZ; z++) {
        const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2);
        if (r >= innerR && r <= outerR && !bodyOcc.has(`${x},${y},${z}`)) {
          result.push({ x, y, z, r: color[0], g: color[1], b: color[2] });
        }
      }
    }
  }
  return result;
}
