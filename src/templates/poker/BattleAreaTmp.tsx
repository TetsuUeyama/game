'use client'

import { useState } from 'react'
import { Box, Image } from '@chakra-ui/react'
import { BulletAnimation } from '@/components/poker/BulletAnimation'
import { AttackButton } from '@/components/poker/AttackButton'
import { Character } from '@/types/poker/PokerGameTypes'
import '@/components/poker/benkei-animation.css'
import '@/components/poker/bullet-animation.css'
import './transparent-background.css'

interface BattleAreaTmpProps {
  playerCharacter?: Character
  enemyCharacter?: Character
  isPlayerAttacking?: boolean
  isEnemyAttacking?: boolean
  onPlayerAttackComplete?: () => void
  onEnemyAttackComplete?: () => void
  onPlayerAttackClick?: () => void
  onEnemyAttackClick?: () => void
  showPlayerAttackButton?: boolean
  showEnemyAttackButton?: boolean
}

type HitResult = 'guard' | 'dodge' | 'heavyHit' | 'lightHit' | 'heavyCritical' | 'lightCritical';

export const BattleAreaTmp = ({
  playerCharacter,
  enemyCharacter,
  isPlayerAttacking = false,
  isEnemyAttacking = false,
  onPlayerAttackComplete = () => {},
  onEnemyAttackComplete = () => {},
  onPlayerAttackClick = () => {},
  onEnemyAttackClick = () => {},
  showPlayerAttackButton = true,
  showEnemyAttackButton = false
}: BattleAreaTmpProps = {}) => {
  const [isPlayerHit, setIsPlayerHit] = useState(false)
  const [isEnemyHit, setIsEnemyHit] = useState(false)
  const [internalPlayerAttacking, setInternalPlayerAttacking] = useState(false)
  const [internalEnemyAttacking, setInternalEnemyAttacking] = useState(false)
  const [hitResult, setHitResult] = useState<string>('')
  const [playerEffect, setPlayerEffect] = useState<HitResult | null>(null)
  const [enemyEffect, setEnemyEffect] = useState<HitResult | null>(null)
  const [showPlayerShield, setShowPlayerShield] = useState(false)
  const [showEnemyShield, setShowEnemyShield] = useState(false)

  const actuallyPlayerAttacking = isPlayerAttacking || internalPlayerAttacking
  const actuallyEnemyAttacking = isEnemyAttacking || internalEnemyAttacking

  const handlePlayerHit = (result: HitResult) => {
    console.log(`プレイヤーの攻撃結果: ${result}`)

    // 結果に応じた処理
    switch (result) {
      case 'guard':
        setHitResult('ガード！')
        setShowEnemyShield(true)
        setTimeout(() => setShowEnemyShield(false), 800)
        break
      case 'dodge':
        setHitResult('回避！')
        setEnemyEffect('dodge')
        setTimeout(() => setEnemyEffect(null), 200)
        break
      case 'heavyHit':
        setHitResult('強ヒット！')
        setEnemyEffect('heavyHit')
        setIsEnemyHit(true)
        setTimeout(() => {
          setIsEnemyHit(false)
          setEnemyEffect(null)
        }, 600)
        break
      case 'lightHit':
        setHitResult('弱ヒット！')
        setEnemyEffect('lightHit')
        setIsEnemyHit(true)
        setTimeout(() => {
          setIsEnemyHit(false)
          setEnemyEffect(null)
        }, 1200)
        break
      case 'heavyCritical':
        setHitResult('強クリティカル！')
        setEnemyEffect('heavyCritical')
        setIsEnemyHit(true)
        setTimeout(() => {
          setIsEnemyHit(false)
          setEnemyEffect(null)
        }, 800)
        break
      case 'lightCritical':
        setHitResult('弱クリティカル！')
        setEnemyEffect('lightCritical')
        setIsEnemyHit(true)
        setTimeout(() => {
          setIsEnemyHit(false)
          setEnemyEffect(null)
        }, 1200)
        break
    }

    // 結果表示を3秒後に消す
    setTimeout(() => setHitResult(''), 3000)

    setInternalPlayerAttacking(false)
    onPlayerAttackComplete?.()
  }

  const handleEnemyHit = (result: HitResult) => {
    console.log(`敵の攻撃結果: ${result}`)

    // 結果に応じた処理
    switch (result) {
      case 'guard':
        setHitResult('ガード！')
        setShowPlayerShield(true)
        setTimeout(() => setShowPlayerShield(false), 800)
        break
      case 'dodge':
        setHitResult('回避！')
        setPlayerEffect('dodge')
        setTimeout(() => setPlayerEffect(null), 200)
        break
      case 'heavyHit':
        setHitResult('強ヒット！')
        setPlayerEffect('heavyHit')
        setIsPlayerHit(true)
        setTimeout(() => {
          setIsPlayerHit(false)
          setPlayerEffect(null)
        }, 600)
        break
      case 'lightHit':
        setHitResult('弱ヒット！')
        setPlayerEffect('lightHit')
        setIsPlayerHit(true)
        setTimeout(() => {
          setIsPlayerHit(false)
          setPlayerEffect(null)
        }, 1200)
        break
      case 'heavyCritical':
        setHitResult('強クリティカル！')
        setPlayerEffect('heavyCritical')
        setIsPlayerHit(true)
        setTimeout(() => {
          setIsPlayerHit(false)
          setPlayerEffect(null)
        }, 600)
        break
      case 'lightCritical':
        setHitResult('弱クリティカル！')
        setPlayerEffect('lightCritical')
        setIsPlayerHit(true)
        setTimeout(() => {
          setIsPlayerHit(false)
          setPlayerEffect(null)
        }, 1200)
        break
    }

    // 結果表示を3秒後に消す
    setTimeout(() => setHitResult(''), 3000)

    setInternalEnemyAttacking(false)
    onEnemyAttackComplete?.()
  }

  const handlePlayerAttackClick = () => {
    setInternalPlayerAttacking(true)
    onPlayerAttackClick?.()
  }

  const handleEnemyAttackClick = () => {
    setInternalEnemyAttacking(true)
    onEnemyAttackClick?.()
  }

  return (
    <Box position="relative" width="100%" height="100%" display="flex" flexDirection="column" justifyContent="space-between" bg="transparent" className="battle-area-container">
      {/* Benkei画像表示 - 敵（上面合わせ） */}
      <Box display="flex" justifyContent="center" alignItems="flex-start" pt={5} position="relative" bg="transparent">
        <Box position="relative" bg="transparent">
          <Image
            src={enemyCharacter?.image || "/images/character/benkei.png"}
            alt={enemyCharacter?.name || "敵"}
            width="50px"
            height="50px"
            objectFit="contain"
            className={`benkei-animation ${
              enemyEffect === 'heavyHit' ? 'heavy-hit-effect' :
              enemyEffect === 'lightHit' ? 'light-hit-effect' :
              enemyEffect === 'heavyCritical' ? 'heavy-hit-effect' :
              enemyEffect === 'lightCritical' ? 'light-hit-effect' :
              enemyEffect === 'dodge' ? 'dodge-effect' :
              isEnemyHit ? 'hit-effect' : ''
              }`}
            
          />
          {/* クリティカル時の赤いオーバーレイ */}
          {(enemyEffect === 'heavyCritical' || enemyEffect === 'lightCritical') && (
            <Box
              position="absolute"
              top="-25px"
              left="-25px"
              width="100px"
              height="100px"
              className="critical-flash"
              pointerEvents="none"
            />
          )}
        </Box>
        {/* 敵のガード盾エフェクト */}
        {showEnemyShield && <Box className="guard-shield" />}
      </Box>

      {/* センター要素 - 弾丸アニメーションが通るエリア */}
      <Box
        flex="1"
        display="flex"
        justifyContent="center"
        alignItems="center"
        position="relative"
        bg="transparent"
      >
        {/* 弾丸アニメーション - プレイヤーから敵へ */}
        {actuallyPlayerAttacking && (
          <BulletAnimation
            isActive={actuallyPlayerAttacking}
            onHit={handlePlayerHit}
            fromPlayer={true}
          />
        )}

        {/* 弾丸アニメーション - 敵からプレイヤーへ */}
        {actuallyEnemyAttacking && (
          <BulletAnimation
            isActive={actuallyEnemyAttacking}
            onHit={handleEnemyHit}
            fromPlayer={false}
          />
        )}

        {/* 攻撃結果表示 */}
        {hitResult && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="rgba(0, 0, 0, 0.8)"
            color="white"
            px={6}
            py={3}
            borderRadius="lg"
            fontSize="24px"
            fontWeight="bold"
            textAlign="center"
            zIndex={20}
            border="2px solid white"
            boxShadow="0 0 20px rgba(255, 255, 255, 0.5)"
          >
            {hitResult}
          </Box>
        )}
      </Box>

      {/* Benkei画像表示 - プレイヤー（下面合わせ） */}
      <Box display="flex" justifyContent="center" alignItems="flex-end" pb={4} position="relative" bg="transparent">
        <Box position="relative">
          <Image
            src={playerCharacter?.backImage || "/images/character/benkei-back.png"}
            alt={playerCharacter?.name || "プレイヤー"}
            width="50px"
            height="50px"
            objectFit="contain"
            className={`benkei-animation ${
              playerEffect === 'heavyHit' ? 'heavy-hit-effect' :
              playerEffect === 'lightHit' ? 'light-hit-effect' :
              playerEffect === 'heavyCritical' ? 'heavy-hit-effect' :
              playerEffect === 'lightCritical' ? 'light-hit-effect' :
              playerEffect === 'dodge' ? 'dodge-effect' :
              isPlayerHit ? 'hit-effect' : ''
            }`}
          />
          {/* クリティカル時の赤いオーバーレイ */}
          {(playerEffect === 'heavyCritical' || playerEffect === 'lightCritical') && (
            <Box
              position="absolute"
              top="-25px"
              left="-25px"
              width="100px"
              height="100px"
              className="critical-flash"
              pointerEvents="none"
            />
          )}
        </Box>
        {/* プレイヤーのガード盾エフェクト */}
        {showPlayerShield && <Box className="guard-shield" />}
      </Box>

      {/* 攻撃ボタン - エリア右端 */}
      {showEnemyAttackButton && (
        <Box position="absolute" bottom="5%" right="0%">
          <AttackButton
            onAttack={handleEnemyAttackClick}
            isPlayer={false}
            disabled={actuallyEnemyAttacking}
          />
        </Box>
      )}

      {showPlayerAttackButton && (
        <Box position="absolute" bottom="10%" right="5%">
          <AttackButton
            onAttack={handlePlayerAttackClick}
            isPlayer={true}
            disabled={actuallyPlayerAttacking}
          />
        </Box>
      )}

   </Box>
  )
}