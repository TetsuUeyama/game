'use client'

import {
  Box,
  VStack,
  HStack
} from '@chakra-ui/react'
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/Text'
import { Team, Member } from '@/types/league/TeamLeagueTypes'
import { sortTeamsByRanking, sortMembersByRanking } from '@/utils/TeamLeagueUtils'
import { useState } from 'react'

interface TeamRankingModalProps {
  isOpen: boolean
  onClose: () => void
  teams: (Team & { members: Member[] })[]
  turnNumber: number
}

export const TeamRankingModal = ({ isOpen, onClose, teams, turnNumber }: TeamRankingModalProps) => {
  const [activeTab, setActiveTab] = useState<'team' | 'member'>('team')
  const rankedTeams = sortTeamsByRanking(teams)
  const allMembers: Member[] = teams.flatMap(team => team.members)
  const rankedMembers = sortMembersByRanking(allMembers)

  const getTeamWinRate = (team: Team): string => {
    if (team.totalGames === 0) return '0.0%'
    return ((team.wins / team.totalGames) * 100).toFixed(1) + '%'
  }

  const getMemberWinRate = (member: Member): string => {
    if (member.totalGames === 0) return '0.0%'
    return ((member.wins / member.totalGames) * 100).toFixed(1) + '%'
  }

  const getRankIcon = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `${rank}`
    }
  }

  const getRankColor = (rank: number): string => {
    switch (rank) {
      case 1: return 'yellow.400'
      case 2: return 'gray.400'
      case 3: return 'orange.400'
      default: return 'gray.600'
    }
  }

  const renderTabButton = (tab: 'team' | 'member', label: string) => {
    const isActive = activeTab === tab
    
    return (
      <Button
        onClick={() => setActiveTab(tab)}
        variant={isActive ? "solid" : "outline"}
        colorScheme={isActive ? "blue" : "gray"}
        size="sm"
        fontSize={{ base: 12, md: 14 }}
        minWidth="100px"
      >
        {label}
      </Button>
    )
  }

  const renderTeamRanking = () => (
    <VStack gap={3} width="100%">
      <Text
        text="チーム順位表"
        fontSize={{ base: 14, md: 16 }}
        fontWeight="bold"
        color="blue.600"
      />

      <VStack gap={2} width="100%">
        {/* ヘッダー */}
        <HStack
          width="100%"
          justifyContent="space-between"
          padding={2}
          bg="gray.100"
          borderRadius="md"
          fontSize={10}
          fontWeight="bold"
        >
          <Box minWidth="40px" textAlign="center">
            <Text text="順位" fontSize={10} fontWeight="bold" />
          </Box>
          <Box minWidth="120px" textAlign="left">
            <Text text="チーム" fontSize={10} fontWeight="bold" />
          </Box>
          <Box minWidth="40px" textAlign="center">
            <Text text="勝点" fontSize={10} fontWeight="bold" />
          </Box>
          <Box minWidth="60px" textAlign="center">
            <Text text="得失点" fontSize={10} fontWeight="bold" />
          </Box>
          <Box minWidth="70px" textAlign="center">
            <Text text="成績" fontSize={10} fontWeight="bold" />
          </Box>
          <Box minWidth="50px" textAlign="center">
            <Text text="勝率" fontSize={10} fontWeight="bold" />
          </Box>
        </HStack>

        {/* データ行 */}
        {rankedTeams.map((team, index) => {
          const rank = index + 1
          const goalDiff = team.goalFor - team.goalAgainst
          
          return (
            <HStack
              key={team.id}
              width="100%"
              justifyContent="space-between"
              padding={2}
              bg={rank <= 3 ? `${getRankColor(rank)}20` : 'white'}
              borderRadius="md"
              border="1px solid"
              borderColor={rank <= 3 ? getRankColor(rank) : 'gray.200'}
            >
              <Box minWidth="40px" textAlign="center">
                <Text
                  text={getRankIcon(rank)}
                  fontSize={12}
                  fontWeight="bold"
                />
              </Box>
              <Box minWidth="120px" textAlign="left">
                <HStack gap={1}>
                  <Box
                    width="10px"
                    height="10px"
                    bg={team.color}
                    borderRadius="full"
                  />
                  <Text
                    text={team.name}
                    fontSize={10}
                    fontWeight="bold"
                    color={team.color}
                  />
                </HStack>
              </Box>
              <Box minWidth="40px" textAlign="center">
                <Text
                  text={team.points.toString()}
                  fontSize={11}
                  fontWeight="bold"
                  color="blue.600"
                />
              </Box>
              <Box minWidth="60px" textAlign="center">
                <Text
                  text={`${team.goalFor}-${team.goalAgainst} (${goalDiff >= 0 ? '+' : ''}${goalDiff})`}
                  fontSize={9}
                  color="purple.600"
                />
              </Box>
              <Box minWidth="70px" textAlign="center">
                <Text
                  text={`${team.wins}勝${team.draws}分${team.losses}敗`}
                  fontSize={9}
                  color="gray.700"
                />
              </Box>
              <Box minWidth="50px" textAlign="center">
                <Text
                  text={getTeamWinRate(team)}
                  fontSize={10}
                  fontWeight="bold"
                />
              </Box>
            </HStack>
          )
        })}
      </VStack>
    </VStack>
  )

  const renderMemberRanking = () => (
    <VStack gap={3} width="100%">
      <Text
        text="個人順位表"
        fontSize={{ base: 14, md: 16 }}
        fontWeight="bold"
        color="purple.600"
      />

      <VStack gap={2} width="100%">
        {/* データ行 - 縦並び */}
        {rankedMembers.map((member, index) => {
          const rank = index + 1
          const memberTeam = teams.find(t => t.id === member.teamId)
          
          return (
            <Box
              key={member.id}
              width="100%"
              padding={3}
              bg={rank <= 3 ? `${member.color}20` : 'white'}
              borderRadius="md"
              border="1px solid"
              borderColor={rank <= 3 ? member.color : 'gray.200'}
            >
              <HStack gap={4} width="100%" justifyContent="space-between" alignItems="center">
                {/* 順位 */}
                <Box minWidth="50px" textAlign="center">
                  <Text
                    text={getRankIcon(rank)}
                    fontSize={16}
                    fontWeight="bold"
                  />
                </Box>
                
                {/* プレイヤー情報 */}
                <VStack gap={1} flex="1" alignItems="flex-start">
                  <HStack gap={2}>
                    <Box
                      width="12px"
                      height="12px"
                      bg={member.color}
                      borderRadius="full"
                    />
                    <Text
                      text={member.name}
                      fontSize={14}
                      fontWeight="bold"
                      color={member.color}
                    />
                  </HStack>
                  <HStack gap={1}>
                    <Text text="所属:" fontSize={10} color="gray.500" />
                    {memberTeam && (
                      <HStack gap={1}>
                        <Box
                          width="8px"
                          height="8px"
                          bg={memberTeam.color}
                          borderRadius="full"
                        />
                        <Text
                          text={memberTeam.name}
                          fontSize={10}
                          color={memberTeam.color}
                          fontWeight="bold"
                        />
                      </HStack>
                    )}
                  </HStack>
                </VStack>
                
                {/* 成績情報 */}
                <VStack gap={1} alignItems="center" minWidth="120px">
                  <HStack gap={2}>
                    <Text
                      text={`${member.wins}勝`}
                      fontSize={12}
                      fontWeight="bold"
                      color="green.600"
                    />
                    <Text
                      text={`${member.losses}敗`}
                      fontSize={12}
                      color="red.600"
                    />
                  </HStack>
                  <Text
                    text={`勝率: ${getMemberWinRate(member)}`}
                    fontSize={10}
                    color="gray.600"
                  />
                </VStack>
                
                {/* 勝点 */}
                <Box minWidth="60px" textAlign="center">
                  <Text
                    text={`${member.points}pt`}
                    fontSize={14}
                    fontWeight="bold"
                    color="blue.600"
                  />
                </Box>
              </HStack>
            </Box>
          )
        })}
      </VStack>
    </VStack>
  )

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent maxWidth="700px" mx="auto">
        <DialogHeader textAlign="center">
          <DialogTitle>
            <Text
              text={`ターム ${turnNumber} 順位表`}
              fontSize={{ base: 18, md: 22 }}
              fontWeight="bold"
              color="blue.600"
            />
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody bg="gray.50">
          <VStack gap={4} width="100%">
            {/* タブナビゲーション */}
            <HStack gap={2} justifyContent="center" bg="white" padding={3} borderRadius="lg" boxShadow="sm">
              {renderTabButton('team', 'チーム順位')}
              {renderTabButton('member', '個人順位')}
            </HStack>

            {/* コンテンツエリア */}
            <Box width="100%" minHeight="400px" maxHeight="500px" overflowY="auto" bg="white" padding={4} borderRadius="lg" boxShadow="sm">
              {activeTab === 'team' && renderTeamRanking()}
              {activeTab === 'member' && renderMemberRanking()}
            </Box>

            {turnNumber === 52 && (
              <Box
                textAlign="center"
                padding={4}
                bg="purple.50"
                borderRadius="lg"
                width="100%"
                border="2px solid"
                borderColor="purple.200"
              >
                <VStack gap={1}>
                  <Text
                    text="🏆 リーグ戦終了！ 🏆"
                    fontSize={{ base: 16, md: 18 }}
                    fontWeight="bold"
                    color="purple.600"
                  />
                  <Text
                    text={`優勝チーム: ${rankedTeams[0]?.name}`}
                    fontSize={{ base: 14, md: 16 }}
                    fontWeight="bold"
                    color={rankedTeams[0]?.color}
                  />
                  <Text
                    text={`個人首位: ${rankedMembers[0]?.name}`}
                    fontSize={{ base: 12, md: 14 }}
                    color={rankedMembers[0]?.color}
                  />
                </VStack>
              </Box>
            )}
          </VStack>
        </DialogBody>

        <DialogFooter justifyContent="center">
          <Button onClick={onClose} colorScheme="blue" size="lg" width="150px">
            {turnNumber === 52 ? '完了' : '次へ進む'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}