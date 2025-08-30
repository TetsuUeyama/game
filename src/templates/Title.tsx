import { Text } from "@/components/Text";
import { Box } from "@chakra-ui/react";

type Props = {
  text: string;
  subTitle?: string;
};
export const Title = ({ text, subTitle }: Props) => {
  return (
    <Box pb={1} pt={2}>
      <Text text={text} fontWeight="bold" />
      {subTitle && (
        <Box opacity={0.5}>
          <Text text={subTitle} />
        </Box>
      )}
    </Box>
  );
};
