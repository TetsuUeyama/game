'use client';

import { PlayerStats } from '@/character-move/types/PlayerData';

export interface SelectedPlayerInfo {
  playerName: string;
  position: string;
  height: number;
  dominantHand: string;
  stats: PlayerStats;
  team: 'ally' | 'enemy';
  dataUrl: string;
}

interface PlayerDetailPanelProps {
  player: SelectedPlayerInfo;
  onClose: () => void;
}

interface RadarItem {
  key: keyof PlayerStats;
  label: string;
}

/** 基本能力（独立チャート） */
const BASIC_STATS: RadarItem[] = [
  { key: 'power', label: 'PWR' },
  { key: 'stamina', label: 'STM' },
  { key: 'speed', label: 'SPD' },
  { key: 'acceleration', label: 'ACC' },
  { key: 'reflexes', label: 'RFX' },
  { key: 'quickness', label: 'QCK' },
  { key: 'mentality', label: 'MNT' },
  { key: 'jump', label: 'JMP' },
  { key: 'shootdistance', label: 'SDT' },
  { key: 'aggressive', label: 'AGR' },
];

/**
 * スキルチャートの軸定義
 */
interface SkillAxis {
  label: string;
  accuracyKey: keyof PlayerStats;
  speedKey?: keyof PlayerStats;
}

const SKILL_AXES: SkillAxis[] = [
  { label: 'OF/DF', accuracyKey: 'offense', speedKey: 'defense' },
  { label: 'DRB', accuracyKey: 'dribblingaccuracy', speedKey: 'dribblingspeed' },
  { label: 'PAS', accuracyKey: 'passaccuracy', speedKey: 'passspeed' },
  { label: '3PT', accuracyKey: '3paccuracy', speedKey: '3pspeed' },
  { label: 'SHT', accuracyKey: 'shootccuracy', speedKey: 'shoottechnique' },
  { label: 'FT', accuracyKey: 'freethrow' },
  { label: 'CRV', accuracyKey: 'curve' },
  { label: 'DNK', accuracyKey: 'dunk' },
  { label: 'TEC', accuracyKey: 'technique' },
  { label: 'ALN', accuracyKey: 'alignment' },
];

/** 実数表示する項目 */
const PLAIN_STATS: RadarItem[] = [
  { key: 'oppositeaccuracy', label: '逆手精度' },
  { key: 'oppositefrequency', label: '逆手頻度' },
  { key: 'condition', label: 'コンディション' },
];

/** テキストアンカー */
function anchorFor(a: number): string {
  if (Math.cos(a) < -0.1) return 'end';
  if (Math.cos(a) > 0.1) return 'start';
  return 'middle';
}

/**
 * 上半分か下半分かでラベルと数値のY方向オフセットを返す
 * 上半分: ラベルが上(負オフセット)、数値が下(正オフセット)
 * 下半分: 数値が上(負オフセット)、ラベルが下(正オフセット)
 */
function labelValueOffsets(a: number, spacing: number): { labelDy: number; valueDy: number } {
  const isTop = Math.sin(a) < 0.1; // 上半分（真横含む）
  if (isTop) {
    return { labelDy: -spacing, valueDy: spacing };
  } else {
    return { labelDy: spacing, valueDy: -spacing };
  }
}

/**
 * SVGレーダーチャート（基本能力用）
 */
