import fs from 'fs';
import path from 'path';

export const VOX_BASE = process.env.VOX_BASE_DIR || 'C:\\Users\\user\\developsecond\\game-assets\\vox';

export interface PrefixScanDir {
  label: string;
  rootDir: string;
}

export const PREFIX_SCAN_DIRS: PrefixScanDir[] = [
  { label: 'qm', rootDir: 'female/realistic-queenmarika-default' },
];

export interface SpecialOutfit {
  label: string;
  rootDir: string;
  subdirs: string[];
  filePrefix: string;
}

export const SPECIAL_OUTFITS: SpecialOutfit[] = [
  {
    label: 'qm_default',
    rootDir: 'female/realistic-queenmarika-default',
    subdirs: ['clothing', 'accessories', 'armor', 'other'],
    filePrefix: 'queen_marika_default_-_',
  },
];

export interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
}

export function countVoxels(filePath: string): number {
  try {
    const buf = fs.readFileSync(filePath);
    const idx = buf.indexOf(Buffer.from('XYZI'));
    if (idx < 0) return 0;
    return buf.readUInt32LE(idx + 12);
  } catch {
    return 0;
  }
}

export function scanPrefixGroups(rootDir: string): string[] {
  const full = path.join(VOX_BASE, ...rootDir.split('/'));
  let files: string[] = [];
  try { files = fs.readdirSync(full); } catch { return []; }
  const prefixes = new Set<string>();
  for (const f of files) {
    if (!f.endsWith('.vox')) continue;
    const base = f.slice(0, -4);
    const parts = base.split('_');
    if (parts.length < 2) continue;
    prefixes.add(`${parts[0]}_${parts[1]}`);
  }
  return [...prefixes].sort();
}

export function loadPrefixGroup(rootDir: string, prefix: string): PartEntry[] | null {
  const fullDir = path.join(VOX_BASE, ...rootDir.split('/'));
  let files: string[] = [];
  try { files = fs.readdirSync(fullDir); } catch { return null; }
  const matches = files
    .filter((f) => f.endsWith('.vox') && f.startsWith(`${prefix}_`))
    .sort();
  if (matches.length === 0) return null;
  return matches.map((f) => ({
    key: f.slice(prefix.length + 1, -4),
    file: `/api/vox/${rootDir}/${f}`,
    voxels: countVoxels(path.join(fullDir, f)),
    default_on: true,
  }));
}

export function loadSpecialOutfit(outfit: SpecialOutfit): PartEntry[] | null {
  const parts: PartEntry[] = [];
  for (const sub of outfit.subdirs) {
    const subDir = path.join(VOX_BASE, ...outfit.rootDir.split('/'), sub);
    let files: string[] = [];
    try { files = fs.readdirSync(subDir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.vox')) continue;
      if (!f.startsWith(outfit.filePrefix)) continue;
      const key = f.slice(outfit.filePrefix.length, -4);
      parts.push({
        key,
        file: `/api/vox/${outfit.rootDir}/${sub}/${f}`,
        voxels: countVoxels(path.join(subDir, f)),
        default_on: true,
      });
    }
  }
  parts.sort((a, b) => a.key.localeCompare(b.key));
  return parts.length > 0 ? parts : null;
}
