/**
 * 衣装セット (setKey) から全 voxel を読み込む単純なローダ。
 * behavior 分類はしない — 全ての voxel を布パーティクルとして扱う用途。
 *
 * 使い方:
 *   const { voxels, grid } = await loadOutfitAsCloth('special__qm_default');
 *   const cloth = new VoxelCloth(scene, { voxels, grid, skeleton, capsules });
 */
import { parseVox } from '@/lib/vox-parser';
import type { ClothVoxel, GridInfo } from '@/lib/cloth';

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

export interface OutfitClothData {
  voxels: ClothVoxel[];
  setKey: string;
}

/**
 * 指定 setKey の全パーツを読み込み、ClothVoxel[] に変換する。
 * 失敗したパーツは skip（warn のみ）。
 */
export async function loadOutfitAsCloth(setKey: string): Promise<OutfitClothData> {
  const manifestResp = await fetch(`/api/equip-manifest?set=${encodeURIComponent(setKey)}`);
  if (!manifestResp.ok) throw new Error(`manifest not found: ${setKey}`);
  const parts: PartEntry[] = await manifestResp.json();

  const voxels: ClothVoxel[] = [];
  for (const part of parts) {
    try {
      const voxResp = await fetch(part.file);
      if (!voxResp.ok) continue;
      const model = parseVox(await voxResp.arrayBuffer());
      for (const v of model.voxels) {
        const col = model.palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
        voxels.push({
          x: v.x, y: v.y, z: v.z,
          r: col.r, g: col.g, b: col.b,
        });
      }
    } catch (e) {
      console.warn(`outfit part failed: ${part.key}`, e);
    }
  }

  return { voxels, setKey };
}

/** grid.json をフェッチする（vox 共通グリッド情報） */
export async function loadGridInfo(url: string): Promise<GridInfo> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`grid not found: ${url}`);
  return resp.json();
}
