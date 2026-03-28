"use client"; // クライアントサイドレンダリングを有効化するディレクティブ
// Chakra UIのProvider、デフォルトシステム設定、Themeコンポーネントをインポート
import { ChakraProvider, defaultSystem, Theme } from "@chakra-ui/react";
// ReactのReactNode型をインポート
import { ReactNode } from "react";
// カラーモード関連のコンポーネントとフックをインポート
import { ColorModeProvider, useColorMode } from "./ColorMode";

// Propsの型定義（childrenのみ）
type Props = {
  children: ReactNode; // 子コンポーネント
};

// アプリ全体にChakra UIとカラーモードを提供するProviderコンポーネント
export const Provider: React.FC<Props> = ({ children }) => {
  // 現在のカラーモード（light/dark）を取得
  const { colorMode } = useColorMode();

  return (
    // ChakraProviderでChakra UIのデフォルトシステム設定を適用
    <ChakraProvider value={defaultSystem}>
      {/* カラーモード（ライト/ダーク切り替え）のプロバイダー */}
      <ColorModeProvider>
        {/* Themeコンポーネントで現在のカラーモードに応じた外観を適用 */}
        <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme>
      </ColorModeProvider>
    </ChakraProvider>
  );
};
