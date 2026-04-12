'use client';

interface PartEntry {
  key: string;
  voxels: number;
  meshes: string[];
  is_body: boolean;
  category?: string;
}

type Props = {
  parts: PartEntry[];
  partVisibility: Record<string, boolean>;
  loadingParts?: Set<string>;
  onTogglePart: (key: string) => void;
  onToggleAll: (on: boolean) => void;
  onToggleCategory: (isBody: boolean, on: boolean) => void;
};

function partLabel(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    .replace('  ', ' ').trim();
}

/** パーツキーからテーマ名を抽出（例: "nina_battlesuit_suit" → "Nina Battlesuit"） */
function extractTheme(key: string): string | null {
  // パターン: {source}_{theme}_{part} (例: nina_battlesuit_suit, helena_witch_corset)
  const sources = ['nina', 'helena', 'rachel', 'queenmarika', 'queen'];
  for (const src of sources) {
    if (key.startsWith(src + '_')) {
      const rest = key.slice(src.length + 1);
      const parts = rest.split('_');
      if (parts.length >= 2) {
        // テーマ名 = ソース名を除いた最初のセグメント
        const theme = parts[0];
        const srcLabel = src.charAt(0).toUpperCase() + src.slice(1);
        const themeLabel = theme.charAt(0).toUpperCase() + theme.slice(1);
        return `${srcLabel} ${themeLabel}`;
      }
    }
  }
  return null;
}

/** テーマ別にパーツをグループ化 */
function groupByTheme(parts: PartEntry[]): { theme: string; parts: PartEntry[] }[] {
  const themeMap = new Map<string, PartEntry[]>();
  const ungrouped: PartEntry[] = [];

  for (const part of parts) {
    const theme = extractTheme(part.key);
    if (theme) {
      if (!themeMap.has(theme)) themeMap.set(theme, []);
      themeMap.get(theme)!.push(part);
    } else {
      ungrouped.push(part);
    }
  }

  const groups: { theme: string; parts: PartEntry[] }[] = [];
  if (ungrouped.length > 0) groups.push({ theme: 'Original', parts: ungrouped });
  for (const [theme, themeParts] of themeMap) {
    groups.push({ theme, parts: themeParts });
  }
  return groups;
}

export function PartListTmp({ parts, partVisibility, loadingParts, onTogglePart, onToggleAll, onToggleCategory }: Props) {
  const bodyParts = parts.filter(p => p.is_body);
  const hairParts = parts.filter(p => !p.is_body && p.category === 'hair');
  const outfitParts = parts.filter(p => !p.is_body && p.category !== 'hair');
  const themeGroups = groupByTheme(outfitParts);

  const setThemeOn = (themeParts: PartEntry[]) => {
    // まず全outfitをOFFにしてからこのテーマだけON
    for (const p of outfitParts) {
      if (partVisibility[p.key]) onTogglePart(p.key);
    }
    for (const p of themeParts) {
      if (!partVisibility[p.key]) onTogglePart(p.key);
    }
  };

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

      {/* Body */}
      {bodyParts.length > 0 && (
        <Section title="Body" count={bodyParts.length} color="#8c8"
          onAllOn={() => onToggleCategory(true, true)} onAllOff={() => onToggleCategory(true, false)}>
          {bodyParts.map(part => (
            <PartButton key={part.key} part={part} on={partVisibility[part.key]} loading={loadingParts?.has(part.key)} onClick={() => onTogglePart(part.key)} color="#6a6" />
          ))}
        </Section>
      )}

      {/* Hair */}
      {hairParts.length > 0 && (
        <Section title="Hair" count={hairParts.length} color="#fa8">
          {hairParts.map(part => (
            <PartButton key={part.key} part={part} on={partVisibility[part.key]} loading={loadingParts?.has(part.key)} onClick={() => onTogglePart(part.key)} color="#f80" />
          ))}
        </Section>
      )}

      {/* Outfit themes */}
      {themeGroups.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontWeight: 'bold', color: '#8af', fontSize: 13, display: 'block', marginBottom: 8 }}>
            Outfits ({outfitParts.length})
          </span>
          {themeGroups.map(group => {
            const anyOn = group.parts.some(p => partVisibility[p.key]);
            return (
              <div key={group.theme} style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                  background: anyOn ? 'rgba(60,60,180,0.25)' : 'rgba(30,30,50,0.4)',
                  border: anyOn ? '1px solid #68f' : '1px solid #333',
                  marginBottom: 3,
                }} onClick={() => setThemeOn(group.parts)}>
                  <span style={{ fontSize: 11, fontWeight: 'bold', color: anyOn ? '#adf' : '#777' }}>
                    {group.theme} ({group.parts.length})
                  </span>
                  <span style={{ fontSize: 9, color: '#555' }}>click to wear</span>
                </div>
                {anyOn && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 10 }}>
                    {group.parts.map(part => (
                      <PartButton key={part.key} part={part} on={partVisibility[part.key]} loading={loadingParts?.has(part.key)} onClick={() => onTogglePart(part.key)} color="#68f" small />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 16, paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: 10, opacity: 0.4, lineHeight: 1.6,
      }}>
        Total: {parts.reduce((s, p) => s + p.voxels, 0).toLocaleString()} voxels
        <br />Click theme to wear outfit set
      </div>
    </>
  );
}

function Section({ title, count, color, children, onAllOn, onAllOff }: {
  title: string; count: number; color: string; children: React.ReactNode;
  onAllOn?: () => void; onAllOff?: () => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 'bold', color, fontSize: 13 }}>{title} ({count})</span>
        {onAllOn && onAllOff && (
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={onAllOn} style={{
              padding: '2px 6px', fontSize: 9, border: `1px solid ${color}`, borderRadius: 3,
              background: 'transparent', color, cursor: 'pointer',
            }}>ON</button>
            <button onClick={onAllOff} style={{
              padding: '2px 6px', fontSize: 9, border: '1px solid #a44', borderRadius: 3,
              background: 'transparent', color: '#c88', cursor: 'pointer',
            }}>OFF</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>{children}</div>
    </div>
  );
}

function PartButton({ part, on, loading, onClick, color, small }: {
  part: PartEntry; on: boolean; loading?: boolean; onClick: () => void; color: string; small?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: small ? '3px 8px' : '5px 10px', fontSize: small ? 10 : 11, textAlign: 'left',
      border: on ? `2px solid ${color}` : '1px solid #444',
      borderRadius: 4,
      background: loading ? 'rgba(80,80,40,0.3)' : on ? `${color}22` : 'rgba(30,30,50,0.6)',
      color: loading ? '#ff8' : on ? '#fff' : '#666',
      cursor: loading ? 'wait' : 'pointer',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span>{loading ? 'Loading...' : partLabel(part.key)}</span>
      <span style={{ fontSize: 9, opacity: 0.5 }}>{part.voxels.toLocaleString()}</span>
    </button>
  );
}
