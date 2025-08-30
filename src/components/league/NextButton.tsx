'use client'

import { Button } from '@/components/ui/button'
import { Box } from '@chakra-ui/react'

interface NextButtonProps {
  onClick: () => void
  isLastTurn: boolean
  disabled: boolean
}

export const NextButton = ({ onClick, isLastTurn, disabled }: NextButtonProps) => {
  return (
    <Box width="100%" display="flex" justifyContent="center">
      <Button
        onClick={onClick}
        disabled={disabled}
        size="lg"
        colorScheme="blue"
        width={{ base: "200px", md: "250px" }}
        height="60px"
      >
        {isLastTurn ? '完了' : '次へ'}
      </Button>
    </Box>
  )
}