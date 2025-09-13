'use client'

import { useState, useEffect } from 'react'
import { Box, VStack, HStack, Text } from '@chakra-ui/react'
import { Button } from '@/components/ui/button'
import { GameState, GameAction, AttackType, DefenseType, Card } from '@/types/poker/PokerGameTypes'
import { PlayerTmp } from './PlayerTmp'
import { EnemyTmp } from './EnemyTmp'
import { 
  SlotAttack, 
  handleCardExchange, 
  handleDropCard, 
  handleRemoveCard, 
  handleReturnDiscardedCard 
} from '@/utils/cardExchange'


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
      width="100%"
      minHeight="100vh"
      bg="green.800"
      backgroundImage="url('/poker/images/board.png')"
      backgroundSize="cover"
      backgroundPosition="center"
      position="relative"
    >
      <Box
        position="absolute"
        inset="0"
        bg="rgba(0, 0, 0, 0.3)"
        display="flex"
        flexDirection="column"
      >
        {/* 上部: 敵関連をEnemyTmpに統一 */}
        <EnemyTmp
          enemy={{ ...enemy, currentHp: enemyCurrentHp }}
          enemyDiscardedCards={enemyDiscardedCards}
          onDropCard={handleEnemyDropCard}
          onRemoveCard={handleEnemyRemoveCard}
          onAttackExecute={handleEnemyAttackExecute}
          showTopCards={true}
        />
      </Box>

      {/* 手札交換・決定ボタンとプログレスバー - 中央 */}
      <Box position="absolute" bottom="30%" right="20.7%" transform="translate(-50%, -50%)" zIndex={15}>
        <VStack>
          {/* ボタン群 */}
          <HStack>
            <Button
              onClick={handleExchange}
              colorScheme="blue"
              size="lg"
              disabled={discardedCardIndices.size === 0 || isProcessing}
            >
              手札交換 ({discardedCardIndices.size}枚)
            </Button>
            
            <Button
              onClick={handleDecide}
              colorScheme="red"
              size="lg"
              disabled={isProcessing}
            >
              決定
            </Button>
          </HStack>

          {/* プログレスバー */}
          {isProcessing && (
            <Box width="400px" padding={4} bg="rgba(0, 0, 0, 0.8)" borderRadius="md">
              <VStack>
                <Text 
                  fontSize={16} 
                  fontWeight="bold" 
                  color="white" 
                  textAlign="center"
                >
                  攻撃処理中...
                </Text>
                <Box
                  width="100%"
                  height="16px"
                  bg="rgba(255, 255, 255, 0.3)"
                  borderRadius="md"
                  overflow="hidden"
                >
                  <Box
                    width={`${progressValue}%`}
                    height="100%"
                    bg="red.500"
                    borderRadius="md"
                    transition="width 0.05s linear"
                  />
                </Box>
                <HStack justifyContent="space-between" width="100%">
                  <Text 
                    fontSize={14} 
                    color="white" 
                    textAlign="center"
                  >
                    {Math.round(progressValue)}%
                  </Text>
                  <Text 
                    fontSize={12} 
                    color="gray.300" 
                    textAlign="center"
                  >
                    {Math.round((progressValue / 100) * 10000)}ms / 10000ms
                  </Text>
                </HStack>
              </VStack>
            </Box>
          )}
        </VStack>
      </Box>

      {/* プレイヤー関連をPlayerTmpに統一 */}
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
  )
}