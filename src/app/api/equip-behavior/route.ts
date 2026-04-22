import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const VALID_KEY = /^[a-zA-Z0-9_-]+$/;

function isValidKey(key: string | null): key is string {
  return typeof key === 'string' && VALID_KEY.test(key);
}

function getBehaviorFilePath(partKey: string, setKey?: string | null): string {
  const name = setKey ? `${setKey}__${partKey}` : partKey;
  return path.join(process.cwd(), 'public', 'box2', `${name}.behavior.json`);
}

export async function GET(request: NextRequest) {
  const partKey = request.nextUrl.searchParams.get('partKey');
  const setKey = request.nextUrl.searchParams.get('setKey');

  if (!isValidKey(partKey)) {
    return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
  }
  if (setKey !== null && !isValidKey(setKey)) {
    return NextResponse.json({ error: 'Invalid setKey' }, { status: 400 });
  }

  const filePath = getBehaviorFilePath(partKey, setKey);
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
    const { partKey, setKey, behaviors } = body;

    if (!isValidKey(partKey)) {
      return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
    }
    if (setKey != null && !isValidKey(setKey)) {
      return NextResponse.json({ error: 'Invalid setKey' }, { status: 400 });
    }

    const filePath = getBehaviorFilePath(partKey, setKey);
    const data = {
      surface: behaviors?.surface ?? [],
      gravity: behaviors?.gravity ?? [],
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
