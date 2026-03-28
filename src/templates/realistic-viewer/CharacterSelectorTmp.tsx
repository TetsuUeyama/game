'use client';

type CharCategory = 'female' | 'male' | 'base' | 'weapons';

interface CharacterConfig {
  label: string;
  category: CharCategory;
}

type Props = {
  characters: Record<string, CharacterConfig>;
  selectedCategory: CharCategory;
  charKey: string;
  onCategoryChange: (cat: CharCategory, firstKey: string) => void;
  onCharChange: (key: string) => void;
};

export function CharacterSelectorTmp({ characters, selectedCategory, charKey, onCategoryChange, onCharChange }: Props) {
  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['base', 'female', 'male', 'weapons'] as CharCategory[]).map(cat => (
          <button key={cat} onClick={() => {
            const first = Object.entries(characters).find(([, c]) => c.category === cat);
            if (first) onCategoryChange(cat, first[0]);
          }} style={{
            flex: 1, padding: '5px 0', fontSize: 11, fontWeight: selectedCategory === cat ? 'bold' : 'normal',
            border: selectedCategory === cat ? '2px solid #fa0' : '1px solid #555',
            borderRadius: 4, cursor: 'pointer',
            background: selectedCategory === cat ? 'rgba(180,120,0,0.25)' : 'rgba(40,40,60,0.4)',
            color: selectedCategory === cat ? '#fda' : '#999',
            textTransform: 'capitalize',
          }}>
            {cat}
          </button>
        ))}
      </div>
      <select
        value={charKey}
        onChange={(e) => onCharChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 14,
          background: '#1a1a2e', color: '#fda', border: '1px solid #fa0',
          borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        {Object.entries(characters)
          .filter(([, c]) => c.category === selectedCategory)
          .map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
      </select>
    </>
  );
}
