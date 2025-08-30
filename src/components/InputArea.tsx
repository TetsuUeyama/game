import { Textarea } from "@chakra-ui/react";
import { Text } from "./Text";
import { UseFormRegisterReturn } from "react-hook-form";

type Props = {
  label?: string;
  placeholder?: string;
  register: UseFormRegisterReturn;
  height?: number;
  width?: number | string;
};
export const InputArea = (props: Props) => {
  return (
    <>
      {props.label && <Text text={props.label} />}
      <Textarea
        {...props.register}
        border="1px solid lightgray"
        width={props.width ?? 250}
        fontSize={16}
        height={props.height}
        placeholder={props.placeholder}
        variant="subtle"
        p={2}
      />
    </>
  );
};
