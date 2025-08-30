import { Text as ChakraText } from "@chakra-ui/react";
import { ConditionalValue } from "@chakra-ui/react";

type Props = {
  text: string | number;
  color?: string;
  fontWeight?: string;
  fontSize?: ConditionalValue<string | number>;
  isTruncated?: boolean;
  whiteSpace?: "pre-line" | "nowrap";
  textAlign?: "center" | "left";
  onClick?: () => void;
  as?: React.ElementType;
  textDecoration?: string;
  textShadow?: string;
  minWidth?: string;
};
export const Text = ({
  text,
  color,
  fontWeight,
  fontSize = 14,
  isTruncated = false,
  whiteSpace,
  textAlign,
  onClick,
  as = "p",
  textDecoration,
  textShadow,
  minWidth
}: Props) => {
  return (
    <ChakraText
      color={color}
      fontWeight={fontWeight}
      fontSize={fontSize}
      whiteSpace={whiteSpace}
      textAlign={textAlign}
      truncate={isTruncated}
      onClick={onClick}
      as={as}
      textDecoration={textDecoration}
      textShadow={textShadow}
      minWidth={minWidth}
    >
      {text}
    </ChakraText>
  );
};
