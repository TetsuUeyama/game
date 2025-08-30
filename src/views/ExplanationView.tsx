"use client";
import { Box } from "@chakra-ui/react";
import { Header } from "@/templates/Header";
import { colors } from "@/utils/theme";

export default function Explanation() {
  return (
    <Box
      color={colors.text}
      width={"100%"}
      height={"100%"}
      margin={"auto"}
      bg={colors.base}
    >
      <Header />
    </Box>
  );
}
