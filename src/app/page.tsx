import Link from 'next/link';

/**
 * ホームページ - ゲームモード選択
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-12">Basketball Game</h1>
      <div className="grid gap-6">
        <Link
          href="/character-move-1on1"
          className="px-8 py-6 bg-blue-600 hover:bg-blue-500 rounded-xl text-xl font-semibold text-center transition-colors"
        >
          1 on 1
        </Link>
        <Link
          href="/league"
          className="px-8 py-6 bg-green-600 hover:bg-green-500 rounded-xl text-xl font-semibold text-center transition-colors"
        >
          リーグ
        </Link>
      </div>
    </div>
  );
}
