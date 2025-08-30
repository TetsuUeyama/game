'use client'

import { Box, VStack, HStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Character } from '@/types/poker/PokerGameTypes'

interface CharacterDetailProps {
  character: Character | null
  title: string
}

export const CharacterDetail = ({ character, title }: CharacterDetailProps) => {
  if (!character) {
    return (
      <Box
        width="300px"
        height="400px"
        border="2px solid"
        borderColor="gray.300"
        borderRadius="md"
        bg="gray.50"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text text="キャラクターを選択してください" fontSize={14} color="gray.500" />
      </Box>
    )
  }

  return (
    <Box
      width="300px"
      height="400px"
      border="2px solid"
      borderColor="gray.400"
      borderRadius="md"
      bg="white"
      padding={4}
    >
      <VStack gap={3} height="100%">
        <Text
          text={title}
          fontSize={16}
          fontWeight="bold"
          color="blue.600"
          textAlign="center"
        />
        
        <Image
          src={character.image}
          alt={character.name}
          width="150px"
          height="150px"
          objectFit="cover"
          borderRadius="md"
          border="1px solid"
          borderColor="gray.300"
        />
        
        <VStack gap={2} width="100%">
          <Text
            text={character.name}
            fontSize={18}
            fontWeight="bold"
            color="gray.800"
            textAlign="center"
          />
          
          <HStack justifyContent="space-between" width="100%">
            <Text text={character.personality} fontSize={14} color="gray.600" />
            <Text
              text={character.type === 'attack' ? '攻撃型' : '守備型'}
              fontSize={14}
              color={character.type === 'attack' ? 'red.600' : 'blue.600'}
              fontWeight="bold"
            />
          </HStack>
          
          <Box width="100%" bg="gray.100" borderRadius="md" padding={3}>
            <VStack gap={1}>
              <HStack justifyContent="space-between" width="100%">
                <Text text="体力" fontSize={12} fontWeight="bold" />
                <Text text={character.hp} fontSize={12} fontWeight="bold" color="green.600" />
              </HStack>
              <HStack justifyContent="space-between" width="100%">
                <Text text="攻撃力" fontSize={12} fontWeight="bold" />
                <Text text={character.attack} fontSize={12} fontWeight="bold" color="red.600" />
              </HStack>
              <HStack justifyContent="space-between" width="100%">
                <Text text="守備力" fontSize={12} fontWeight="bold" />
                <Text text={character.defense} fontSize={12} fontWeight="bold" color="blue.600" />
              </HStack>
              <HStack justifyContent="space-between" width="100%">
                <Text text="素早さ" fontSize={12} fontWeight="bold" />
                <Text text={character.speed} fontSize={12} fontWeight="bold" color="yellow.600" />
              </HStack>
              <HStack justifyContent="space-between" width="100%">
                <Text text="知力" fontSize={12} fontWeight="bold" />
                <Text text={character.intelligence} fontSize={12} fontWeight="bold" color="purple.600" />
              </HStack>
            </VStack>
          </Box>
        </VStack>
      </VStack>
    </Box>
  )
}