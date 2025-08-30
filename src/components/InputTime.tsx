import { Box, Input } from "@chakra-ui/react";
import { UseFormRegisterReturn } from "react-hook-form";
import { Text } from "@/components/Text";

type Props = {
  register: UseFormRegisterReturn;
  label?: string;
};
export const InputTime = ({ register, label }: Props) => {
  return (
    <Box w="100%">
      {label && <Text text={label} />}
      <Input
        borderRadius={5}
        placeContent="時間を入力"
        type="time"
        {...register}
      />
    </Box>
  );
};
