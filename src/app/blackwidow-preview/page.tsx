'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Hair',
    parts: [
      { key: 'blackwidow_body',   label: 'BW Body',      color: '#fdb' },
      { key: 'blackwidow_eyes',   label: 'BW Eyes',      color: '#48a' },
      { key: 'blackwidow_lashes', label: 'BW Eyelashes', color: '#222' },
      { key: 'blackwidow_hair1',  label: 'BW Hair 1',    color: '#a55' },
      { key: 'blackwidow_hair2',  label: 'BW Hair 2',    color: '#522' },
    ],
  },
  {
    group: 'BW Suit (Signature)',
    parts: [
      { key: 'blackwidow_bw_suit',         label: 'BW Suit',          color: '#222' },
      { key: 'blackwidow_bw_harness',      label: 'BW Harness',       color: '#444' },
      { key: 'blackwidow_bw_armbands',     label: 'BW Armbands',      color: '#111' },
      { key: 'blackwidow_bw_belt',         label: 'BW Belt',          color: '#222' },
      { key: 'blackwidow_bw_boots',        label: 'BW Boots',         color: '#222' },
      { key: 'blackwidow_gun_l',           label: 'Gun L',            color: '#444' },
      { key: 'blackwidow_gun_r',           label: 'Gun R',            color: '#444' },
      { key: 'blackwidow_gun_holstered_l', label: 'Gun Holstered L',  color: '#444' },
      { key: 'blackwidow_gun_holstered_r', label: 'Gun Holstered R',  color: '#444' },
    ],
  },
  {
    group: 'Casual / Business',
    parts: [
      { key: 'blackwidow_bodysuit',      label: 'Bodysuit',        color: '#333' },
      { key: 'blackwidow_casual_pants',  label: 'Casual Pants',    color: '#446' },
      { key: 'blackwidow_casual_shirt',  label: 'Casual Shirt',    color: '#ccc' },
      { key: 'blackwidow_bw_jacket',     label: 'Business Jacket', color: '#444' },
      { key: 'blackwidow_bw_skirt',      label: 'Business Skirt',  color: '#333' },
      { key: 'blackwidow_boots',         label: 'Boots',           color: '#321' },
      { key: 'blackwidow_boots_punk',    label: 'Boots Punk',      color: '#1a1a1a' },
      { key: 'blackwidow_shoes',         label: 'Shoes',           color: '#222' },
    ],
  },
  {
    group: 'School Uniform',
    parts: [
      { key: 'blackwidow_school_choker',    label: 'School Choker',    color: '#222' },
      { key: 'blackwidow_school_shirt',     label: 'School Shirt',     color: '#fff' },
      { key: 'blackwidow_school_skirt',     label: 'School Skirt',     color: '#a44' },
      { key: 'blackwidow_school_stockings', label: 'School Stockings', color: '#222' },
      { key: 'blackwidow_school_panty',     label: 'School Panty',     color: '#fff' },
    ],
  },
  {
    group: 'Nurse Outfit',
    parts: [
      { key: 'blackwidow_nurse_corset',    label: 'Nurse Corset',    color: '#a22' },
      { key: 'blackwidow_nurse_gloves',    label: 'Nurse Gloves',    color: '#222' },
      { key: 'blackwidow_nurse_pasties',   label: 'Nurse Pasties',   color: '#a22' },
      { key: 'blackwidow_nurse_stockings', label: 'Nurse Stockings', color: '#222' },
    ],
  },
  {
    group: 'Lingerie',
    parts: [
      { key: 'blackwidow_babydoll',         label: 'Babydoll',         color: '#caa' },
      { key: 'blackwidow_corset_stockings', label: 'Corset+Stockings', color: '#444' },
      { key: 'blackwidow_pantyhose',        label: 'Pantyhose',        color: '#222' },
    ],
  },
  {
    group: 'Accessories',
    parts: [
      { key: 'blackwidow_glasses', label: 'Glasses', color: '#111' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair only',
    visibleKeys: () => ['blackwidow_body', 'blackwidow_hair1'],
    bg: 'rgba(60,40,80,0.5)',
    fg: '#fcf',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['blackwidow_body'],
    bg: 'rgba(40,60,80,0.5)',
    fg: '#cff',
  },
];

export default function BlackWidowPreviewPage() {
  return (
    <MustardUIPreview
      title="BlackWidow Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['blackwidow_body', 'blackwidow_hair1']}
      quickPresets={QUICK_PRESETS}
      bodyKey="blackwidow_body"
    />
  );
}
