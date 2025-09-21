'use client';

import { useState, useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import './bullet-animation.css';

type HitResult = 'guard' | 'dodge' | 'heavyHit' | 'lightHit' | 'heavyCritical' | 'lightCritical';

interface BulletAnimationProps {
  isActive: boolean;
  onHit: (result: HitResult) => void;
  fromPlayer: boolean; // true: プレイヤーから敵へ, false: 敵からプレイヤーへ
}

export const BulletAnimation = ({ isActive, onHit, fromPlayer }: BulletAnimationProps) => {
  const [showBullet, setShowBullet] = useState(false);
  const [hitResult, setHitResult] = useState<HitResult | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      setShowBullet(true);

      // 着弾前の当たり判定（1.2秒後）
      timeoutRef.current = setTimeout(() => {
        // 6分の1の確率でランダム判定
        const random = Math.random();
        let result: HitResult;

        if (random < 1/6) {
          result = 'guard';
        } else if (random < 2/6) {
          result = 'dodge';
        } else if (random < 3/6) {
          result = 'heavyHit';
        } else if (random < 4/6) {
          result = 'lightHit';
        } else if (random < 5/6) {
          result = 'heavyCritical';
        } else {
          result = 'lightCritical';
        }

        setHitResult(result);
        onHit(result);

        // 結果アニメーション後に弾丸を非表示
        setTimeout(() => {
          setShowBullet(false);
          setHitResult(null);
        }, 800);
      }, 1200); // 1.2秒で当たり判定
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isActive, onHit]);

  if (!showBullet) return null;

  // 結果に応じたクラス名を取得
  const getResultClass = () => {
    if (!hitResult) return '';
    return `bullet-${hitResult}`;
  };

  return (
    <Box
      className={`bullet ${fromPlayer ? 'bullet-to-enemy' : 'bullet-to-player'} ${getResultClass()}`}
      position="absolute"
      width="15px"
      height="15px"
      borderRadius="50%"
      bg={
        hitResult === 'heavyCritical' || hitResult === 'lightCritical' ? 'gold' :
        hitResult === 'dodge' ? 'blue.400' :
        hitResult === 'guard' ? 'green.500' :
        hitResult === 'heavyHit' ? 'red.600' :
        hitResult === 'lightHit' ? 'red.300' :
        'red.500'
      }
      boxShadow={
        hitResult === 'heavyCritical' || hitResult === 'lightCritical' ? '0 0 25px gold, 0 0 50px gold' :
        hitResult === 'dodge' ? '0 0 20px blue, 0 0 40px blue' :
        hitResult === 'guard' ? '0 0 20px green, 0 0 40px green' :
        hitResult === 'heavyHit' ? '0 0 20px darkred, 0 0 40px darkred' :
        hitResult === 'lightHit' ? '0 0 15px red, 0 0 30px red' :
        '0 0 15px red, 0 0 30px red'
      }
      zIndex={10}
      border="2px solid white"
    />
  );
};