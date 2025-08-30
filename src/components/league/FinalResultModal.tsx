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

import { Player } from '@/types/league/LeagueTypes'
import { Team } from '@/types/league/TeamLeagueTypes'
import { sortPlayersByRanking } from '@/utils/LeagueUtils'
import { sortTeamsByRanking } from '@/utils/TeamLeagueUtils'

interface GameStats {
  playerAWins: number
  playerBWins: number
  draws: number
  totalGames: number
}

interface FinalResultModalProps {
  isOpen: boolean
  onClose: () => void
  onReset: () => void
  gameStats: GameStats
  players?: Player[]
  teams?: Team[]
}

export const FinalResultModal = ({ isOpen, onClose, onReset, players = [], teams = [] }: FinalResultModalProps) => {
  const isTeamMode = teams.length > 0
  
  // チームモードまたは個人モード
  const rankedPlayers = sortPlayersByRanking(players)
  const rankedTeams = sortTeamsByRanking(teams)
  const champion = isTeamMode ? rankedTeams[0] : rankedPlayers[0]

  const getWinRate = (player: Player): string => {
    if (player.totalGames === 0) return '0.0%'
    return ((player.wins / player.totalGames) * 100).toFixed(1) + '%'
  }

  const handleComplete = () => {
    onClose()
    onReset()
  }

  return (
    <DialogRoot open={isOpen} onOpenChange={() => {}}>
      <DialogContent maxWidth="lg" mx="auto">
        <DialogHeader textAlign="center">
          <DialogTitle>
            <Text
              text="🎉 全52ターム完了！ 🎉"
              fontSize={{ base: 20, md: 24 }}
              fontWeight="bold"
              color="purple.600"
            />
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody bg="gray.50">
          <VStack gap={6}>
            {champion && (
              <Box
                textAlign="center"
                padding={6}
                bg="purple.50"
                borderRadius="lg"
                width="100%"
                border="2px solid"
                borderColor="purple.200"
              >
                <VStack gap={2}>
                  <Text
                    text="🏆 リーグ優勝 🏆"
                    fontSize={{ base: 18, md: 22 }}
                    fontWeight="bold"
                    color="purple.600"
                  />
                  <HStack gap={2}>
                    <Box
                      width="20px"
                      height="20px"
                      bg={champion.color}
                      borderRadius="full"
                    />
                    <Text
                      text={champion.name}
                      fontSize={{ base: 16, md: 20 }}
                      fontWeight="bold"
                      color={champion.color}
                    />
                  </HStack>
                  <Text
                    text={`${champion.points}pt (勝率: ${getWinRate(champion)})`}
                    fontSize={{ base: 14, md: 16 }}
                    color="purple.500"
                  />
                </VStack>
              </Box>
            )}

            <Box
              width="100%"
              bg="gray.50"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="lg"
              padding={5}
            >
              <VStack gap={4}>
                <Text
                  text="最終順位表"
                  fontSize={{ base: 16, md: 18 }}
                  fontWeight="bold"
                  color="gray.700"
                />
                
                <VStack gap={2} width="100%">
                  {rankedPlayers.slice(0, 5).map((player, index) => {
                    const rank = index + 1
                    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}位`
                    
                    return (
                      <HStack
                        key={player.id}
                        width="100%"
                        justifyContent="space-between"
                        padding={2}
                        bg={rank <= 3 ? `${player.color}20` : 'white'}
                        borderRadius="md"
                        border="1px solid"
                        borderColor={rank <= 3 ? player.color : 'gray.200'}
                      >
                        <HStack gap={2}>
                          <Text
                            text={rankEmoji}
                            fontSize={14}
                            fontWeight="bold"
                          />
                          <Box
                            width="12px"
                            height="12px"
                            bg={player.color}
                            borderRadius="full"
                          />
                          <Text
                            text={player.name}
                            fontSize={12}
                            fontWeight="bold"
                            color={player.color}
                          />
                        </HStack>
                        <HStack gap={3}>
                          <Text
                            text={`${player.points}pt`}
                            fontSize={11}
                            fontWeight="bold"
                            color="blue.600"
                          />
                          <Text
                            text={`${player.wins}勝${player.draws}分${player.losses}敗`}
                            fontSize={10}
                            color="gray.600"
                          />
                          <Text
                            text={getWinRate(player)}
                            fontSize={10}
                            fontWeight="bold"
                            color="purple.600"
                          />
                        </HStack>
                      </HStack>
                    )
                  })}
                </VStack>
              </VStack>
            </Box>
          </VStack>
        </DialogBody>

        <DialogFooter justifyContent="center">
          <Button 
            onClick={handleComplete} 
            colorScheme="purple" 
            size="lg" 
            width="200px"
          >
            最初からやり直す
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}