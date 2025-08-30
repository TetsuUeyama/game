'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/Text'
import { TurnContent } from '@/components/league/TurnContent'
import { NextButton } from '@/components/league/NextButton'
import { LeagueStats } from '@/components/league/GameStats'
import { LeagueRankingModal } from '@/components/league/LeagueRankingModal'
import { FinalResultModal } from '@/components/league/FinalResultModal'
import { useState, useEffect } from 'react'
import { Player, Match, LeagueStats as LeagueStatsType } from '@/types/league/LeagueTypes'

interface TurnPageTemplateProps {
  currentTurn: number
  players: Player[]
  onNextTurn: () => void
  onPrevTurn: () => void
  onRoundComplete: (matches: Match[]) => void
  onReset: () => void
  isLastTurn: boolean
  isFirstTurn: boolean
}

export const TurnPageTemplate = ({
  currentTurn,
  players,
  onNextTurn,
  onPrevTurn,
  onRoundComplete,
  onReset,
  isLastTurn,
  isFirstTurn
}: TurnPageTemplateProps) => {
  const [showRankingModal, setShowRankingModal] = useState(false)
  const [showFinalModal, setShowFinalModal] = useState(false)
  const [roundCompletedForTurn, setRoundCompletedForTurn] = useState(false)

  useEffect(() => {
    setRoundCompletedForTurn(false)
  }, [currentTurn])

  const handleRoundComplete = (matches: Match[]) => {
    setRoundCompletedForTurn(true)
    onRoundComplete(matches)
    
    // 少し遅れてランキングモーダルを表示
    setTimeout(() => {
      setShowRankingModal(true)
    }, 500)
  }

  const handleRankingModalClose = () => {
    setShowRankingModal(false)
    if (isLastTurn) {
      setShowFinalModal(true)
    } else {
      onNextTurn()
    }
  }

  const handleFinalModalClose = () => {
    setShowFinalModal(false)
    onReset()
  }

  const handleManualNext = () => {
    if (roundCompletedForTurn) {
      if (isLastTurn) {
        setShowFinalModal(true)
      } else {
        onNextTurn()
      }
    }
  }

  // 簡単な統計データの作成
  const leagueStats: LeagueStatsType = {
    players: players,
    totalTurns: currentTurn - (roundCompletedForTurn ? 0 : 1),
    completedMatches: players.reduce((sum, player) => sum + player.totalGames, 0) / 2
  }

  return (
    <>
      <VStack
        flex={1}
        gap={4}
        padding={4}
        justifyContent="space-between"
        height="100%"
      >
        <Box textAlign="center" paddingTop={8}>
          <Text
            text={`ターム ${currentTurn} / 52`}
            fontSize={{ base: 18, md: 24 }}
            fontWeight="bold"
          />
        </Box>

        <Box flex={1} width="100%" display="flex" justifyContent="center" alignItems="center">
          <TurnContent 
            turnNumber={currentTurn} 
            players={players}
            onRoundComplete={handleRoundComplete}
          />
        </Box>

        <Box width="100%" paddingBottom={4}>
          <VStack gap={4}>
            <LeagueStats 
              players={players}
              totalTurns={leagueStats.totalTurns}
            />
            
            <HStack gap={4} width="100%" justifyContent="center">
              {!isFirstTurn && (
                <Button
                  onClick={onPrevTurn}
                  variant="outline"
                  size="lg"
                  minWidth="120px"
                >
                  前へ
                </Button>
              )}
            </HStack>
            
            <Box width="100%">
              <NextButton
                onClick={handleManualNext}
                isLastTurn={isLastTurn}
                disabled={!roundCompletedForTurn}
              />
            </Box>
          </VStack>
        </Box>
      </VStack>

      <LeagueRankingModal
        isOpen={showRankingModal}
        onClose={handleRankingModalClose}
        players={players}
        turnNumber={currentTurn}
      />

      <FinalResultModal
        isOpen={showFinalModal}
        onClose={handleFinalModalClose}
        onReset={onReset}
        players={players}
        gameStats={{
          playerAWins: 0, // この値は使用されない
          playerBWins: 0, // この値は使用されない
          draws: 0, // この値は使用されない
          totalGames: players.reduce((sum, p) => sum + p.totalGames, 0) / 2
        }}
      />
    </>
  )
}