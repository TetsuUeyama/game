"use client"

import { Button as ChakraButton } from "@chakra-ui/react"
import { forwardRef } from "react"

export interface ButtonProps extends React.ComponentProps<typeof ChakraButton> {
  colorScheme?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(props, ref) {
    return <ChakraButton ref={ref} {...props} />
  }
)
