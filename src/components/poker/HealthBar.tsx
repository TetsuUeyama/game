'use client'

import { Box, HStack, VStack } from '@chakra-ui/react'
import { Text } from '@/components/Text'

interface HealthBarProps {
  currentHp: number
  maxHp: number
  label?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  hideLabel?: boolean
}

export const HealthBar = ({ currentHp, maxHp, label = 'HP', size = 'md', hideLabel = false }: HealthBarProps) => {
  const percentage = (currentHp / maxHp) * 100
  
  const barSizes = {
    xs: { width: '45px', height: hideLabel ? '15px' : '8px' },
    sm: { width: '57px', height: hideLabel ? '15px' : '8px' },
    md: { width: '200px', height: hideLabel ? '26px' : '20px' },
    lg: { width: '250px', height: hideLabel ? '33px' : '25px' }
  }

  const currentSize = barSizes[size]

  const getHealthColor = () => {
    if (percentage > 60) return 'green.500'
    if (percentage > 30) return 'yellow.500'
    return 'red.500'
  }

  return (
    <VStack gap={1} alignItems="flex-start">
      {!hideLabel && (
        <HStack gap={2}>
          <Text
            text={label}
            fontSize={size === 'lg' ? 14 : size === 'md' ? 12 : size === 'sm' ? 10 : 8}
            fontWeight="bold"
            color="gray.700"
          />
          <Text
            text={`${currentHp}/${maxHp}`}
            fontSize={size === 'lg' ? 14 : size === 'md' ? 12 : size === 'sm' ? 10 : 8}
            fontWeight="bold"
            color="gray.600"
          />
        </HStack>
      )}
      
      <Box
        width={currentSize.width}
        height={currentSize.height}
        bg="gray.300"
        borderRadius="full"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.400"
      >
        <Box
          width={`${percentage}%`}
          height="100%"
          bg={getHealthColor()}
          borderRadius="full"
          transition="all 0.5s ease"
          position="relative"
        >
          {/* HPバーのグロー効果 */}
          <Box
            position="absolute"
            top="0"
            left="0"
            right="0"
            bottom="0"
            bg={`linear-gradient(90deg, transparent 0%, ${getHealthColor()} 50%, transparent 100%)`}
            opacity="0.6"
            borderRadius="full"
          />
        </Box>
      </Box>
    </VStack>
  )
}