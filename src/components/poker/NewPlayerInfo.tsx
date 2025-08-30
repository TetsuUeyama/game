'use client'

import { Box, HStack, VStack, Image, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { HealthBar } from './HealthBar'
import { NewPlayer } from '@/types/poker/PokerGameTypes'

interface NewPlayerInfoProps {
  player: NewPlayer
  maxValues: {
    bodyHp: number
    rightHp: number
    leftHp: number
    legHp: number
  }
}

export const NewPlayerInfo = ({ player, maxValues }: NewPlayerInfoProps) => {
  return (
    <HStack justifyContent="center" width="100%" alignItems="center">
      {/* プレイヤー画像と詳細ステータスエリア */}
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
            src={player.image}
            alt={player.name}
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
              text={player.name}
              fontSize={10}
              fontWeight="bold"
              color="white"
              textAlign="left"
            />
          </Box>
        </Box>

        {/* 右側: 詳細HP表示 */}
        <VStack gap={1} alignItems="center">
          {/* 上段: 体幹HP */}
          <HStack gap={1}>
            <Text
              text="体幹"
              fontSize={8}
              color="white"
              minWidth="30px"
            />
            <HealthBar
              currentHp={player.bodyHp}
              maxHp={maxValues.bodyHp}
              label="Body"
              size="xs"
              hideLabel={true}
            />
          </HStack>
          
          {/* 中段左: 右腕HP */}
          <HStack gap={1}>
            <Text
              text="右腕"
              fontSize={8}
              color="white"
              minWidth="30px"
            />
            <HealthBar
              currentHp={player.rightHp}
              maxHp={maxValues.rightHp}
              label="Right"
              size="xs"
              hideLabel={true}
            />
          </HStack>
          
          {/* 中段右: 左腕HP */}
          <HStack gap={1}>
            <Text
              text="左腕"
              fontSize={8}
              color="white"
              minWidth="30px"
            />
            <HealthBar
              currentHp={player.leftHp}
              maxHp={maxValues.leftHp}
              label="Left"
              size="xs"
              hideLabel={true}
            />
          </HStack>
          
          {/* 下段: 脚部HP */}
          <HStack gap={1}>
            <Text
              text="脚部"
              fontSize={8}
              color="white"
              minWidth="30px"
            />
            <HealthBar
              currentHp={player.legHp}
              maxHp={maxValues.legHp}
              label="Leg"
              size="xs"
              hideLabel={true}
            />
          </HStack>
        </VStack>

        {/* 右端: 基本ステータス */}
        <VStack gap={1} alignItems="flex-start">
          <Text
            text={`回避: ${player.evasion}`}
            fontSize={8}
            color="gray.300"
          />
          <Text
            text={`機動: ${player.mobility}`}
            fontSize={8}
            color="gray.300"
          />
          <Text
            text={`直感: ${player.instinct}`}
            fontSize={8}
            color="gray.300"
          />
        </VStack>
      </Box>
    </HStack>
  )
}