import { colors } from '@/utils/theme';
import { Box, Progress } from '@chakra-ui/react'

type Props = {
  value: number;
  size: string;
  colorScheme: string;
};
export const ContentProgress = ({value, size, colorScheme }: Props) => {
  
  return (
		<Box width={"100%"} alignItems={"center"} textAlign={"center"}>
      <Progress.Root bg={colors.ProgressBar} mx={"auto"} mt={2} width={"80%"} value={value} size={size as "xs" | "sm" | "md" | "lg" | "xl"} colorScheme={colorScheme} rounded={3}>
        <Progress.Track bg={colors.ProgressBar} rounded={3}>
          <Progress.Range bg={colorScheme}/>
        </Progress.Track>
      </Progress.Root>
		</Box>
  );
};