"use client";
import { Box } from "@chakra-ui/react";
import { Text } from "@/components/Text";
import { colors } from "@/utils/theme";

export const Header = () => {
  return (
    <Box
      color={colors.text}
      fontWeight={"bold"}
      pt={5}
      textAlign={"left"}
      width={"80%"}
      margin={"auto"}
    >
      <Text fontSize={24} text={"ストレスチェック"} />
      <Text fontSize={24} text={"アンケート"} />
    </Box>
  );
};
