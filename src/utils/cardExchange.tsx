import { Card, GameAction } from '@/types/poker/PokerGameTypes'
import { generateRandomCards, removeCardsFromHand } from '@/utils/pokerHands'

export interface SlotAttack {
  id: number
  name: string
  baseDamage: number
  target: 'all' | 'random' | 'up' | 'down' | 'left' | 'right'
  baseCooldown: number
  currentCooldown: number
  damageBonus: number
}

export interface CardExchangeState {
  playerCards: Card[]
  discardedCardIndices: Set<number>
  discardedCardMapping: Map<number, { slotIndex: number, stackIndex: number }>
  playerDiscardedCards: Card[][]
  slotAttacks: SlotAttack[]
}

export interface CardExchangeActions {
  setPlayerCards: (cards: Card[]) => void
  setDiscardedCardIndices: (indices: Set<number>) => void
  setDiscardedCardMapping: (mapping: Map<number, { slotIndex: number, stackIndex: number }>) => void
  setPlayerDiscardedCards: (cards: Card[][]) => void
  setSlotAttacks: (attacks: SlotAttack[]) => void
  setSelectedCards: (cards: number[]) => void
  onAction: (action: GameAction) => void
}

// カード交換処理
export const handleCardExchange = (
  state: CardExchangeState,
  actions: CardExchangeActions,
  setIsProcessing: (processing: boolean) => void,
  setProgressValue: (value: number) => void,
  setIsContinuousAttacking: (attacking: boolean) => void,
  setSlotProgresses: (progresses: number[]) => void,
  setEnemyCurrentHp: (hp: (prevHp: number) => number) => void
) => {
  const discardedCount = state.discardedCardIndices.size
  
  if (discardedCount === 0) {
    alert('交換するカードがありません')
    return
  }
  
  // 捨てたカードを手札から削除
  const newPlayerCards = removeCardsFromHand(state.playerCards, state.discardedCardIndices)
  
  // 山札から新しいカードを補充
  const newCards = generateRandomCards(discardedCount)
  
  // 新しい手札を設定
  const updatedPlayerCards = [...newPlayerCards, ...newCards]
  actions.setPlayerCards(updatedPlayerCards)
  
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
    const newSlotAttacks = [...state.slotAttacks]
    const newSlotProgresses = [0, 0, 0, 0, 0, 0]
    
    state.slotAttacks.forEach((attack, index) => {
      // 全スロット常にクールダウンを進める
      newSlotAttacks[index] = {
        ...attack,
        currentCooldown: Math.max(0, attack.currentCooldown - updateInterval)
      }
      
      // 攻撃実行チェック
      if (newSlotAttacks[index].currentCooldown <= 0 && attack.currentCooldown > 0) {
        // カードがある場合のみ攻撃実行
        if (state.playerDiscardedCards[index].length > 0) {
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
    
    actions.setSlotAttacks(newSlotAttacks)
    setSlotProgresses(newSlotProgresses)
    
    if (currentStep >= steps) {
      clearInterval(progressTimer)
      
      // 状態をクリア（攻撃実行後に行う）
      actions.setDiscardedCardIndices(new Set())
      actions.setDiscardedCardMapping(new Map())
      actions.setPlayerDiscardedCards(Array(6).fill(null).map(() => []))
      actions.setSelectedCards([])
      
      // 攻撃力ボーナスもリセット
      const resetSlotAttacks = state.slotAttacks.map(attack => ({
        ...attack,
        damageBonus: 0
      }))
      actions.setSlotAttacks(resetSlotAttacks)
      
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
  actions.onAction({
    type: 'exchange',
    cardsToExchange: Array.from(state.discardedCardIndices)
  })
}

// カードを捨て場に落とす処理
export const handleDropCard = (
  slotIndex: number,
  card: Card,
  state: CardExchangeState,
  actions: CardExchangeActions
) => {
  const cardWithIndex = card as Card & { cardIndex?: number }
  if (cardWithIndex.cardIndex !== undefined) {
    // 捨てたカードのインデックスを記録（手札からは削除しない）
    const newDiscardedIndices = new Set(state.discardedCardIndices)
    newDiscardedIndices.add(cardWithIndex.cardIndex)
    actions.setDiscardedCardIndices(newDiscardedIndices)
    
    // プレイヤーのドロップゾーンにカードを追加
    const removedCard = state.playerCards[cardWithIndex.cardIndex]
    const newDiscardedCards = [...state.playerDiscardedCards]
    const stackIndex = newDiscardedCards[slotIndex].length
    newDiscardedCards[slotIndex] = [...newDiscardedCards[slotIndex], removedCard]
    actions.setPlayerDiscardedCards(newDiscardedCards)
    
    // カードの位置情報をマッピングに記録
    const newMapping = new Map(state.discardedCardMapping)
    newMapping.set(cardWithIndex.cardIndex, { slotIndex, stackIndex })
    actions.setDiscardedCardMapping(newMapping)
    
    // そのスロットの攻撃力にボーナスを追加
    const newSlotAttacks = [...state.slotAttacks]
    newSlotAttacks[slotIndex] = {
      ...newSlotAttacks[slotIndex],
      damageBonus: newSlotAttacks[slotIndex].damageBonus + 1
    }
    actions.setSlotAttacks(newSlotAttacks)
    
    // 選択されたカードをクリア
    actions.setSelectedCards([])
  }
}

// カードを捨て場から取り除く処理
export const handleRemoveCard = (
  slotIndex: number,
  state: CardExchangeState,
  actions: CardExchangeActions
) => {
  const slotCards = state.playerDiscardedCards[slotIndex]
  if (slotCards && slotCards.length > 0) {
    // 一番上のカードのスタックインデックス
    const topStackIndex = slotCards.length - 1
    
    // マッピングから該当するカードインデックスを見つける
    let cardIndexToRemove = -1
    for (const [cardIdx, position] of state.discardedCardMapping.entries()) {
      if (position.slotIndex === slotIndex && position.stackIndex === topStackIndex) {
        cardIndexToRemove = cardIdx
        break
      }
    }
    
    if (cardIndexToRemove !== -1) {
      // 捨てたカードのインデックスから削除
      const newDiscardedIndices = new Set(state.discardedCardIndices)
      newDiscardedIndices.delete(cardIndexToRemove)
      actions.setDiscardedCardIndices(newDiscardedIndices)
      
      // マッピングから削除
      const newMapping = new Map(state.discardedCardMapping)
      newMapping.delete(cardIndexToRemove)
      actions.setDiscardedCardMapping(newMapping)
    }
    
    // ドロップゾーンから一番上のカードを削除
    const newDiscardedCards = [...state.playerDiscardedCards]
    newDiscardedCards[slotIndex] = slotCards.slice(0, -1)
    actions.setPlayerDiscardedCards(newDiscardedCards)
  }
}

// 捨てたカードを手札に戻す処理
export const handleReturnDiscardedCard = (
  cardIndex: number,
  state: CardExchangeState,
  actions: CardExchangeActions
) => {
  // マッピングから該当するカードの位置情報を取得
  const cardPosition = state.discardedCardMapping.get(cardIndex)
  if (!cardPosition) return
  
  const { slotIndex, stackIndex } = cardPosition
  const newDiscardedCards = [...state.playerDiscardedCards]
  
  // 指定されたスロットから指定されたスタック位置のカードを削除
  if (newDiscardedCards[slotIndex] && newDiscardedCards[slotIndex].length > stackIndex) {
    // 該当するカードを削除
    newDiscardedCards[slotIndex] = newDiscardedCards[slotIndex].filter((_, index) => index !== stackIndex)
    
    // 削除したカードより上にあるカードのstackIndexを更新
    const newMapping = new Map(state.discardedCardMapping)
    for (const [cardIdx, position] of state.discardedCardMapping.entries()) {
      if (position.slotIndex === slotIndex && position.stackIndex > stackIndex) {
        newMapping.set(cardIdx, { slotIndex, stackIndex: position.stackIndex - 1 })
      }
    }
    // 削除したカードのマッピングを削除
    newMapping.delete(cardIndex)
    
    actions.setPlayerDiscardedCards(newDiscardedCards)
    actions.setDiscardedCardMapping(newMapping)
    
    // 捨てたカードのインデックスから削除
    const newDiscardedIndices = new Set(state.discardedCardIndices)
    newDiscardedIndices.delete(cardIndex)
    actions.setDiscardedCardIndices(newDiscardedIndices)
  }
}