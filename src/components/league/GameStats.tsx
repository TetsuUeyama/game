'use client'

import { Box, HStack, VStack, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Player } from '@/types/league/LeagueTypes'
import { sortPlayersByRanking } from '@/utils/LeagueUtils'

interface LeagueStatsProps {
  players: Player[]
  totalTurns: number
}

export const LeagueStats = ({ players, totalTurns }: LeagueStatsProps) => {
  const rankedPlayers = sortPlayersByRanking(players)
  const topPlayer = rankedPlayers[0]
  const totalMatches = players.reduce((sum, player) => sum + player.totalGames, 0) / 2 // 2で割るのは重複を除くため

  const getWinRate = (player: Player): string => {
    if (player.totalGames === 0) return '0.0%'
    return ((player.wins / player.totalGames) * 100).toFixed(1) + '%'
  }

  return (
    <Box
      width="100%"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      padding={4}
      boxShadow="sm"
    >
      <VStack gap={4}>
        <Text
          text={`リーグ戦績 (${totalTurns}/52ターン完了)`}
          fontSize={{ base: 14, md: 16 }}
          fontWeight="bold"
          color="gray.700"
        />

        {/* 首位チーム表示 */}
        {topPlayer && (
          <Box
            width="100%"
            bg="yellow.50"
            border="2px solid"
            borderColor="yellow.200"
            borderRadius="md"
            padding={3}
          >
            <VStack gap={2}>
              <HStack gap={2}>
                <Text text="🥇" fontSize={16} />
                <Text
                  text="現在の首位"
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="yellow.700"
                />
              </HStack>
              <HStack gap={2}>
                <Box
                  width="16px"
                  height="16px"
                  bg={topPlayer.color}
                  borderRadius="full"
                />
                <Text
                  text={topPlayer.name}
                  fontSize={{ base: 14, md: 16 }}
                  fontWeight="bold"
                  color={topPlayer.color}
                />
                <Text
                  text={`${topPlayer.points}pt`}
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="blue.600"
                />
                <Text
                  text={`(${getWinRate(topPlayer)})`}
                  fontSize={{ base: 10, md: 12 }}
                  color="gray.600"
                />
              </HStack>
            </VStack>
          </Box>
        )}

        {/* 上位3位の簡易表示 */}
        <SimpleGrid columns={3} gap={2} width="100%">
          {rankedPlayers.slice(0, 3).map((player, index) => {
            const rank = index + 1
            const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'
            
            return (
              <VStack
                key={player.id}
                gap={1}
                padding={2}
                bg={rank === 1 ? 'yellow.50' : rank === 2 ? 'gray.50' : 'orange.50'}
                borderRadius="md"
                border="1px solid"
                borderColor={rank === 1 ? 'yellow.200' : rank === 2 ? 'gray.200' : 'orange.200'}
              >
                <Text text={rankEmoji} fontSize={14} />
                <Box
                  width="12px"
                  height="12px"
                  bg={player.color}
                  borderRadius="full"
                />
                <Text
                  text={player.name}
                  fontSize={10}
                  fontWeight="bold"
                  color={player.color}
                  textAlign="center"
                />
                <Text
                  text={`${player.points}pt`}
                  fontSize={10}
                  fontWeight="bold"
                  color="blue.600"
                />
                <Text
                  text={getWinRate(player)}
                  fontSize={8}
                  color="gray.600"
                />
              </VStack>
            )
          })}
        </SimpleGrid>

        {/* リーグ統計 */}
        <HStack gap={4} width="100%" justifyContent="space-around" flexWrap="wrap">
          <VStack gap={1} minWidth="60px">
            <Text
              text="総試合数"
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color="gray.600"
            />
            <Text
              text={totalMatches.toString()}
              fontSize={{ base: 12, md: 14 }}
              fontWeight="bold"
              color="blue.700"
            />
          </VStack>

          <VStack gap={1} minWidth="60px">
            <Text
              text="平均勝点"
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color="gray.600"
            />
            <Text
              text={(players.reduce((sum, p) => sum + p.points, 0) / players.length).toFixed(1)}
              fontSize={{ base: 12, md: 14 }}
              fontWeight="bold"
              color="purple.700"
            />
          </VStack>

          <VStack gap={1} minWidth="60px">
            <Text
              text="完了ターン"
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color="gray.600"
            />
            <Text
              text={`${totalTurns}/52`}
              fontSize={{ base: 12, md: 14 }}
              fontWeight="bold"
              color="green.700"
            />
          </VStack>
        </HStack>
      </VStack>
    </Box>
  )
}