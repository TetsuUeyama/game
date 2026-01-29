"use client";
import { Theme } from "@chakra-ui/react";
import { ReactNode } from "react";
import { Provider as CProvider } from "@/components/ui/provider";
import { useColorMode } from "@/components/ui/color-mode";

type Props = {
  children: ReactNode;
};

export const Provider: React.FC<Props> = ({ children }) => {
  const { colorMode } = useColorMode();

  return (
    <CProvider>
      <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme>
    </CProvider>
  );
};
