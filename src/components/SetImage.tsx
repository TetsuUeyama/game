import { Box } from "@chakra-ui/react";
import { useState } from "react";
import { Icons } from "./Icons";
import { Text } from "./Text";

type Props = {
  setImageAction?: (file: File) => void;
  initialImageURL?: string;
  isIcon?: boolean;
};
export const SetImage = ({
  setImageAction,
  initialImageURL,
  isIcon,
}: Props) => {
  const [imageSrc, setImageSrc] = useState<File>();
  const imageId = "srcImage";
  const inputId = "inputImage";
  const inputImage = (element: React.ChangeEvent<HTMLInputElement>) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof window === "undefined") return;
      const image = document.getElementById(imageId) as HTMLImageElement;
      if (e.target && image) {
        const result = e.target.result as string;
        image.src = result;
      }
    };
    if (element?.target?.files?.[0]) {
      setImageSrc(element.target.files[0]);
      if (setImageAction) {
        setImageAction(element.target.files[0]);
      }
      reader.readAsDataURL(element.target.files[0]);
    }
  };
  return (
    <>
      <Box display="grid" justifyContent="center">
        {imageSrc ? (
          isIcon ? (
            <img
              style={{
                objectFit: "cover",
                width: 150,
                height: 150,
                borderRadius: 20,
              }}
              alt="imageData"
              id={imageId}
              src=""
            />
          ) : (
            <img
              style={{
                objectFit: "contain",
              }}
              alt="imageData"
              id={imageId}
              src=""
            />
          )
        ) : (
          <Box display="grid" justifyContent="center">
            {initialImageURL ? (
              isIcon ? (
                <img
                  style={{
                    objectFit: "cover",
                    width: 150,
                    height: 150,
                    borderRadius: 20,
                  }}
                  alt="imageData"
                  id={imageId}
                  src={initialImageURL}
                />
              ) : (
                <img
                  style={{
                    objectFit: "contain",
                  }}
                  alt="imageData"
                  id={imageId}
                  src={initialImageURL}
                />
              )
            ) : (
              <Box opacity={0.5}>
                <Icons icon="image" boxSize="60" />
              </Box>
            )}
          </Box>
        )}
      </Box>
      <input type="file" onChange={inputImage} hidden id={inputId} />
      <Box
        mt={2}
        opacity={0.6}
        justifyContent="center"
        display="grid"
        cursor="pointer"
        onClick={() => {
          if (typeof window === "undefined") return;
          document.getElementById(inputId)?.click();
        }}
      >
        <Text text="写真をアップロード" fontSize={12} />
      </Box>
    </>
  );
};
