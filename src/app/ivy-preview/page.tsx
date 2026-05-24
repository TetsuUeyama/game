'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'ivy_body',      label: 'Ivy Body',      color: '#fcb' },
      { key: 'ivy_eyelashes', label: 'Eyelashes',     color: '#222' },
      { key: 'ivy_eyebrows',  label: 'Eyebrows',      color: '#532' },
    ],
  },
  {
    group: 'Hair',
    parts: [
      { key: 'ivy_hair',     label: 'Ivy Hair',     color: '#864' },
      { key: 'ivy_hair_nun', label: 'Ivy Hair Nun', color: '#864' },
    ],
  },
  {
    group: 'Bikini',
    parts: [
      { key: 'ivy_gold_bikini',  label: 'Gold Bikini',  color: '#cc8' },
      { key: 'ivy_hot_bikini',   label: 'Hot Bikini',   color: '#fcc' },
    ],
  },
  {
    group: 'Dresses',
    parts: [
      { key: 'ivy_dress',      label: 'Dress',       color: '#a72' },
      { key: 'ivy_dress_2',    label: 'Dress (2)',   color: '#a72' },
      { key: 'ivy_xfs2_dress', label: 'XFS2 Dress',  color: '#a72' },
    ],
  },
  {
    group: 'Bodysuits',
    parts: [
      { key: 'ivy_sheer_bodysuit', label: 'Sheer Bodysuit', color: '#fcc' },
      { key: 'ivy_bodysuit',       label: 'Bodysuit',       color: '#444' },
    ],
  },
  {
    group: 'Secretary',
    parts: [
      { key: 'ivy_secretary_top',     label: 'Secretary Top',     color: '#fff' },
      { key: 'ivy_secretary_skirt',   label: 'Secretary Skirt',   color: '#321' },
      { key: 'ivy_secretary_glasses', label: 'Secretary Glasses', color: '#111' },
    ],
  },
  {
    group: 'Ivy Armor',
    parts: [
      { key: 'ivy_armor',     label: 'Ivy Armor',     color: '#544' },
      { key: 'ivy_arm_left',  label: 'Ivy Arm Left',  color: '#544' },
      { key: 'ivy_arm_right', label: 'Ivy Arm Right', color: '#544' },
    ],
  },
  {
    group: 'Footwear',
    parts: [
      { key: 'ivy_boots',       label: 'Boots',         color: '#321' },
      { key: 'ivy_heels',       label: 'Heels',         color: '#321' },
      { key: 'ivy_heels_001',   label: 'Heels (2)',     color: '#321' },
      { key: 'ivy_heels_002',   label: 'Heels (3)',     color: '#321' },
      { key: 'ivy_heels_003',   label: 'Heels (4)',     color: '#321' },
      { key: 'ivy_heels_004',   label: 'Heels (5)',     color: '#321' },
      { key: 'ivy_heels_005',   label: 'Heels (6)',     color: '#321' },
      { key: 'ivy_heels_006',   label: 'Heels (7)',     color: '#321' },
      { key: 'ivy_high_heels',  label: 'High Heels',    color: '#321' },
      { key: 'ivy_shoes',       label: 'Shoes',         color: '#321' },
    ],
  },
  {
    group: 'Hosiery',
    parts: [
      { key: 'ivy_pantyhose', label: 'Pantyhose', color: '#666' },
      { key: 'ivy_stocking',  label: 'Stocking',  color: '#666' },
    ],
  },
  {
    group: 'Underwear',
    parts: [
      { key: 'ivy_bra',             label: 'Bra',            color: '#fcc' },
      { key: 'ivy_panty',           label: 'Panty',          color: '#fcc' },
      { key: 'ivy_cheeky_panties',  label: 'Cheeky Panties', color: '#fcc' },
      { key: 'ivy_garter',          label: 'Garter',         color: '#fcc' },
      { key: 'ivy_qoh_top',         label: 'QOH Top',        color: '#a22' },
      { key: 'ivy_qoh_panty',       label: 'QOH Panty',      color: '#a22' },
    ],
  },
  {
    group: 'Accessories',
    parts: [
      { key: 'ivy_qos_collar',    label: 'QOS Collar',    color: '#321' },
      { key: 'ivy_head_scarf',    label: 'Head Scarf',    color: '#864' },
      { key: 'ivy_necklace',      label: 'Necklace',      color: '#cc8' },
      { key: 'ivy_earring',       label: 'Earring',       color: '#cc8' },
      { key: 'ivy_glasses',       label: 'Glasses',       color: '#111' },
      { key: 'ivy_elbow',         label: 'Elbow',         color: '#544' },
      { key: 'ivy_shoulder',      label: 'Shoulder',      color: '#544' },
    ],
  },
  {
    group: 'Nails & Claws',
    parts: [
      { key: 'ivy_nail1', label: 'Nail 1', color: '#fcc' },
      { key: 'ivy_nail2', label: 'Nail 2', color: '#fcc' },
      { key: 'ivy_nail3', label: 'Nail 3', color: '#fcc' },
      { key: 'ivy_nail4', label: 'Nail 4', color: '#fcc' },
      { key: 'ivy_nail5', label: 'Nail 5', color: '#fcc' },
      { key: 'ivy_claw1', label: 'Claw 1', color: '#aaa' },
      { key: 'ivy_claw2', label: 'Claw 2', color: '#aaa' },
      { key: 'ivy_claw3', label: 'Claw 3', color: '#aaa' },
      { key: 'ivy_claw4', label: 'Claw 4', color: '#aaa' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair',
    visibleKeys: () => ['ivy_body', 'ivy_eyelashes', 'ivy_eyebrows', 'ivy_hair'],
    bg: 'rgba(60,40,40,0.5)',
    fg: '#fcc',
  },
  {
    label: 'Ivy Armor (signature)',
    visibleKeys: () => [
      'ivy_body', 'ivy_eyelashes', 'ivy_eyebrows', 'ivy_hair',
      'ivy_armor', 'ivy_arm_left', 'ivy_arm_right',
    ],
    bg: 'rgba(60,40,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Secretary',
    visibleKeys: () => [
      'ivy_body', 'ivy_eyelashes', 'ivy_eyebrows', 'ivy_hair',
      'ivy_secretary_top', 'ivy_secretary_skirt', 'ivy_secretary_glasses',
      'ivy_high_heels',
    ],
    bg: 'rgba(40,40,50,0.5)',
    fg: '#cce',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['ivy_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function IvyPreviewPage() {
  return (
    <MustardUIPreview
      title="Ivy Valentine Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['ivy_body', 'ivy_eyelashes', 'ivy_eyebrows', 'ivy_hair']}
      quickPresets={QUICK_PRESETS}
      bodyKey="ivy_body"
    />
  );
}
