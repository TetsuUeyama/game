// Next.jsのリクエスト・レスポンス型をインポート
import { NextRequest, NextResponse } from 'next/server';
// ファイルシステムモジュール
import fs from 'fs';
// パス操作モジュール
import path from 'path';

// パスキーのバリデーション（ディレクトリトラバーサル攻撃を防止）
// 英数字、アンダースコア、ハイフンのみ許可
function isValidPartKey(key: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

// パスキーからビヘイビアJSONファイルのフルパスを生成する関数
function getBehaviorFilePath(partKey: string): string {
  // public/box2/{partKey}.behavior.json に格納
  return path.join(process.cwd(), 'public', 'box2', `${partKey}.behavior.json`);
}

// GET: 指定パーツのビヘイビア設定を取得するAPIエンドポイント
export async function GET(request: NextRequest) {
  // クエリパラメータからpartKeyを取得
  const partKey = request.nextUrl.searchParams.get('partKey');
  // partKeyが未指定または不正な場合はエラー400を返す
  if (!partKey || !isValidPartKey(partKey)) {
    return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
  }

  // ビヘイビアファイルのパスを取得
  const filePath = getBehaviorFilePath(partKey);
  try {
    // ファイルが存在すれば読み込んでJSONとして返す
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return NextResponse.json(data);
    }
    // ファイルが存在しなければ空のビヘイビアデータを返す
    return NextResponse.json({ surface: [], gravity: [] });
  } catch {
    // エラー時も空のビヘイビアデータを返す（ファイル破損等に対応）
    return NextResponse.json({ surface: [], gravity: [] });
  }
}

// POST: 指定パーツのビヘイビア設定を保存するAPIエンドポイント
export async function POST(request: NextRequest) {
  try {
    // リクエストボディをJSONとしてパース
    const body = await request.json();
    // partKeyとbehaviorsを取得
    const { partKey, behaviors } = body;

    // partKeyが未指定または不正な場合はエラー400を返す
    if (!partKey || !isValidPartKey(partKey)) {
      return NextResponse.json({ error: 'Invalid partKey' }, { status: 400 });
    }

    // ビヘイビアファイルのパスを取得
    const filePath = getBehaviorFilePath(partKey);
    // 保存するデータを構築（surfaceとgravityの配列、未指定なら空配列）
    const data = {
      surface: behaviors?.surface ?? [],
      gravity: behaviors?.gravity ?? [],
    };

    // JSONファイルとして書き込み（インデント付き）
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    // 成功レスポンスを返す
    return NextResponse.json({ success: true });
  } catch (e) {
    // エラー時はエラーメッセージ付きの500レスポンスを返す
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
