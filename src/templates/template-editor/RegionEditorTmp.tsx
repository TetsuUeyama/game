'use client';

interface RegionDef {
  label: string;
  labelJa: string;
  color: [number, number, number];
  zMin: number; zMax: number;
  xMin: number; xMax: number;
}

type Props = {
  regions: Record<string, RegionDef>;
  onUpdateRegion: (key: string, field: keyof RegionDef, value: number) => void;
};

export function RegionEditorTmp({ regions, onUpdateRegion }: Props) {
  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Body Regions (Z/X boundaries)</div>
      {Object.entries(regions).map(([key, reg]) => (
        <div key={key} style={{
          marginBottom: 8, padding: '6px 8px', borderRadius: 4,
          background: `rgba(${reg.color.map(c => Math.round(c * 255)).join(',')}, 0.1)`,
          border: `1px solid rgba(${reg.color.map(c => Math.round(c * 255)).join(',')}, 0.3)`,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 'bold', marginBottom: 4,
            color: `rgb(${reg.color.map(c => Math.round(c * 255)).join(',')})`,
          }}>
            {reg.labelJa} ({reg.label})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 30px', gap: '2px', alignItems: 'center', fontSize: 10 }}>
            <span>Z min</span>
            <input type="range" min="0" max="120" value={reg.zMin} onChange={e => onUpdateRegion(key, 'zMin', Number(e.target.value))} />
            <span style={{ color: '#8cf' }}>{reg.zMin}</span>
            <span>Z max</span>
            <input type="range" min="0" max="999" value={Math.min(reg.zMax, 120)} onChange={e => onUpdateRegion(key, 'zMax', Number(e.target.value))} />
            <span style={{ color: '#8cf' }}>{reg.zMax > 200 ? 'max' : reg.zMax}</span>
            <span>X min</span>
            <input type="range" min="0" max="100" value={reg.xMin} onChange={e => onUpdateRegion(key, 'xMin', Number(e.target.value))} />
            <span style={{ color: '#8cf' }}>{reg.xMin}</span>
            <span>X max</span>
            <input type="range" min="0" max="999" value={Math.min(reg.xMax, 100)} onChange={e => onUpdateRegion(key, 'xMax', Number(e.target.value))} />
            <span style={{ color: '#8cf' }}>{reg.xMax > 200 ? 'max' : reg.xMax}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
