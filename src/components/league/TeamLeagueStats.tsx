'use client'

import { Box, HStack, VStack, SimpleGrid } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Team, Member } from '@/types/league/TeamLeagueTypes'
import { sortTeamsByRanking, sortMembersByRanking } from '@/utils/TeamLeagueUtils'

interface TeamLeagueStatsProps {
  teams: (Team & { members: Member[] })[]
  totalTurns: number
}

export const TeamLeagueStats = ({ teams, totalTurns }: TeamLeagueStatsProps) => {
  const rankedTeams = sortTeamsByRanking(teams)
  const topTeam = rankedTeams[0]
  const allMembers: Member[] = teams.flatMap(team => team.members)
  const rankedMembers = sortMembersByRanking(allMembers)
  const topMember = rankedMembers[0]
  const totalMatches = teams.reduce((sum, team) => sum + team.totalGames, 0) / 2 // 2で割るのは重複を除くため

  const getTeamWinRate = (team: Team): string => {
    if (team.totalGames === 0) return '0.0%'
    return ((team.wins / team.totalGames) * 100).toFixed(1) + '%'
  }

  const getMemberWinRate = (member: Member): string => {
    if (member.totalGames === 0) return '0.0%'
    return ((member.wins / member.totalGames) * 100).toFixed(1) + '%'
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
          text={`チームリーグ戦績 (${totalTurns}/52ターン完了)`}
          fontSize={{ base: 14, md: 16 }}
          fontWeight="bold"
          color="gray.700"
        />

        {/* 首位チーム表示 */}
        {topTeam && (
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
                <Text text="🏆" fontSize={16} />
                <Text
                  text="現在の首位チーム"
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="yellow.700"
                />
              </HStack>
              <HStack gap={2}>
                <Box
                  width="16px"
                  height="16px"
                  bg={topTeam.color}
                  borderRadius="full"
                />
                <Text
                  text={topTeam.name}
                  fontSize={{ base: 14, md: 16 }}
                  fontWeight="bold"
                  color={topTeam.color}
                />
                <Text
                  text={`${topTeam.points}pt`}
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="blue.600"
                />
                <Text
                  text={`(${getTeamWinRate(topTeam)})`}
                  fontSize={{ base: 10, md: 12 }}
                  color="gray.600"
                />
              </HStack>
              <Text
                text={`得失点: ${topTeam.goalFor}-${topTeam.goalAgainst} (${topTeam.goalFor - topTeam.goalAgainst >= 0 ? '+' : ''}${topTeam.goalFor - topTeam.goalAgainst})`}
                fontSize={{ base: 10, md: 12 }}
                color="purple.600"
              />
            </VStack>
          </Box>
        )}

        {/* 個人首位表示 */}
        {topMember && (
          <Box
            width="100%"
            bg="purple.50"
            border="2px solid"
            borderColor="purple.200"
            borderRadius="md"
            padding={3}
          >
            <VStack gap={2}>
              <HStack gap={2}>
                <Text text="⭐" fontSize={16} />
                <Text
                  text="個人首位"
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="purple.700"
                />
              </HStack>
              <HStack gap={2}>
                <Box
                  width="12px"
                  height="12px"
                  bg={topMember.color}
                  borderRadius="full"
                />
                <Text
                  text={topMember.name}
                  fontSize={{ base: 14, md: 16 }}
                  fontWeight="bold"
                  color={topMember.color}
                />
                <Text
                  text={`${topMember.points}pt`}
                  fontSize={{ base: 12, md: 14 }}
                  fontWeight="bold"
                  color="blue.600"
                />
                <Text
                  text={`(${getMemberWinRate(topMember)})`}
                  fontSize={{ base: 10, md: 12 }}
                  color="gray.600"
                />
              </HStack>
            </VStack>
          </Box>
        )}

        {/* 全8チームの簡易表示 */}
        <VStack gap={2} width="100%">
          <Text
            text="チーム順位"
            fontSize={{ base: 12, md: 14 }}
            fontWeight="bold"
            color="gray.600"
          />
          
          <SimpleGrid columns={4} gap={2} width="100%">
            {rankedTeams.slice(0, 8).map((team, index) => {
              const rank = index + 1
              const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank.toString()
              
              return (
                <VStack
                  key={team.id}
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
                    bg={team.color}
                    borderRadius="full"
                  />
                  <Text
                    text={team.name.replace('チーム', '')}
                    fontSize={9}
                    fontWeight="bold"
                    color={team.color}
                    textAlign="center"
                  />
                  <Text
                    text={`${team.points}pt`}
                    fontSize={9}
                    fontWeight="bold"
                    color="blue.600"
                  />
                  <Text
                    text={`${team.goalFor}-${team.goalAgainst}`}
                    fontSize={8}
                    color="purple.600"
                  />
                </VStack>
              )
            })}
          </SimpleGrid>
        </VStack>

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
              text={(teams.reduce((sum, t) => sum + t.points, 0) / teams.length).toFixed(1)}
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