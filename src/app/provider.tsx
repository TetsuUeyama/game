"use client";
import { ChakraProvider, defaultSystem, Theme } from "@chakra-ui/react";
import { ReactNode } from "react";
import { ColorModeProvider, useColorMode } from "./ColorMode";

type Props = {
  children: ReactNode;
};

export const Provider: React.FC<Props> = ({ children }) => {
  const { colorMode } = useColorMode();

  return (
    <ChakraProvider value={defaultSystem}>
      <ColorModeProvider>
        <Theme appearance={colorMode as "light" | "dark"}>{children}</Theme>
      </ColorModeProvider>
    </ChakraProvider>
  );
};
