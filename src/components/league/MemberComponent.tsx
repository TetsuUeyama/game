'use client'

import { Box, VStack } from '@chakra-ui/react'
import { Text } from '@/components/Text'
import { Member } from '@/types/league/TeamLeagueTypes'

interface MemberComponentProps {
  member: Member
  showDetails?: boolean
  showTeamInfo?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  isVersus?: boolean
}

export const MemberComponent = ({ 
  member, 
  showDetails = false, 
  showTeamInfo = false,
  size = 'md',
  isVersus = false
}: MemberComponentProps) => {
  const getWinRate = (): string => {
    if (member.totalGames === 0) return '0.0%'
    return ((member.wins / member.totalGames) * 100).toFixed(1) + '%'
  }

  const getSizeStyles = () => {
    switch (size) {
      case 'xs':
        return {
          padding: 1,
          width: '60px',
          height: '40px',
          nameSize: { base: 8, md: 10 },
          textSize: { base: 6, md: 8 },
          colorSize: '8px'
        }
      case 'sm':
        return {
          padding: 2,
          width: '80px',
          height: '60px',
          nameSize: { base: 10, md: 12 },
          textSize: { base: 8, md: 10 },
          colorSize: '10px'
        }
      case 'lg':
        return {
          padding: 4,
          width: '120px',
          height: '100px',
          nameSize: { base: 14, md: 18 },
          textSize: { base: 12, md: 14 },
          colorSize: '16px'
        }
      default:
        return {
          padding: 3,
          width: '100px',
          height: '80px',
          nameSize: { base: 12, md: 14 },
          textSize: { base: 10, md: 12 },
          colorSize: '12px'
        }
    }
  }

  const styles = getSizeStyles()

  if (isVersus) {
    // VS表示用の簡略版
    return (
      <VStack gap={1} alignItems="center" minWidth={styles.width}>
        <Box
          width={styles.colorSize}
          height={styles.colorSize}
          bg={member.color}
          borderRadius="full"
        />
        <Text
          text={member.name}
          fontSize={styles.nameSize}
          fontWeight="bold"
          color={member.color}
          textAlign="center"
        />
      </VStack>
    )
  }

  return (
    <Box
      border="1px solid"
      borderColor={member.color}
      borderRadius="md"
      padding={styles.padding}
      bg="white"
      boxShadow="sm"
      minWidth={styles.width}
      minHeight={styles.height}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <VStack gap={1} width="100%">
        {/* メンバー名とカラーインジケーター */}
        <VStack gap={1} alignItems="center">
          <Box
            width={styles.colorSize}
            height={styles.colorSize}
            bg={member.color}
            borderRadius="full"
          />
          <Text
            text={member.name}
            fontSize={styles.nameSize}
            fontWeight="bold"
            color={member.color}
            textAlign="center"
          />
        </VStack>

        {/* 詳細情報 */}
        {showDetails && (
          <VStack gap={1} width="100%">
            <Text
              text={`${member.points}pt`}
              fontSize={styles.textSize}
              fontWeight="bold"
              color="blue.600"
              textAlign="center"
            />
            <Text
              text={`${member.wins}勝${member.draws}分${member.losses}敗`}
              fontSize={styles.textSize}
              color="gray.600"
              textAlign="center"
            />
            {member.totalGames > 0 && (
              <Text
                text={getWinRate()}
                fontSize={styles.textSize}
                fontWeight="bold"
                color="green.600"
                textAlign="center"
              />
            )}
          </VStack>
        )}

        {/* チーム情報 */}
        {showTeamInfo && (
          <Text
            text={`Team ${member.teamId}`}
            fontSize={styles.textSize}
            color="gray.500"
            textAlign="center"
          />
        )}
      </VStack>
    </Box>
  )
}