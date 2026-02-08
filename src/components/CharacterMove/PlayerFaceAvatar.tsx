'use client';

import { useState, useRef, useCallback } from 'react';
import { OffenseRole, DefenseRole } from '@/character-move/state/PlayerStateTypes';

export interface PlayerGameStatsView {
  points: number;
  assists: number;
  playingTime: string; // "MM:SS" format
}

interface PlayerFaceAvatarProps {
  dataUrl: string;
  playerName: string;
  position: string;
  team: 'ally' | 'enemy';
  stateColor?: string;
  shotPriority: number | null;
  offenseRole: OffenseRole | null;
  defenseRole: DefenseRole | null;
  gameStats?: PlayerGameStatsView;
  onClick: () => void;
  onRoleChange?: (field: 'shotPriority' | 'offenseRole' | 'defenseRole', value: string) => void;
}

const OFFENSE_ROLE_LABELS: Record<OffenseRole, string> = {
  [OffenseRole.MAIN_HANDLER]: 'MAIN',
  [OffenseRole.SECOND_HANDLER]: '2ND',
  [OffenseRole.SPACER]: 'SPACER',
  [OffenseRole.SCREENER]: 'SCREEN',
  [OffenseRole.DUNKER]: 'DUNK',
  [OffenseRole.SLASHER]: 'SLASH',
};

const DEFENSE_ROLE_LABELS: Record<DefenseRole, string> = {
  [DefenseRole.POA]: 'POA',
  [DefenseRole.NAIL]: 'NAIL',
  [DefenseRole.LOW_MAN]: 'LOW',
  [DefenseRole.CLOSEOUT]: 'CLOSE',
  [DefenseRole.SCRAMBLER]: 'SCRAM',
};

/**
 * 小さな円形アバター。チームカラーのボーダー付き。
 * 外側リングで選手の現在状態色を表示。
 * ホバーで選手名ツールチップ。クリックで詳細パネルを開く。
 * shotPriority / offenseRole / defenseRole をselectで変更可能。
 */
export function PlayerFaceAvatar({
  dataUrl, playerName, position, team, stateColor,
  shotPriority, offenseRole, defenseRole, gameStats,
  onClick, onRoleChange,
}: PlayerFaceAvatarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipLeft, setTooltipLeft] = useState<string>('50%');
  const [tooltipTranslateX, setTooltipTranslateX] = useState<string>('-50%');
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // ツールチップ表示時に画面端クランプを計算
  const handleMouseEnter = useCallback(() => {
    setShowTooltip(true);
    // 次フレームでDOM測定
    requestAnimationFrame(() => {
      const container = containerRef.current;
      const tooltip = tooltipRef.current;
      if (!container || !tooltip) return;

      const containerRect = container.getBoundingClientRect();
      const tooltipW = tooltip.offsetWidth;
      const centerX = containerRect.left + containerRect.width / 2;
      const tooltipLeftEdge = centerX - tooltipW / 2;
      const tooltipRightEdge = centerX + tooltipW / 2;

      if (tooltipLeftEdge < 4) {
        // 左端にはみ出す → 左寄せ
        setTooltipLeft('0%');
        setTooltipTranslateX('0%');
      } else if (tooltipRightEdge > window.innerWidth - 4) {
        // 右端にはみ出す → 右寄せ
        setTooltipLeft('100%');
        setTooltipTranslateX('-100%');
      } else {
        setTooltipLeft('50%');
        setTooltipTranslateX('-50%');
      }
    });
  }, []);

  const borderColor = team === 'ally' ? '#60a5fa' : '#f87171';
  const outerColor = stateColor || borderColor;

  const selectStyle: React.CSSProperties = {
    fontSize: 8,
    padding: '0 1px',
    lineHeight: 1.2,
    height: 16,
    border: '1px solid #ccc',
    borderRadius: 2,
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    maxWidth: 52,
    textAlign: 'center',
  };

  const handleSelectChange = (
    field: 'shotPriority' | 'offenseRole' | 'defenseRole',
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    e.stopPropagation();
    onRoleChange?.(field, e.target.value);
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer flex flex-col items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
    >
      {/* shotPriority select */}
      <select
        style={{ ...selectStyle, marginBottom: 1 }}
        value={shotPriority != null ? String(shotPriority) : ''}
        onChange={(e) => handleSelectChange('shotPriority', e)}
        onClick={handleSelectClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="">-</option>
        <option value="1">1st</option>
        <option value="2">2nd</option>
        <option value="3">3rd</option>
        <option value="4">4th</option>
        <option value="5">5th</option>
      </select>

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

      {/* offenseRole select */}
      <select
        style={{ ...selectStyle, marginTop: 1 }}
        value={offenseRole ?? ''}
        onChange={(e) => handleSelectChange('offenseRole', e)}
        onClick={handleSelectClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="">OFF-</option>
        {Object.entries(OFFENSE_ROLE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {/* defenseRole select */}
      <select
        style={{ ...selectStyle, marginTop: 1 }}
        value={defenseRole ?? ''}
        onChange={(e) => handleSelectChange('defenseRole', e)}
        onClick={handleSelectClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <option value="">DEF-</option>
        {Object.entries(DEFENSE_ROLE_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>

      {showTooltip && (
        <div
          ref={tooltipRef}
          className="absolute z-50 whitespace-nowrap px-2 py-1 rounded text-xs bg-black/90 text-white"
          style={{
            bottom: '100%',
            left: tooltipLeft,
            transform: `translateX(${tooltipTranslateX})`,
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          <div className="font-bold">{playerName} ({position})</div>
          {gameStats && (
            <div style={{ fontSize: 10, opacity: 0.9 }}>
              {gameStats.points}pts / {gameStats.assists}ast / {gameStats.playingTime}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
