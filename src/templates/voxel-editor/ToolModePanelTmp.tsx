'use client';

type ToolMode = 'navigate' | 'paint' | 'box';

type Props = {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
};

const TOOLS: { mode: ToolMode; label: string; key: string; icon: string; desc: string }[] = [
  { mode: 'navigate', label: 'Navigate', key: 'Q', icon: '🔄', desc: 'Rotate/zoom camera' },
  { mode: 'paint', label: 'Paint', key: 'W', icon: '🖌️', desc: 'Click/drag to paint' },
  { mode: 'box', label: 'Box Select', key: 'E', icon: '⬜', desc: 'Drag to select area' },
];

export function ToolModePanelTmp({ toolMode, onToolModeChange }: Props) {
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#aaa' }}>Tool Mode</div>
      {TOOLS.map(t => (
        <button key={t.mode} onClick={() => onToolModeChange(t.mode)} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '6px 10px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
          background: toolMode === t.mode ? '#2a2a5e' : 'transparent',
          border: toolMode === t.mode ? '1px solid #55a' : '1px solid transparent',
          color: toolMode === t.mode ? '#fff' : '#888', fontSize: 12, textAlign: 'left',
        }}>
          <span style={{ fontSize: 14 }}>{t.icon}</span>
          <div>
            <div style={{ fontWeight: toolMode === t.mode ? 'bold' : 'normal' }}>
              {t.label} <span style={{ fontSize: 10, color: '#666' }}>({t.key})</span>
            </div>
            <div style={{ fontSize: 10, color: '#666' }}>{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
