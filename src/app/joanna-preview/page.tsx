'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'joanna_body',  label: 'Joanna Body', color: '#fcb' },
      { key: 'joanna_eyes',  label: 'Eyes',        color: '#48a' },
      { key: 'joanna_mouth', label: 'Mouth',       color: '#a44' },
      { key: 'joanna_hair',  label: 'Hair',        color: '#864' },
    ],
  },
  {
    group: 'Underwear',
    parts: [
      { key: 'joanna_bra',       label: 'Bra',        color: '#fcc' },
      { key: 'joanna_bra_2',     label: 'Bra 2',      color: '#fcc' },
      { key: 'joanna_panty',     label: 'Panty',      color: '#fcc' },
      { key: 'joanna_pantie_3',  label: 'Pantie 3',   color: '#fcc' },
    ],
  },
  {
    group: 'Outfits',
    parts: [
      { key: 'joanna_classic_outfit', label: 'Classic Outfit', color: '#a72' },
      { key: 'joanna_swimsuit',       label: 'Swimsuit',       color: '#aef' },
    ],
  },
  {
    group: 'Decorative Cords',
    parts: [
      { key: 'joanna_cords_chest', label: 'Cords (Chest)', color: '#cc8' },
      { key: 'joanna_cords_hip',   label: 'Cords (Hip)',   color: '#cc8' },
    ],
  },
  {
    group: 'Bracelets',
    parts: [
      { key: 'joanna_bracelet_1l', label: 'Bracelet 1 (L)', color: '#cc8' },
      { key: 'joanna_bracelet_1r', label: 'Bracelet 1 (R)', color: '#cc8' },
      { key: 'joanna_bracelet_2',  label: 'Bracelet 2',     color: '#cc8' },
      { key: 'joanna_bracelet_3',  label: 'Bracelet 3',     color: '#cc8' },
    ],
  },
  {
    group: 'Neck Accessories',
    parts: [
      { key: 'joanna_peace_choker',  label: 'Peace Choker',  color: '#444' },
      { key: 'joanna_pearl_necklace', label: 'Pearl Necklace', color: '#eee' },
    ],
  },
  {
    group: 'Piercings',
    parts: [
      { key: 'joanna_belly_piercing', label: 'Belly Piercing',  color: '#cc8' },
      { key: 'joanna_bull_nose_ring', label: 'Bull Nose Ring',  color: '#cc8' },
      { key: 'joanna_hoop_nose_ring', label: 'Hoop Nose Ring',  color: '#cc8' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Face + Hair',
    visibleKeys: () => ['joanna_body', 'joanna_eyes', 'joanna_mouth', 'joanna_hair'],
    bg: 'rgba(60,40,40,0.5)',
    fg: '#fcc',
  },
  {
    label: 'Classic Outfit',
    visibleKeys: () => [
      'joanna_body', 'joanna_eyes', 'joanna_mouth', 'joanna_hair',
      'joanna_classic_outfit',
    ],
    bg: 'rgba(60,40,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Swimsuit',
    visibleKeys: () => [
      'joanna_body', 'joanna_eyes', 'joanna_mouth', 'joanna_hair',
      'joanna_swimsuit',
    ],
    bg: 'rgba(30,50,60,0.5)',
    fg: '#aef',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['joanna_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function JoannaPreviewPage() {
  return (
    <MustardUIPreview
      title="Joanna Dark Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['joanna_body', 'joanna_eyes', 'joanna_mouth', 'joanna_hair']}
      quickPresets={QUICK_PRESETS}
      bodyKey="joanna_body"
    />
  );
}
