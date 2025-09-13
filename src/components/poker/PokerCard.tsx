'use client'

import { Box } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Card } from '@/types/poker/PokerGameTypes'

interface PokerCardProps {
  card?: Card
  isBack?: boolean
  isSelected?: boolean
  onClick?: () => void
  size?: 'xs' | 'sm' | 'md' | 'lg'
  isDraggable?: boolean
  cardIndex?: number
  isDiscarded?: boolean
}

export const PokerCard = ({ card, isBack = false, isSelected = false, onClick, size = 'md', isDraggable = false, cardIndex, isDiscarded = false }: PokerCardProps) => {
  const cardSizes = {
    xs: { width: '35px', height: '50px' },
    sm: { width: '50px', height: '70px' },
    md: { width: '70px', height: '100px' },
    lg: { width: '100px', height: '140px' }
  }

  const currentSize = cardSizes[size]

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'spades': return '♠'
      case 'hearts': return '♥'
      case 'diamonds': return '♦'
      case 'clubs': return '♣'
      default: return ''
    }
  }

  const getSuitColor = (suit: string) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'red.600' : 'black'
  }

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return 'A'
    if (rank === 11) return 'J'
    if (rank === 12) return 'Q'
    if (rank === 13) return 'K'
    return rank.toString()
  }

  const getCardImageNumber = (card: Card) => {
    const suitBase = {
      'spades': 0,    // 01-13
      'clubs': 13,    // 14-26
      'diamonds': 26, // 27-39
      'hearts': 39    // 40-52
    }
    const imageNumber = suitBase[card.suit] + card.rank
    return imageNumber.toString().padStart(2, '0')
  }

  const handleDragStart = (event: React.DragEvent) => {
    if (card && isDraggable && !isDiscarded) {
      // ドラッグエフェクトを設定
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/json', JSON.stringify({
        ...card,
        cardIndex
      }))
      
      // ドラッグ画像を作成
      const originalElement = event.currentTarget as HTMLElement
      
      // Canvasを使用してドラッグ画像を作成
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const rect = originalElement.getBoundingClientRect()
      
      // 半分のサイズでキャンバスを設定
      canvas.width = rect.width * 0.5
      canvas.height = rect.height * 0.5
      
      // CanvasをDOMに一時的に追加（見えない位置に）
      canvas.style.position = 'absolute'
      canvas.style.top = '-1000px'
      canvas.style.left = '-1000px'
      document.body.appendChild(canvas)
      
      if (ctx) {
        // 背景を白に設定
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // 枠線を描画
        ctx.strokeStyle = '#ccc'
        ctx.lineWidth = 1
        ctx.strokeRect(0, 0, canvas.width, canvas.height)
        
        // カードの内容をシンプルに描画
        ctx.fillStyle = getSuitColor(card.suit) === 'red.600' ? '#dc2626' : '#000000'
        ctx.font = `bold ${Math.max(12, canvas.height * 0.2)}px Arial`
        ctx.textAlign = 'center'
        
        // ランク表示
        ctx.fillText(getRankDisplay(card.rank), canvas.width * 0.5, canvas.height * 0.4)
        
        // スート表示
        ctx.font = `${Math.max(10, canvas.height * 0.15)}px Arial`
        ctx.fillText(getSuitSymbol(card.suit), canvas.width * 0.5, canvas.height * 0.7)
      }
      
      // ドラッグ画像として設定
      event.dataTransfer.setDragImage(canvas, canvas.width * 0.5, canvas.height * 0.5)
      
      // Canvasをクリーンアップ（ドラッグ完了後に削除）
      setTimeout(() => {
        if (canvas.parentNode) {
          document.body.removeChild(canvas)
        }
      }, 1000)
    }
  }

  if (isBack) {
    return (
      <Box
        width={currentSize.width}
        height={currentSize.height}
        border="2px solid"
        borderColor="gray.400"
        borderRadius="md"
        cursor={onClick ? 'pointer' : 'default'}
        _hover={onClick ? { transform: 'translateY(-5px)' } : {}}
        transition="all 0.2s"
        onClick={onClick}
        backgroundImage="url('/images/card/red.png')"
        backgroundSize="cover"
        backgroundPosition="center"
        backgroundRepeat="no-repeat"
      />
    )
  }

  if (!card) {
    return (
      <Box
        width={currentSize.width}
        height={currentSize.height}
        border="2px dashed"
        borderColor="gray.300"
        borderRadius="md"
        bg="gray.100"
      />
    )
  }

  return (
    <Box
      width={currentSize.width}
      height={currentSize.height}
      border="2px solid"
      borderColor={isSelected ? 'blue.500' : 'gray.400'}
      borderRadius="md"
      cursor={isDraggable && !isDiscarded ? 'grab' : onClick ? 'pointer' : 'default'}
      _active={isDraggable && !isDiscarded ? { cursor: 'grabbing' } : {}}
      _hover={onClick ? { transform: 'translateY(-5px)', borderColor: 'blue.400' } : {}}
      transition="all 0.2s"
      onClick={onClick}
      position="relative"
      boxShadow={isSelected ? '0 4px 12px rgba(0,0,255,0.3)' : 'sm'}
      draggable={isDraggable && !isDiscarded}
      onDragStart={handleDragStart}
      opacity={isDiscarded ? 0.3 : 1}
      backgroundImage={`url('/images/card/${getCardImageNumber(card)}.png')`}
      backgroundSize="cover"
      backgroundPosition="center"
      backgroundRepeat="no-repeat"
    >
      {/* 捨てられたカードの場合はオーバーレイを表示 */}
      {isDiscarded && (
        <Box
          position="absolute"
          top="0"
          left="0"
          width="100%"
          height="100%"
          bg="rgba(0, 0, 0, 0.6)"
          borderRadius="md"
        />
      )}
    </Box>
  )
}