import React from 'react'
import { Text, Box } from '@chakra-ui/react'

interface EnhancedValueDisplayProps {
  label: string
  originalValue: number | string
  enhancedValue: number | string
  isEnhanced?: boolean
  color?: string
}

export const EnhancedValueDisplay: React.FC<EnhancedValueDisplayProps> = ({
  label,
  originalValue,
  enhancedValue,
  isEnhanced: isEnhancedProp,
  color: _color
}) => {
  const isEnhanced = isEnhancedProp !== undefined ? isEnhancedProp : enhancedValue !== originalValue
  const difference = typeof enhancedValue === 'number' && typeof originalValue === 'number'
    ? enhancedValue - originalValue
    : 0

  return (
    <Box>
      <Text as="span">{label}: </Text>
      {isEnhanced ? (
        <>
          <Text as="span" textDecoration="line-through" color="gray.400">
            {originalValue}
          </Text>
          <Text as="span" color="green.400" fontWeight="bold" ml={1}>
            {enhancedValue}
          </Text>
          <Text as="span" color="green.300" fontSize="xs" ml={1}>
            (+{difference})
          </Text>
        </>
      ) : (
        <Text as="span">{originalValue}</Text>
      )}
    </Box>
  )
}
