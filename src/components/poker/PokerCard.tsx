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
        bg="blue.600"
        border="2px solid"
        borderColor="gray.400"
        borderRadius="md"
        cursor={onClick ? 'pointer' : 'default'}
        _hover={onClick ? { transform: 'translateY(-5px)' } : {}}
        transition="all 0.2s"
        onClick={onClick}
        display="flex"
        alignItems="center"
        justifyContent="center"
        backgroundImage="url('/poker/images/red.png')"
        backgroundSize="cover"
        backgroundPosition="center"
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
      bg={isDiscarded ? "rgba(0, 0, 0, 0.8)" : "white"}
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
      opacity={isDiscarded ? 0.6 : 1}
    >
      {/* カード番号（左上） */}
      <Box position="absolute" top="2px" left="2px">
        <Text
          text={getRankDisplay(card.rank)}
          fontSize={size === 'lg' ? 16 : size === 'md' ? 12 : size === 'sm' ? 10 : 8}
          fontWeight="bold"
          color={isDiscarded ? "white" : getSuitColor(card.suit)}
        />
      </Box>

      {/* スート（左上） */}
      <Box position="absolute" top={size === 'lg' ? '18px' : size === 'md' ? '14px' : '12px'} left="2px">
        <Text
          text={getSuitSymbol(card.suit)}
          fontSize={size === 'lg' ? 14 : size === 'md' ? 10 : size === 'sm' ? 8 : 6}
          color={isDiscarded ? "white" : getSuitColor(card.suit)}
        />
      </Box>

      {/* 中央のスート */}
      <Box
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
      >
        <Text
          text={getSuitSymbol(card.suit)}
          fontSize={size === 'lg' ? 24 : size === 'md' ? 18 : size === 'sm' ? 14 : 10}
          color={isDiscarded ? "white" : getSuitColor(card.suit)}
        />
      </Box>

      {/* カード番号（右下・回転） */}
      <Box
        position="absolute"
        bottom="2px"
        right="2px"
        transform="rotate(180deg)"
      >
        <Text
          text={getRankDisplay(card.rank)}
          fontSize={size === 'lg' ? 16 : size === 'md' ? 12 : size === 'sm' ? 10 : 8}
          fontWeight="bold"
          color={isDiscarded ? "white" : getSuitColor(card.suit)}
        />
      </Box>

      {/* スート（右下・回転） */}
      <Box
        position="absolute"
        bottom={size === 'lg' ? '18px' : size === 'md' ? '14px' : size === 'sm' ? '12px' : '10px'}
        right="2px"
        transform="rotate(180deg)"
      >
        <Text
          text={getSuitSymbol(card.suit)}
          fontSize={size === 'lg' ? 14 : size === 'md' ? 10 : size === 'sm' ? 8 : 6}
          color={isDiscarded ? "white" : getSuitColor(card.suit)}
        />
      </Box>
    </Box>
  )
}