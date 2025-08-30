'use client'

import { Box, VStack, HStack, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Button } from '@/components/ui/button'
import { CharacterCard } from './CharacterCard'
import { CharacterDetail } from './CharacterDetail'
import { characters, getRandomCharacter } from '@/utils/characterData'
import { useState, useEffect } from 'react'
import { Character } from '@/types/poker/PokerGameTypes'

interface CharacterSelectProps {
  onStartGame: (playerCharacter: Character, enemyCharacter: Character) => void
}

export const CharacterSelect = ({ onStartGame }: CharacterSelectProps) => {
  const [playerCharacter, setPlayerCharacter] = useState<Character | null>(null)
  const [enemyCharacter, setEnemyCharacter] = useState<Character | null>(null)

  useEffect(() => {
    // 敵キャラクターをランダムに選択
    setEnemyCharacter(getRandomCharacter())
  }, [])

  const handleStartGame = () => {
    if (playerCharacter && enemyCharacter) {
      onStartGame(playerCharacter, enemyCharacter)
    }
  }

  const handleReselect = () => {
    setPlayerCharacter(null)
    setEnemyCharacter(getRandomCharacter())
  }

  return (
    <Box
      width="100%"
      minHeight="100vh"
      bg="gray.50"
      padding={6}
    >
      <VStack gap={6} width="100%">
        <Text
          text="レッツゴー★本能寺Ⅱ - キャラクター選択"
          fontSize={{ base: 20, md: 24 }}
          fontWeight="bold"
          color="blue.600"
          textAlign="center"
        />
        
        <Text
          text="キャラクターをクリックして選択してください"
          fontSize={16}
          color="gray.600"
          textAlign="center"
        />

        <HStack gap={8} alignItems="flex-start" justifyContent="center" flexWrap="wrap">
          {/* プレイヤー選択エリア */}
          <VStack gap={4}>
            <CharacterDetail character={playerCharacter} title="プレイヤー" />
            
            <SimpleGrid columns={4} gap={3} maxWidth="600px">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  isSelected={playerCharacter?.id === character.id}
                  onSelect={setPlayerCharacter}
                  size="sm"
                />
              ))}
            </SimpleGrid>
          </VStack>

          {/* VS表示 */}
          <VStack gap={4} alignItems="center" justifyContent="center" minHeight="400px">
            <Text
              text="VS"
              fontSize={32}
              fontWeight="bold"
              color="red.600"
            />
          </VStack>

          {/* 敵キャラクター表示エリア */}
          <VStack gap={4}>
            <CharacterDetail character={enemyCharacter} title="相手" />
          </VStack>
        </HStack>

        {/* ボタンエリア */}
        <HStack gap={4} justifyContent="center">
          <Button
            onClick={handleStartGame}
            disabled={!playerCharacter}
            colorScheme="blue"
            size="lg"
            width="150px"
          >
            決定
          </Button>
          
          <Button
            onClick={handleReselect}
            variant="outline"
            colorScheme="gray"
            size="lg"
            width="150px"
          >
            再選択
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}