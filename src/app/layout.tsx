// import type { Metadata } from "next";  // メタデータ型（現在未使用）
// グローバルCSSスタイルシートのインポート
import "./globals.css";
// Google Fontsから丸ゴシックフォントをインポート
import { Zen_Maru_Gothic } from "next/font/google";
// ChakraUI + テーマを提供するProviderコンポーネントのインポート
import { Provider } from "./provider";

// メタデータ設定（現在コメントアウト）
// export const metadata: Metadata = {
//   title: "",
//   description: "",
// };

// Zen Maru Gothicフォントの設定
const font = Zen_Maru_Gothic({
  subsets: ["latin"],        // ラテン文字サブセットのみ読み込み
  weight: ["400"],           // ウェイト400（レギュラー）のみ読み込み（プリロード警告を減らすため1つに絞っている）
  display: "swap",           // フォント読み込み中はフォールバックフォントを表示し、読み込み完了後に切り替え
  preload: false,            // プリロードを無効化（パフォーマンス最適化）
});

// アプリケーション全体のルートレイアウトコンポーネント
export default function RootLayout({
  children,  // 子コンポーネント（各ページのコンテンツ）
}: Readonly<{
  children: React.ReactNode;  // React要素型のchildren
}>) {
  return (
    // htmlタグ（suppressHydrationWarning: サーバー/クライアント間のハイドレーション警告を抑制）
    <html suppressHydrationWarning>
      {/* bodyタグにフォントのクラス名を適用 */}
      <body className={font.className}>
        {/* Providerで子コンポーネントをラップ（ChakraUI + カラーモード提供） */}
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
