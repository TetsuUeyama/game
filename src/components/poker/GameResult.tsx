'use client'

import { Box, VStack, HStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Button } from '@/components/ui/button'
import { GameState } from '@/types/poker/PokerGameTypes'

interface GameResultProps {
  gameState: GameState
  winner: 'player' | 'enemy'
  onReplay: () => void
  onSelectCharacter: () => void
  onExit: () => void
}

export const GameResult = ({ gameState, winner, onReplay, onSelectCharacter, onExit }: GameResultProps) => {
  const { player, enemy } = gameState
  
  const isPlayerWin = winner === 'player'
  
  return (
    <Box
      width="100%"
      height="100vh"
      bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      position="relative"
    >
      {/* 背景エフェクト */}
      <Box
        position="absolute"
        inset="0"
        opacity="0.1"
        backgroundImage="url('/poker/images/board.png')"
        backgroundSize="cover"
        backgroundPosition="center"
      />

      <VStack gap={8} textAlign="center" zIndex="1">
        {/* 結果表示 */}
        <VStack gap={4}>
          <Text
            text={isPlayerWin ? "勝利！" : "敗北..."}
            fontSize={48}
            fontWeight="bold"
            color={isPlayerWin ? "yellow.300" : "red.300"}
            textShadow="2px 2px 4px rgba(0,0,0,0.5)"
          />
          
          <Text
            text={isPlayerWin ? "おめでとうございます！" : "また挑戦してください！"}
            fontSize={20}
            color="white"
            textShadow="1px 1px 2px rgba(0,0,0,0.5)"
          />
        </VStack>

        {/* キャラクター表示 */}
        <HStack gap={12} alignItems="center">
          {/* プレイヤーキャラクター */}
          <VStack gap={3}>
            <Box
              position="relative"
              transform={isPlayerWin ? "scale(1.2)" : "scale(0.9)"}
              transition="all 0.5s ease"
            >
              <Image
                src={player.character.image}
                alt={player.character.name}
                width="150px"
                height="150px"
                borderRadius="lg"
                border="4px solid"
                borderColor={isPlayerWin ? "yellow.400" : "gray.400"}
                filter={isPlayerWin ? "none" : "grayscale(50%)"}
              />
              
              {/* 勝利エフェクト */}
              {isPlayerWin && (
                <Box
                  position="absolute"
                  inset="0"
                  border="4px solid"
                  borderColor="yellow.400"
                  borderRadius="lg"
                  animation="pulse 2s infinite"
                />
              )}
            </Box>
            
            <VStack gap={1}>
              <Text
                text={player.character.name}
                fontSize={18}
                fontWeight="bold"
                color="white"
                textShadow="1px 1px 2px rgba(0,0,0,0.5)"
              />
              <Text
                text={`HP: ${player.currentHp}/${player.maxHp}`}
                fontSize={14}
                color="gray.300"
              />
            </VStack>
          </VStack>

          {/* VS */}
          <Text
            text="VS"
            fontSize={32}
            fontWeight="bold"
            color="white"
            textShadow="2px 2px 4px rgba(0,0,0,0.5)"
          />

          {/* 敵キャラクター */}
          <VStack gap={3}>
            <Box
              position="relative"
              transform={!isPlayerWin ? "scale(1.2)" : "scale(0.9)"}
              transition="all 0.5s ease"
            >
              <Image
                src={enemy.character.image}
                alt={enemy.character.name}
                width="150px"
                height="150px"
                borderRadius="lg"
                border="4px solid"
                borderColor={!isPlayerWin ? "red.400" : "gray.400"}
                filter={!isPlayerWin ? "none" : "grayscale(50%)"}
              />
              
              {/* 勝利エフェクト */}
              {!isPlayerWin && (
                <Box
                  position="absolute"
                  inset="0"
                  border="4px solid"
                  borderColor="red.400"
                  borderRadius="lg"
                  animation="pulse 2s infinite"
                />
              )}
            </Box>
            
            <VStack gap={1}>
              <Text
                text={enemy.character.name}
                fontSize={18}
                fontWeight="bold"
                color="white"
                textShadow="1px 1px 2px rgba(0,0,0,0.5)"
              />
              <Text
                text={`HP: ${enemy.currentHp}/${enemy.maxHp}`}
                fontSize={14}
                color="gray.300"
              />
            </VStack>
          </VStack>
        </HStack>

        {/* ボタンエリア */}
        <VStack gap={4}>
          <Text
            text="どうしますか？"
            fontSize={16}
            color="white"
            textShadow="1px 1px 2px rgba(0,0,0,0.5)"
          />
          
          <HStack gap={4}>
            <Button
              onClick={onReplay}
              colorScheme="green"
              size="lg"
              width="120px"
            >
              再戦
            </Button>
            
            <Button
              onClick={onSelectCharacter}
              colorScheme="blue"
              size="lg"
              width="120px"
            >
              相手変更
            </Button>
            
            <Button
              onClick={onExit}
              variant="outline"
              colorScheme="gray"
              size="lg"
              width="120px"
              color="white"
              borderColor="white"
              _hover={{ bg: "whiteAlpha.200" }}
            >
              終了
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </Box>
  )
}