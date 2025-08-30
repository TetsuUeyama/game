'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { TeamMatch, MemberMatch, Team, Member } from '@/types/league/TeamLeagueTypes'
import { MemberComponent } from './MemberComponent'
import { sortTeamsByRanking } from '@/utils/TeamLeagueUtils'
import { useState } from 'react'

interface TeamMatchCardProps {
  teamMatch: TeamMatch
  onClick?: () => void
  isClickable?: boolean
  showToggleDetails?: boolean
  allTeams?: (Team & { members: Member[] })[]
}

export const TeamMatchCard = ({ teamMatch, onClick, isClickable = false, showToggleDetails = false, allTeams }: TeamMatchCardProps) => {
  const [showDetails, setShowDetails] = useState(false)
  
  // 現在の順位を取得
  const getCurrentRanking = (teamId: number): number => {
    if (!allTeams) return 0
    const rankedTeams = sortTeamsByRanking(allTeams)
    const rank = rankedTeams.findIndex(team => team.id === teamId) + 1
    return rank
  }

  const getRankIcon = (rank: number): string => {
    if (rank === 0) return ''
    return `${rank}位`
  }
  const getResultColor = (teamType: 'home' | 'away') => {
    if (!teamMatch.completed) return 'gray.100'
    
    if (teamType === 'home') {
      return teamMatch.result === 'home' ? 'green.100' : 'red.100'
    } else {
      return teamMatch.result === 'away' ? 'green.100' : 'red.100'
    }
  }


  const getResultText = (): string => {
    if (!teamMatch.completed) return ''
    
    const homeScore = teamMatch.homeTeamScore
    const awayScore = teamMatch.awayTeamScore
    
    return `${homeScore} - ${awayScore}`
  }

  const getResultSummary = (): string => {
    if (!teamMatch.completed) return ''
    
    if (teamMatch.result === 'home') {
      return 'H勝利'
    } else {
      return 'A勝利'
    }
  }

  return (
    <Box
      border="2px solid"
      borderColor="gray.200"
      borderRadius="lg"
      padding={4}
      bg="white"
      boxShadow="sm"
      width="100%"
      minHeight="140px"
      cursor={isClickable ? 'pointer' : 'default'}
      _hover={isClickable ? { boxShadow: 'md', borderColor: 'blue.300' } : {}}
      onClick={isClickable ? onClick : undefined}
    >
      <VStack gap={3} height="100%">
        <HStack width="100%" justifyContent="space-between" alignItems="center">
          {/* ホームチーム */}
          <VStack gap={1} flex={1}>
            <Box
              width="60px"
              height="40px"
              bg={getResultColor('home')}
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor={teamMatch.homeTeam.color}
            >
              <VStack gap={0}>
                <Box
                  width="12px"
                  height="12px"
                  bg={teamMatch.homeTeam.color}
                  borderRadius="full"
                />
                {teamMatch.completed && (
                  <Text
                    text={teamMatch.result === 'home' ? '〇' : '×'}
                    fontSize={{ base: 16, md: 18 }}
                    fontWeight="bold"
                    color={teamMatch.result === 'home' ? 'green.600' : 'red.600'}
                  />
                )}
              </VStack>
            </Box>
            <Text
              text={teamMatch.homeTeam.name}
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color={teamMatch.homeTeam.color}
              textAlign="center"
            />
            <Text
              text="(H)"
              fontSize={{ base: 8, md: 10 }}
              color="gray.500"
            />
            {/* 順位表示 */}
            {allTeams && (
              <Text
                text={getRankIcon(getCurrentRanking(teamMatch.homeTeam.id))}
                fontSize={{ base: 8, md: 10 }}
                fontWeight="bold"
                color="purple.600"
                textAlign="center"
              />
            )}
          </VStack>

          {/* VS & Result */}
          <VStack gap={1} alignItems="center" minWidth="60px">
            <Text
              text="VS"
              fontSize={{ base: 12, md: 14 }}
              fontWeight="bold"
              color="gray.500"
            />
            {teamMatch.completed && (
              <>
                <Text
                  text={getResultText()}
                  fontSize={{ base: 14, md: 16 }}
                  fontWeight="bold"
                  color="gray.700"
                />
                <Text
                  text={getResultSummary()}
                  fontSize={{ base: 8, md: 10 }}
                  fontWeight="bold"
                  color={
                    teamMatch.result === 'home' ? 'green.600' :
                    'blue.600'
                  }
                />
              </>
            )}
          </VStack>

          {/* アウェイチーム */}
          <VStack gap={1} flex={1}>
            <Box
              width="60px"
              height="40px"
              bg={getResultColor('away')}
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor={teamMatch.awayTeam.color}
            >
              <VStack gap={0}>
                <Box
                  width="12px"
                  height="12px"
                  bg={teamMatch.awayTeam.color}
                  borderRadius="full"
                />
                {teamMatch.completed && (
                  <Text
                    text={teamMatch.result === 'away' ? '〇' : '×'}
                    fontSize={{ base: 16, md: 18 }}
                    fontWeight="bold"
                    color={teamMatch.result === 'away' ? 'green.600' : 'red.600'}
                  />
                )}
              </VStack>
            </Box>
            <Text
              text={teamMatch.awayTeam.name}
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color={teamMatch.awayTeam.color}
              textAlign="center"
            />
            <Text
              text="(A)"
              fontSize={{ base: 8, md: 10 }}
              color="gray.500"
            />
            {/* 順位表示 */}
            {allTeams && (
              <Text
                text={getRankIcon(getCurrentRanking(teamMatch.awayTeam.id))}
                fontSize={{ base: 8, md: 10 }}
                fontWeight="bold"
                color="purple.600"
                textAlign="center"
              />
            )}
          </VStack>
        </HStack>

        {/* 詳細表示トグルボタン */}
        {showToggleDetails && teamMatch.completed && (
          <Box
            textAlign="center"
            padding={2}
            bg="blue.50"
            borderRadius="sm"
            width="100%"
            cursor="pointer"
            _hover={{ bg: "blue.100" }}
            onClick={(e) => {
              e.stopPropagation()
              setShowDetails(!showDetails)
            }}
          >
            <Text
              text={showDetails ? "📊 詳細を隠す" : "📊 詳細を表示"}
              fontSize={{ base: 10, md: 12 }}
              color="blue.600"
              fontWeight="bold"
            />
          </Box>
        )}

        {/* 詳細表示（従来の詳細タブ内容） */}
        {showToggleDetails && showDetails && teamMatch.completed && (
          <Box
            width="100%"
            bg="gray.50"
            borderRadius="md"
            padding={3}
            border="1px solid"
            borderColor="gray.200"
          >
            <VStack gap={2}>
              <Text
                text="メンバー別試合結果"
                fontSize={{ base: 12, md: 14 }}
                fontWeight="bold"
                color="gray.700"
                textAlign="center"
              />
              
              {teamMatch.memberMatches.map((memberMatch: MemberMatch) => (
                <Box
                  key={memberMatch.id}
                  width="100%"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  padding={2}
                  bg={
                    memberMatch.result === 'home' ? 'green.50' :
                    memberMatch.result === 'away' ? 'blue.50' :
                    'gray.50'
                  }
                >
                  <HStack justifyContent="space-between" alignItems="center">
                    <MemberComponent
                      member={memberMatch.homeMember}
                      size="xs"
                      isVersus={true}
                    />
                    
                    <VStack gap={0} minWidth="80px">
                      <Text
                        text="VS"
                        fontSize={{ base: 8, md: 10 }}
                        fontWeight="bold"
                        color="gray.500"
                      />
                      {memberMatch.completed && (
                        <>
                          <HStack gap={1}>
                            <Text
                              text={memberMatch.homeScore?.toString() || ''}
                              fontSize={{ base: 10, md: 12 }}
                              fontWeight="bold"
                              color="gray.700"
                            />
                            <Text
                              text={memberMatch.result === 'home' ? '〇' : '×'}
                              fontSize={{ base: 8, md: 10 }}
                              fontWeight="bold"
                              color={memberMatch.result === 'home' ? 'green.600' : 'red.600'}
                            />
                            <Text
                              text=" - "
                              fontSize={{ base: 10, md: 12 }}
                              fontWeight="bold"
                              color="gray.700"
                            />
                            <Text
                              text={memberMatch.result === 'away' ? '〇' : '×'}
                              fontSize={{ base: 8, md: 10 }}
                              fontWeight="bold"
                              color={memberMatch.result === 'away' ? 'green.600' : 'red.600'}
                            />
                            <Text
                              text={memberMatch.awayScore?.toString() || ''}
                              fontSize={{ base: 10, md: 12 }}
                              fontWeight="bold"
                              color="gray.700"
                            />
                          </HStack>
                          <Text
                            text={
                              memberMatch.result === 'home' ? 'H勝利' :
                              'A勝利'
                            }
                            fontSize={{ base: 6, md: 8 }}
                            fontWeight="bold"
                            color={
                              memberMatch.result === 'home' ? 'green.600' :
                              'blue.600'
                            }
                          />
                        </>
                      )}
                    </VStack>

                    <MemberComponent
                      member={memberMatch.awayMember}
                      size="xs"
                      isVersus={true}
                    />
                  </HStack>
                </Box>
              ))}
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  )
}