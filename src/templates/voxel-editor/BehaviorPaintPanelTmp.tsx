'use client';

import type { EquipBehavior } from '@/types/equip';

const BEHAVIOR_INFO: { value: EquipBehavior; label: string; labelJa: string; cssColor: string; shortcut: string }[] = [
  { value: 'synced',  label: 'Synced',  labelJa: 'body同期',  cssColor: '#4a6', shortcut: '1' },
  { value: 'surface', label: 'Surface', labelJa: '表面維持',  cssColor: '#68f', shortcut: '2' },
  { value: 'gravity', label: 'Gravity', labelJa: '重力影響',  cssColor: '#f84', shortcut: '3' },
];

type Props = {
  paintBehavior: EquipBehavior;
  onPaintBehaviorChange: (behavior: EquipBehavior) => void;
};

export { BEHAVIOR_INFO };

export function BehaviorPaintPanelTmp({ paintBehavior, onPaintBehaviorChange }: Props) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#aaa' }}>Paint Behavior</div>
      {BEHAVIOR_INFO.map(info => (
        <button key={info.value} onClick={() => onPaintBehaviorChange(info.value)} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '6px 10px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
          background: paintBehavior === info.value ? info.cssColor : 'transparent',
          border: paintBehavior === info.value ? `2px solid ${info.cssColor}` : '2px solid transparent',
          color: paintBehavior === info.value ? '#fff' : '#888', fontSize: 12, textAlign: 'left',
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
            background: info.cssColor, display: 'inline-block',
          }} />
          <div>
            <span style={{ fontWeight: paintBehavior === info.value ? 'bold' : 'normal' }}>
              {info.label} <span style={{ fontSize: 10, color: paintBehavior === info.value ? '#ddd' : '#666' }}>({info.shortcut})</span>
            </span>
            <div style={{ fontSize: 10, color: paintBehavior === info.value ? '#ddd' : '#555' }}>{info.labelJa}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
