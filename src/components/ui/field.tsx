"use client"

import { Field as ChakraField } from "@chakra-ui/react"
import { forwardRef, ReactNode } from "react"

interface FieldProps extends React.ComponentProps<typeof ChakraField.Root> {
  label?: ReactNode
  children?: ReactNode
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(
  function Field({ label, children, ...props }, ref) {
    return (
      <ChakraField.Root ref={ref} {...props}>
        {label && <ChakraField.Label>{label}</ChakraField.Label>}
        {children}
      </ChakraField.Root>
    )
  }
)

export const FieldLabel = ChakraField.Label
export const FieldHelperText = ChakraField.HelperText
export const FieldErrorText = ChakraField.ErrorText
export const FieldRequiredIndicator = ChakraField.RequiredIndicator
