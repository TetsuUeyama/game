import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const VOX_BASE = process.env.VOX_BASE_DIR || 'C:\\Users\\user\\developsecond\\game-assets\\vox';
const PREVIEW_DIR = path.join(VOX_BASE, 'female', 'realistic-queenmarika-default', 'previews');

export async function GET() {
  if (!fs.existsSync(PREVIEW_DIR)) {
    return NextResponse.json([]);
  }
  const files = fs.readdirSync(PREVIEW_DIR)
    .filter(f => f.endsWith('.png') && !f.startsWith('_tmp'))
    .sort();
  return NextResponse.json(files);
}
