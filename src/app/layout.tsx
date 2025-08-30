// import type { Metadata } from "next";
import "./globals.css";
import { Zen_Maru_Gothic } from "next/font/google";
import { Provider } from "./provider";

// export const metadata: Metadata = {
//   title: "",
//   description: "",
// };
const font = Zen_Maru_Gothic({
  subsets: ["latin"],
  weight: ["400", "500", "700"], // 必要に応じてウェイトを調整
  display: "swap", // オプション: フォントの表示方法を制御
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body className={font.className}>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
