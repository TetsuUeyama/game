// ========================================================================
// 基準Bodyベースの体型補正（クラスタベース）
// model-import で使用
// ========================================================================

import type { VoxelEntry } from '@/types/vox';
import { parseVox } from '@/lib/vox-parser';

/** 高さZごとのスライスプロファイル */
export interface SliceProfile {
  z: number;
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
  count: number;
}

// 基準Bodyプロファイルのキャッシュ
let cachedBaseProfile: SliceProfile[] | null = null;
let cachedBaseUrl: string | null = null;

/**
 * ボクセル配列からZ軸(高さ)ごとのスライスプロファイルを生成。
 */
export function buildSliceProfile(voxels: VoxelEntry[]): SliceProfile[] {
  const sliceMap = new Map<number, { xs: number[]; ys: number[] }>();
  for (const v of voxels) {
    let entry = sliceMap.get(v.z);
    if (!entry) { entry = { xs: [], ys: [] }; sliceMap.set(v.z, entry); }
    entry.xs.push(v.x);
    entry.ys.push(v.y);
  }

  const profiles: SliceProfile[] = [];
  for (const [z, { xs, ys }] of sliceMap) {
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    profiles.push({
      z,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX + 1,
      depth: maxY - minY + 1,
      count: xs.length,
    });
  }

  profiles.sort((a, b) => a.z - b.z);
  return profiles;
}

/**
 * 基準body.voxをAPIから読み込み、プロファイルを生成してキャッシュする。
 */
export async function loadBaseProfile(voxUrl: string): Promise<SliceProfile[]> {
  if (cachedBaseProfile && cachedBaseUrl === voxUrl) return cachedBaseProfile;

  const resp = await fetch(voxUrl + `?v=${Date.now()}`);
  if (!resp.ok) throw new Error(`Failed to load base body: ${resp.status}`);

  const model = parseVox(await resp.arrayBuffer());
  const voxels: VoxelEntry[] = model.voxels.map(v => {
    const c = model.palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
    return { x: v.x, y: v.y, z: v.z, r: c.r, g: c.g, b: c.b };
  });

  cachedBaseProfile = buildSliceProfile(voxels);
  cachedBaseUrl = voxUrl;
  return cachedBaseProfile;
}

