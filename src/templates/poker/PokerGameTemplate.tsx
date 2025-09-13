'use client'

import { useState } from 'react'
import { CharacterSelect } from '@/components/poker/CharacterSelect'
import { PokerBattleField } from '@/components/poker/PokerBattleField'
import { GameResult } from '@/components/poker/GameResult'
import { Character, GameState, GameAction } from '@/types/poker/PokerGameTypes'
import { createDeck, evaluateHand } from './CardFunction'
import { initializePlayer } from './PlayerTmp'
import { initializeEnemy } from './EnemyTmp'

interface PokerGameTemplateProps {
  onExit: () => void
}

export const PokerGameTemplate = ({ onExit }: PokerGameTemplateProps) => {
  const [gamePhase, setGamePhase] = useState<'select' | 'battle' | 'result'>('select')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [winner, setWinner] = useState<'player' | 'enemy' | null>(null)


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
          // カード交換処理
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
        // バトル処理
        const playerStrength = newGameState.player.hand?.strength || 0
        const enemyStrength = newGameState.enemy.hand?.strength || 0
        
        // 簡単なダメージ計算
        let damage = 0
        if (playerStrength > enemyStrength) {
          damage = 20 + Math.floor(Math.random() * 20)
          newGameState.enemy.currentHp = Math.max(0, newGameState.enemy.currentHp - damage)
        } else if (enemyStrength > playerStrength) {
          damage = 20 + Math.floor(Math.random() * 20)
          newGameState.player.currentHp = Math.max(0, newGameState.player.currentHp - damage)
        }

        // 勝敗判定
        if (newGameState.player.currentHp <= 0) {
          setWinner('enemy')
          setGamePhase('result')
        } else if (newGameState.enemy.currentHp <= 0) {
          setWinner('player')
          setGamePhase('result')
        } else {
          // 新しいターン
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

  switch (gamePhase) {
    case 'select':
      return (
        <CharacterSelect onStartGame={handleStartGame} />
      )
    
    case 'battle':
      return gameState ? (
        <PokerBattleField
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
          onExit={onExit}
        />
      ) : null
    
    default:
      return null
  }
}