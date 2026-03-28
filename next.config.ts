// Next.jsの設定型をインポート
import type { NextConfig } from "next";

// Next.jsの設定オブジェクト
const nextConfig: NextConfig = {
  /* config options here */
  // React Strict Modeを有効化（開発時に副作用のバグを検出しやすくする）
  reactStrictMode: true,
  // ESLintの設定
  eslint: {
    // ビルド時のESLintチェックを無視する（ビルド速度向上のため）
    ignoreDuringBuilds: true,
  },
  // TypeScriptの設定
  typescript: {
    // ビルド時のTypeScript型エラーを無視する（ビルド速度向上のため）
    ignoreBuildErrors: true,
  },

  // Webpackの設定をカスタマイズ
  webpack: (config) => {
    // 既存のexperiments設定を保持しつつ、asyncWebAssemblyを有効化
    config.experiments = {
      ...config.experiments,
      // 非同期WebAssemblyモジュールの読み込みを有効化（Havok物理エンジン等で必要）
      asyncWebAssembly: true,
    };
    // カスタマイズ済みの設定を返す
    return config;
  },
};

// 設定オブジェクトをデフォルトエクスポート
export default nextConfig;
