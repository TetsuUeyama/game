'use client';

import { useEffect, useRef } from 'react';

export default function FightingGame() {
  const gameRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initGame = async () => {
      const Phaser = await import('phaser');
      const { FightScene } = await import('@/fighting-game/scenes/FightScene');
      const { GAME_CONFIG } = await import('@/fighting-game/config/gameConfig');

      const config = {
        type: Phaser.AUTO,
        ...GAME_CONFIG,
        parent: containerRef.current || undefined,
        scene: [FightScene],
      };

      if (!gameRef.current) {
        gameRef.current = new Phaser.Game(config);
      }
    };

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">2D Fighting Game - AI vs AI</h1>
        <div className="text-white space-y-2">
          <div className="bg-purple-600 px-6 py-3 rounded-lg inline-block mb-4">
            <p className="text-xl font-bold">🤖 自動対戦モード 🤖</p>
            <p className="text-sm">AIが自動で戦います！観戦をお楽しみください</p>
          </div>
          <div className="grid grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="border border-green-500 p-4 rounded bg-gray-800">
              <h2 className="text-xl font-bold text-green-400 mb-2">🤖 AI Fighter 1 (Green)</h2>
              <ul className="text-sm space-y-1">
                <li>難易度: Medium</li>
                <li>戦略: バランス型</li>
                <li>特徴: 状況に応じて攻守を切り替え</li>
                <li>攻撃判定: 自動</li>
                <li>防御判定: 自動</li>
              </ul>
            </div>
            <div className="border border-red-500 p-4 rounded bg-gray-800">
              <h2 className="text-xl font-bold text-red-400 mb-2">🤖 AI Fighter 2 (Red)</h2>
              <ul className="text-sm space-y-1">
                <li>難易度: Medium</li>
                <li>戦略: バランス型</li>
                <li>特徴: 状況に応じて攻守を切り替え</li>
                <li>攻撃判定: 自動</li>
                <li>防御判定: 自動</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        id="fighting-game-container"
        className="border-4 border-purple-500 rounded-lg shadow-2xl"
      />
      <div className="mt-8 text-white text-center max-w-2xl">
        <h3 className="text-xl font-bold mb-2">Game Rules</h3>
        <ul className="text-sm space-y-1">
          <li>Best of 3 rounds - First to 2 wins takes the match!</li>
          <li>Each round is 99 seconds</li>
          <li>Blocking reduces damage to 30%</li>
          <li>AI builds special meter by taking damage</li>
          <li>Special attacks deal 2.5x damage</li>
          <li>AI automatically switches between aggressive/defensive/balanced strategies</li>
        </ul>
      </div>
    </div>
  );
}
