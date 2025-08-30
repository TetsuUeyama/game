'use client'

import { Box, VStack, HStack, Button } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { useState } from 'react'
import { NewPlayerInfo } from './NewPlayerInfo'
import { createSamplePlayer, getMaxValues } from '@/utils/PlayerUtils'
import { NewPlayer } from '@/types/poker/PokerGameTypes'

export const NewPlayerTest = () => {
  const [player, setPlayer] = useState<NewPlayer>(createSamplePlayer())
  const maxValues = getMaxValues(player)

  const handleDamage = (part: 'body' | 'right' | 'left' | 'leg', amount: number) => {
    setPlayer(prev => ({
      ...prev,
      [`${part}Hp`]: Math.max(0, prev[`${part}Hp` as keyof NewPlayer] as number - amount)
    }))
  }

  const handleHeal = (part: 'body' | 'right' | 'left' | 'leg', amount: number) => {
    setPlayer(prev => {
      const maxHp = maxValues[`${part}Hp` as keyof typeof maxValues]
      return {
        ...prev,
        [`${part}Hp`]: Math.min(maxHp, prev[`${part}Hp` as keyof NewPlayer] as number + amount)
      }
    })
  }

  const resetPlayer = () => {
    setPlayer(createSamplePlayer())
  }

  return (
    <Box
      width="100%"
      height="100vh"
      bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      padding={4}
    >
      <VStack gap={6} alignItems="center">
        <Text
          text="新しいPlayer構造テスト"
          fontSize={24}
          fontWeight="bold"
          color="white"
          textAlign="center"
        />
        
        {/* プレイヤー情報表示 */}
        <NewPlayerInfo player={player} maxValues={maxValues} />
        
        {/* アクション情報表示 */}
        <VStack gap={2} bg="rgba(0,0,0,0.3)" padding={4} borderRadius="lg">
          <Text text="アクション情報" fontSize={16} fontWeight="bold" color="white" />
          
          {player.actionA && (
            <HStack gap={4}>
              <Text text="攻撃A:" fontSize={12} color="yellow.300" />
              <Text text={`${player.actionA.function} (${player.actionA.damage}ダメージ)`} fontSize={12} color="white" />
            </HStack>
          )}
          
          {player.actionD && (
            <HStack gap={4}>
              <Text text="防御D:" fontSize={12} color="blue.300" />
              <Text text={`${player.actionD.function} (${player.actionD.diffencerate}%軽減)`} fontSize={12} color="white" />
            </HStack>
          )}
          
          {player.actionM && (
            <HStack gap={4}>
              <Text text="機動M:" fontSize={12} color="green.300" />
              <Text text={player.actionM.mobility} fontSize={12} color="white" />
            </HStack>
          )}
          
          {player.actionI && (
            <HStack gap={4}>
              <Text text="直感I:" fontSize={12} color="purple.300" />
              <Text text={`直感値: ${player.actionI.instinct}`} fontSize={12} color="white" />
            </HStack>
          )}
        </VStack>
        
        {/* テスト用ボタン */}
        <VStack gap={3}>
          <Text text="ダメージテスト" fontSize={14} color="white" fontWeight="bold" />
          <HStack gap={2}>
            <Button size="sm" colorScheme="red" onClick={() => handleDamage('body', 10)}>
              体幹-10
            </Button>
            <Button size="sm" colorScheme="red" onClick={() => handleDamage('right', 15)}>
              右腕-15
            </Button>
            <Button size="sm" colorScheme="red" onClick={() => handleDamage('left', 15)}>
              左腕-15
            </Button>
            <Button size="sm" colorScheme="red" onClick={() => handleDamage('leg', 12)}>
              脚部-12
            </Button>
          </HStack>
          
          <HStack gap={2}>
            <Button size="sm" colorScheme="green" onClick={() => handleHeal('body', 20)}>
              体幹+20
            </Button>
            <Button size="sm" colorScheme="green" onClick={() => handleHeal('right', 20)}>
              右腕+20
            </Button>
            <Button size="sm" colorScheme="green" onClick={() => handleHeal('left', 20)}>
              左腕+20
            </Button>
            <Button size="sm" colorScheme="green" onClick={() => handleHeal('leg', 20)}>
              脚部+20
            </Button>
          </HStack>
          
          <Button colorScheme="blue" onClick={resetPlayer}>
            リセット
          </Button>
        </VStack>
      </VStack>
    </Box>
  )
}