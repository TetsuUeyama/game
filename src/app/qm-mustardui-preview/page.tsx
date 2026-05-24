'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'body',  label: 'Body',  color: '#faa' },
      { key: 'hair',  label: 'Hair',  color: '#fa8' },
      { key: 'eyes',  label: 'Eyes',  color: '#fff' },
    ],
  },
  {
    group: 'Default Outfit',
    parts: [
      { key: 'dress',         label: 'Dress',         color: '#f8f' },
      { key: 'belt',          label: 'Belt',          color: '#ff8' },
      { key: 'panties',       label: 'Panties',       color: '#8ff' },
      { key: 'thigh_strap_l', label: 'ThighStrap L',  color: '#88f' },
      { key: 'thigh_strap_r', label: 'ThighStrap R',  color: '#8af' },
      { key: 'heels',         label: 'Heels',         color: '#cca' },
      { key: 'armband',       label: 'Armband',       color: '#8f8' },
      { key: 'bracelet',      label: 'Bracelet',      color: '#afa' },
      { key: 'circlet',       label: 'Circlet',       color: '#faf' },
      { key: 'necklace',      label: 'Necklace',      color: '#aaf' },
    ],
  },
  {
    group: 'Golden Bikini',
    parts: [
      { key: 'bikini_bra',             label: 'Bra',                       color: '#fc8' },
      { key: 'bikini_bra_cup',         label: 'Bra Cup (no strap, thin)',  color: '#fa6' },
      { key: 'bikini_panties',         label: 'Panties',                   color: '#fc8' },
      { key: 'bikini_panties_crotch',  label: 'Panties Crotch (back)',     color: '#f80' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair only',
    visibleKeys: () => ['body', 'hair'],
    bg: 'rgba(60,40,80,0.5)',
    fg: '#fcf',
  },
  {
    label: 'Default Set',
    visibleKeys: (all) => all.filter(k => !k.startsWith('bikini_')),
    bg: 'rgba(40,60,80,0.5)',
    fg: '#cff',
  },
];

const EFFECT_SLOTS_PER_PART: Record<string, string[]> = {
  body:  ['blush_color', 'tattoo_color', 'tattoo_emissive'],
  dress: ['dress_color_red', 'dress_color_white'],
};

const PART_FORWARD_OFFSET: Record<string, number> = {
  eyes: -0.002,
};

const INSIDE_BODY_PARTS = new Set<string>(['eyes']);

export default function QMMustardUIPreviewPage() {
  return (
    <MustardUIPreview
      title="QM MustardUI Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['body', 'hair', 'eyes']}
      quickPresets={QUICK_PRESETS}
      insideBodyParts={INSIDE_BODY_PARTS}
      partForwardOffset={PART_FORWARD_OFFSET}
      effectSlotsPerPart={EFFECT_SLOTS_PER_PART}
      showMustardUIEffects={true}
    />
  );
}
