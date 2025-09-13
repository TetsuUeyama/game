import { Card } from '@/types/poker/PokerGameTypes'

export const createDeck = (): Card[] => {
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

export const evaluateHand = (cards: Card[]): { role: string; strength: number } => {
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

export const generateRandomCard = (): Card => {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades']
  const randomSuit = suits[Math.floor(Math.random() * suits.length)]
  const randomRank = Math.floor(Math.random() * 13) + 1
  const cardId = Date.now() + Math.floor(Math.random() * 1000)
  
  return {
    id: cardId,
    suit: randomSuit as 'hearts' | 'diamonds' | 'clubs' | 'spades',
    rank: randomRank,
    image: `/poker/images/${cardId}.png`
  }
}

export const generateRandomCards = (count: number): Card[] => {
  const newCards: Card[] = []
  
  for (let i = 0; i < count; i++) {
    newCards.push(generateRandomCard())
  }
  
  return newCards
}

export const removeCardsFromHand = (playerCards: Card[], discardedIndices: Set<number>): Card[] => {
  return playerCards.filter((_, index) => !discardedIndices.has(index))
}