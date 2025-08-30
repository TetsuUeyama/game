"use client";
import { firebaseConfig } from "@/firebase/init";
import { Theme } from "@chakra-ui/react";
import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { ReactNode, useEffect } from "react";
import { Provider as CProvider } from "@/components/ui/provider";
import { useColorMode } from "@/components/ui/color-mode";

type Props = {
  children: ReactNode;
};
// テーマを拡張して Input コンポーネントのホバースタイルをカスタマイズ
export const app = initializeApp(firebaseConfig);
export const Provider: React.FC<Props> = ({ children }) => {
  const { colorMode } = useColorMode();
  useEffect(() => {
    getAnalytics(app);
  }, []);
  return (
    <CProvider>
      {/* <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme> */}
      <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme>
    </CProvider>
  );
};
