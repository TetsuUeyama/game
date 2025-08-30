import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReactNode } from "react";

type Props = {
  dialogTriggerContent: ReactNode;
  headerText: ReactNode;
  bodyContent: ReactNode;
  footerContent: ReactNode;
};
export const Dialog = (props: Props) => {
  return (
    <DialogRoot>
      <DialogTrigger>{props.dialogTriggerContent}</DialogTrigger>
      <DialogContent mx={4} display="grid">
        <DialogHeader>
          <DialogTitle>{props.headerText}</DialogTitle>
        </DialogHeader>
        <DialogBody>{props.bodyContent}</DialogBody>
        {props.footerContent && (
          <DialogFooter>{props.footerContent}</DialogFooter>
        )}
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
};
