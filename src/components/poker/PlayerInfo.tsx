'use client'

import { Box, HStack, VStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { HealthBar } from './HealthBar'
import { Player } from '@/types/poker/PokerGameTypes'

interface PlayerInfoProps {
  player: Player
}

export const PlayerInfo = ({ player }: PlayerInfoProps) => {
  return (
    <HStack justifyContent="center" width="100%" alignItems="center">
      {/* プレイヤー画像と体力バーエリア全体の背景 */}
      <Box
        bg="rgba(0, 0, 0, 0.5)"
        borderRadius="lg"
        padding={4}
        display="flex"
        alignItems="center"
        gap={4}
      >
        {/* 左側: プレイヤー画像と名前 */}
        <Box position="relative">
          <Image
            src={player.character.image}
            alt={player.character.name}
            width="80px"
            height="80px"
            borderRadius="md"
            border="2px solid white"
          />
          {/* 名前を画像の左上にかぶせる */}
          <Box
            position="absolute"
            top="0"
            left="0"
            bg="rgba(0, 0, 0, 0.7)"
            borderTopLeftRadius="md"
            borderBottomRightRadius="md"
            px={2}
            py={1}
          >
            <Text
              text={player.character.name}
              fontSize={10}
              fontWeight="bold"
              color="white"
              textAlign="left"
            />
          </Box>
        </Box>

        {/* 右側: 体力バー（3列レイアウト） */}
        <VStack gap={2} alignItems="center">
          {/* 上段：1つ */}
          <HStack>
            <HealthBar
              currentHp={player.currentHp}
              maxHp={player.maxHp}
              label="HP"
              size="xs"
              hideLabel={true}
            />
          </HStack>
          
          {/* 中段：2つ */}
          <HStack gap={2}>
            <HealthBar
              currentHp={player.currentHp}
              maxHp={player.maxHp}
              label="ATK"
              size="xs"
              hideLabel={true}
            />
            <HealthBar
              currentHp={player.currentHp}
              maxHp={player.maxHp}
              label="DEF"
              size="xs"
              hideLabel={true}
            />
          </HStack>
          
          {/* 下段：1つ */}
          <HStack>
            <HealthBar
              currentHp={player.currentHp}
              maxHp={player.maxHp}
              label="MP"
              size="xs"
              hideLabel={true}
            />
          </HStack>
        </VStack>
      </Box>
    </HStack>
  )
}