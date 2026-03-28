'use client';

interface HairOption {
  charKey: string;
  partKey: string;
  label: string;
  voxels: number;
}

type Props = {
  hairOptions: HairOption[];
  selectedHair: string;
  hairLoading: boolean;
  hairSizeDiff: string;
  onSwapHair: (hairId: string) => void;
};

export function HairSwapTmp({ hairOptions, selectedHair, hairLoading, hairSizeDiff, onSwapHair }: Props) {
  if (hairOptions.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 'bold', color: '#f8c', fontSize: 13, marginBottom: 6 }}>
        Hair Swap {hairLoading && <span style={{ fontSize: 10, color: '#8af' }}>(loading...)</span>}
        {hairSizeDiff && (
          <span style={{
            fontSize: 10, marginLeft: 6,
            color: Math.abs(parseInt(hairSizeDiff)) > 30 ? '#f88' : '#8f8',
          }}>
            size: {hairSizeDiff}
          </span>
        )}
      </div>
      <select
        value={selectedHair}
        onChange={(e) => onSwapHair(e.target.value)}
        disabled={hairLoading}
        style={{
          width: '100%', padding: '6px 8px', fontSize: 11,
          background: '#1a1a2e', color: '#ddd', border: '1px solid #555',
          borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        <option value="">-- Default (own hair) --</option>
        {hairOptions.map((opt, idx) => (
          <option key={`${opt.charKey}::${opt.partKey}::${idx}`} value={`${opt.charKey}::${opt.partKey}`}>
            {opt.label} ({opt.voxels.toLocaleString()})
          </option>
        ))}
      </select>
    </div>
  );
}
