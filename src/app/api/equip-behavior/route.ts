import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Validate partKey to prevent directory traversal
function isValidPartKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

function getBehaviorFilePath(partKey: string): string {
  return path.join(process.cwd(), 'public', 'box2', `${partKey}.behavior.json`);
}

export async function GET(request: NextRequest) {
  const partKey = request.nextUrl.searchParams.get('partKey');
  if (!partKey || !isValidPartKey(partKey)) {
    return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
  }

  const filePath = getBehaviorFilePath(partKey);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return NextResponse.json(data);
    }
    return NextResponse.json({ surface: [], gravity: [] });
  } catch {
    return NextResponse.json({ surface: [], gravity: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { partKey, behaviors } = body;

    if (!partKey || !isValidPartKey(partKey)) {
      return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
    }

    const filePath = getBehaviorFilePath(partKey);
    const data = {
      surface: behaviors?.surface ?? [],
      gravity: behaviors?.gravity ?? [],
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
