// Next.jsのLinkコンポーネントをインポート（クライアントサイドナビゲーション用）
import Link from 'next/link';

// アプリケーション内の各ページへのリンク定義（パスとラベルの配列）
const pages = [
  { href: '/realistic-viewer', label: 'Realistic Viewer' },    // リアリスティックボクセルビューア
  { href: '/motion-lab', label: 'Motion Lab' },                // モーションラボ（ポーズ編集・キーフレームブレンド）
  { href: '/equip-config', label: 'Equipment Behavior Config' }, // 装備ビヘイビア設定
  { href: '/model-import', label: 'Model Import' },            // モデルインポート
  { href: '/template-editor', label: 'Template Editor' },      // テンプレートエディタ
];

// ホームページコンポーネント（各ツールページへのリンクを表示）
export default function Home() {
  return (
    // ルートコンテナ（パディング付き）
    <div style={{ padding: '2rem' }}>
      {/* ページタイトル */}
      <h1 style={{ marginBottom: '1.5rem' }}>Pages</h1>
      {/* リンクボタンを横並びフレックスで表示（折り返しあり） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        {/* 各ページへのリンクを生成 */}
        {pages.map((page) => (
          <Link
            key={page.href}          // Reactのkeyにパスを使用
            href={page.href}         // リンク先URL
            target="_blank"          // 新しいタブで開く
            style={{
              display: 'block',                  // ブロック要素として表示
              padding: '0.75rem 1.25rem',        // 内側の余白
              backgroundColor: '#2563eb',        // 青い背景色
              color: '#fff',                     // 白い文字色
              borderRadius: '0.5rem',            // 角丸
              textDecoration: 'none',            // アンダーラインなし
              textAlign: 'center',               // テキスト中央寄せ
              fontSize: '1rem',                  // フォントサイズ
            }}
          >
            {/* ページラベルを表示 */}
            {page.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
