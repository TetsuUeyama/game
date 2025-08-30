'use client'

import { Box, VStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Character } from '@/types/poker/PokerGameTypes'

interface CharacterCardProps {
  character: Character
  isSelected: boolean
  onSelect: (character: Character) => void
  size?: 'sm' | 'md' | 'lg'
}

export const CharacterCard = ({ character, isSelected, onSelect, size = 'md' }: CharacterCardProps) => {
  const cardSize = {
    sm: { width: '80px', height: '120px', imageSize: '50px' },
    md: { width: '120px', height: '180px', imageSize: '80px' },
    lg: { width: '200px', height: '300px', imageSize: '150px' }
  }

  const currentSize = cardSize[size]

  return (
    <Box
      width={currentSize.width}
      height={currentSize.height}
      border="2px solid"
      borderColor={isSelected ? 'blue.500' : 'gray.300'}
      borderRadius="md"
      bg={isSelected ? 'blue.50' : 'white'}
      cursor="pointer"
      _hover={{ borderColor: 'blue.400', transform: 'scale(1.05)' }}
      transition="all 0.2s"
      onClick={() => onSelect(character)}
      padding={2}
    >
      <VStack gap={1} height="100%" justifyContent="space-between">
        <Image
          src={character.image}
          alt={character.name}
          width={currentSize.imageSize}
          height={currentSize.imageSize}
          objectFit="cover"
          borderRadius="md"
        />
        
        <VStack gap={0} textAlign="center">
          <Text
            text={character.name}
            fontSize={{ base: size === 'lg' ? 14 : 10, md: size === 'lg' ? 16 : 12 }}
            fontWeight="bold"
            color="gray.800"
          />
          <Text
            text={character.personality}
            fontSize={{ base: size === 'lg' ? 10 : 8, md: size === 'lg' ? 12 : 10 }}
            color="gray.600"
          />
          <Text
            text={`${character.type === 'attack' ? '攻撃型' : '守備型'}`}
            fontSize={{ base: size === 'lg' ? 10 : 8, md: size === 'lg' ? 12 : 10 }}
            color={character.type === 'attack' ? 'red.600' : 'blue.600'}
            fontWeight="bold"
          />
        </VStack>
      </VStack>
    </Box>
  )
}