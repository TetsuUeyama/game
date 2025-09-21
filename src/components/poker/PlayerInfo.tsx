'use client'

import { Box, HStack, VStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { HealthBar } from './HealthBar'
import { Player } from '@/types/poker/PokerGameTypes'

interface PlayerInfoProps {
  player: Player
  showRole?: boolean
  rolePosition?: 'above' | 'below'
  isEnemy?: boolean
}

export const PlayerInfo = ({ player, showRole = false, rolePosition = 'below', }: PlayerInfoProps) => {

  const roleDisplay = showRole && (
    <Box
      bg="rgba(255, 255, 255, 0.9)"
      px={3}
      borderRadius="md"
      border="2px solid"
      borderColor={player.character.name.includes('敵') ? "red.500" : "blue.500"}
    >
      <Text
        text={player.hand?.role || "役を判定中..."}
        fontSize={16}
        fontWeight="bold"
        color={player.character.name.includes('敵') ? "red.600" : "blue.600"}
        textAlign="center"
      />
    </Box>
  )

  // 攻守の選択肢表示（常に表示、役未選択の位置に表示）
  const attackDisplay = player.attackAction || "balance";
  const defenseDisplay = player.defenseAction || "balance";
  
  const selectionDisplay = (
    <HStack gap={2} alignItems="center">
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        px={2}
        py={1}
        borderRadius="sm"
        border="1px solid"
        borderColor="orange.400"
      >
        <Text
          text={attackDisplay}
          fontSize={12}
          fontWeight="medium"
          color="orange.600"
          textAlign="center"
        />
      </Box>
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        px={2}
        py={1}
        borderRadius="sm"
        border="1px solid"
        borderColor="green.400"
      >
        <Text
          text={defenseDisplay}
          fontSize={12}
          fontWeight="medium"
          color="green.600"
          textAlign="center"
        />
      </Box>
    </HStack>
  )

  return (
    <Box position="relative">
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
              width="120px"
              height="120px"
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

          {/* 右側: 体力バー（縦等間隔レイアウト） */}
          <VStack alignItems="center" justifyContent="space-evenly" height="120px">
            {/* 役表示（体力バーの上） */}
            {showRole && rolePosition === 'above' && roleDisplay}
            {/* 選択肢表示（役が下の場合は上に表示） */}
            {rolePosition === 'below' && selectionDisplay}
            
            {/* 上段：HP */}
            <HStack gap={2} alignItems="center">
              <HealthBar
                currentHp={player.currentHp}
                maxHp={player.maxHp}
                label="HP"
                size="md"
                hideLabel={true}
              />
              <Text
                text={`${player.currentHp}/${player.maxHp}`}
                fontSize={12}
                fontWeight="bold"
                color="white"
                textAlign="left"
              />
            </HStack>

            {/* 下段：MP（紫ベース） */}
            <HStack gap={2} alignItems="center">
              <HealthBar
                currentHp={player.currentHp}
                maxHp={player.maxHp}
                label="MP"
                size="md"
                hideLabel={true}
                type="mp"
              />
              <Text
                text={`${player.currentHp}/${player.maxHp}`}
                fontSize={12}
                fontWeight="bold"
                color="white"
                textAlign="left"
              />
            </HStack>
            
            {/* 役表示（体力バーの下） */}
            {showRole && rolePosition === 'below' && roleDisplay}
            {/* 選択肢表示（役が上の場合は下に表示） */}
            {rolePosition === 'above' && selectionDisplay}
          </VStack>
        </Box>
      </HStack>


    </Box>
  )
}