import { Card } from '@/types/poker/PokerGameTypes'
import { SlotConfig } from '@/types/poker/DropZoneTypes'

// カードによる強化倍率を計算
export const calculateCardEnhancement = (cards: Card[], slotConfig: SlotConfig) => {
  if (!cards || cards.length === 0) return 1

  // カード枚数による基本強化倍率
  const cardCountBonus = 1 + (cards.length * 0.1) // 1枚につき10%強化

  // カードのランクによる追加強化
  let rankBonus = 0
  cards.forEach(card => {
    switch (card.rank) {
      case 'A':
        rankBonus += 0.15 // Aceは15%
        break
      case 'K':
      case 'Q':
      case 'J':
        rankBonus += 0.1 // 絵札は10%
        break
      default:
        const numValue = parseInt(card.rank)
        if (numValue >= 10) {
          rankBonus += 0.08 // 10は8%
        } else if (numValue >= 7) {
          rankBonus += 0.05 // 7-9は5%
        } else {
          rankBonus += 0.03 // 2-6は3%
        }
    }
  })

  return cardCountBonus + rankBonus
}

// 強化後の値を計算
export const calculateEnhancedValue = (originalValue: string, enhancement: number) => {
  // 数値部分を抽出して強化
  const numberMatch = originalValue.match(/([+-]?\d+\.?\d*)(%)?/)
  if (numberMatch) {
    const number = parseFloat(numberMatch[1])
    const isPercentage = numberMatch[2] === '%'
    const enhancedNumber = number * enhancement

    if (isPercentage) {
      return originalValue.replace(numberMatch[0], `${enhancedNumber.toFixed(1)}%`)
    } else {
      return originalValue.replace(numberMatch[0], enhancedNumber.toFixed(1))
    }
  }

  // 数値が含まれていない場合は強化レベルを表示
  const level = Math.floor((enhancement - 1) * 10)
  return level > 0 ? `${originalValue} Lv.${level}` : originalValue
}

// 強化情報を取得
export const getEnhancementInfo = (cards: Card[], slotConfig: SlotConfig) => {
  const enhancement = calculateCardEnhancement(cards, slotConfig)

  return {
    enhancement,
    isEnhanced: enhancement > 1,
    enhancementLevel: Math.floor((enhancement - 1) * 10),
    enhancementPercentage: Math.floor((enhancement - 1) * 100)
  }
}

// ドラッグ中のカードを含めた仮の強化情報を取得
export const getPreviewEnhancementInfo = (currentCards: Card[], draggedCard: Card, slotConfig: SlotConfig) => {
  const previewCards = [...currentCards, draggedCard]
  return getEnhancementInfo(previewCards, slotConfig)
}