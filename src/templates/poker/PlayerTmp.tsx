'use client'

import { Box, VStack, HStack, Text } from '@chakra-ui/react'
import { PokerCard } from '@/components/poker/PokerCard'
import { CardDiscardArea } from '@/components/poker/CardDiscardArea'
import { Button } from '@/components/ui/button'
import { Character, Card, AttackType, DefenseType, Player } from '@/types/poker/PokerGameTypes'
import { SlotAttack } from '@/utils/cardExchange'

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
  progressValue,
  onCardSelect,
  onExchange,
  onDecide,
  onDropCard,
  onRemoveCard,
  onAttackTypeChange,
  onDefenseTypeChange,
  onAttackExecute,
}: PlayerProps) => {
  // const hpPercentage = (player.currentHp / player.maxHp) * 100

  return (
    <Box pb={2}>
      {/* 手札交換・決定ボタンとプログレスバー */}
      <VStack gap={2} pb={2}>
          <VStack width={"400px"} alignItems={"left"}>
            {/* ボタン群 */}
            <HStack>
              <Button
                onClick={onExchange}
                colorScheme="blue"
                size="lg"
                disabled={discardedCardIndices.size === 0 || isProcessing}
              >
                手札交換 ({discardedCardIndices.size}枚)
              </Button>

              <Button
                onClick={onDecide}
                colorScheme="red"
                size="lg"
                disabled={isProcessing}
              >
                手札公開
              </Button>
            </HStack>

            {/* プログレスバー */}
            {isProcessing && (
              <Box width="400px" padding={4} bg="rgba(0, 0, 0, 0.8)" borderRadius="md">
                <VStack>
                  <Text
                    fontSize={16}
                    fontWeight="bold"
                    color="white"
                    textAlign="center"
                  >
                    攻撃処理中...
                  </Text>
                  <Box
                    width="100%"
                    height="16px"
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
                      fontSize={14}
                      color="white"
                      textAlign="center"
                    >
                      {Math.round(progressValue)}%
                    </Text>
                    <Text
                      fontSize={12}
                      color="gray.300"
                      textAlign="center"
                    >
                      {Math.round((progressValue / 100) * 10000)}ms / 10000ms
                    </Text>
                  </HStack>
                </VStack>
              </Box>
            )}
          </VStack>
        {/* プレイヤーのカード捨て場 */}
        <Box>
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
      </VStack>

      {/* プレイヤー手札とコントロール - 下部中央 */}
      <Box>
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

    </Box>
  )
}