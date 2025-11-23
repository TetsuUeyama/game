'use client';

import dynamic from 'next/dynamic';

const FightingGame = dynamic(
  () => import('@/components/fighting-game/FightingGame'),
  { ssr: false }
);

export default function FightingGamePage() {
  return <FightingGame />;
}
