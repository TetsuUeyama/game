'use client'

import { Box, SimpleGrid } from '@chakra-ui/react'
import { PokerCard } from './PokerCard'
import { Card } from '@/types/poker/PokerGameTypes'
import { useState, useEffect } from 'react'

interface SlotAttack {
  id: number
  name: string
  baseDamage: number
  target: 'all' | 'random' | 'up' | 'down' | 'left' | 'right'
  baseCooldown: number
  currentCooldown: number
  damageBonus: number
}

interface DropZoneProps {
  cards: Card[][]
  onDrop: (slotIndex: number, card: Card) => void
  onRemoveCard: (slotIndex: number) => void
  slotAttacks?: SlotAttack[]
  slotProgresses?: number[]
  isProcessing?: boolean
  progressCycleDurations?: number[] // 各スロットの進捗サイクル時間（ミリ秒）
  onAttackExecute?: (slotIndex: number, attack: SlotAttack) => void // 攻撃実行時のコールバック
}

export const DropZone = ({ cards, onDrop, onRemoveCard, slotAttacks, slotProgresses, isProcessing, progressCycleDurations, onAttackExecute }: DropZoneProps) => {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [animationProgress, setAnimationProgress] = useState<number[]>(Array(6).fill(0))
  const [lastAttackCycle, setLastAttackCycle] = useState<number[]>(Array(6).fill(-1))

  useEffect(() => {
    let animationId: number

    if (!isProcessing) {
      setAnimationProgress(Array(6).fill(0))
      setLastAttackCycle(Array(6).fill(-1))
      return
    }

    const startTime = Date.now()
    const totalDuration = 10000 // 10秒間
    const defaultCycleDuration = 2000 // デフォルト2秒で1サイクル

    const animate = () => {
      const elapsed = Date.now() - startTime
      
      if (elapsed >= totalDuration) {
        setAnimationProgress(Array(6).fill(0))
        return
      }

      const newProgress = Array(6).fill(0).map((_, index) => {
        const cycleDuration = progressCycleDurations?.[index] || defaultCycleDuration
        const cycleProgress = ((elapsed % cycleDuration) / cycleDuration) * 100
        const currentCycle = Math.floor(elapsed / cycleDuration)
        
        // サイクル完了時に攻撃実行（一度だけ）
        if (currentCycle > lastAttackCycle[index]) {
          const attack = slotAttacks?.[index]
          if (attack && onAttackExecute && cards[index]?.length > 0) {
            onAttackExecute(index, attack)
          }
          setLastAttackCycle(prev => {
            const newCycles = [...prev]
            newCycles[index] = currentCycle
            return newCycles
          })
        }
        
        return cycleProgress
      })
      
      setAnimationProgress(newProgress)
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [isProcessing])
  const handleDragOver = (event: React.DragEvent, slotIndex: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverSlot(slotIndex)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = event.clientX
    const y = event.clientY
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverSlot(null)
    }
  }

  const handleDrop = (event: React.DragEvent, slotIndex: number) => {
    event.preventDefault()
    setDragOverSlot(null)
    const cardData = event.dataTransfer.getData('application/json')
    if (cardData) {
      try {
        const card = JSON.parse(cardData)
        onDrop(slotIndex, card)
      } catch (error) {
        console.error('Failed to parse card data:', error)
      }
    }
  }

  const handleCardClick = (slotIndex: number) => {
    if (cards[slotIndex] && cards[slotIndex].length > 0) {
      onRemoveCard(slotIndex)
    }
  }

  return (
    <Box
      bg="rgba(255, 255, 255, 0.1)"
      padding={4}
      borderRadius="lg"
      border="2px dashed"
      borderColor="white"
      margin={4}
    >
      <SimpleGrid columns={3} gap={2} width="200px" height="140px">
        {Array.from({ length: 6 }, (_, index) => {
          const slotCards = cards[index] || []
          const hasCards = slotCards.length > 0
          const topCard = hasCards ? slotCards[slotCards.length - 1] : null
          const attack = slotAttacks?.[index]
          const progress = animationProgress[index]
          
          return (
            <Box
              key={index}
              width="60px"
              height="70px"
              border="2px dashed"
              borderColor={
                dragOverSlot === index 
                  ? "blue.500" 
                  : hasCards 
                    ? "green.400" 
                    : "gray.400"
              }
              borderRadius="md"
              bg={
                dragOverSlot === index 
                  ? "blue.100" 
                  : hasCards 
                    ? "green.100" 
                    : "gray.100"
              }
              display="flex"
              alignItems="center"
              justifyContent="center"
              onDragOver={(event) => handleDragOver(event, index)}
              onDragLeave={handleDragLeave}
              onDrop={(event) => handleDrop(event, index)}
              cursor={hasCards ? "pointer" : "default"}
              _hover={hasCards ? { bg: "green.200" } : { bg: "gray.200" }}
              transition="all 0.2s"
              position="relative"
              transform={dragOverSlot === index ? "scale(1.05)" : "scale(1)"}
            >
              {/* 攻撃プログレスバー */}
              <Box
                position="absolute"
                bottom="2px"
                left="2px"
                right="2px"
                height="6px"
                bg="gray.700"
                borderRadius="sm"
                overflow="hidden"
                border="1px solid white"
              >
                <Box
                  width={`${progress}%`}
                  height="100%"
                  bg="blue.400"
                  borderRadius="sm"
                  transition="none"
                />
              </Box>
              {hasCards ? (
                <Box position="relative">
                  {/* 重なりを示すために複数のカードを少しずつずらして表示 */}
                  {slotCards.map((card, cardIndex) => {
                    // 1枚目は中央(0,0)、2枚目以降は右下にずらす
                    const offsetX = cardIndex === 0 ? 0 : cardIndex * 2
                    const offsetY = cardIndex === 0 ? 0 : cardIndex * 2
                    
                    return (
                      <Box
                        key={cardIndex}
                        position="absolute"
                        left={`${offsetX}px`}
                        top={`${offsetY}px`}
                        zIndex={cardIndex}
                        opacity={cardIndex === slotCards.length - 1 ? 1 : 0.7}
                        transform="translate(-50%, -50%)"
                      >
                        <PokerCard
                          card={card}
                          size="xs"
                          onClick={cardIndex === slotCards.length - 1 ? () => handleCardClick(index) : undefined}
                        />
                      </Box>
                    )
                  })}
                  {/* カード枚数表示 */}
                  {slotCards.length > 1 && (
                    <Box
                      position="absolute"
                      top="-25px"
                      right="-25px"
                      width="20px"
                      height="20px"
                      bg="red.500"
                      color="white"
                      borderRadius="full"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="10px"
                      fontWeight="bold"
                      zIndex={999}
                    >
                      {slotCards.length}
                    </Box>
                  )}
                </Box>
              ) : (
                <Box
                  width="50px"
                  height="50px"
                  border="1px dashed"
                  borderColor="gray.300"
                  borderRadius="md"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="6px"
                  color="gray.500"
                  textAlign="center"
                  gap={0.5}
                >
                  {attack ? (
                    <>
                      <div>{attack.name}</div>
                      <div>DMG: {attack.baseDamage}{attack.damageBonus > 0 ? `+${attack.damageBonus}` : ''}</div>
                      <div>CD: {(attack.baseCooldown / 1000).toFixed(1)}s</div>
                      {hasCards && <div style={{ color: 'green', fontSize: '5px' }}>ボーナス!</div>}
                    </>
                  ) : (
                    '捨てる'
                  )}
                </Box>
              )}
            </Box>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}