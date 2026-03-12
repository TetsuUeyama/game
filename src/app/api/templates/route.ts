import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates');

const VALID_NAMES = new Set([
  'hair_cap', 'shirt_shell', 'pants_shell',
  'boots_shell', 'gloves_shell', 'full_body_shell',
]);

export async function GET() {
  try {
    if (!fs.existsSync(TEMPLATES_DIR)) return NextResponse.json({ files: [] });
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.vox'));
    const result = files.map(f => {
      const stat = fs.statSync(path.join(TEMPLATES_DIR, f));
      return { name: f.replace('.vox', ''), size: stat.size, modified: stat.mtime.toISOString() };
    });
    return NextResponse.json({ files: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const name = formData.get('name') as string;
    const file = formData.get('file') as File;
    if (!name || !file) return NextResponse.json({ error: 'name and file required' }, { status: 400 });
    if (!VALID_NAMES.has(name)) return NextResponse.json({ error: `Invalid template name: ${name}` }, { status: 400 });

    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(TEMPLATES_DIR, `${name}.vox`), buf);
    return NextResponse.json({ ok: true, name, size: buf.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
