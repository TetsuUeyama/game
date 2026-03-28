'use client';

import type { EquipBehavior } from '@/types/equip';

const STAT_INFO: { value: EquipBehavior; label: string; cssColor: string }[] = [
  { value: 'synced',  label: 'Synced',  cssColor: '#4a6' },
  { value: 'surface', label: 'Surface', cssColor: '#68f' },
  { value: 'gravity', label: 'Gravity', cssColor: '#f84' },
];

type Props = {
  stats: { synced: number; surface: number; gravity: number };
  totalVoxels: number;
};

export function VoxelStatsTmp({ stats, totalVoxels }: Props) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6, color: '#aaa' }}>Voxel Stats</div>
      {STAT_INFO.map(info => {
        const count = stats[info.value];
        const pct = totalVoxels > 0 ? Math.round(count / totalVoxels * 100) : 0;
        return (
          <div key={info.value} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: info.cssColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 12, minWidth: 60 }}>{info.label}</span>
            <span style={{ fontSize: 12, fontWeight: 'bold', minWidth: 40, textAlign: 'right' }}>{count}</span>
            <div style={{ flex: 1, height: 8, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: info.cssColor, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 10, color: '#888', width: 30, textAlign: 'right' }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
