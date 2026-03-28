// ========================================================================
// VOXファイルエクスポーター（ブラウザ版、Blobとして出力）
// ========================================================================

import type { VoxelEntry } from '@/types/vox';

export function exportVoxBlob(
  voxels: VoxelEntry[], sizeX: number, sizeY: number, sizeZ: number
): Blob {
  const cMap = new Map<string, number>();
  const pal: { r: number; g: number; b: number }[] = [];
  for (const v of voxels) {
    const k = `${Math.round(v.r * 255)},${Math.round(v.g * 255)},${Math.round(v.b * 255)}`;
    if (!cMap.has(k) && pal.length < 255) {
      cMap.set(k, pal.length + 1);
      pal.push({ r: v.r, g: v.g, b: v.b });
    }
  }
  const vd = voxels.map(v => ({
    x: v.x, y: v.y, z: v.z,
    ci: cMap.get(`${Math.round(v.r * 255)},${Math.round(v.g * 255)},${Math.round(v.b * 255)}`) ?? 1,
  }));
  const szC = 12, xyC = 4 + vd.length * 4, rgC = 1024;
  const chSz = (12 + szC) + (12 + xyC) + (12 + rgC);
  const buf = new ArrayBuffer(8 + 12 + chSz);
  const dv = new DataView(buf);
  let o = 0;
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  const w32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  const w8 = (v: number) => { dv.setUint8(o, v); o += 1; };
  ws('VOX '); w32(200); ws('MAIN'); w32(0); w32(chSz);
  ws('SIZE'); w32(szC); w32(0); w32(sizeX); w32(sizeY); w32(sizeZ);
  ws('XYZI'); w32(xyC); w32(0); w32(vd.length);
  for (const v of vd) { w8(v.x); w8(v.y); w8(v.z); w8(v.ci); }
  ws('RGBA'); w32(rgC); w32(0);
  for (let i = 0; i < 256; i++) {
    const c = pal[i] ?? { r: 0, g: 0, b: 0 };
    w8(Math.round(c.r * 255)); w8(Math.round(c.g * 255)); w8(Math.round(c.b * 255)); w8(255);
  }
  return new Blob([buf], { type: 'application/octet-stream' });
}
