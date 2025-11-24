"use client"

import { Dialog as ChakraDialog } from "@chakra-ui/react"

export const DialogRoot = ChakraDialog.Root
export const DialogTrigger = ChakraDialog.Trigger
export const DialogContent = ChakraDialog.Content
export const DialogHeader = ChakraDialog.Header
export const DialogTitle = ChakraDialog.Title
export const DialogBody = ChakraDialog.Body
export const DialogFooter = ChakraDialog.Footer
export const DialogCloseTrigger = ChakraDialog.CloseTrigger
export const DialogBackdrop = ChakraDialog.Backdrop
export const DialogPositioner = ChakraDialog.Positioner

export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Body: DialogBody,
  Footer: DialogFooter,
  CloseTrigger: DialogCloseTrigger,
  Backdrop: DialogBackdrop,
  Positioner: DialogPositioner,
}
