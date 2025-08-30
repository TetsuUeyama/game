'use client'

import { Box } from '@chakra-ui/react'
import { useState } from 'react'
import { Header } from '@/templates/Header'
import { colors } from '@/utils/theme'
import { TeamTurnPageTemplate } from '@/templates/league/TeamTurnPageTemplate'
import { Team, TeamMatch, Member } from '@/types/league/TeamLeagueTypes'
import { createInitialTeams, updateTeamStatsLegacy } from '@/utils/TeamLeagueUtils'

export const TeamTurnPageView = () => {
  const [currentTurn, setCurrentTurn] = useState<number>(1)
  const [teams, setTeams] = useState<(Team & { members: Member[] })[]>(createInitialTeams())

  const handleRoundComplete = (teamMatches: TeamMatch[]) => {
    const updatedTeams = updateTeamStatsLegacy(teams, teamMatches)
    setTeams(updatedTeams)
  }

  const handleNextTurn = () => {
    if (currentTurn < 52) {
      setCurrentTurn(currentTurn + 1)
    }
  }

  const handlePrevTurn = () => {
    if (currentTurn > 1) {
      setCurrentTurn(currentTurn - 1)
    }
  }

  const handleReset = () => {
    setCurrentTurn(1)
    setTeams(createInitialTeams())
  }

  return (
    <Box
      color={colors.text}
      width={'100%'}
      height={'100vh'}
      margin={'auto'}
      bg={colors.base}
      display={'flex'}
      flexDirection={'column'}
    >
      <Header />
      <TeamTurnPageTemplate 
        currentTurn={currentTurn}
        teams={teams}
        onNextTurn={handleNextTurn}
        onPrevTurn={handlePrevTurn}
        onRoundComplete={handleRoundComplete}
        onReset={handleReset}
        isLastTurn={currentTurn === 52}
        isFirstTurn={currentTurn === 1}
      />
    </Box>
  )
}