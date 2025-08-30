import { colors } from "@/utils/theme";
import { Box, Spinner } from "@chakra-ui/react";

export const Loading = () => {
  return (
    <Box
      zIndex={1000}
      position="fixed"
      h="100vh"
      w="100vw"
      opacity={0.5}
      bg={colors.baseR}
    >
      <Box display="grid" justifyContent="center" alignItems="center" h="90vh">
        <Spinner />
      </Box>
    </Box>
  );
};
