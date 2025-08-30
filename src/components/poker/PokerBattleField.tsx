'use client'

import { Box, VStack, HStack, Image } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Button } from '@/components/ui/button'
import { PokerCard } from './PokerCard'
import { HealthBar } from './HealthBar'
import { DropZone } from './DropZone'
import { PlayerInfo } from './PlayerInfo'
import { CardDiscardArea } from './CardDiscardArea'
import { GameState, GameAction, AttackType, DefenseType, Card } from '@/types/poker/PokerGameTypes'
import { useState, useEffect } from 'react'

interface SlotAttack {
  id: number
  name: string
  baseDamage: number
  target: 'all' | 'random' | 'up' | 'down' | 'left' | 'right'
  baseCooldown: number
  currentCooldown: number
  damageBonus: number
}

interface PokerBattleFieldProps {
  gameState: GameState
  onAction: (action: GameAction) => void
}

export const PokerBattleField = ({ gameState, onAction }: PokerBattleFieldProps) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [attackType, setAttackType] = useState<AttackType>('balance')
  const [defenseType, setDefenseType] = useState<DefenseType>('balance')
  const [playerDiscardedCards, setPlayerDiscardedCards] = useState<Card[][]>(Array(6).fill(null).map(() => []))
  const [enemyDiscardedCards, setEnemyDiscardedCards] = useState<Card[][]>(Array(6).fill(null).map(() => []))
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
  
  // 継続的な攻撃処理用の状態
  const [continuousAttackProgress, setContinuousAttackProgress] = useState(0)
  const [isContinuousAttacking, setIsContinuousAttacking] = useState(false)
  
  // 各スロットの個別プログレス状態
  const [slotProgresses, setSlotProgresses] = useState<number[]>([0, 0, 0, 0, 0, 0])

  const { player, enemy } = gameState

  // gameStateが変更された時にplayerCardsとHPを更新
  useEffect(() => {
    setPlayerCards(gameState.player.cards)
    setEnemyCurrentHp(gameState.enemy.currentHp)
    setPlayerCurrentHp(gameState.player.currentHp)
  }, [gameState.player.cards, gameState.enemy.currentHp, gameState.player.currentHp])

  // 古い攻撃システム - 新しいコールバックシステムで処理されるため無効化
  // useEffect(() => {
    const updateInterval = 100 // 100msごとに更新
    
    const progressTimer = setInterval(() => {
      setSlotAttacks(prevSlotAttacks => {
        const newSlotAttacks = [...prevSlotAttacks]
        const newSlotProgresses = [...slotProgresses]
        
        prevSlotAttacks.forEach((attack, index) => {
          // 常にクールダウンを進める
          const newCooldown = Math.max(0, attack.currentCooldown - updateInterval)
          newSlotAttacks[index] = {
            ...attack,
            currentCooldown: newCooldown
          }
          
          // 攻撃実行チェック
          if (attack.currentCooldown > 0 && newCooldown <= 0) {
            // 攻撃実行
            if (playerDiscardedCards[index].length > 0) {
              const damage = attack.baseDamage + attack.damageBonus
              console.log(`${attack.name} が ${damage} ダメージ（+${attack.damageBonus}ボーナス）を与えました！`)
              setEnemyCurrentHp(prevHp => Math.max(0, prevHp - damage))
            } else {
              const damage = attack.baseDamage
              console.log(`${attack.name} が ${damage} ダメージ（基本攻撃）を与えました！`)
              setEnemyCurrentHp(prevHp => Math.max(0, prevHp - damage))
            }
            
            // クールダウンをリセット
            newSlotAttacks[index].currentCooldown = attack.baseCooldown
          }
          
          // プログレス更新
          const currentCooldown = newSlotAttacks[index].currentCooldown
          const progressPercent = ((attack.baseCooldown - currentCooldown) / attack.baseCooldown) * 100
          newSlotProgresses[index] = Math.min(100, Math.max(0, progressPercent))
        })
        
        setSlotProgresses(newSlotProgresses)
        return newSlotAttacks
      })
    }, updateInterval)
    
    // return () => {
    //   clearInterval(progressTimer)
    // }
  // }, [playerDiscardedCards, slotProgresses])


  const handleCardSelect = (cardIndex: number) => {
    // 捨てたカードをクリックした場合、手札に戻す
    if (discardedCardIndices.has(cardIndex)) {
      handleReturnDiscardedCard(cardIndex)
      return
    }
    
    setSelectedCards(prev => 
      prev.includes(cardIndex) 
        ? prev.filter(i => i !== cardIndex)
        : [...prev, cardIndex]
    )
  }

  const handleReturnDiscardedCard = (cardIndex: number) => {
    // マッピングから該当するカードの位置情報を取得
    const cardPosition = discardedCardMapping.get(cardIndex)
    if (!cardPosition) return
    
    const { slotIndex, stackIndex } = cardPosition
    const newDiscardedCards = [...playerDiscardedCards]
    
    // 指定されたスロットから指定されたスタック位置のカードを削除
    if (newDiscardedCards[slotIndex] && newDiscardedCards[slotIndex].length > stackIndex) {
      // 該当するカードを削除
      newDiscardedCards[slotIndex] = newDiscardedCards[slotIndex].filter((_, index) => index !== stackIndex)
      
      // 削除したカードより上にあるカードのstackIndexを更新
      const newMapping = new Map(discardedCardMapping)
      for (const [cardIdx, position] of discardedCardMapping.entries()) {
        if (position.slotIndex === slotIndex && position.stackIndex > stackIndex) {
          newMapping.set(cardIdx, { slotIndex, stackIndex: position.stackIndex - 1 })
        }
      }
      // 削除したカードのマッピングを削除
      newMapping.delete(cardIndex)
      
      setPlayerDiscardedCards(newDiscardedCards)
      setDiscardedCardMapping(newMapping)
      
      // 捨てたカードのインデックスから削除
      const newDiscardedIndices = new Set(discardedCardIndices)
      newDiscardedIndices.delete(cardIndex)
      setDiscardedCardIndices(newDiscardedIndices)
    }
  }

  const handleExchange = () => {
    // 捨てたカードの数を数える
    const discardedCount = discardedCardIndices.size
    
    if (discardedCount === 0) {
      alert('交換するカードがありません')
      return
    }
    
    // 捨てたカードを手札から削除
    const newPlayerCards = playerCards.filter((_, index) => !discardedCardIndices.has(index))
    
    // 山札から新しいカードを補充（デモ用：ランダムなカードを生成）
    const suits = ['hearts', 'diamonds', 'clubs', 'spades']
    const newCards: Card[] = []
    
    for (let i = 0; i < discardedCount; i++) {
      const randomSuit = suits[Math.floor(Math.random() * suits.length)]
      const randomRank = Math.floor(Math.random() * 13) + 1
      const newCard: Card = {
        id: `new-${Date.now()}-${i}`,
        suit: randomSuit as 'hearts' | 'diamonds' | 'clubs' | 'spades',
        rank: randomRank
      }
      newCards.push(newCard)
    }
    
    // 新しい手札を設定
    const updatedPlayerCards = [...newPlayerCards, ...newCards]
    setPlayerCards(updatedPlayerCards)
    
    // プログレスバーの処理を開始
    setIsProcessing(true)
    setProgressValue(0)
    setIsContinuousAttacking(true)
    setSlotProgresses([0, 0, 0, 0, 0, 0])
    
    // プログレスバーのアニメーション
    const totalDuration = 10000 // 10000ms（10秒）
    const updateInterval = 100 // 100msごとに更新
    const steps = totalDuration / updateInterval
    let currentStep = 0
    
    const progressTimer = setInterval(() => {
      currentStep++
      const progress = (currentStep / steps) * 100
      setProgressValue(progress)
      
      // 各スロットの個別攻撃処理
      const newSlotAttacks = [...slotAttacks]
      const newSlotProgresses = [...slotProgresses]
      
      slotAttacks.forEach((attack, index) => {
        // 全スロット常にクールダウンを進める
        newSlotAttacks[index] = {
          ...attack,
          currentCooldown: Math.max(0, attack.currentCooldown - updateInterval)
        }
        
        // 攻撃実行チェック
        if (newSlotAttacks[index].currentCooldown <= 0 && attack.currentCooldown > 0) {
          // カードがある場合のみ攻撃実行
          if (playerDiscardedCards[index].length > 0) {
            // 個別攻撃実行（カードありの場合、ダメージボーナス適用）
            const damage = attack.baseDamage + attack.damageBonus
            console.log(`${attack.name} が ${damage} ダメージ（+${attack.damageBonus}ボーナス）を与えました！`)
            
            // 敵のHPを即座に減らす
            setEnemyCurrentHp(prevHp => Math.max(0, prevHp - damage))
          } else {
            // カードがない場合は基本ダメージのみ
            const damage = attack.baseDamage
            console.log(`${attack.name} が ${damage} ダメージ（基本攻撃）を与えました！`)
            
            // 敵のHPを即座に減らす
            setEnemyCurrentHp(prevHp => Math.max(0, prevHp - damage))
          }
          
          // クールダウンを満タンにリセットして次の攻撃サイクル開始
          newSlotAttacks[index].currentCooldown = attack.baseCooldown
        }
        
        // プログレス更新（攻撃後も含めて毎回計算）
        const currentCooldown = newSlotAttacks[index].currentCooldown
        const progressPercent = ((attack.baseCooldown - currentCooldown) / attack.baseCooldown) * 100
        newSlotProgresses[index] = Math.min(100, Math.max(0, progressPercent))
      })
      
      setSlotAttacks(newSlotAttacks)
      setSlotProgresses(newSlotProgresses)
      
      if (currentStep >= steps) {
        clearInterval(progressTimer)
        
        // 10000ms進行させてクールダウンを進める
        progressCooldowns(10000)
        
        // 最終攻撃を実行
        executeAttacks()
        
        // 状態をクリア（攻撃実行後に行う）
        setDiscardedCardIndices(new Set())
        setDiscardedCardMapping(new Map())
        setPlayerDiscardedCards(Array(6).fill(null).map(() => []))
        setSelectedCards([])
        
        // 攻撃力ボーナスもリセット
        const resetSlotAttacks = slotAttacks.map(attack => ({
          ...attack,
          damageBonus: 0
        }))
        setSlotAttacks(resetSlotAttacks)
        
        // プログレスバーを非表示
        setIsContinuousAttacking(false)
        setTimeout(() => {
          setIsProcessing(false)
          setProgressValue(0)
          setSlotProgresses([0, 0, 0, 0, 0, 0])
        }, 500) // 0.5秒後に非表示
      }
    }, updateInterval)
    
    // ゲーム状態を更新（実際のゲームロジックに合わせて調整）
    onAction({
      type: 'exchange',
      cardsToExchange: Array.from(discardedCardIndices)
    })
  }

  const handleDecide = () => {
    onAction({
      type: 'decide',
      attackType,
      defenseType
    })
  }

  const handlePlayerDropCard = (slotIndex: number, card: Card) => {
    const cardWithIndex = card as Card & { cardIndex?: number }
    if (cardWithIndex.cardIndex !== undefined) {
      // 捨てたカードのインデックスを記録（手札からは削除しない）
      const newDiscardedIndices = new Set(discardedCardIndices)
      newDiscardedIndices.add(cardWithIndex.cardIndex)
      setDiscardedCardIndices(newDiscardedIndices)
      
      // プレイヤーのドロップゾーンにカードを追加
      const removedCard = playerCards[cardWithIndex.cardIndex]
      const newDiscardedCards = [...playerDiscardedCards]
      const stackIndex = newDiscardedCards[slotIndex].length
      newDiscardedCards[slotIndex] = [...newDiscardedCards[slotIndex], removedCard]
      setPlayerDiscardedCards(newDiscardedCards)
      
      // カードの位置情報をマッピングに記録
      const newMapping = new Map(discardedCardMapping)
      newMapping.set(cardWithIndex.cardIndex, { slotIndex, stackIndex })
      setDiscardedCardMapping(newMapping)
      
      // そのスロットの攻撃力にボーナスを追加
      const newSlotAttacks = [...slotAttacks]
      newSlotAttacks[slotIndex] = {
        ...newSlotAttacks[slotIndex],
        damageBonus: newSlotAttacks[slotIndex].damageBonus + 1
      }
      setSlotAttacks(newSlotAttacks)
      
      // 選択されたカードをクリア
      setSelectedCards([])
    }
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
    const slotCards = playerDiscardedCards[slotIndex]
    if (slotCards && slotCards.length > 0) {
      // 一番上のカードのスタックインデックス
      const topStackIndex = slotCards.length - 1
      
      // マッピングから該当するカードインデックスを見つける
      let cardIndexToRemove = -1
      for (const [cardIdx, position] of discardedCardMapping.entries()) {
        if (position.slotIndex === slotIndex && position.stackIndex === topStackIndex) {
          cardIndexToRemove = cardIdx
          break
        }
      }
      
      if (cardIndexToRemove !== -1) {
        // 捨てたカードのインデックスから削除
        const newDiscardedIndices = new Set(discardedCardIndices)
        newDiscardedIndices.delete(cardIndexToRemove)
        setDiscardedCardIndices(newDiscardedIndices)
        
        // マッピングから削除
        const newMapping = new Map(discardedCardMapping)
        newMapping.delete(cardIndexToRemove)
        setDiscardedCardMapping(newMapping)
      }
      
      // ドロップゾーンから一番上のカードを削除
      const newDiscardedCards = [...playerDiscardedCards]
      newDiscardedCards[slotIndex] = slotCards.slice(0, -1)
      setPlayerDiscardedCards(newDiscardedCards)
    }
  }

  const handleEnemyDropCard = (slotIndex: number, card: Card) => {
    // 相手のカードドロップ処理（デモ用）
    console.log(`Enemy dropped card to slot ${slotIndex}`)
  }

  const handleEnemyRemoveCard = (slotIndex: number) => {
    // 相手のカード削除処理（デモ用）
    console.log(`Enemy removed card from slot ${slotIndex}`)
  }

  // 攻撃実行関数
  const executeAttacks = () => {
    const newSlotAttacks = [...slotAttacks]
    let totalDamage = 0
    
    newSlotAttacks.forEach((attack, index) => {
      if (attack.currentCooldown <= 0 && playerDiscardedCards[index].length > 0) {
        // 攻撃を実行
        const damage = attack.baseDamage + attack.damageBonus
        totalDamage += damage
        
        // クールダウンをリセット
        newSlotAttacks[index] = {
          ...attack,
          currentCooldown: attack.baseCooldown
        }
        
        console.log(`${attack.name} が ${damage} ダメージを与えました！`)
      }
    })
    
    if (totalDamage > 0) {
      // 実際のダメージ処理
      console.log(`合計 ${totalDamage} ダメージを敵に与えました！`)
      
      // 敵のHPを直接減らす
      const newEnemyHp = Math.max(0, enemyCurrentHp - totalDamage)
      setEnemyCurrentHp(newEnemyHp)
      
      // 敵のHPを減らすアクションを発行（ゲームシステム用）
      onAction({
        type: 'dealDamage',
        target: 'enemy',
        damage: totalDamage
      } as any)
    }
    
    setSlotAttacks(newSlotAttacks)
  }

  // クールダウンを進める関数
  const progressCooldowns = (timeMs: number) => {
    const newSlotAttacks = slotAttacks.map(attack => ({
      ...attack,
      currentCooldown: Math.max(0, attack.currentCooldown - timeMs)
    }))
    setSlotAttacks(newSlotAttacks)
  }

  const attackOptions: { value: AttackType; label: string }[] = [
    { value: 'balance', label: 'バランス' },
    { value: 'full', label: '全力攻撃' },
    { value: 'light', label: '牽制攻撃' }
  ]

  const defenseOptions: { value: DefenseType; label: string }[] = [
    { value: 'balance', label: 'バランス' },
    { value: 'royal_straight_flush', label: 'RSフラッシュ' },
    { value: 'straight_flush', label: 'Sフラッシュ' },
    { value: 'four_of_a_kind', label: 'フォーカード' },
    { value: 'full_house', label: 'フルハウス' },
    { value: 'flush', label: 'フラッシュ' },
    { value: 'straight', label: 'ストレート' },
    { value: 'three_of_a_kind', label: 'スリーカード' },
    { value: 'two_pair', label: 'ツーペア' },
    { value: 'one_pair', label: 'ワンペア' },
    { value: 'high_card', label: '役なし' }
  ]

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
        {/* 上部: 敵のカード表示 */}
        <VStack gap={3} padding={4} bg="rgba(255, 255, 255, 0.1)" borderRadius="lg" margin={4}>
          <HStack gap={2}>
            {enemy.cards.map((_, index) => (
              <PokerCard key={index} isBack={true} size="md" />
            ))}
          </HStack>
          
          {/* 敵の役表示 */}
          <Box
            bg="rgba(255, 255, 255, 0.9)"
            padding={3}
            borderRadius="md"
            border="2px solid"
            borderColor="red.500"
          >
            <Text
              text={enemy.hand?.role || "役を判定中..."}
              fontSize={16}
              fontWeight="bold"
              color="red.600"
              textAlign="center"
            />
          </Box>
        </VStack>

        {/* 中央: ゲームフィールド */}
        <Box flex="1" display="flex" alignItems="center" justifyContent="center" padding={4}>
          {/* VS表示のみ */}
          <Box
            bg="rgba(255, 255, 255, 0.1)"
            padding={2}
            borderRadius="full"
            width="60px"
            height="60px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text text="VS" fontSize={20} fontWeight="bold" color="white" />
          </Box>
        </Box>

        {/* 下部: プレイヤーの情報 */}
        <Box padding={4} bg="rgba(255, 255, 255, 0.1)" borderRadius="lg" margin={4}>
          <VStack gap={4}>
            {/* プレイヤーの役表示とボタン */}
            <HStack gap={4} justifyContent="center">
              <Box
                bg="rgba(255, 255, 255, 0.9)"
                padding={3}
                borderRadius="md"
                border="2px solid"
                borderColor="blue.500"
              >
                <Text
                  text={player.hand?.role || "役を判定中..."}
                  fontSize={16}
                  fontWeight="bold"
                  color="blue.600"
                  textAlign="center"
                />
              </Box>
              
              <Button
                onClick={handleExchange}
                colorScheme="blue"
                size="lg"
                disabled={!gameState.isPlayerTurn || discardedCardIndices.size === 0 || isProcessing}
              >
                手札交換 ({discardedCardIndices.size}枚)
              </Button>
              
              <Button
                onClick={handleDecide}
                colorScheme="red"
                size="lg"
                disabled={!gameState.isPlayerTurn || isProcessing}
              >
                決定
              </Button>
            </HStack>
            
            {/* プログレスバー */}
            {isProcessing && (
              <Box width="300px" padding={2}>
                <VStack gap={2}>
                  <Text 
                    text="攻撃処理中..." 
                    fontSize={14} 
                    fontWeight="bold" 
                    color="white" 
                    textAlign="center"
                  />
                  <Box
                    width="100%"
                    height="12px"
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
                      text={`${Math.round(progressValue)}%`} 
                      fontSize={12} 
                      color="white" 
                      textAlign="center"
                    />
                    <Text 
                      text={`${Math.round((progressValue / 100) * 10000)}ms / 10000ms`} 
                      fontSize={10} 
                      color="gray.300" 
                      textAlign="center"
                    />
                  </HStack>
                </VStack>
              </Box>
            )}
            
            {/* 継続的な攻撃プログレスバー */}
            {isContinuousAttacking && isProcessing && (
              <Box width="250px" padding={2}>
                <VStack gap={2}>
                  <Text 
                    text="自動攻撃中..." 
                    fontSize={12} 
                    fontWeight="bold" 
                    color="orange.300" 
                    textAlign="center"
                  />
                  <Box
                    width="100%"
                    height="8px"
                    bg="rgba(255, 165, 0, 0.3)"
                    borderRadius="md"
                    overflow="hidden"
                  >
                    <Box
                      width={`${continuousAttackProgress}%`}
                      height="100%"
                      bg="orange.500"
                      borderRadius="md"
                      transition="width 0.1s linear"
                    />
                  </Box>
                  <Text 
                    text={`${Math.round(continuousAttackProgress * 10)}ms / 1000ms`} 
                    fontSize={8} 
                    color="orange.200" 
                    textAlign="center"
                  />
                </VStack>
              </Box>
            )}
            
            {/* プレイヤー手札 */}
            <HStack gap={2} justifyContent="center">
              {playerCards.map((card, index) => (
                <PokerCard
                  key={`${card.id}-${index}`}
                  card={card}
                  isSelected={selectedCards.includes(index)}
                  onClick={() => handleCardSelect(index)}
                  size="md"
                  isDraggable={true}
                  cardIndex={index}
                  isDiscarded={discardedCardIndices.has(index)}
                />
              ))}
            </HStack>
          </VStack>
        </Box>
      </Box>

      {/* プレイヤー情報 - 画面左下 */}
      <Box position="absolute" bottom={4} left={4}>
        <PlayerInfo player={{ ...player, currentHp: playerCurrentHp }} />
      </Box>

      {/* 相手情報 - 画面右上 */}
      <Box position="absolute" top={4} right={4}>
        <PlayerInfo player={{ ...enemy, currentHp: enemyCurrentHp }} />
      </Box>

      {/* プレイヤーのカード捨て場 - 画面右のやや下側 */}
      <Box position="absolute" right="15%" bottom="25%">
        <CardDiscardArea
          cards={playerDiscardedCards}
          onDrop={handlePlayerDropCard}
          onRemoveCard={handlePlayerRemoveCard}
          showControls={true}
          position="bottom"
          attackType={attackType}
          defenseType={defenseType}
          onAttackTypeChange={setAttackType}
          onDefenseTypeChange={setDefenseType}
          slotAttacks={slotAttacks}
          slotProgresses={slotProgresses}
          isProcessing={isProcessing}
          onAttackExecute={handlePlayerAttackExecute}
        />
      </Box>

      {/* 相手のカード捨て場 - 画面左のやや上側 */}
      <Box position="absolute" left="15%" top="25%">
        <CardDiscardArea
          cards={enemyDiscardedCards}
          onDrop={handleEnemyDropCard}
          onRemoveCard={handleEnemyRemoveCard}
          showControls={true}
          position="top"
          attackType="balance"
          defenseType="balance"
          onAttackExecute={handleEnemyAttackExecute}
        />
      </Box>
    </Box>
  )
}