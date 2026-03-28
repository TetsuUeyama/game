"use client" // クライアントサイドレンダリングを有効化するディレクティブ

// Chakra UIのIconButton型をインポート
import type { IconButtonProps } from "@chakra-ui/react"
// Chakra UIのコンポーネント群をインポート
import { ClientOnly, IconButton, Skeleton } from "@chakra-ui/react"
// next-themesからテーマプロバイダーとフックをインポート
import { ThemeProvider, useTheme } from "next-themes"
// next-themesのThemeProviderのProps型をインポート
import type { ThemeProviderProps } from "next-themes"
// Reactの基本インポート
import * as React from "react"
// react-iconsから太陽と月のアイコンをインポート（ライト/ダークモード表示用）
import { LuMoon, LuSun } from "react-icons/lu"

// ColorModeProviderのProps型（ThemeProviderPropsを再エクスポート）
export type ColorModeProviderProps = ThemeProviderProps

// カラーモードプロバイダーコンポーネント（next-themesのThemeProviderをラップ）
export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    // attribute="class"でHTMLのclass属性にテーマを反映、disableTransitionOnChangeでテーマ切替時のCSS遷移を無効化
    <ThemeProvider attribute="class" disableTransitionOnChange {...props} />
  )
}

// カラーモードの取得・切替を行うカスタムフック
export function useColorMode() {
  // next-themesから現在のテーマとテーマ設定関数を取得
  const { resolvedTheme, setTheme } = useTheme()
  // ライト↔ダークをトグルする関数
  const toggleColorMode = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light")
  }
  // カラーモード情報と操作関数を返す
  return {
    colorMode: resolvedTheme,      // 現在のカラーモード（"light" | "dark"）
    setColorMode: setTheme,        // カラーモードを直接設定する関数
    toggleColorMode,               // カラーモードをトグルする関数
  }
}

// カラーモードに応じた値を返すユーティリティフック
export function useColorModeValue<T>(light: T, dark: T) {
  // 現在のカラーモードを取得
  const { colorMode } = useColorMode()
  // ライトモードならlight値、ダークモードならdark値を返す
  return colorMode === "light" ? light : dark
}

// カラーモードに応じたアイコンを表示するコンポーネント
export function ColorModeIcon() {
  // 現在のカラーモードを取得
  const { colorMode } = useColorMode()
  // ライトモードなら太陽アイコン、ダークモードなら月アイコンを返す
  return colorMode === "light" ? <LuSun /> : <LuMoon />
}

// カラーモード切替ボタンのProps型（aria-labelを除外、内部で固定設定するため）
type ColorModeButtonProps = Omit<IconButtonProps, "aria-label">

// カラーモード切替ボタンコンポーネント（forwardRefでref転送対応）
export const ColorModeButton = React.forwardRef<
  HTMLButtonElement,       // refの型（HTMLボタン要素）
  ColorModeButtonProps     // Propsの型
>(function ColorModeButton(props, ref) {
  // カラーモードトグル関数を取得
  const { toggleColorMode } = useColorMode()
  return (
    // ClientOnly: クライアントサイドでのみレンダリング（SSR時はSkeletonを表示）
    <ClientOnly fallback={<Skeleton boxSize="8" />}>
      {/* アイコンボタン: クリックでカラーモード切替 */}
      <IconButton
        onClick={toggleColorMode}           // クリックハンドラ
        variant="ghost"                     // ゴーストバリアント（背景なし）
        aria-label="Toggle color mode"      // アクセシビリティラベル
        size="sm"                           // 小サイズ
        ref={ref}                           // ref転送
        {...props}                          // 残りのpropsを展開
        css={{
          _icon: {
            width: "5",                     // アイコンの幅
            height: "5",                    // アイコンの高さ
          },
        }}
      >
        {/* 現在のカラーモードに応じたアイコンを表示 */}
        <ColorModeIcon />
      </IconButton>
    </ClientOnly>
  )
})
