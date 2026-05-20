// Next.jsのLinkコンポーネントをインポート（クライアントサイドナビゲーション用）
import Link from 'next/link';

// アプリケーション内の各ページへのリンク定義（パスとラベルの配列）
const pages = [
  { href: '/realistic-viewer', label: 'Voxel Viewer' },        // ボクセルモデルビューア（静的表示）
  { href: '/equip-config', label: 'Equipment Behavior Config' }, // 装備ビヘイビア設定
  { href: '/model-import', label: 'Model Import' },            // モデルインポート
  { href: '/template-editor', label: 'Template Editor' },      // テンプレートエディタ
  { href: '/clothing-preview', label: 'Clothing Preview' },    // 衣装プレビュー・部位指定
  { href: '/skinned-voxel-demo', label: 'Skinned Voxel Demo' }, // スキン付きボクセルデモ
  { href: '/characters-preview', label: 'Characters Preview' }, // キャラクター一覧プレビュー
  { href: '/cloth-test', label: 'Cloth Test' },                // クロスシミュレーションテスト
  { href: '/darkelfblader-preview', label: 'Dark Elf Blader Preview' }, // ダークエルフブレイダープレビュー
  { href: '/qm-mustardui-preview', label: 'QM MustardUI Preview' }, // QM MustardUI プレビュー
  { href: '/helena-qm-compare?model=helena', label: 'QM Compare: Helena' }, // QM比較: Helena
  { href: '/helena-qm-compare?model=anna',   label: 'QM Compare: Anna' },   // QM比較: Anna
  { href: '/helena-qm-compare?model=rachel', label: 'QM Compare: Rachel' }, // QM比較: Rachel
  { href: '/helena-qm-compare?model=vaultgirl', label: 'QM Compare: Vaultgirl' }, // QM比較: Vaultgirl
  { href: '/helena-qm-compare?model=nyotengu', label: 'QM Compare: Nyotengu' }, // QM比較: Nyotengu
  { href: '/helena-qm-compare?model=blackwidow', label: 'QM Compare: BlackWidow' }, // QM比較: BlackWidow
  { href: '/helena-qm-compare?model=pharah', label: 'QM Compare: Pharah' }, // QM比較: Pharah
  { href: '/build?model=rachel',         label: 'Build: Rachel' },          // 骨リターゲット検証 (Rachel)
  { href: '/build?model=anna',           label: 'Build: Anna' },            // 骨リターゲット検証 (Anna)
  { href: '/build?model=helena',         label: 'Build: Helena (Final)' },  // 骨リターゲット検証 (Helena Final)
  { href: '/build?model=helena_douglas', label: 'Build: Helena Douglas' },  // 骨リターゲット検証 (Helena Douglas)
  { href: '/rachel-native',              label: 'Rachel Native Voxel' },    // Rachel ネイティブ体型 voxel ビューア
  { href: '/anna-native',                label: 'Anna Native Voxel' },      // Anna ネイティブ体型 voxel ビューア
  { href: '/vaultgirl-native',           label: 'Vaultgirl Native Voxel' }, // Vaultgirl ネイティブ体型 voxel ビューア
  { href: '/nyotengu-native',            label: 'Nyotengu Native Voxel' },  // Nyotengu ネイティブ体型 voxel ビューア
  { href: '/blackwidow-native',          label: 'BlackWidow Native Voxel' },// BlackWidow ネイティブ体型 voxel ビューア
  { href: '/pharah-native',              label: 'Pharah Native Voxel' },    // Pharah ネイティブ体型 voxel ビューア
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
