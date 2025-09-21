'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { PokerCard } from '@/components/poker/PokerCard'
import { Character, Card, Player } from '@/types/poker/PokerGameTypes'
import { SlotAttack } from '@/utils/cardExchange'
import { CardDiscardArea } from '@/components/poker/CardDiscardArea'

export interface EnemyState {
  character: Character
  currentHp: number
  maxHp: number
}

export interface EnemyProps {
  enemy: Player
  enemyDiscardedCards: Card[][]
  slotAttacks?: SlotAttack[]
  slotProgresses?: number[]
  isProcessing?: boolean
  onDropCard: (slotIndex: number, card: Card) => void
  onRemoveCard: (slotIndex: number) => void
  onAttackExecute: (slotIndex: number, attack: SlotAttack) => void
  showTopCards?: boolean
}

export const rankToHp = (rank: string): number => {
  switch (rank) {
    case 'A': return 120
    case 'B': return 100
    case 'C': return 80
    default: return 100
  }
}

export const initializeEnemy = (enemyCharacter: Character): EnemyState => {
  const enemyHp = rankToHp(enemyCharacter.hp)
  return {
    character: enemyCharacter,
    currentHp: enemyHp,
    maxHp: enemyHp
  }
}

export const EnemyTmp = ({
  enemy,
  enemyDiscardedCards,
  slotAttacks,
  slotProgresses,
  isProcessing,
  onDropCard,
  onRemoveCard,
  onAttackExecute,
  showTopCards = false
}: EnemyProps) => {

  return (
    <Box pt={2}>
      {/* 上部: 敵のカード表示 */}
      {showTopCards && (
        <VStack>
          <HStack>
            {enemy.cards.map((_, index) => (
              <PokerCard key={index} isBack={true} size="md" />
            ))}
          </HStack>
        </VStack>
      )}

      {/* 相手情報 - 画面右上 */}
      <Box pt={4}>
        <CardDiscardArea
          cards={enemyDiscardedCards}
          onDrop={onDropCard}
          onRemoveCard={onRemoveCard}
          slotAttacks={slotAttacks}
          slotProgresses={slotProgresses}
          isProcessing={isProcessing}
          onAttackExecute={onAttackExecute}
        />
      </Box>
    </Box>
  )
}