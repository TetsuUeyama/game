import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, normalize, sep } from 'path';

// External voxel data directory. Override with env var VOX_DATA_DIR.
// Default: C:/Users/user/developsecond/game-assets/vox-model/box5 (Windows).
const VOX_DIR =
  process.env.VOX_DATA_DIR ||
  'C:/Users/user/developsecond/game-assets/vox-model/box5';

const MIME: Record<string, string> = {
  vox: 'application/octet-stream',
  json: 'application/json',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  // Resolve safely, prevent path traversal
  const rel = normalize(path.join('/')).replace(/^[/\\]+/, '');
  if (rel.includes('..')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const full = join(VOX_DIR, rel.split('/').join(sep));
  try {
    const data = await readFile(full);
    const ext = rel.split('.').pop()?.toLowerCase() || '';
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': data.length.toString(),
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