/** スライス内のXY座標を4連結で連結成分分析し、クラスタに分離する */
function findClusters(positions: [number, number][]): Set<string>[] {
  const posSet = new Set(positions.map(([x, y]) => `${x},${y}`));
  const visited = new Set<string>();
  const clusters: Set<string>[] = [];

  for (const key of posSet) {
    if (visited.has(key)) continue;
    const cluster = new Set<string>();
    const queue = [key];
    while (queue.length > 0) {
      const p = queue.pop()!;
      if (visited.has(p)) continue;
      visited.add(p);
      cluster.add(p);
      const [px, py] = p.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nb = `${px+dx},${py+dy}`;
        if (posSet.has(nb) && !visited.has(nb)) queue.push(nb);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/** クラスタの幅/奥行/中心を計算 */
function clusterProfile(cluster: Set<string>): { centerX: number; centerY: number; width: number; depth: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const key of cluster) {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX + 1,
    depth: maxY - minY + 1,
  };
}

/**
 * ボクセル配列を基準Bodyの体型に向けて補正する。
 * クラスタベース: 各スライスで連結成分分析を行い、最大クラスタ（胴体）のみ補正。
 * 腕や離れたパーツはそのまま保持。足先（下5%）は補正スキップ。
 */
export function normalizeToBase(
  voxels: VoxelEntry[],
  baseProfile: SliceProfile[],
  blendRate: number,
): VoxelEntry[] {
  if (blendRate <= 0 || voxels.length === 0) return voxels;

  // 基準プロファイルをMap化
  const baseMap = new Map<number, SliceProfile>();
  for (const b of baseProfile) baseMap.set(b.z, b);
  const baseMinZ = Math.min(...baseProfile.map(p => p.z));
  const baseMaxZ = Math.max(...baseProfile.map(p => p.z));
  const baseHeight = baseMaxZ - baseMinZ + 1;

  // Zごとにグループ化
  const zGroups = new Map<number, VoxelEntry[]>();
  for (const v of voxels) {
    let group = zGroups.get(v.z);
    if (!group) { group = []; zGroups.set(v.z, group); }
    group.push(v);
  }

  const sortedZs = [...zGroups.keys()].sort((a, b) => a - b);
  const srcMinZ = sortedZs[0];
  const srcMaxZ = sortedZs[sortedZs.length - 1];
  const srcHeight = srcMaxZ - srcMinZ + 1;

  // 足先スキップ: 最下部5%
  const footSkipZ = srcMinZ + Math.floor(srcHeight * 0.05);

  const result: VoxelEntry[] = [];
  const occupied = new Set<string>();

  for (const vz of sortedZs) {
    const entries = zGroups.get(vz)!;

    // 足先はスキップ
    if (vz < footSkipZ) {
      for (const v of entries) {
        const key = `${v.x},${v.y},${v.z}`;
        if (!occupied.has(key)) { occupied.add(key); result.push(v); }
      }
      continue;
    }

    // 連結成分分析
    const xyPositions: [number, number][] = entries.map(v => [v.x, v.y]);
    const clusters = findClusters(xyPositions);

    if (clusters.length === 0) {
      for (const v of entries) {
        const key = `${v.x},${v.y},${v.z}`;
        if (!occupied.has(key)) { occupied.add(key); result.push(v); }
      }
      continue;
    }

    // 最大クラスタ = 胴体
    const largest = clusters.reduce((a, b) => a.size > b.size ? a : b);
    const torso = clusterProfile(largest);

    // 基準Zにマッピング
    const t = (vz - srcMinZ) / Math.max(srcHeight - 1, 1);
    const mappedZ = Math.round(baseMinZ + t * (baseHeight - 1));
    const bp = baseMap.get(mappedZ) || findNearest(baseProfile, mappedZ);

    if (!bp || bp.width < 2 || torso.width < 2) {
      for (const v of entries) {
        const key = `${v.x},${v.y},${v.z}`;
        if (!occupied.has(key)) { occupied.add(key); result.push(v); }
      }
      continue;
    }

    // 補正スケール
    const targetWidth = torso.width - (torso.width - bp.width) * blendRate;
    const scaleX = targetWidth / torso.width;
    const targetDepth = torso.depth - (torso.depth - bp.depth) * blendRate;
    const scaleY = targetDepth / torso.depth;

    for (const v of entries) {
      const xyKey = `${v.x},${v.y}`;
      if (largest.has(xyKey)) {
        // 胴体クラスタ: 補正適用
        const newX = Math.round(torso.centerX + (v.x - torso.centerX) * scaleX);
        const newY = Math.round(torso.centerY + (v.y - torso.centerY) * scaleY);
        const key = `${newX},${newY},${v.z}`;
        if (!occupied.has(key)) {
          occupied.add(key);
          result.push({ x: newX, y: newY, z: v.z, r: v.r, g: v.g, b: v.b });
        }
      } else {
        // 非胴体クラスタ: そのまま
        const key = `${v.x},${v.y},${v.z}`;
        if (!occupied.has(key)) { occupied.add(key); result.push(v); }
      }
    }
  }

  return result;
}

/** 最も近いZ値のプロファイルを検索 */
function findNearest(profiles: SliceProfile[], targetZ: number): SliceProfile | null {
  let best: SliceProfile | null = null;
  let bestDist = Infinity;
  for (const p of profiles) {
    const d = Math.abs(p.z - targetZ);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

/** 基準Body VOXファイルのデフォルトURL */
export const BASE_BODY_VOX_URL = '/api/vox/female/realistic-queenmarika-default/body/body.vox';
