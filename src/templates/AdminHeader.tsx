"use client";
import { Box, Flex } from "@chakra-ui/react";
import { Text } from "@/components/Text";
import { colors } from "@/utils/theme";
import { Button } from "@/components/ui/button";
import { Dispatch, SetStateAction } from "react";

type Props = {
  logIn?: boolean;
  setLogIn?: Dispatch<SetStateAction<boolean>>;
  setPassword?: Dispatch<SetStateAction<string>>;
  setEmail?: Dispatch<SetStateAction<string>>;
};

export const AdminHeader = ({ logIn, setLogIn, setPassword, setEmail }: Props) => {

  return (
      <Flex 
        height={16} 
        justifyContent={"space-between"} 
        alignItems={"center"} 
        bg={colors.HeaderBlue} 
        color={colors.base} 
        fontWeight={"bold"} 
        textAlign={"left"} 
        margin={"auto"}
      >
        <Box ml={4}>
          <Text fontSize={16} text={"ストレスチェック 管理"}/>
        </Box>
        <Box mr={4} fontSize={12} display={logIn ? "block" : "none"}>
          <Button onClick={() => { 
            if (setLogIn) setLogIn(false); 
            if (setPassword) setPassword(""); 
            if (setEmail) setEmail(""); 
          }}>ログアウト</Button>
        </Box>
      </Flex>    
  );
};