import { Box, Image as ChakraImage } from "@chakra-ui/react";

type Props = {
  src: string;
  alt: string;
  maxWidth?: string | number;
  width?: string | number;
  height?: string | number;
};
export const Image = ({
  src,
  alt,
  maxWidth = 300,
  height = "auto",
  width,
}: Props) => {
  return (
    <Box maxWidth={maxWidth} height={height} overflow="hidden">
      <ChakraImage
        src={src}
        alt={alt}
        objectFit="cover"
        height={height}
        width={width}
      />
    </Box>
  );
};
