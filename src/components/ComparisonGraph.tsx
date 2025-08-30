import { Box, Flex } from '@chakra-ui/react'
import { Text } from "@/components/Text";
import { colors } from '@/utils/theme';

type Props = {
  overflow: string;
  title: string;
  TextHidden?: boolean;
  score: number;
};
export const ComparisonGraph = ({overflow, title, TextHidden, score }: Props) => {
  
  return (
        <Flex 
          justifyContent={"center"} 
          alignItems={"center"} 
          width={"90%"} 
          margin={"auto"}
        >
          <Flex 
            width={"35%"} 
            height={10} 
            textAlign={"center"} 
            alignItems={"center"}
          >
            <Text fontSize={12} fontWeight="bold" text={title}/>
          </Flex>
          <Box 
            bg={colors.GRAY100}
            width="65%" 
            position="relative" 
            height={20} 
            overflow={overflow}
            display="flex"
            flexDirection="column"
            justifyContent="center"
          >
            {/* 縦の目盛り */}
            {Array.from({ length: 7 }).map((_, i) => {
              const value = i * 20;
              const leftPercent = `${(value / 120) * 100}%`;
              return (
                <Box 
                  key={value} 
                  position="absolute" 
                  left={leftPercent} 
                  top={0} 
                  bottom={0}
                >
                  {/* 破線 */}
                  <Box
                    width="1px"
                    height="100%"
                    bg={colors.GRAY400}
                    opacity={0.5}
                    borderLeft="1px dashed"
                  />
                  {/* 数値のラベル */}
                  <Box
                    position="absolute"
                    top="100%"
                    left="50%"
                    transform="translateX(-50%)"
                    mt="1"       
                    display={TextHidden ? "none" : "block"}
                  >
                    <Text
                      fontSize="10px"
                      color={colors.GRAY600}
                      text={value}
                    />
                  </Box>
                </Box>
              );
            })}
            <Box 
              bg={colors.BLUE500} 
              width={`${100/120 * 100}%`} 
              height={5} 
              mt="5px" 
            />
            <Box 
              bg={colors.GRAY400}
              width={`${score/120 * 100}%`} 
              height={5} 
              mt="4px" 
            />
          </Box>
        </Flex>
  );
};