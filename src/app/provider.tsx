"use client";
import { firebaseConfig } from "@/firebase/init";
import { Theme } from "@chakra-ui/react";
import { getAnalytics } from "firebase/analytics";
import { initializeApp, getApps } from "firebase/app";
import { ReactNode, useEffect } from "react";
import { Provider as CProvider } from "@/components/ui/provider";
import { useColorMode } from "@/components/ui/color-mode";

type Props = {
  children: ReactNode;
};

// Firebaseアプリの初期化（設定がある場合のみ）
const hasValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId;
export const app = hasValidConfig && getApps().length === 0
  ? initializeApp(firebaseConfig)
  : null;

export const Provider: React.FC<Props> = ({ children }) => {
  const { colorMode } = useColorMode();

  useEffect(() => {
    // Firebaseが初期化されている場合のみAnalyticsを有効化
    if (app && typeof window !== 'undefined') {
      try {
        getAnalytics(app);
      } catch (error) {
        console.warn('Firebase Analytics could not be initialized:', error);
      }
    }
  }, []);

  return (
    <CProvider>
      <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme>
    </CProvider>
  );
};
