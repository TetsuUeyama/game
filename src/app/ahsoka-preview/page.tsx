'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'ahsoka_body',   label: 'Ahsoka Body', color: '#e9b' },
      { key: 'ahsoka_eye',    label: 'Eyes',        color: '#48a' },
      { key: 'ahsoka_lashes', label: 'Lashes',      color: '#222' },
      { key: 'ahsoka_mouth',  label: 'Mouth',       color: '#a44' },
    ],
  },
  {
    group: 'Bikini',
    parts: [
      { key: 'ahsoka_bikini_top',     label: 'Bikini Top',     color: '#fcc' },
      { key: 'ahsoka_bikini_bottoms', label: 'Bikini Bottoms', color: '#fcc' },
    ],
  },
  {
    group: 'Swimsuit',
    parts: [
      { key: 'ahsoka_swimsuit', label: 'Swimsuit', color: '#aef' },
    ],
  },
  {
    group: 'Casual',
    parts: [
      { key: 'ahsoka_top',        label: 'Top',        color: '#ccf' },
      { key: 'ahsoka_sporty_top', label: 'Sporty Top', color: '#fca' },
      { key: 'ahsoka_shorts',     label: 'Shorts',     color: '#888' },
      { key: 'ahsoka_socks',      label: 'Socks',      color: '#eee' },
    ],
  },
  {
    group: 'Hoodie Outfit',
    parts: [
      { key: 'ahsoka_frontless_hooddie', label: 'Frontless Hoodie', color: '#aaa' },
      { key: 'ahsoka_chucks',            label: 'Chucks',           color: '#321' },
    ],
  },
  {
    group: 'Accessories',
    parts: [
      { key: 'ahsoka_boots',          label: 'Boots',          color: '#321' },
      { key: 'ahsoka_choker',         label: 'Choker',         color: '#444' },
      { key: 'ahsoka_gloves',         label: 'Gloves',         color: '#332' },
      { key: 'ahsoka_headband',       label: 'Headband',       color: '#864' },
      { key: 'ahsoka_high_socks',     label: 'High Socks',     color: '#aaa' },
      { key: 'ahsoka_leg_belt',       label: 'Leg Belt',       color: '#642' },
      { key: 'ahsoka_leg_belt_cage',  label: 'Leg Belt Cage',  color: '#642' },
    ],
  },
  {
    group: 'Rebels (Star Wars Rebels)',
    parts: [
      { key: 'ahsoka_rebels_belt',         label: 'Rebels Belt',         color: '#642' },
      { key: 'ahsoka_rebels_boots',        label: 'Rebels Boots',        color: '#321' },
      { key: 'ahsoka_rebels_chest_armor',  label: 'Rebels Chest Armor',  color: '#544' },
      { key: 'ahsoka_rebels_dress',        label: 'Rebels Dress',        color: '#a72' },
      { key: 'ahsoka_rebels_dress_001',    label: 'Rebels Dress (2)',    color: '#a72' },
      { key: 'ahsoka_rebels_headgear',     label: 'Rebels Headgear',     color: '#864' },
      { key: 'ahsoka_rebels_leggings',     label: 'Rebels Leggings',     color: '#666' },
      { key: 'ahsoka_rebels_sleeves',      label: 'Rebels Sleeves',      color: '#a72' },
    ],
  },
  {
    group: 'S5 (Clone Wars S5)',
    parts: [
      { key: 'ahsoka_s5_belt',          label: 'S5 Belt',          color: '#642' },
      { key: 'ahsoka_s5_boots',         label: 'S5 Boots',         color: '#321' },
      { key: 'ahsoka_s5_dress',         label: 'S5 Dress',         color: '#864' },
      { key: 'ahsoka_s5_headdress',     label: 'S5 Headdress',     color: '#864' },
      { key: 'ahsoka_s5_headdress_001', label: 'S5 Headdress (2)', color: '#864' },
      { key: 'ahsoka_s5_sabers',        label: 'S5 Sabers',        color: '#0cf' },
      { key: 'ahsoka_s5_sabers_001',    label: 'S5 Sabers (2)',    color: '#0cf' },
      { key: 'ahsoka_s5_sleeves',       label: 'S5 Sleeves',       color: '#864' },
      { key: 'ahsoka_s5_leggings',      label: 'S5 Leggings',      color: '#666' },
    ],
  },
  {
    group: 'S7 (Clone Wars S7)',
    parts: [
      { key: 'ahsoka_s7_belt',             label: 'S7 Belt',             color: '#642' },
      { key: 'ahsoka_s7_boots',            label: 'S7 Boots',            color: '#321' },
      { key: 'ahsoka_s7_gauntlets',        label: 'S7 Gauntlets',        color: '#544' },
      { key: 'ahsoka_s7_headband',         label: 'S7 Headband',         color: '#864' },
      { key: 'ahsoka_s7_leggings',         label: 'S7 Leggings',         color: '#666' },
      { key: 'ahsoka_s7_sabers_holstered', label: 'S7 Sabers Holstered', color: '#aaa' },
      { key: 'ahsoka_s7_skirt',            label: 'S7 Skirt',            color: '#864' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Face',
    visibleKeys: () => ['ahsoka_body', 'ahsoka_eye', 'ahsoka_lashes', 'ahsoka_mouth'],
    bg: 'rgba(60,40,60,0.5)',
    fg: '#fcc',
  },
  {
    label: 'S7 Outfit (Clone Wars)',
    visibleKeys: () => [
      'ahsoka_body', 'ahsoka_eye', 'ahsoka_lashes', 'ahsoka_mouth',
      'ahsoka_s7_belt', 'ahsoka_s7_boots', 'ahsoka_s7_gauntlets',
      'ahsoka_s7_headband', 'ahsoka_s7_leggings', 'ahsoka_s7_sabers_holstered',
      'ahsoka_s7_skirt',
    ],
    bg: 'rgba(60,40,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Rebels Outfit',
    visibleKeys: () => [
      'ahsoka_body', 'ahsoka_eye', 'ahsoka_lashes', 'ahsoka_mouth',
      'ahsoka_rebels_belt', 'ahsoka_rebels_boots', 'ahsoka_rebels_chest_armor',
      'ahsoka_rebels_dress', 'ahsoka_rebels_headgear', 'ahsoka_rebels_leggings',
      'ahsoka_rebels_sleeves',
    ],
    bg: 'rgba(60,40,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['ahsoka_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function AhsokaPreviewPage() {
  return (
    <MustardUIPreview
      title="Ahsoka Tano Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['ahsoka_body', 'ahsoka_eye', 'ahsoka_lashes', 'ahsoka_mouth']}
      quickPresets={QUICK_PRESETS}
      bodyKey="ahsoka_body"
    />
  );
}
