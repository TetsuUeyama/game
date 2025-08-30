import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
} from "@/components/ui/drawer";
import {
  Container,
  DrawerFooter,
  DrawerHeader,
  DrawerTrigger,
} from "@chakra-ui/react";
import { ReactNode } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  triggerContent?: ReactNode;
  header: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  placement: "end" | "bottom";
  size?: "sm" | "md" | "lg" | "xl";
};
export const Drawer = (props: Props) => {
  const rounded = 8;
  return (
    <DrawerRoot
      open={props.isOpen}
      placement={props.placement ?? "end"}
      size={props.size ?? "md"}
    >
      <DrawerBackdrop />
      <DrawerTrigger>{props.triggerContent}</DrawerTrigger>
      <DrawerContent
        roundedTopLeft={rounded}
        roundedTopRight={props.placement === "bottom" ? rounded : undefined}
        roundedBottomLeft={props.placement === "end" ? rounded : undefined}
      >
        <Container>
          <DrawerCloseTrigger onClick={props.onClose} />
          <DrawerHeader>{props.header}</DrawerHeader>
          <DrawerBody>{props.content}</DrawerBody>
          <DrawerFooter>{props.footer}</DrawerFooter>
        </Container>
      </DrawerContent>
    </DrawerRoot>
  );
};
