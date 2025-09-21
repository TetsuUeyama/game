'use client'

import { Box, Portal, VStack } from '@chakra-ui/react'
import { useState, useRef, useEffect, ReactNode } from 'react'

interface HoverDialogProps {
  children: ReactNode
  title?: string
  content: ReactNode | ((event: React.MouseEvent) => ReactNode)
  delay?: number
}

export const HoverDialog = ({ children, title, content, delay = 300 }: HoverDialogProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const [currentContent, setCurrentContent] = useState<ReactNode>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showDialog = (event: React.MouseEvent) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      const dialogContent = typeof content === 'function' ? content(event) : content
      setCurrentContent(dialogContent)
      setIsVisible(true)
    }, delay)
  }

  // ドラッグイベント用のハンドラー
  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault()
    // ドラッグ中の場合はすぐに表示（遅延なし）
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    const dialogContent = typeof content === 'function' ? content(event as any) : content
    setCurrentContent(dialogContent)
    setIsVisible(true)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    // ドラッグオーバー中も継続して表示
    if (!isVisible) {
      handleDragEnter(event)
    }
  }

  const hideDialog = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <Box
        ref={triggerRef}
        onMouseEnter={showDialog}
        onMouseLeave={hideDialog}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={hideDialog}
        display="inline-block"
      >
        {children}
      </Box>

      {isVisible && (
        <Portal>
          <Box
            position="fixed"
            left="50%"
            top="50%"
            transform="translateX(-50%)"
            width="300px"
            height="180px"
            bg="rgba(0, 0, 0, 0.9)"
            color="white"
            px={2}
            py={2}
            borderRadius="md"
            fontSize="xs"
            boxShadow="0 4px 12px rgba(0,0,0,0.3)"
            zIndex={9999}
            pointerEvents="none"
            border="1px solid rgba(255,255,255,0.2)"
          >
            <VStack gap={1} align="start" height="100%">
              {title && (
                <Box fontWeight="bold" fontSize="xs" borderBottom="1px solid rgba(255,255,255,0.3)" pb={1} mb={1}>
                  {title}
                </Box>
              )}
              <Box flex="1" overflow="hidden">
                {currentContent}
              </Box>
            </VStack>
          </Box>
        </Portal>
      )}
    </>
  )
}