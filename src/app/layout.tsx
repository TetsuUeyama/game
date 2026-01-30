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
  weight: ["400"], // プリロード警告を減らすため1つに
  display: "swap",
  preload: false, // プリロードを無効化
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
