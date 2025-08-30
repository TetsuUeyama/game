'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/Text'
import { TeamTurnContent } from '@/components/league/TeamTurnContent'
import { NextButton } from '@/components/league/NextButton'
import { TeamLeagueStats } from '@/components/league/TeamLeagueStats'
import { TeamResultModal } from '@/components/league/TeamResultModal'
import { TeamRankingModal } from '@/components/league/TeamRankingModal'
import { FinalResultModal } from '@/components/league/FinalResultModal'
import { useState, useEffect } from 'react'
import { Team, TeamMatch, TeamLeagueStats as TeamLeagueStatsType } from '@/types/league/TeamLeagueTypes'

interface TeamTurnPageTemplateProps {
  currentTurn: number
  teams: Team[]
  onNextTurn: () => void
  onPrevTurn: () => void
  onRoundComplete: (teamMatches: TeamMatch[]) => void
  onReset: () => void
  isLastTurn: boolean
  isFirstTurn: boolean
}

export const TeamTurnPageTemplate = ({
  currentTurn,
  teams,
  onNextTurn,
  onPrevTurn,
  onRoundComplete,
  onReset,
  isLastTurn,
  isFirstTurn
}: TeamTurnPageTemplateProps) => {
  const [showResultModal, setShowResultModal] = useState(false)
  const [showRankingModal, setShowRankingModal] = useState(false)
  const [showFinalModal, setShowFinalModal] = useState(false)
  const [roundCompletedForTurn, setRoundCompletedForTurn] = useState(false)
  const [currentTeamMatches, setCurrentTeamMatches] = useState<TeamMatch[]>([])

  useEffect(() => {
    setRoundCompletedForTurn(false)
    setCurrentTeamMatches([])
  }, [currentTurn])

  const handleRoundComplete = (teamMatches: TeamMatch[]) => {
    setRoundCompletedForTurn(true)
    setCurrentTeamMatches(teamMatches)
    onRoundComplete(teamMatches)
    
    // 少し遅れてリザルトモーダルを表示
    setTimeout(() => {
      setShowResultModal(true)
    }, 500)
  }

  const handleResultModalClose = () => {
    setShowResultModal(false)
    // リザルト後にランキングモーダルを表示
    setTimeout(() => {
      setShowRankingModal(true)
    }, 300)
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
  const teamLeagueStats: TeamLeagueStatsType = {
    teams: teams,
    members: teams.flatMap(team => team.members),
    totalTurns: currentTurn - (roundCompletedForTurn ? 0 : 1),
    completedMatches: teams.reduce((sum, team) => sum + team.totalGames, 0) / 2
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
          <TeamTurnContent 
            turnNumber={currentTurn} 
            teams={teams}
            onRoundComplete={handleRoundComplete}
          />
        </Box>

        <Box width="100%" paddingBottom={4}>
          <VStack gap={4}>
            <TeamLeagueStats 
              teams={teams}
              totalTurns={teamLeagueStats.totalTurns}
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

      <TeamResultModal
        isOpen={showResultModal}
        onClose={handleResultModalClose}
        teams={teams}
        teamMatches={currentTeamMatches}
        turnNumber={currentTurn}
      />

      <TeamRankingModal
        isOpen={showRankingModal}
        onClose={handleRankingModalClose}
        teams={teams}
        turnNumber={currentTurn}
      />

      <FinalResultModal
        isOpen={showFinalModal}
        onClose={handleFinalModalClose}
        onReset={onReset}
        teams={teams}
        gameStats={{
          playerAWins: 0, // この値は使用されない
          playerBWins: 0, // この値は使用されない
          draws: 0, // この値は使用されない
          totalGames: teams.reduce((sum, t) => sum + t.totalGames, 0) / 2
        }}
      />
    </>
  )
}