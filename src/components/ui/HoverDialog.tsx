import React, { ReactNode } from 'react'
import { Box, Text } from '@chakra-ui/react'

interface HoverDialogProps {
  title: string
  content: ReactNode
  children?: ReactNode
}

export const HoverDialog: React.FC<HoverDialogProps> = ({ title, content, children }) => {
  return (
    <Box position="relative" width="100%" height="100%">
      {children}
      <Box
        position="absolute"
        top="0"
        left="0"
        width="100%"
        height="100%"
        opacity="0"
        transition="opacity 0.2s"
        _hover={{ opacity: 1 }}
        bg="rgba(0, 0, 0, 0.9)"
        borderRadius="md"
        p={2}
        zIndex={10}
        pointerEvents="none"
      >
        <Text fontSize="xs" fontWeight="bold" mb={1} color="white">
          {title}
        </Text>
        <Box fontSize="xs" color="gray.200">
          {content}
        </Box>
      </Box>
    </Box>
  )
}
