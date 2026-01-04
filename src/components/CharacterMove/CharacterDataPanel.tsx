'use client';

import { useState } from 'react';
import { CharacterConfig } from '@/character-move/types/CharacterStats';

interface CharacterDataPanelProps {
  characterData: Record<string, CharacterConfig>;
}

/**
 * キャラクターデータ表示パネル
 */
export function CharacterDataPanel({ characterData }: CharacterDataPanelProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const characterIds = Object.keys(characterData);
  const selectedCharacter = selectedCharacterId ? characterData[selectedCharacterId] : null;

  return (
    <div className="absolute top-4 right-4 w-96 bg-black/80 backdrop-blur-sm text-white rounded-lg shadow-lg overflow-hidden">
      {/* ヘッダー */}
      <div
        className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 cursor-pointer flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-bold">キャラクターデータ一覧</h3>
        <button className="text-white hover:text-gray-200">
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      {isExpanded && (
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* キャラクター一覧 */}
          <div className="p-4 border-b border-gray-700">
            <p className="text-sm text-gray-300 mb-2">キャラクターを選択してください</p>
            <div className="space-y-2">
              {characterIds.map((id) => {
                const char = characterData[id];
                const isSelected = id === selectedCharacterId;

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedCharacterId(isSelected ? null : id)}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600 shadow-lg'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold">{char.basic.name}</p>
                        <p className="text-xs text-gray-300">ID: {id}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>身長: {char.physical.height}m</p>
                        <p className="text-xs text-gray-400">体重: {char.physical.weight}kg</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 詳細データ表示 */}
          {selectedCharacter && (
            <div className="p-4 space-y-4">
              <div>
                <h4 className="font-bold text-lg mb-2 text-blue-400">
                  {selectedCharacter.basic.name}
                </h4>
                {selectedCharacter.basic.description && (
                  <p className="text-sm text-gray-300">{selectedCharacter.basic.description}</p>
                )}
              </div>

              {/* 物理的特性 */}
              <div>
                <h5 className="font-semibold text-sm text-purple-400 mb-2">物理的特性</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatItem label="身長" value={`${selectedCharacter.physical.height} m`} />
                  <StatItem label="体重" value={`${selectedCharacter.physical.weight} kg`} />
                  <StatItem label="当たり判定半径" value={`${selectedCharacter.physical.radius} m`} />
                </div>
              </div>

              {/* 移動性能 */}
              <div>
                <h5 className="font-semibold text-sm text-green-400 mb-2">移動性能</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatItem label="歩行速度" value={`${selectedCharacter.movement.walkSpeed} m/s`} />
                  <StatItem
                    label="ダッシュ最低速度"
                    value={`${selectedCharacter.movement.dashSpeedMin}x`}
                  />
                  <StatItem
                    label="ダッシュ最高速度"
                    value={`${selectedCharacter.movement.dashSpeedMax}x`}
                  />
                  <StatItem
                    label="加速時間"
                    value={`${selectedCharacter.movement.dashAccelerationTime} 秒`}
                  />
                  <StatItem
                    label="回転速度"
                    value={`${selectedCharacter.movement.rotationSpeed} rad/s`}
                  />
                </div>
              </div>

              {/* ジャンプ性能 */}
              <div>
                <h5 className="font-semibold text-sm text-yellow-400 mb-2">ジャンプ性能</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatItem
                    label="ジャンプ力倍率"
                    value={`${selectedCharacter.jump.jumpPowerMultiplier}x`}
                  />
                  <StatItem
                    label="空中制御倍率"
                    value={`${selectedCharacter.jump.airControlMultiplier}x`}
                  />
                </div>
              </div>

              {/* 視野設定 */}
              <div>
                <h5 className="font-semibold text-sm text-cyan-400 mb-2">視野設定</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <StatItem label="視野角" value={`${selectedCharacter.vision.visionAngle}°`} />
                  <StatItem label="視野範囲" value={`${selectedCharacter.vision.visionRange} m`} />
                </div>
              </div>

              {/* 追加ステータス */}
              {selectedCharacter.additional && Object.keys(selectedCharacter.additional).length > 0 && (
                <div>
                  <h5 className="font-semibold text-sm text-orange-400 mb-2">追加ステータス</h5>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(selectedCharacter.additional).map(([key, value]) => (
                      <StatItem key={key} label={key} value={String(value)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ステータス項目コンポーネント
 */
function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/50 p-2 rounded">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
