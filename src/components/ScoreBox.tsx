import { Box } from '@chakra-ui/react'
import { Text } from "@/components/Text";
import { colors } from '@/utils/theme';

type Props = {
  score: number;
  textOne: string;
  textTwo: string;
};
export const ScoreBox = ({ score, textOne, textTwo }: Props) => {
  
  return (
    <Box width={"30%"} margin={"auto"} height={"100%"} textAlign={"center"}>
    <Box bg={colors.ScoreBox}>
      <Box pt={5}>
        <Text fontSize={25} fontWeight="bold" text={score}/>
      </Box>
      <Box textAlign={"right"} width={"100%"} pb={1} pr={2}>
        <Text fontSize={12} fontWeight="bold" text={"/15"}/>
      </Box>
    </Box>
    <Box mt={5}>
      <Text fontSize={{ base: 7, sm: 8, md: 10, lg: 10, xl: 10}} fontWeight="bold" text={textOne}/>
      <Text fontSize={10} fontWeight="bold" text={textTwo}/>
    </Box>
  </Box>
  );
};