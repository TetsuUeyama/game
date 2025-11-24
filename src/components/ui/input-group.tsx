"use client"

import { Group, BoxProps } from "@chakra-ui/react"
import { forwardRef, ReactNode } from "react"

interface InputGroupProps extends BoxProps {
  startElement?: ReactNode
  endElement?: ReactNode
  children?: ReactNode
}

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  function InputGroup({ startElement, endElement, children, ...props }, ref) {
    return (
      <Group ref={ref} {...props}>
        {startElement}
        {children}
        {endElement}
      </Group>
    )
  }
)
