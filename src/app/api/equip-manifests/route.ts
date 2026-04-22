import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  PREFIX_SCAN_DIRS, SPECIAL_OUTFITS, scanPrefixGroups,
} from '@/lib/equip-sets-config';

const BOX2_DIR = path.join(process.cwd(), 'public', 'box2');
const STATIC_SUFFIX = '_parts.json';

export interface ManifestSetEntry {
  key: string;
  source: 'static' | 'dynamic';
  label?: string;
}

function listStaticSets(): ManifestSetEntry[] {
  try {
    return fs.readdirSync(BOX2_DIR)
      .filter((f) => f.endsWith(STATIC_SUFFIX))
      .map((f) => ({ key: f.slice(0, -STATIC_SUFFIX.length), source: 'static' as const }));
  } catch {
    return [];
  }
}

function listDynamicSets(): ManifestSetEntry[] {
  const out: ManifestSetEntry[] = [];
  for (const scan of PREFIX_SCAN_DIRS) {
    for (const prefix of scanPrefixGroups(scan.rootDir)) {
      out.push({ key: `${scan.label}__${prefix}`, source: 'dynamic', label: prefix });
    }
  }
  for (const outfit of SPECIAL_OUTFITS) {
    out.push({ key: `special__${outfit.label}`, source: 'dynamic', label: outfit.label });
  }
  return out;
}

export async function GET() {
  try {
    const sets = [...listStaticSets(), ...listDynamicSets()]
      .sort((a, b) => a.key.localeCompare(b.key));
    return NextResponse.json(sets);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
