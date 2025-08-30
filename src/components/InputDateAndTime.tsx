import { Box, Input } from "@chakra-ui/react";
import { UseFormRegisterReturn } from "react-hook-form";
import { Text } from "@/components/Text";

type Props = {
  register: UseFormRegisterReturn;
  label?: string;
};
export const InputDateAndTime = ({ register, label }: Props) => {
  return (
    <Box w="100%">
      {label && <Text text={label} />}
      <Input
        borderRadius={5}
        placeContent="日時を選択"
        type="datetime-local"
        {...register}
      />
    </Box>
  );
};
