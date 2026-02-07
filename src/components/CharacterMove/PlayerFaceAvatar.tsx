'use client';

import { useState } from 'react';

interface PlayerFaceAvatarProps {
  dataUrl: string;
  playerName: string;
  position: string;
  team: 'ally' | 'enemy';
  stateColor?: string;
  onClick: () => void;
}

/**
 * 小さな円形アバター。チームカラーのボーダー付き。
 * 外側リングで選手の現在状態色を表示。
 * ホバーで選手名ツールチップ。クリックで詳細パネルを開く。
 */
export function PlayerFaceAvatar({ dataUrl, playerName, position, team, stateColor, onClick }: PlayerFaceAvatarProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const borderColor = team === 'ally' ? '#60a5fa' : '#f87171';
  const outerColor = stateColor || borderColor;

  return (
    <div
      className="relative cursor-pointer flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
    >
      {/* ポジションラベル */}
      <span
        className="text-center leading-none mb-0.5"
        style={{ fontSize: 9, color: '#333', fontWeight: 800 }}
      >
        {position}
      </span>
      {/* 状態色リング（外側） */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: outerColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.3s',
        }}
      >
        {/* アバター本体（内側） */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: `2px solid ${borderColor}`,
            overflow: 'hidden',
            background: '#1a1a2e',
          }}
        >
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={playerName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: '#999',
              }}
            >
              {position}
            </div>
          )}
        </div>
      </div>
      {showTooltip && (
        <div
          className="absolute z-50 whitespace-nowrap px-2 py-1 rounded text-xs bg-black/90 text-white"
          style={{
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 4,
          }}
        >
          {playerName} ({position})
        </div>
      )}
    </div>
  );
}
