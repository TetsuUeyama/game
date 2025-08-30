import { Input } from "@chakra-ui/react";
import { UseFormRegisterReturn } from "react-hook-form";
import { InputGroup } from "./ui/input-group";
import { Icons, IconType } from "./Icons";
import { useEffect, useState } from "react";
import { Field } from "./ui/field";
import { Text } from "./Text";

type Props = {
  label?: string;
  placeholder?: string;
  ref?: React.RefObject<HTMLInputElement | null>;
  register?: UseFormRegisterReturn;
  width?: string;
  type?: "text" | "password";
  startIcon?: IconType;
  endIcon?: IconType;
  endIconClick?: () => void;
  variant?: "subtle" | "outline" | "flushed";
};
export const InputText = ({
  label,
  placeholder,
  ref,
  register,
  width,
  type = "text",
  startIcon,
  endIcon,
  endIconClick,
  variant = "flushed",
}: Props) => {
  const [isOpenPassword, setIsOpenPassword] = useState(false);
  const [inputType, setInputType] = useState<"text" | "password">(
    type ?? "text"
  );

  useEffect(() => {
    if (type === "password") {
      isOpenPassword ? setInputType("text") : setInputType("password");
    }
  }, [isOpenPassword]);
  if (endIcon || startIcon) {
    return (
      <>
        <InputGroup
          flex="1"
          startElement={
            startIcon && <Icons icon={startIcon} onClick={endIconClick} />
          }
          endElement={
            endIcon && <Icons icon={endIcon} onClick={endIconClick} />
          }
        >
          <Field label={label}>
            {ref ? (
              <Input
                ref={ref}
                fontSize={16}
                height={8}
                type={inputType}
                width={width ?? 250}
                placeholder={placeholder}
                variant={variant}
                pt={1}
                pr={2}
                pl={startIcon ? 9 : 2}
              />
            ) : (
              <Input
                {...register}
                fontSize={16}
                height={8}
                type={inputType}
                width={width ?? 250}
                placeholder={placeholder}
                variant={variant}
                pt={1}
                pr={2}
                pl={startIcon ? 9 : 2}
              />
            )}
          </Field>
        </InputGroup>
      </>
    );
  }
  return (
    <>
      {label && <Text text={label} />} {/* fieldに入れるとアイコンズレる */}
      <InputGroup
        flex="1"
        endElement={
          type === "password" ? (
            isOpenPassword ? (
              <Icons icon="closeEye" onClick={() => setIsOpenPassword(false)} />
            ) : (
              <Icons icon="openEye" onClick={() => setIsOpenPassword(true)} />
            )
          ) : (
            <></>
          )
        }
      >
        <Field>
          {ref ? (
            <Input
              ref={ref}
              height={8}
              fontSize={16}
              type={inputType}
              width={width ?? 250}
              placeholder={placeholder}
              variant={variant}
              px={2}
            />
          ) : (
            <Input
              {...register}
              fontSize={16}
              height={8}
              type={inputType}
              width={width ?? 250}
              placeholder={placeholder}
              variant={variant}
              px={2}
            />
          )}
        </Field>
      </InputGroup>
    </>
  );
};
