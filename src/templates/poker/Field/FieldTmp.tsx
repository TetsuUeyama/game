'use client'

import { useState, useEffect } from 'react'
import { Box } from '@chakra-ui/react'
import { GameState, GameAction, AttackType, DefenseType, Card } from '@/types/poker/PokerGameTypes'
import { PlayerTmp } from '../PlayerTmp'
import { EnemyTmp } from '../EnemyTmp'
import { 
  SlotAttack, 
  handleCardExchange, 
  handleDropCard, 
  handleRemoveCard, 
  handleReturnDiscardedCard 
} from '@/utils/cardExchange'
import { BattleAreaTmp } from '../BattleAreaTmp'


interface FieldTmpProps {
  gameState: GameState
  onAction: (action: GameAction) => void
}

export const FieldTmp = ({ gameState, onAction }: FieldTmpProps) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [attackType, setAttackType] = useState<AttackType>('balance')
  const [defenseType, setDefenseType] = useState<DefenseType>('balance')
  const [playerDiscardedCards, setPlayerDiscardedCards] = useState<Card[][]>(Array(6).fill(null).map(() => []))
  const [enemyDiscardedCards] = useState<Card[][]>(Array(6).fill(null).map(() => []))
  const [playerCards, setPlayerCards] = useState<Card[]>(gameState.player.cards)
  const [discardedCardIndices, setDiscardedCardIndices] = useState<Set<number>>(new Set())
  const [discardedCardMapping, setDiscardedCardMapping] = useState<Map<number, { slotIndex: number, stackIndex: number }>>(new Map())
  
  // 各スロットの攻撃機能
  const [slotAttacks, setSlotAttacks] = useState<SlotAttack[]>([
    { id: 0, name: '全体攻撃', baseDamage: 1, target: 'all', baseCooldown: 1000, currentCooldown: 0, damageBonus: 0 },
    { id: 1, name: 'ランダム攻撃', baseDamage: 3, target: 'random', baseCooldown: 1200, currentCooldown: 0, damageBonus: 0 },
    { id: 2, name: '上攻撃', baseDamage: 2, target: 'up', baseCooldown: 1400, currentCooldown: 0, damageBonus: 0 },
    { id: 3, name: '下攻撃', baseDamage: 2, target: 'down', baseCooldown: 1600, currentCooldown: 0, damageBonus: 0 },
    { id: 4, name: '右攻撃', baseDamage: 2, target: 'right', baseCooldown: 1800, currentCooldown: 0, damageBonus: 0 },
    { id: 5, name: '左攻撃', baseDamage: 2, target: 'left', baseCooldown: 2000, currentCooldown: 0, damageBonus: 0 }
  ])
  
  // プログレスバー用の状態
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  
  // HP管理用の状態
  const [enemyCurrentHp, setEnemyCurrentHp] = useState(gameState.enemy.currentHp)
  const [playerCurrentHp, setPlayerCurrentHp] = useState(gameState.player.currentHp)
  
  
  // 各スロットの個別プログレス状態
  const [slotProgresses, setSlotProgresses] = useState<number[]>([0, 0, 0, 0, 0, 0])

  const { player, enemy } = gameState

  // gameStateが変更された時にplayerCardsとHPを更新
  useEffect(() => {
    setPlayerCards(gameState.player.cards)
    setEnemyCurrentHp(gameState.enemy.currentHp)
    setPlayerCurrentHp(gameState.player.currentHp)
  }, [gameState.player.cards, gameState.enemy.currentHp, gameState.player.currentHp])

  const handleCardSelect = (cardIndex: number) => {
    // 捨てたカードをクリックした場合、手札に戻す
    if (discardedCardIndices.has(cardIndex)) {
      handleReturnDiscardedCardLocal(cardIndex)
      return
    }
    
    setSelectedCards(prev => 
      prev.includes(cardIndex) 
        ? prev.filter(i => i !== cardIndex)
        : [...prev, cardIndex]
    )
  }

  const handleReturnDiscardedCardLocal = (cardIndex: number) => {
    const state = {
      playerCards,
      discardedCardIndices,
      discardedCardMapping,
      playerDiscardedCards,
      slotAttacks
    }
    
    const actions = {
      setPlayerCards,
      setDiscardedCardIndices,
      setDiscardedCardMapping,
      setPlayerDiscardedCards,
      setSlotAttacks,
      setSelectedCards,
      onAction
    }
    
    handleReturnDiscardedCard(cardIndex, state, actions)
  }

  const handleExchange = () => {
    const state = {
      playerCards,
      discardedCardIndices,
      discardedCardMapping,
      playerDiscardedCards,
      slotAttacks
    }
    
    const actions = {
      setPlayerCards,
      setDiscardedCardIndices,
      setDiscardedCardMapping,
      setPlayerDiscardedCards,
      setSlotAttacks,
      setSelectedCards,
      onAction
    }
    
    handleCardExchange(
      state,
      actions,
      setIsProcessing,
      setProgressValue,
      () => {}, // no-op for setIsContinuousAttacking
      setSlotProgresses,
      setEnemyCurrentHp
    )
  }

  const handleDecide = () => {
    onAction({
      type: 'decide',
      attackType,
      defenseType
    })
  }

  const handlePlayerDropCard = (slotIndex: number, card: Card) => {
    const state = {
      playerCards,
      discardedCardIndices,
      discardedCardMapping,
      playerDiscardedCards,
      slotAttacks
    }
    
    const actions = {
      setPlayerCards,
      setDiscardedCardIndices,
      setDiscardedCardMapping,
      setPlayerDiscardedCards,
      setSlotAttacks,
      setSelectedCards,
      onAction
    }
    
    handleDropCard(slotIndex, card, state, actions)
  }

  // 攻撃実行時のハンドラー
  const handlePlayerAttackExecute = (slotIndex: number, attack: SlotAttack) => {
    const damage = attack.baseDamage + attack.damageBonus
    console.log(`スロット${slotIndex}: ${attack.name}で${damage}ダメージ！`)
    setEnemyCurrentHp(prevHp => Math.max(0, prevHp - damage))
  }

  const handleEnemyAttackExecute = (slotIndex: number, attack: SlotAttack) => {
    const damage = attack.baseDamage + attack.damageBonus
    console.log(`敵スロット${slotIndex}: ${attack.name}で${damage}ダメージ！`)
    setPlayerCurrentHp(prevHp => Math.max(0, prevHp - damage))
  }

  const handlePlayerRemoveCard = (slotIndex: number) => {
    const state = {
      playerCards,
      discardedCardIndices,
      discardedCardMapping,
      playerDiscardedCards,
      slotAttacks
    }
    
    const actions = {
      setPlayerCards,
      setDiscardedCardIndices,
      setDiscardedCardMapping,
      setPlayerDiscardedCards,
      setSlotAttacks,
      setSelectedCards,
      onAction
    }
    
    handleRemoveCard(slotIndex, state, actions)
  }

  const handleEnemyDropCard = (slotIndex: number, _card: Card) => {
    // 相手のカードドロップ処理（デモ用）
    console.log(`Enemy dropped card to slot ${slotIndex}`)
  }

  const handleEnemyRemoveCard = (slotIndex: number) => {
    // 相手のカード削除処理（デモ用）
    console.log(`Enemy removed card from slot ${slotIndex}`)
  }

  return (
    <Box
      // width="100%"
      minHeight="100vh"
      bg="green.800"
      backgroundImage="url('/poker/images/board.png')"
      backgroundSize="cover"
      backgroundPosition="center"
      position="relative"
      display="flex"
      flexDirection="column"
    >
      <Box
        // position="absolute"
        inset="0"
        // bg="rgba(0, 0, 0, 0.3)"
        display="flex"
        flexDirection="column"
        height="100vh"
        px={4}
      >
        {/* 上面合わせ: 敵関連 */}
        <Box flex="1" display="flex" alignItems="flex-start" justifyContent="center">
          <EnemyTmp
            enemy={{ ...enemy, currentHp: enemyCurrentHp }}
            enemyDiscardedCards={enemyDiscardedCards}
            onDropCard={handleEnemyDropCard}
            onRemoveCard={handleEnemyRemoveCard}
            onAttackExecute={handleEnemyAttackExecute}
            showTopCards={true}
          />
        </Box>

        {/* センター: BattleAreaTmp */}
        <Box flex="1" display="flex" alignItems="center" justifyContent="center" bg="rgba(0, 0, 0, 0.3)">
          <BattleAreaTmp />
        </Box>

        {/* 下面合わせ: プレイヤー関連 */}
        <Box flex="1" display="flex" alignItems="flex-end" justifyContent="center">
          <PlayerTmp
            player={{ ...player, currentHp: playerCurrentHp, cards: playerCards }}
            selectedCards={selectedCards}
            discardedCardIndices={discardedCardIndices}
            playerDiscardedCards={playerDiscardedCards}
            attackType={attackType}
            defenseType={defenseType}
            slotAttacks={slotAttacks}
            slotProgresses={slotProgresses}
            isProcessing={isProcessing}
            onCardSelect={handleCardSelect}
            onExchange={handleExchange}
            onDecide={handleDecide}
            onDropCard={handlePlayerDropCard}
            onRemoveCard={handlePlayerRemoveCard}
            onAttackTypeChange={setAttackType}
            onDefenseTypeChange={setDefenseType}
            onAttackExecute={handlePlayerAttackExecute}
            progressValue={progressValue}
          />
        </Box>
      </Box>
    </Box>
  )
}