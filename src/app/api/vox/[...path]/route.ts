// Next.jsのリクエスト・レスポンス型をインポート
import { NextRequest, NextResponse } from 'next/server';
// ファイルシステムモジュール
import fs from 'fs';
// パス操作モジュール
import path from 'path';

// VOXファイルのベースディレクトリ（環境変数で上書き可能）
const VOX_BASE = process.env.VOX_BASE_DIR || 'C:\\Users\\user\\developsecond\\game-assets\\vox';

// パスセグメントの安全性チェック用正規表現（英数字、ドット、アンダースコア、ハイフンのみ許可）
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

// ファイル拡張子→Content-Typeのマッピング
const CONTENT_TYPES: Record<string, string> = {
  '.vox': 'application/octet-stream',   // VOXファイルはバイナリデータ
  '.json': 'application/json',           // JSONファイル
  '.png': 'image/png',                   // プレビュー画像
  '.glb': 'model/gltf-binary',          // GLBモデル
};

// GET: 指定パスのVOX/JSONファイルを返すAPIエンドポイント（動的ルート [...path]）
export async function GET(
  _request: NextRequest,  // リクエスト（未使用）
  { params }: { params: Promise<{ path: string[] }> }  // URLパスセグメントの配列
) {
  // パスセグメントを取得
  const { path: segments } = await params;

  // 各パスセグメントのバリデーション（ディレクトリトラバーサル防止）
  for (const seg of segments) {
    // 安全でない文字を含むか、".."が含まれる場合はエラー400
    if (!SAFE_SEGMENT.test(seg) || seg === '..') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
  }

  // ベースディレクトリとセグメントからフルパスを構築
  const filePath = path.join(VOX_BASE, ...segments);

  // パスを正規化してベースディレクトリ内にあることを確認（二重チェック）
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(VOX_BASE))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // ファイルが存在しなければ404
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ファイル拡張子からContent-Typeを決定
  const ext = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  // サポートされていないファイルタイプは403
  if (!contentType) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 403 });
  }

  // ファイルを読み込み
  const data = fs.readFileSync(resolved);
  // ファイルデータをレスポンスとして返す（1時間キャッシュ設定付き）
  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,                  // ファイル種別に応じたContent-Type
      'Cache-Control': 'public, max-age=3600',       // 1時間のパブリックキャッシュ
    },
  });
}
