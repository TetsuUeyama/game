'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Hair',
    parts: [
      { key: 'anna_body',         label: 'Anna Body',        color: '#fdb' },
      { key: 'anna_hair_classic', label: 'Anna Hair Classic', color: '#fa6' },
      { key: 'anna_hair_t8',      label: 'Anna Hair T8',      color: '#fc8' },
    ],
  },
  {
    group: 'Blackmottled',
    parts: [
      { key: 'anna_blackmottled_top',    label: 'Blackmottled Top',    color: '#666' },
      { key: 'anna_blackmottled_pants',  label: 'Blackmottled Pants',  color: '#444' },
      { key: 'anna_blackmottled_boots',  label: 'Blackmottled Boots',  color: '#321' },
      { key: 'anna_blackmottled_gloves', label: 'Blackmottled Gloves', color: '#543' },
    ],
  },
  {
    group: 'T8 (Tekken 8)',
    parts: [
      { key: 'anna_t8_top',    label: 'T8 Top',    color: '#a82' },
      { key: 'anna_t8_pants',  label: 'T8 Pants',  color: '#642' },
      { key: 'anna_t8_boots',  label: 'T8 Boots',  color: '#321' },
      { key: 'anna_t8_gloves', label: 'T8 Gloves', color: '#864' },
      { key: 'anna_t8_coat',   label: 'T8 Coat',   color: '#864' },
      { key: 'anna_t8_choker', label: 'T8 Choker', color: '#aaa' },
      { key: 'anna_t8_thong',  label: 'T8 Thong',  color: '#864' },
    ],
  },
  {
    group: 'Suit',
    parts: [
      { key: 'anna_suit_top',       label: 'Suit Top',       color: '#88a' },
      { key: 'anna_suit_skirt',     label: 'Suit Skirt',     color: '#668' },
      { key: 'anna_suit_pantyhose', label: 'Suit Pantyhose', color: '#665' },
      { key: 'anna_suit_boots',     label: 'Suit Boots',     color: '#321' },
      { key: 'anna_suit_gloves',    label: 'Suit Gloves',    color: '#88a' },
      { key: 'anna_suit_hat',       label: 'Suit Hat',       color: '#88a' },
    ],
  },
  {
    group: 'Gym',
    parts: [
      { key: 'anna_gym_croptop', label: 'Gym Croptop', color: '#fc8' },
      { key: 'anna_gym_hoodie',  label: 'Gym Hoodie',  color: '#cca' },
      { key: 'anna_gym_shorts',  label: 'Gym Shorts',  color: '#aaa' },
      { key: 'anna_gym_shoes',   label: 'Gym Shoes',   color: '#caa' },
    ],
  },
  {
    group: 'Lingerie',
    parts: [
      { key: 'anna_lingerie_bra',       label: 'Lingerie Bra',       color: '#fcc' },
      { key: 'anna_lingerie_thong',     label: 'Lingerie Thong',     color: '#fcc' },
      { key: 'anna_lingerie_stockings', label: 'Lingerie Stockings', color: '#fdd' },
      { key: 'anna_lingerie_heels',     label: 'Lingerie Heels',     color: '#fcc' },
      { key: 'anna_lingerie_sleeves',   label: 'Lingerie Sleeves',   color: '#fcc' },
      { key: 'anna_lingerie_choker',    label: 'Lingerie Choker',    color: '#fcc' },
      { key: 'anna_lingerie_pasties',   label: 'Lingerie Pasties',   color: '#fcc' },
    ],
  },
  {
    group: 'Swimsuit',
    parts: [
      { key: 'anna_swimsuit_top',    label: 'Swimsuit Top',    color: '#cef' },
      { key: 'anna_swimsuit_bottom', label: 'Swimsuit Bottom', color: '#cef' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair (T8)',
    visibleKeys: () => ['anna_body', 'anna_hair_t8'],
    bg: 'rgba(60,40,80,0.5)',
    fg: '#fcf',
  },
  {
    label: 'Body + Hair (Classic)',
    visibleKeys: () => ['anna_body', 'anna_hair_classic'],
    bg: 'rgba(40,60,80,0.5)',
    fg: '#cff',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['anna_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function AnnaPreviewPage() {
  return (
    <MustardUIPreview
      title="Anna (Tekken 8) Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['anna_body', 'anna_hair_t8']}
      quickPresets={QUICK_PRESETS}
      bodyKey="anna_body"
    />
  );
}
