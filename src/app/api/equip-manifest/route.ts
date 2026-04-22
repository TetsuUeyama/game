import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  PREFIX_SCAN_DIRS, SPECIAL_OUTFITS,
  loadPrefixGroup, loadSpecialOutfit,
  type PartEntry,
} from '@/lib/equip-sets-config';

const BOX2_DIR = path.join(process.cwd(), 'public', 'box2');
const VALID_KEY = /^[a-zA-Z0-9_-]+$/;

function loadStatic(setKey: string): PartEntry[] | null {
  const filePath = path.join(BOX2_DIR, `${setKey}_parts.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PartEntry[];
  } catch { return null; }
}

function loadDynamic(setKey: string): PartEntry[] | null {
  const parts = setKey.split('__');
  if (parts.length < 2) return null;
  const [label, ...rest] = parts;
  const suffix = rest.join('__');

  if (label === 'special') {
    const outfit = SPECIAL_OUTFITS.find((o) => o.label === suffix);
    return outfit ? loadSpecialOutfit(outfit) : null;
  }

  const scan = PREFIX_SCAN_DIRS.find((s) => s.label === label);
  return scan ? loadPrefixGroup(scan.rootDir, suffix) : null;
}

export async function GET(request: NextRequest) {
  const setKey = request.nextUrl.searchParams.get('set');
  if (!setKey || !VALID_KEY.test(setKey)) {
    return NextResponse.json({ error: 'Invalid set key' }, { status: 400 });
  }
  const parts = loadStatic(setKey) ?? loadDynamic(setKey);
  if (!parts) {
    return NextResponse.json({ error: `Set "${setKey}" not found` }, { status: 404 });
  }
  return NextResponse.json(parts);
}
