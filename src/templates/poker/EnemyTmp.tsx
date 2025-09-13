'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { PokerCard } from '@/components/poker/PokerCard'
import { PlayerInfo } from '@/components/poker/PlayerInfo'
import { CardDiscardArea } from '@/components/poker/CardDiscardArea'
import { Character, Card, Player } from '@/types/poker/PokerGameTypes'
import { SlotAttack } from '@/utils/cardExchange'

export interface EnemyState {
  character: Character
  currentHp: number
  maxHp: number
}

export interface EnemyProps {
  enemy: Player
  enemyDiscardedCards: Card[][]
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
  onDropCard,
  onRemoveCard,
  onAttackExecute,
  showTopCards = false
}: EnemyProps) => {

  return (
    <>
      {/* 上部: 敵のカード表示 */}
      {showTopCards && (
        <VStack padding={4} borderRadius="lg" margin={4} zIndex={5}>
          <HStack>
            {enemy.cards.map((_, index) => (
              <PokerCard key={index} isBack={true} size="md" />
            ))}
          </HStack>
        </VStack>
      )}

      {/* 相手情報 - 画面右上 */}
      <Box position="absolute" top={"23%"} right={"40%"} zIndex={10}>
        <PlayerInfo 
          player={enemy} 
          showRole={true}
          rolePosition="below"
        />
      </Box>

      {/* 相手のカード捨て場 - 画面左のやや上側 */}
      <Box position="absolute" left="25%" top="5%" zIndex={10}>
        <CardDiscardArea
          cards={enemyDiscardedCards}
          onDrop={onDropCard}
          onRemoveCard={onRemoveCard}
          showControls={true}
          position="top"
          attackType="balance"
          defenseType="balance"
          onAttackExecute={onAttackExecute}
        />
      </Box>
    </>
  )
}