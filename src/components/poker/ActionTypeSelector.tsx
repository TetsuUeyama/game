'use client'

import { VStack, HStack } from '@chakra-ui/react'
import { AttackType, DefenseType } from '@/types/poker/PokerGameTypes'

interface ActionTypeSelectorProps {
  attackType?: AttackType
  defenseType?: DefenseType
  onAttackTypeChange?: (type: AttackType) => void
  onDefenseTypeChange?: (type: DefenseType) => void
}

export const ActionTypeSelector = ({
  attackType,
  defenseType,
  onAttackTypeChange,
  onDefenseTypeChange
}: ActionTypeSelectorProps) => {
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
}