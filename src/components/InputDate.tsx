import { Input } from "@chakra-ui/react";
import { UseFormRegisterReturn } from "react-hook-form";

type Props = {
  register: UseFormRegisterReturn;
};
export const InputDate = ({ register }: Props) => {
  return (
    <Input
      borderRadius={5}
      placeContent="日付を選択"
      size="sm"
      type="date"
      {...register}
    />
  );
};
