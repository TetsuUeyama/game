import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Validate dir to prevent directory traversal
function isValidDir(dir: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(dir);
}

function getConfigPath(dir: string): string {
  return path.join(process.cwd(), 'public', dir, 'bone-config.json');
}

export async function GET(request: NextRequest) {
  const dir = request.nextUrl.searchParams.get('dir');
  if (!dir || !isValidDir(dir)) {
    return NextResponse.json({ error: 'Missing or invalid dir parameter' }, { status: 400 });
  }

  const filePath = getConfigPath(dir);
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return NextResponse.json(data);
    }
    return NextResponse.json(null);
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request: NextRequest) {
  const dir = request.nextUrl.searchParams.get('dir');
  if (!dir || !isValidDir(dir)) {
    return NextResponse.json({ error: 'Missing or invalid dir parameter' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const filePath = getConfigPath(dir);
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
