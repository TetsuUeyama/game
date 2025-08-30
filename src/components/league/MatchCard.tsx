'use client'

import { Box, VStack, HStack } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Match } from '@/types/league/LeagueTypes'

interface MatchCardProps {
  match: Match
}

export const MatchCard = ({ match }: MatchCardProps) => {
  const getResultColor = (playerType: 'home' | 'away') => {
    if (!match.completed) return 'gray.100'
    
    if (match.result === 'draw') return 'yellow.100'
    
    if (playerType === 'home') {
      return match.result === 'home' ? 'green.100' : 'red.100'
    } else {
      return match.result === 'away' ? 'green.100' : 'red.100'
    }
  }

  const getScoreColor = (playerType: 'home' | 'away') => {
    if (!match.completed) return 'gray.600'
    
    if (match.result === 'draw') return 'yellow.700'
    
    if (playerType === 'home') {
      return match.result === 'home' ? 'green.700' : 'red.700'
    } else {
      return match.result === 'away' ? 'green.700' : 'red.700'
    }
  }

  return (
    <Box
      border="2px solid"
      borderColor="gray.200"
      borderRadius="lg"
      padding={4}
      bg="white"
      boxShadow="sm"
      width="100%"
      minHeight="120px"
    >
      <VStack gap={3}>
        <HStack width="100%" justifyContent="space-between" alignItems="center">
          {/* ホームプレイヤー */}
          <VStack gap={1} flex={1}>
            <Box
              width="60px"
              height="60px"
              bg={getResultColor('home')}
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor={match.homePlayer.color}
            >
              <Text
                text={match.homeScore?.toString() || '?'}
                fontSize={{ base: 18, md: 22 }}
                fontWeight="bold"
                color={getScoreColor('home')}
              />
            </Box>
            <Text
              text={match.homePlayer.name}
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color={match.homePlayer.color}
              textAlign="center"
            />
            <Text
              text="(H)"
              fontSize={{ base: 8, md: 10 }}
              color="gray.500"
            />
          </VStack>

          {/* VS */}
          <VStack gap={0}>
            <Text
              text="VS"
              fontSize={{ base: 12, md: 14 }}
              fontWeight="bold"
              color="gray.500"
            />
            {match.completed && (
              <Text
                text={
                  match.result === 'home' ? 'H勝利' :
                  match.result === 'away' ? 'A勝利' :
                  '引き分け'
                }
                fontSize={{ base: 8, md: 10 }}
                fontWeight="bold"
                color={
                  match.result === 'home' ? 'green.600' :
                  match.result === 'away' ? 'blue.600' :
                  'yellow.600'
                }
              />
            )}
          </VStack>

          {/* アウェープレイヤー */}
          <VStack gap={1} flex={1}>
            <Box
              width="60px"
              height="60px"
              bg={getResultColor('away')}
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor={match.awayPlayer.color}
            >
              <Text
                text={match.awayScore?.toString() || '?'}
                fontSize={{ base: 18, md: 22 }}
                fontWeight="bold"
                color={getScoreColor('away')}
              />
            </Box>
            <Text
              text={match.awayPlayer.name}
              fontSize={{ base: 10, md: 12 }}
              fontWeight="bold"
              color={match.awayPlayer.color}
              textAlign="center"
            />
            <Text
              text="(A)"
              fontSize={{ base: 8, md: 10 }}
              color="gray.500"
            />
          </VStack>
        </HStack>
      </VStack>
    </Box>
  )
}