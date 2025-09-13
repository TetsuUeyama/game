'use client'

import { useState } from 'react'
import { Box } from '@chakra-ui/react'
import { CharacterSelect } from '@/components/poker/CharacterSelect'
import { GameResult } from '@/components/poker/GameResult'
import { Character, GameState, GameAction } from '@/types/poker/PokerGameTypes'
import { createDeck, evaluateHand } from '@/templates/poker/CardFunction'
import { initializePlayer } from '@/templates/poker/PlayerTmp'
import { initializeEnemy } from '@/templates/poker/EnemyTmp'
import { FieldTmp } from '@/templates/poker/FieldTmp'
import { colors } from '@/utils/theme'
import { useRouter } from 'next/navigation'

export const PokerGameView = () => {
  const router = useRouter()
  const [gamePhase, setGamePhase] = useState<'select' | 'battle' | 'result'>('select')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [winner, setWinner] = useState<'player' | 'enemy' | null>(null)

  const handleExit = () => {
    router.push('/')
  }

  const handleStartGame = (playerCharacter: Character, enemyCharacter: Character) => {
    const deck = createDeck()
    const playerCards = deck.slice(0, 5)
    const enemyCards = deck.slice(5, 10)
    const remainingDeck = deck.slice(10)

    const playerState = initializePlayer(playerCharacter)
    const enemyState = initializeEnemy(enemyCharacter)

    const newGameState: GameState = {
      player: {
        character: playerCharacter,
        cards: playerCards,
        currentHp: playerState.currentHp,
        maxHp: playerState.maxHp,
        hand: evaluateHand(playerCards),
        attackAction: '',
        defenseAction: ''
      },
      enemy: {
        character: enemyCharacter,
        cards: enemyCards,
        currentHp: enemyState.currentHp,
        maxHp: enemyState.maxHp,
        hand: evaluateHand(enemyCards),
        attackAction: '',
        defenseAction: ''
      },
      deck: remainingDeck,
      discardPile: [],
      turn: 1,
      phase: 'battle',
      isPlayerTurn: true,
      gameLog: []
    }

    setGameState(newGameState)
    setGamePhase('battle')
  }

  const handleGameAction = (action: GameAction) => {
    if (!gameState) return

    const newGameState = { ...gameState }

    switch (action.type) {
      case 'exchange':
        if (action.cardsToExchange && action.cardsToExchange.length > 0) {
          const newCards = [...newGameState.player.cards]
          action.cardsToExchange.forEach(index => {
            if (newGameState.deck.length > 0) {
              newCards[index] = newGameState.deck.pop()!
            }
          })
          newGameState.player.cards = newCards
          newGameState.player.hand = evaluateHand(newCards)
        }
        break

      case 'decide':
        const playerStrength = newGameState.player.hand?.strength || 0
        const enemyStrength = newGameState.enemy.hand?.strength || 0
        
        let damage = 0
        if (playerStrength > enemyStrength) {
          damage = 20 + Math.floor(Math.random() * 20)
          newGameState.enemy.currentHp = Math.max(0, newGameState.enemy.currentHp - damage)
        } else if (enemyStrength > playerStrength) {
          damage = 20 + Math.floor(Math.random() * 20)
          newGameState.player.currentHp = Math.max(0, newGameState.player.currentHp - damage)
        }

        if (newGameState.player.currentHp <= 0) {
          setWinner('enemy')
          setGamePhase('result')
        } else if (newGameState.enemy.currentHp <= 0) {
          setWinner('player')
          setGamePhase('result')
        } else {
          const deck = createDeck()
          const playerCards = deck.slice(0, 5)
          const enemyCards = deck.slice(5, 10)
          
          newGameState.player.cards = playerCards
          newGameState.player.hand = evaluateHand(playerCards)
          newGameState.enemy.cards = enemyCards
          newGameState.enemy.hand = evaluateHand(enemyCards)
          newGameState.deck = deck.slice(10)
          newGameState.turn += 1
        }
        break
    }

    setGameState(newGameState)
  }

  const handleReplay = () => {
    if (gameState) {
      handleStartGame(gameState.player.character, gameState.enemy.character)
    }
  }

  const handleSelectCharacter = () => {
    setGamePhase('select')
    setGameState(null)
    setWinner(null)
  }

  const renderGameContent = () => {
    switch (gamePhase) {
      case 'select':
        return <CharacterSelect onStartGame={handleStartGame} />
      
      case 'battle':
        return gameState ? (
          <FieldTmp
            gameState={gameState}
            onAction={handleGameAction}
          />
        ) : null
      
      case 'result':
        return gameState && winner ? (
          <GameResult
            gameState={gameState}
            winner={winner}
            onReplay={handleReplay}
            onSelectCharacter={handleSelectCharacter}
            onExit={handleExit}
          />
        ) : null
      
      default:
        return null
    }
  }

  return (
    <Box
      color={colors.text}
      width="100%"
      minHeight="100vh"
      margin="auto"
      bg={colors.base}
      display="flex"
      flexDirection="column"
    >
      <Box flex="1">
        {renderGameContent()}
      </Box>
    </Box>
  )
}