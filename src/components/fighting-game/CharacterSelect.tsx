'use client';

import { CHARACTERS, CharacterConfig } from '@/fighting-game/config/characterConfig';

interface CharacterSelectProps {
  onStart: (player1Id: number, player2Id: number) => void;
}

export default function CharacterSelect({ onStart }: CharacterSelectProps) {
  const [player1Selection, setPlayer1Selection] = useState<number>(1);
  const [player2Selection, setPlayer2Selection] = useState<number>(2);

  const handleStart = () => {
    onStart(player1Selection, player2Selection);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-8">キャラクター選択</h1>

      <div className="flex gap-8 w-full max-w-6xl">
        {/* Player 1 選択 */}
        <PlayerSelector
          playerNumber={1}
          selectedId={player1Selection}
          onSelect={setPlayer1Selection}
        />

        {/* VS表示 */}
        <div className="flex items-center justify-center">
          <div className="text-6xl font-bold text-red-500">VS</div>
        </div>

        {/* Player 2 選択 */}
        <PlayerSelector
          playerNumber={2}
          selectedId={player2Selection}
          onSelect={setPlayer2Selection}
        />
      </div>

      {/* 開始ボタン */}
      <button
        onClick={handleStart}
        className="mt-8 px-12 py-4 bg-green-600 hover:bg-green-700 text-white text-2xl font-bold rounded-lg transition-colors shadow-lg"
      >
        対戦開始
      </button>
    </div>
  );
}

interface PlayerSelectorProps {
  playerNumber: number;
  selectedId: number;
  onSelect: (id: number) => void;
}

function PlayerSelector({ playerNumber, selectedId, onSelect }: PlayerSelectorProps) {
  const selectedChar = CHARACTERS[selectedId];

  return (
    <div className="flex-1 bg-gray-800 rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-center">
        Player {playerNumber}
      </h2>

      {/* キャラクター一覧グリッド */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {Object.values(CHARACTERS).map((char) => (
          <button
            key={char.id}
            onClick={() => onSelect(char.id)}
            className={`
              p-3 rounded-lg border-2 transition-all
              ${selectedId === char.id
                ? 'border-yellow-400 bg-yellow-900 scale-110'
                : 'border-gray-600 bg-gray-700 hover:border-gray-400'
              }
            `}
          >
            <div className="text-lg font-bold">{char.id}</div>
          </button>
        ))}
      </div>

      {/* 選択中のキャラクター詳細 */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-xl font-bold mb-2">{selectedChar.name}</h3>
        <p className="text-sm text-gray-300 mb-4">{selectedChar.description}</p>

        {/* ステータス表示 */}
        <div className="space-y-1 text-sm">
          <StatBar label="体力" value={selectedChar.stats.hp} />
          <StatBar label="攻撃" value={selectedChar.stats.attack} />
          <StatBar label="攻速" value={selectedChar.stats.attackSpeed} />
          <StatBar label="防御" value={selectedChar.stats.defense} />
          <StatBar label="特攻" value={selectedChar.stats.specialAttack} />
          <StatBar label="特防" value={selectedChar.stats.specialDefense} />
          <StatBar label="速度" value={selectedChar.stats.speed} />
        </div>
      </div>
    </div>
  );
}

interface StatBarProps {
  label: string;
  value: number;
}

function StatBar({ label, value }: StatBarProps) {
  // 25-150の範囲を0-100%に変換
  const percentage = ((value - 25) / 125) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-600 rounded h-4 overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right">{value}</span>
    </div>
  );
}

// useState のインポート追加
import { useState } from 'react';
