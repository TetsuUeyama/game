'use client';

interface PartEntry {
  key: string;
  voxels: number;
  meshes: string[];
  is_body: boolean;
}

type Props = {
  parts: PartEntry[];
  partVisibility: Record<string, boolean>;
  onTogglePart: (key: string) => void;
  onToggleAll: (on: boolean) => void;
  onToggleCategory: (isBody: boolean, on: boolean) => void;
};

function partLabel(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    .replace('  ', ' ').trim();
}

export function PartListTmp({ parts, partVisibility, onTogglePart, onToggleAll, onToggleCategory }: Props) {
  const bodyParts = parts.filter(p => p.is_body);
  const clothingParts = parts.filter(p => !p.is_body);

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <button onClick={() => onToggleAll(true)} style={{
          flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
          border: '1px solid #4a4', borderRadius: 4,
          background: 'rgba(40,80,40,0.3)', color: '#afa', cursor: 'pointer',
        }}>All ON</button>
        <button onClick={() => onToggleAll(false)} style={{
          flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 'bold',
          border: '1px solid #a44', borderRadius: 4,
          background: 'rgba(80,40,40,0.3)', color: '#faa', cursor: 'pointer',
        }}>All OFF</button>
      </div>

      {bodyParts.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 'bold', color: '#8c8', fontSize: 13 }}>Body ({bodyParts.length})</span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={() => onToggleCategory(true, true)} style={{
                padding: '2px 6px', fontSize: 9, border: '1px solid #4a4', borderRadius: 3,
                background: 'transparent', color: '#8c8', cursor: 'pointer',
              }}>ON</button>
              <button onClick={() => onToggleCategory(true, false)} style={{
                padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                background: 'transparent', color: '#c88', cursor: 'pointer',
              }}>OFF</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
            {bodyParts.map(part => (
              <button key={part.key} onClick={() => onTogglePart(part.key)} style={{
                padding: '5px 10px', fontSize: 11, textAlign: 'left',
                border: partVisibility[part.key] ? '2px solid #6a6' : '1px solid #444',
                borderRadius: 4,
                background: partVisibility[part.key] ? 'rgba(40,80,40,0.35)' : 'rgba(30,30,50,0.6)',
                color: partVisibility[part.key] ? '#cec' : '#666',
                cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{partLabel(part.key)}</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {clothingParts.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13 }}>Parts ({clothingParts.length})</span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={() => onToggleCategory(false, true)} style={{
                padding: '2px 6px', fontSize: 9, border: '1px solid #48f', borderRadius: 3,
                background: 'transparent', color: '#8af', cursor: 'pointer',
              }}>ON</button>
              <button onClick={() => onToggleCategory(false, false)} style={{
                padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
                background: 'transparent', color: '#c88', cursor: 'pointer',
              }}>OFF</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {clothingParts.map(part => (
              <button key={part.key} onClick={() => onTogglePart(part.key)} style={{
                padding: '5px 10px', fontSize: 11, textAlign: 'left',
                border: partVisibility[part.key] ? '2px solid #68f' : '1px solid #444',
                borderRadius: 4,
                background: partVisibility[part.key] ? 'rgba(60,60,180,0.35)' : 'rgba(30,30,50,0.6)',
                color: partVisibility[part.key] ? '#fff' : '#666',
                cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span>{partLabel(part.key)}</span>
                  {part.meshes.length > 1 && (
                    <span style={{ fontSize: 9, opacity: 0.4 }}>{part.meshes.join(', ')}</span>
                  )}
                </div>
                <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{
        marginTop: 16, paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 10, opacity: 0.4, lineHeight: 1.6,
      }}>
        Total: {parts.reduce((s, p) => s + p.voxels, 0).toLocaleString()} voxels
        <br />Click parts to toggle on/off
      </div>
    </>
  );
}
