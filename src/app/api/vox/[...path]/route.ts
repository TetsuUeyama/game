import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const VOX_BASE = process.env.VOX_BASE_DIR || 'C:\\Users\\user\\developsecond\\vox';

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

const CONTENT_TYPES: Record<string, string> = {
  '.vox': 'application/octet-stream',
  '.json': 'application/json',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  // Validate each path segment
  for (const seg of segments) {
    if (!SAFE_SEGMENT.test(seg) || seg === '..') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
  }

  const filePath = path.join(VOX_BASE, ...segments);

  // Ensure resolved path is within VOX_BASE
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(VOX_BASE))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 403 });
  }

  const data = fs.readFileSync(resolved);
  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
