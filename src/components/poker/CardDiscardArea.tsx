'use client'

import { VStack, HStack } from '@chakra-ui/react'
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
  showControls = false,
  position = 'bottom',
  attackType,
  defenseType,
  onAttackTypeChange,
  onDefenseTypeChange,
  slotAttacks,
  slotProgresses,
  isProcessing,
  onAttackExecute
}: CardDiscardAreaProps) => {
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

  const ControlsSection = () => (
    <HStack gap={4} justifyContent="center">
      <VStack gap={1}>
        <select
          value={attackType}
          onChange={(e) => onAttackTypeChange?.(e.target.value as AttackType)}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '12px',
            backgroundColor: 'white'
          }}
        >
          {attackOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </VStack>

      <VStack gap={1}>
        <select
          value={defenseType}
          onChange={(e) => onDefenseTypeChange?.(e.target.value as DefenseType)}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '12px',
            backgroundColor: 'white'
          }}
        >
          {defenseOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </VStack>
    </HStack>
  )

  return (
    <VStack gap={3}>
      {showControls && position === 'top' && <ControlsSection />}
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
      {showControls && position === 'bottom' && <ControlsSection />}
    </VStack>
  )
}