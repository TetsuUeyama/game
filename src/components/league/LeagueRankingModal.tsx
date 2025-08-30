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
import { sortPlayersByRanking } from '@/utils/LeagueUtils'

interface LeagueRankingModalProps {
  isOpen: boolean
  onClose: () => void
  players: Player[]
  turnNumber: number
}

export const LeagueRankingModal = ({ isOpen, onClose, players, turnNumber }: LeagueRankingModalProps) => {
  const rankedPlayers = sortPlayersByRanking(players)

  const getWinRate = (player: Player): string => {
    if (player.totalGames === 0) return '0.0%'
    return ((player.wins / player.totalGames) * 100).toFixed(1) + '%'
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

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent maxWidth="600px" mx="auto">
        <DialogHeader textAlign="center">
          <DialogTitle>
            <Text
              text={`ターム ${turnNumber} リーグ順位表`}
              fontSize={{ base: 18, md: 22 }}
              fontWeight="bold"
              color="blue.600"
            />
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody>
          <VStack gap={4}>
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
                <Box minWidth="80px" textAlign="left">
                  <Text text="プレイヤー" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="40px" textAlign="center">
                  <Text text="勝点" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="40px" textAlign="center">
                  <Text text="試合" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="30px" textAlign="center">
                  <Text text="勝" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="30px" textAlign="center">
                  <Text text="分" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="30px" textAlign="center">
                  <Text text="負" fontSize={10} fontWeight="bold" />
                </Box>
                <Box minWidth="50px" textAlign="center">
                  <Text text="勝率" fontSize={10} fontWeight="bold" />
                </Box>
              </HStack>

              {/* データ行 */}
              {rankedPlayers.map((player, index) => {
                const rank = index + 1
                return (
                  <HStack
                    key={player.id}
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
                    <Box minWidth="80px" textAlign="left">
                      <HStack gap={1}>
                        <Box
                          width="10px"
                          height="10px"
                          bg={player.color}
                          borderRadius="full"
                        />
                        <Text
                          text={player.name}
                          fontSize={10}
                          fontWeight="bold"
                          color={player.color}
                        />
                      </HStack>
                    </Box>
                    <Box minWidth="40px" textAlign="center">
                      <Text
                        text={player.points.toString()}
                        fontSize={11}
                        fontWeight="bold"
                        color="blue.600"
                      />
                    </Box>
                    <Box minWidth="40px" textAlign="center">
                      <Text
                        text={player.totalGames.toString()}
                        fontSize={11}
                      />
                    </Box>
                    <Box minWidth="30px" textAlign="center">
                      <Text
                        text={player.wins.toString()}
                        fontSize={11}
                        color="green.600"
                        fontWeight="bold"
                      />
                    </Box>
                    <Box minWidth="30px" textAlign="center">
                      <Text
                        text={player.draws.toString()}
                        fontSize={11}
                        color="yellow.600"
                      />
                    </Box>
                    <Box minWidth="30px" textAlign="center">
                      <Text
                        text={player.losses.toString()}
                        fontSize={11}
                        color="red.600"
                      />
                    </Box>
                    <Box minWidth="50px" textAlign="center">
                      <Text
                        text={getWinRate(player)}
                        fontSize={10}
                        fontWeight="bold"
                      />
                    </Box>
                  </HStack>
                )
              })}
            </VStack>

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
                <Text
                  text={`🏆 リーグ優勝: ${rankedPlayers[0]?.name} 🏆`}
                  fontSize={{ base: 16, md: 18 }}
                  fontWeight="bold"
                  color="purple.600"
                />
                <Text
                  text={`勝点: ${rankedPlayers[0]?.points}pt (勝率: ${getWinRate(rankedPlayers[0])})`}
                  fontSize={{ base: 12, md: 14 }}
                  color="purple.500"
                />
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