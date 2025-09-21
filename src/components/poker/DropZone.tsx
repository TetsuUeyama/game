'use client'

import { Box, SimpleGrid, Text, Image } from '@chakra-ui/react'
import { PokerCard } from './PokerCard'
import { Card } from '@/types/poker/PokerGameTypes'
import { HoverDialog } from '@/components/ui/HoverDialog'
import { EnhancedValueDisplay } from '@/components/ui/EnhancedValueDisplay'
import { SlotAttack } from '@/types/poker/DropZoneTypes'
import { dropZoneConfig } from '@/config/poker/dropZoneConfig'
import { getEnhancementInfo, calculateEnhancedValue, getPreviewEnhancementInfo } from '@/utils/poker/slotEnhancement'
import { useState, useEffect } from 'react'


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

// グローバル変数でドラッグ中のカード情報を保存
let globalDraggedCard: Card | null = null

// グローバル変数にカード情報をセットする関数（他のコンポーネントから使用）
export const setGlobalDraggedCard = (card: Card | null) => {
  globalDraggedCard = card
}

export const DropZone = ({ cards, onDrop, onRemoveCard, slotAttacks, slotProgresses: _slotProgresses, isProcessing, progressCycleDurations, onAttackExecute }: DropZoneProps) => {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const [draggedCardData, setDraggedCardData] = useState<Card | null>(null)
  const [animationProgress, setAnimationProgress] = useState<number[]>(Array(6).fill(0))
  const [lastAttackCycle, setLastAttackCycle] = useState<number[]>(Array(6).fill(-1))

  // 設定ファイルからスロット情報を取得
  const { slots: slotConfigs, defaultSlot } = dropZoneConfig


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
  }, [isProcessing, progressCycleDurations, slotAttacks, cards, onAttackExecute])
  const handleDragEnter = (event: React.DragEvent, _slotIndex: number) => {
    event.preventDefault()

    // グローバル変数からカード情報を取得
    const draggedCard = globalDraggedCard || getDraggedCard(event)

    if (draggedCard) {
      setDraggedCardData(draggedCard)
    }
  }

  const handleDragOver = (event: React.DragEvent, slotIndex: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverSlot(slotIndex)

    // dragOverでは状態を更新するだけ
    if (!draggedCardData) {
      const draggedCard = getDraggedCard(event)
      if (draggedCard) {
        setDraggedCardData(draggedCard)
      }
    }
  }

  // ドラッグ中のカード情報を取得
  const getDraggedCard = (event: React.DragEvent): Card | null => {
    try {
      const cardData = event.dataTransfer.getData('application/json')
      return cardData ? JSON.parse(cardData) : null
    } catch {
      return null
    }
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const x = event.clientX
    const y = event.clientY

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverSlot(null)
      setDraggedCardData(null)
      globalDraggedCard = null
    }
  }

  const handleDrop = (event: React.DragEvent, slotIndex: number) => {
    event.preventDefault()
    setDragOverSlot(null)
    setDraggedCardData(null)
    globalDraggedCard = null
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
      borderRadius="lg"
      borderColor="white"
      mx={4}
    >
      <SimpleGrid columns={6} gap={2} width="400px" height="80px">
        {Array.from({ length: 6 }, (_, index) => {
          const slotCards = cards[index] || []
          const hasCards = slotCards.length > 0
          const _topCard = hasCards ? slotCards[slotCards.length - 1] : null
          const attack = slotAttacks?.[index]
          const progress = animationProgress[index]
          const slotConfig = slotConfigs[index] || { ...defaultSlot, id: index }
          const enhancementInfo = getEnhancementInfo(slotCards, slotConfig)

          
          return (
            <Box key={index}>
              <Box
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
                onDragEnter={(event) => handleDragEnter(event, index)}
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
                <HoverDialog
                  title={`${slotConfig.dialogContent.title} (強化済み)`}
                  content={
                    <Box fontSize="xs">
                      <Text mb={2} color="gray.300">{slotConfig.description}</Text>
                      <Box mb={2} p={2} bg="rgba(0,255,0,0.1)" borderRadius="md">
                        <Text fontSize="10px" color="lightgreen" fontWeight="bold">
                          カード強化 Lv.{enhancementInfo.enhancementLevel} (+{enhancementInfo.enhancementPercentage}%)
                        </Text>
                      </Box>
                      {slotConfig.dialogContent.details.map((detail, detailIndex: number) => (
                        <Box key={detailIndex} mt={1}>
                          <EnhancedValueDisplay
                            label={detail.label}
                            originalValue={detail.value}
                            enhancedValue={calculateEnhancedValue(detail.value, enhancementInfo.enhancement)}
                            isEnhanced={enhancementInfo.isEnhanced}
                            color={detail.color || "white"}
                          />
                        </Box>
                      ))}
                      {attack && (
                        <Box mt={2} borderTop="1px solid rgba(255,255,255,0.3)" pt={1}>
                          <Text fontSize="10px" color="green.300">配置済み: {attack.name}</Text>
                          <Text fontSize="10px">DMG: {attack.baseDamage}{attack.damageBonus > 0 ? `+${attack.damageBonus}` : ''}</Text>
                        </Box>
                      )}
                      <Box mt={2} borderTop="1px solid rgba(255,255,255,0.3)" pt={1}>
                        <Text fontSize="10px" color="cyan.300">配置カード: {slotCards.length}枚</Text>
                        <Text fontSize="10px" color="gray.400">
                          {slotCards.map(card => `${card.rank}${card.suit}`).join(', ')}
                        </Text>
                      </Box>
                    </Box>
                  }
                >
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
                </HoverDialog>
              ) : (
                <HoverDialog
                  title={(dragOverSlot === index && draggedCardData) ? `${slotConfig.dialogContent.title} (プレビュー)` : slotConfig.dialogContent.title}
                  content={
                    (dragOverSlot === index && draggedCardData) ? (
                      // ドラッグホバー中はプレビュー表示
                      <Box fontSize="xs">
                        <Text mb={2} color="gray.300">{slotConfig.description}</Text>
                        {(() => {
                          const previewEnhancement = getPreviewEnhancementInfo(slotCards, draggedCardData, slotConfig)
                          return (
                            <>
                              <Box mb={2} p={2} bg="rgba(255,255,0,0.1)" borderRadius="md">
                                <Text fontSize="10px" color="yellow.300" fontWeight="bold">
                                  プレビュー: {draggedCardData.rank}{draggedCardData.suit} 追加時
                                </Text>
                                <Text fontSize="10px" color="yellow.300">
                                  Lv.{previewEnhancement.enhancementLevel} (+{previewEnhancement.enhancementPercentage}%)
                                </Text>
                              </Box>
                              {slotConfig.dialogContent.details.map((detail, detailIndex: number) => (
                                <Box key={detailIndex} mt={1}>
                                  <EnhancedValueDisplay
                                    label={detail.label}
                                    originalValue={detail.value}
                                    enhancedValue={calculateEnhancedValue(detail.value, previewEnhancement.enhancement)}
                                    isEnhanced={previewEnhancement.isEnhanced}
                                    color={detail.color || "white"}
                                  />
                                </Box>
                              ))}
                            </>
                          )
                        })()}
                        <Box mt={2} borderTop="1px solid rgba(255,255,255,0.3)" pt={1}>
                          <Text fontSize="10px" color="cyan.300">現在のカード: {slotCards.length}枚</Text>
                          {slotCards.length > 0 && (
                            <Text fontSize="10px" color="gray.400">
                              {slotCards.map((card) => `${card.rank}${card.suit}`).join(', ')}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    ) : (
                      // 通常時は基本情報表示
                      <Box fontSize="xs">
                        <Text mb={2} color="gray.300">{slotConfig.description}</Text>
                        {slotConfig.dialogContent.details.map((detail, detailIndex: number) => (
                          <Box key={detailIndex} mt={1} display="flex" justifyContent="space-between" alignItems="center">
                            <Text fontWeight="bold" color={detail.color || "white"}>{detail.label}:</Text>
                            <Text>{detail.value}</Text>
                          </Box>
                        ))}
                        {attack && (
                          <Box mt={2} borderTop="1px solid rgba(255,255,255,0.3)" pt={1}>
                            <Text fontSize="10px" color="green.300">配置済み: {attack.name}</Text>
                            <Text fontSize="10px">DMG: {attack.baseDamage}{attack.damageBonus > 0 ? `+${attack.damageBonus}` : ''}</Text>
                          </Box>
                        )}
                      </Box>
                    )
                  }
                >
                  <Box
                    width="50px"
                    height="50px"
                    border="1px dashed"
                    borderColor="gray.300"
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="help"
                    onDragEnter={(event) => handleDragEnter(event, index)}
                    onDragOver={(event) => handleDragOver(event, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(event) => handleDrop(event, index)}
                  >
                    <Box
                      width="48px"
                      height="48px"
                      bg={slotConfig.icon.bgColor}
                      borderRadius={slotConfig.icon.borderRadius}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      color="white"
                      fontSize="16px"
                      fontWeight="bold"
                      overflow="hidden"
                    >
                      {slotConfig.icon.imagePath ? (
                        <Image
                          src={slotConfig.icon.imagePath}
                          alt={slotConfig.name}
                          width="44px"
                          height="44px"
                          objectFit="contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.innerHTML = `<div style="font-size: 20px;">${slotConfig.icon.fallbackEmoji}</div>`;
                            }
                          }}
                        />
                      ) : (
                        slotConfig.icon.fallbackEmoji
                      )}
                    </Box>
                  </Box>
                </HoverDialog>
              )}
            </Box>

            </Box>
          )
        })}
      </SimpleGrid>

    </Box>
  )
}