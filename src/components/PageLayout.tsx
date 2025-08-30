"use client";
import { Box, Container } from "@chakra-ui/react";
import React, { ReactNode } from "react";

export const PageLayout: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <Box height="100vh" width="100vw" overflow="auto">
      <Container pb={10} pt="10">
        {children}
      </Container>
    </Box>
  );
};
