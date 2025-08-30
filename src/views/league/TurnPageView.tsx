'use client'

import { Box } from '@chakra-ui/react'
import { useState } from 'react'
import { Header } from '@/templates/Header'
import { colors } from '@/utils/theme'
import { TurnPageTemplate } from '@/templates/league/TurnPageTemplate'
import { Player, Match } from '@/types/league/LeagueTypes'
import { createInitialPlayers, updatePlayerStats } from '@/utils/LeagueUtils'

export const TurnPageView = () => {
  const [currentTurn, setCurrentTurn] = useState<number>(1)
  const [players, setPlayers] = useState<Player[]>(createInitialPlayers())

  const handleRoundComplete = (matches: Match[]) => {
    const updatedPlayers = updatePlayerStats(players, matches)
    setPlayers(updatedPlayers)
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
    setPlayers(createInitialPlayers())
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
      <TurnPageTemplate 
        currentTurn={currentTurn}
        players={players}
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