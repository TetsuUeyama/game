'use client'

import { VStack } from '@chakra-ui/react'
import { DropZone } from './DropZone'
import { Card, AttackType, DefenseType } from '@/types/poker/PokerGameTypes'

const PROGRESS_CYCLE_DURATIONS = [1000, 1500, 2000, 2500, 3000, 1200]

interface SlotAttack {
  id: number
  name: string
  baseDamage: number
  target: 'all' | 'random' | 'up' | 'down' | 'left' | 'right'
  baseCooldown: number
  currentCooldown: number
  damageBonus: number
}

interface CardDiscardAreaProps {
  cards: Card[][]
  onDrop: (slotIndex: number, card: Card) => void
  onRemoveCard: (slotIndex: number) => void
  showControls?: boolean
  position?: 'top' | 'bottom'
  attackType?: AttackType
  defenseType?: DefenseType
  onAttackTypeChange?: (type: AttackType) => void
  onDefenseTypeChange?: (type: DefenseType) => void
  slotAttacks?: SlotAttack[]
  slotProgresses?: number[]
  isProcessing?: boolean
  onAttackExecute?: (slotIndex: number, attack: SlotAttack) => void
}

export const CardDiscardArea = ({ 
  cards, 
  onDrop, 
  onRemoveCard, 
  slotAttacks,
  slotProgresses,
  isProcessing,
  onAttackExecute
}: CardDiscardAreaProps) => {

  return (
    <VStack>
      <DropZone
        cards={cards}
        onDrop={onDrop}
        onRemoveCard={onRemoveCard}
        slotAttacks={slotAttacks}
        slotProgresses={slotProgresses}
        isProcessing={isProcessing}
        progressCycleDurations={PROGRESS_CYCLE_DURATIONS}
        onAttackExecute={onAttackExecute}
      />
    </VStack>
  )
}