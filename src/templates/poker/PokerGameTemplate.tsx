'use client'

import { useState } from 'react'
import { CharacterSelect } from '@/components/poker/CharacterSelect'
import { PokerBattleField } from '@/components/poker/PokerBattleField'
import { GameResult } from '@/components/poker/GameResult'
import { Character, GameState, GameAction, Card } from '@/types/poker/PokerGameTypes'

interface PokerGameTemplateProps {
  onExit: () => void
}

export const PokerGameTemplate = ({ onExit }: PokerGameTemplateProps) => {
  const [gamePhase, setGamePhase] = useState<'select' | 'battle' | 'result'>('select')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [winner, setWinner] = useState<'player' | 'enemy' | null>(null)

  // カードデッキを生成
  const createDeck = (): Card[] => {
    const suits: Array<'spades' | 'hearts' | 'diamonds' | 'clubs'> = ['spades', 'hearts', 'diamonds', 'clubs']
    const deck: Card[] = []
    
    suits.forEach((suit, suitIndex) => {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({
          id: suitIndex * 13 + rank,
          suit,
          rank,
          image: `/poker/images/${suitIndex * 13 + rank}.png`
        })
      }
    })
    
    // シャッフル
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    
    return deck
  }

  // HPを文字ランクから数値に変換
  const rankToHp = (rank: string): number => {
    switch (rank) {
      case 'A': return 120
      case 'B': return 100
      case 'C': return 80
      default: return 100
    }
  }

  // ポーカーの役判定
  const evaluateHand = (cards: Card[]): { role: string; strength: number } => {
    if (!cards || cards.length !== 5) {
      return { role: '役なし', strength: 0 }
    }

    const ranks = cards.map(card => card.rank).sort((a, b) => a - b)
    const suits = cards.map(card => card.suit)
    
    // 同じスートかチェック
    const isFlush = suits.every(suit => suit === suits[0])
    
    // ストレートかチェック
    const isStraight = ranks.every((rank, index) => 
      index === 0 || rank === ranks[index - 1] + 1
    )
    
    // 各ランクの出現回数をカウント
    const rankCounts = ranks.reduce((acc, rank) => {
      acc[rank] = (acc[rank] || 0) + 1
      return acc
    }, {} as Record<number, number>)
    
    const counts = Object.values(rankCounts).sort((a, b) => b - a)
    
    // 役判定
    if (isFlush && isStraight && ranks[0] === 10) {
      return { role: 'ロイヤルストレートフラッシュ', strength: 10 }
    }
    if (isFlush && isStraight) {
      return { role: 'ストレートフラッシュ', strength: 9 }
    }
    if (counts[0] === 4) {
      return { role: 'フォーカード', strength: 8 }
    }
    if (counts[0] === 3 && counts[1] === 2) {
      return { role: 'フルハウス', strength: 7 }
    }
    if (isFlush) {
      return { role: 'フラッシュ', strength: 6 }
    }
    if (isStraight) {
      return { role: 'ストレート', strength: 5 }
    }
    if (counts[0] === 3) {
      return { role: 'スリーカード', strength: 4 }
    }
    if (counts[0] === 2 && counts[1] === 2) {
      return { role: 'ツーペア', strength: 3 }
    }
    if (counts[0] === 2) {
      return { role: 'ワンペア', strength: 2 }
    }
    
    return { role: '役なし', strength: 1 }
  }

  const handleStartGame = (playerCharacter: Character, enemyCharacter: Character) => {
    const deck = createDeck()
    const playerCards = deck.slice(0, 5)
    const enemyCards = deck.slice(5, 10)
    const remainingDeck = deck.slice(10)

    const playerHp = rankToHp(playerCharacter.hp)
    const enemyHp = rankToHp(enemyCharacter.hp)

    const newGameState: GameState = {
      player: {
        character: playerCharacter,
        cards: playerCards,
        currentHp: playerHp,
        maxHp: playerHp,
        hand: evaluateHand(playerCards),
        attackAction: '',
        defenseAction: ''
      },
      enemy: {
        character: enemyCharacter,
        cards: enemyCards,
        currentHp: enemyHp,
        maxHp: enemyHp,
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