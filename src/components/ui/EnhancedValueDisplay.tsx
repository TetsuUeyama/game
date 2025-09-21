'use client'

import { Box, Text } from '@chakra-ui/react'

interface EnhancedValueDisplayProps {
  label: string
  originalValue: string
  enhancedValue: string
  isEnhanced: boolean
  color?: string
}

export const EnhancedValueDisplay = ({
  label,
  originalValue,
  enhancedValue,
  isEnhanced,
  color = "white"
}: EnhancedValueDisplayProps) => {
  return (
    <Box display="flex" justifyContent="space-between" alignItems="center">
      <Text fontWeight="bold" color={color}>{label}:</Text>
      <Box display="flex" alignItems="center" gap={1}>
        <Text>{originalValue}</Text>
        {isEnhanced && (
          <>
            <Text color="orange.300" fontSize="10px">→</Text>
            <Text color="lightgreen" fontWeight="bold" fontSize="11px">
              {enhancedValue}
            </Text>
          </>
        )}
      </Box>
    </Box>
  )
}