function RadarChart({
  items,
  stats,
  teamColor,
  size,
}: {
  items: RadarItem[];
  stats: PlayerStats;
  teamColor: string;
  size: number;
}) {
  const n = items.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.32;
  const outerR = maxR + 10;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labelFontSize = n > 10 ? 5 : n > 6 ? 6 : 7;
  const spacing = 5;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const polygonPoints = (radius: number) =>
    items.map((_, i) => {
      const a = angleFor(i);
      return `${cx + radius * Math.cos(a)},${cy + radius * Math.sin(a)}`;
    }).join(' ');

  const dataPoints = items.map((item, i) => {
    const val = Math.min(99, Math.max(0, stats[item.key]));
    const r = (val / 99) * maxR;
    const a = angleFor(i);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
    >
      {gridLevels.map((level) => (
        <polygon key={level} points={polygonPoints(maxR * level)}
          fill="none" stroke="#444" strokeWidth={level === 1.0 ? 0.8 : 0.3} />
      ))}

      {items.map((_, i) => {
        const a = angleFor(i);
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)}
            stroke="#444" strokeWidth={0.3} />
        );
      })}

      <polygon points={dataPoints}
        fill={teamColor} fillOpacity={0.25} stroke={teamColor} strokeWidth={1.2} />

      {items.map((item, i) => {
        const a = angleFor(i);
        const anchor = anchorFor(a);
        const val = Math.min(99, Math.max(0, stats[item.key]));
        const r = (val / 99) * maxR;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        const bx = cx + outerR * Math.cos(a);
        const by = cy + outerR * Math.sin(a);
        const { labelDy, valueDy } = labelValueOffsets(a, spacing);

        return (
          <g key={i}>
            <circle cx={px} cy={py} r={1.8} fill={teamColor} />
            {/* ラベル */}
            <text x={bx} y={by + labelDy} textAnchor={anchor} dominantBaseline="central"
              fill="#aaa" fontSize={labelFontSize}>
              {item.label}
            </text>
            {/* 数値 */}
            <text x={bx} y={by + valueDy} textAnchor={anchor} dominantBaseline="central"
              fill="#fff" fontSize={labelFontSize + 0.5} fontWeight="bold">
              {val}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * スキル用デュアルレーダーチャート
 */
function SkillRadarChart({
  axes,
  stats,
  teamColor,
  size,
}: {
  axes: SkillAxis[];
  stats: PlayerStats;
  teamColor: string;
  size: number;
}) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.32;
  const outerR = maxR + 10;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const labelFontSize = n > 8 ? 5.5 : 6;
  const spacing = 5;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const polygonPoints = (radius: number) =>
    axes.map((_, i) => {
      const a = angleFor(i);
      return `${cx + radius * Math.cos(a)},${cy + radius * Math.sin(a)}`;
    }).join(' ');

  const hasPairs = axes.some(ax => ax.speedKey);

  const accPoints = axes.map((ax, i) => {
    const val = Math.min(99, Math.max(0, stats[ax.accuracyKey]));
    const r = (val / 99) * maxR;
    const a = angleFor(i);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');

  const spdPoints = axes.map((ax, i) => {
    const key = ax.speedKey ?? ax.accuracyKey;
    const val = Math.min(99, Math.max(0, stats[key]));
    const r = (val / 99) * maxR;
    const a = angleFor(i);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');

  const accColor = teamColor;
  const spdColor = '#facc15';

  return (
    <div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
      >
        {gridLevels.map((level) => (
          <polygon key={level} points={polygonPoints(maxR * level)}
            fill="none" stroke="#444" strokeWidth={level === 1.0 ? 0.8 : 0.3} />
        ))}

        {axes.map((_, i) => {
          const a = angleFor(i);
          return (
            <line key={i} x1={cx} y1={cy}
              x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)}
              stroke="#444" strokeWidth={0.3} />
          );
        })}

        <polygon points={accPoints}
          fill={accColor} fillOpacity={0.2} stroke={accColor} strokeWidth={1.2} />

        {hasPairs && (
          <polygon points={spdPoints}
            fill={spdColor} fillOpacity={0.1} stroke={spdColor} strokeWidth={1.0}
            strokeDasharray="3,2" />
        )}

        {axes.map((ax, i) => {
          const a = angleFor(i);
          const anchor = anchorFor(a);

          const accVal = Math.min(99, Math.max(0, stats[ax.accuracyKey]));
          const accR = (accVal / 99) * maxR;
          const accPx = cx + accR * Math.cos(a);
          const accPy = cy + accR * Math.sin(a);

          const isPair = !!ax.speedKey;
          const spdVal = isPair ? Math.min(99, Math.max(0, stats[ax.speedKey!])) : null;
          const spdR = spdVal !== null ? (spdVal / 99) * maxR : 0;
          const spdPx = cx + spdR * Math.cos(a);
          const spdPy = cy + spdR * Math.sin(a);

          const bx = cx + outerR * Math.cos(a);
          const by = cy + outerR * Math.sin(a);
          const { labelDy, valueDy } = labelValueOffsets(a, spacing);

          const valueText = isPair && spdVal !== null
            ? `${accVal}/${spdVal}`
            : `${accVal}`;

          return (
            <g key={i}>
              <circle cx={accPx} cy={accPy} r={2} fill={accColor} />
              {isPair && spdVal !== null && (
                <circle cx={spdPx} cy={spdPy} r={2} fill={spdColor} />
              )}
              {/* ラベル */}
              <text x={bx} y={by + labelDy} textAnchor={anchor} dominantBaseline="central"
                fill="#aaa" fontSize={labelFontSize}>
                {ax.label}
              </text>
              {/* 数値 */}
              <text x={bx} y={by + valueDy} textAnchor={anchor} dominantBaseline="central"
                fill="#fff" fontSize={labelFontSize + 0.5} fontWeight="bold">
                {valueText}
              </text>
            </g>
          );
        })}
      </svg>

      {hasPairs && (
        <div className="flex items-center justify-center gap-4 mt-0 mb-1">
          <div className="flex items-center gap-1">
            <div style={{ width: 14, height: 2, background: accColor }} />
            <span className="text-gray-400" style={{ fontSize: 9 }}>精度</span>
          </div>
          <div className="flex items-center gap-1">
            <div style={{ width: 14, height: 2, background: spdColor, borderTop: '1px dashed' }} />
            <span className="text-gray-400" style={{ fontSize: 9 }}>速度</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 選手詳細パネル（モーダルオーバーレイ）
 */
export function PlayerDetailPanel({ player, onClose }: PlayerDetailPanelProps) {
  const teamColor = player.team === 'ally' ? '#60a5fa' : '#f87171';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景オーバーレイ */}
      <div className="absolute inset-0 bg-black/60" />

      {/* パネル（タブレットサイズ） */}
      <div
        className="relative bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-600 shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-base z-10"
        >
          x
        </button>

        {/* ヘッダー */}
        <div className="p-5 pb-3">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                border: `2px solid ${teamColor}`,
                overflow: 'hidden',
                background: '#1a1a2e',
                flexShrink: 0,
              }}
            >
              {player.dataUrl ? (
                <img src={player.dataUrl} alt={player.playerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#999' }}>
                  {player.position}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{player.playerName}</h3>
              <p className="text-sm text-gray-400">
                ポジション: {player.position} / 身長: {player.height}cm / 利き手: {player.dominantHand}
              </p>
            </div>
          </div>
        </div>

        {/* レーダーチャート 2列配置 */}
        <div className="px-5 pb-5">
          <div className="flex gap-4">
            {/* 基本能力（左） */}
            <div className="flex-1">
              <div
                className="text-xs font-bold px-2 py-0.5 mb-1"
                style={{ color: teamColor, borderBottom: `1px solid ${teamColor}33` }}
              >
                基本能力
              </div>
              <RadarChart items={BASIC_STATS} stats={player.stats} teamColor={teamColor} size={280} />
            </div>

            {/* スキル（右） */}
            <div className="flex-1">
              <div
                className="text-xs font-bold px-2 py-0.5 mb-1"
                style={{ color: teamColor, borderBottom: `1px solid ${teamColor}33` }}
              >
                スキル
              </div>
              <SkillRadarChart axes={SKILL_AXES} stats={player.stats} teamColor={teamColor} size={280} />
            </div>
          </div>

          {/* その他（実数表示） */}
          <div className="mt-3">
            <div
              className="text-xs font-bold px-2 py-0.5 mb-1"
              style={{ color: teamColor, borderBottom: `1px solid ${teamColor}33` }}
            >
              その他
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 px-2">
              {PLAIN_STATS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-sm font-bold text-white">{player.stats[key]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
