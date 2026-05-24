'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'shermie_body',      label: 'Shermie Body', color: '#fcb' },
      { key: 'shermie_eyelashes', label: 'Eyelashes',    color: '#222' },
    ],
  },
  {
    group: 'Hair',
    parts: [
      { key: 'shermie_hair_main',   label: 'Hair Main',   color: '#a44' },
      { key: 'shermie_hair_detail', label: 'Hair Detail', color: '#a44' },
      { key: 'shermie_hair_tip',    label: 'Hair Tip',    color: '#a44' },
    ],
  },
  {
    group: 'Outfit (KOF Shermie)',
    parts: [
      { key: 'shermie_outfit_top',    label: 'Outfit Top',    color: '#a22' },
      { key: 'shermie_outfit_bottom', label: 'Outfit Bottom', color: '#a22' },
      { key: 'shermie_outfit_extra',  label: 'Outfit Extra',  color: '#a22' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair',
    visibleKeys: () => ['shermie_body', 'shermie_eyelashes', 'shermie_hair_main', 'shermie_hair_detail', 'shermie_hair_tip'],
    bg: 'rgba(60,40,40,0.5)',
    fg: '#fcc',
  },
  {
    label: 'Full Outfit',
    visibleKeys: () => [
      'shermie_body', 'shermie_eyelashes',
      'shermie_hair_main', 'shermie_hair_detail', 'shermie_hair_tip',
      'shermie_outfit_top', 'shermie_outfit_bottom', 'shermie_outfit_extra',
    ],
    bg: 'rgba(60,30,30,0.5)',
    fg: '#f88',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['shermie_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function ShermiePreviewPage() {
  return (
    <MustardUIPreview
      title="Shermie Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['shermie_body', 'shermie_eyelashes', 'shermie_hair_main']}
      quickPresets={QUICK_PRESETS}
      bodyKey="shermie_body"
    />
  );
}
