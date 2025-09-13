'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { PokerCard } from '@/components/poker/PokerCard'
import { PlayerInfo } from '@/components/poker/PlayerInfo'
import { CardDiscardArea } from '@/components/poker/CardDiscardArea'
import { Character, Card, AttackType, DefenseType, Player } from '@/types/poker/PokerGameTypes'
import { SlotAttack } from '@/utils/cardExchange'
// import { ProgressRoot, ProgressBar } from '@/components/ui/progress'

export interface PlayerState {
  character: Character
  currentHp: number
  maxHp: number
}

export interface PlayerProps {
  player: Player
  selectedCards: number[]
  discardedCardIndices: Set<number>
  playerDiscardedCards: Card[][]
  attackType: AttackType
  defenseType: DefenseType
  slotAttacks: SlotAttack[]
  slotProgresses: number[]
  isProcessing: boolean
  onCardSelect: (cardIndex: number) => void
  onExchange: () => void
  onDecide: () => void
  onDropCard: (slotIndex: number, card: Card) => void
  onRemoveCard: (slotIndex: number) => void
  onAttackTypeChange: (type: AttackType) => void
  onDefenseTypeChange: (type: DefenseType) => void
  onAttackExecute: (slotIndex: number, attack: SlotAttack) => void
  progressValue: number
}

export const rankToHp = (rank: string): number => {
  switch (rank) {
    case 'A': return 120
    case 'B': return 100
    case 'C': return 80
    default: return 100
  }
}

export const initializePlayer = (playerCharacter: Character): PlayerState => {
  const playerHp = rankToHp(playerCharacter.hp)
  return {
    character: playerCharacter,
    currentHp: playerHp,
    maxHp: playerHp
  }
}

export const PlayerTmp = ({ 
  player,
  selectedCards, 
  discardedCardIndices, 
  playerDiscardedCards,
  attackType,
  defenseType,
  slotAttacks,
  slotProgresses,
  isProcessing,
  onCardSelect,
  onDropCard,
  onRemoveCard,
  onAttackTypeChange,
  onDefenseTypeChange,
  onAttackExecute,
}: PlayerProps) => {
  // const hpPercentage = (player.currentHp / player.maxHp) * 100

  return (
    <>
      {/* プレイヤー情報 - 中央やや左下 */}
      <Box position="absolute" bottom={"22%"} left={"40%"} zIndex={10}>
        <PlayerInfo 
          player={player} 
          showRole={true}
          rolePosition="above"
        />
      </Box>

      {/* プレイヤー手札とコントロール - 下部中央 */}
      <Box position="absolute" bottom={4} left="50%" transform="translateX(-50%)" zIndex={10}>
        <VStack>
          {/* プレイヤー手札 */}
          <HStack justifyContent="center">
            {player.cards.map((card, index) => (
              <PokerCard
                key={`${card.id}-${index}`}
                card={card}
                isSelected={selectedCards.includes(index)}
                onClick={() => onCardSelect(index)}
                size="md"
                isDraggable={true}
                cardIndex={index}
                isDiscarded={discardedCardIndices.has(index)}
              />
            ))}
          </HStack>
        </VStack>
      </Box>

      {/* プレイヤーのカード捨て場 - 画面右のやや下側 */}
      <Box position="absolute" right="25%" bottom="5%" zIndex={10}>
        <CardDiscardArea
          cards={playerDiscardedCards}
          onDrop={onDropCard}
          onRemoveCard={onRemoveCard}
          showControls={true}
          position="bottom"
          attackType={attackType}
          defenseType={defenseType}
          onAttackTypeChange={onAttackTypeChange}
          onDefenseTypeChange={onDefenseTypeChange}
          slotAttacks={slotAttacks}
          slotProgresses={slotProgresses}
          isProcessing={isProcessing}
          onAttackExecute={onAttackExecute}
        />
      </Box>
    </>
  )
}