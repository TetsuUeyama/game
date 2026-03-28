'use client';

import type { VoxelEntry } from '@/types/vox';

interface TemplateInfo {
  key: string;
  label: string;
  labelJa: string;
  color: [number, number, number];
}

interface SavedTemplate {
  name: string;
  size: number;
}

type Props = {
  templates: TemplateInfo[];
  generatedTemplates: Record<string, VoxelEntry[]>;
  savedFiles: SavedTemplate[];
  selectedTemplate: string | null;
  generating: boolean;
  bodyLoaded: boolean;
  onGenerate: (key: string) => void;
  onPreview: (key: string, voxels: VoxelEntry[]) => void;
  onDownload: (key: string) => void;
  onSave: (key: string) => void;
};

export function TemplateCardListTmp({
  templates, generatedTemplates, savedFiles, selectedTemplate,
  generating, bodyLoaded, onGenerate, onPreview, onDownload, onSave,
}: Props) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Templates</div>
      {templates.map(tmpl => {
        const gen = generatedTemplates[tmpl.key];
        const saved = savedFiles.find(f => f.name === tmpl.key);
        const isSelected = selectedTemplate === tmpl.key;
        return (
          <div key={tmpl.key} style={{
            marginBottom: 6, padding: '8px', borderRadius: 4,
            background: isSelected ? '#1a2a3a' : '#111',
            border: `1px solid ${isSelected ? '#48f' : '#2a2a3a'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                background: `rgb(${tmpl.color.map(c => Math.round(c * 255)).join(',')})`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 'bold', flex: 1 }}>{tmpl.labelJa}</span>
              <span style={{ fontSize: 9, color: '#666' }}>{tmpl.label}</span>
            </div>
            {gen && <div style={{ fontSize: 10, color: '#4c4', marginBottom: 4 }}>{gen.length} voxels</div>}
            {saved && <div style={{ fontSize: 9, color: '#886', marginBottom: 4 }}>Saved: {(saved.size / 1024).toFixed(1)} KB</div>}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => onGenerate(tmpl.key)} disabled={generating || !bodyLoaded}
                style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#253', color: '#8cf', border: '1px solid #48f', cursor: 'pointer' }}>
                Generate
              </button>
              {gen && (<>
                <button onClick={() => onPreview(tmpl.key, gen)}
                  style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer' }}>
                  Preview
                </button>
                <button onClick={() => onDownload(tmpl.key)}
                  style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#234', color: '#aaa', border: '1px solid #555', cursor: 'pointer' }}>
                  .vox
                </button>
                <button onClick={() => onSave(tmpl.key)}
                  style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#342', color: '#ac8', border: '1px solid #584', cursor: 'pointer' }}>
                  Save
                </button>
              </>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
