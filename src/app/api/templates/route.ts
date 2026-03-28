// Next.jsのリクエスト・レスポンス型をインポート
import { NextRequest, NextResponse } from 'next/server';
// ファイルシステムモジュール
import fs from 'fs';
// パス操作モジュール
import path from 'path';

// テンプレートVOXファイルの格納ディレクトリ
const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'templates');

// 許可されたテンプレート名のセット（アップロード時のバリデーション用）
const VALID_NAMES = new Set([
  'hair_cap', 'shirt_shell', 'pants_shell',          // 髪キャップ、シャツシェル、パンツシェル
  'boots_shell', 'gloves_shell', 'full_body_shell',   // ブーツシェル、グローブシェル、全身シェル
]);

// GET: テンプレートファイル一覧を取得するAPIエンドポイント
export async function GET() {
  try {
    // テンプレートディレクトリが存在しなければ空のリストを返す
    if (!fs.existsSync(TEMPLATES_DIR)) return NextResponse.json({ files: [] });
    // ディレクトリ内の.voxファイルのみをフィルタリング
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.vox'));
    // 各ファイルの情報（名前、サイズ、更新日時）を収集
    const result = files.map(f => {
      const stat = fs.statSync(path.join(TEMPLATES_DIR, f));
      return { name: f.replace('.vox', ''), size: stat.size, modified: stat.mtime.toISOString() };
    });
    // ファイル一覧をJSON形式で返す
    return NextResponse.json({ files: result });
  } catch (e) {
    // エラー時はエラーメッセージ付きの500レスポンスを返す
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: テンプレートVOXファイルをアップロードするAPIエンドポイント
export async function POST(req: NextRequest) {
  try {
    // multipart/form-dataからフォームデータを取得
    const formData = await req.formData();
    // テンプレート名とファイルデータを取得
    const name = formData.get('name') as string;
    const file = formData.get('file') as File;
    // nameとfileが両方必須
    if (!name || !file) return NextResponse.json({ error: 'name and file required' }, { status: 400 });
    // テンプレート名が許可リストに含まれているかバリデーション
    if (!VALID_NAMES.has(name)) return NextResponse.json({ error: `Invalid template name: ${name}` }, { status: 400 });

    // テンプレートディレクトリが存在しなければ再帰的に作成
    if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
    // ファイルデータをArrayBufferからNodeのBufferに変換
    const buf = Buffer.from(await file.arrayBuffer());
    // VOXファイルとして保存
    fs.writeFileSync(path.join(TEMPLATES_DIR, `${name}.vox`), buf);
    // 成功レスポンスを返す（テンプレート名とファイルサイズ）
    return NextResponse.json({ ok: true, name, size: buf.length });
  } catch (e) {
    // エラー時はエラーメッセージ付きの500レスポンスを返す
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
