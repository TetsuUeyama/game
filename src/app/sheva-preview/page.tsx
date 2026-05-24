'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'sheva_body',      label: 'Sheva Body', color: '#c87' },
      { key: 'sheva_eyelashes', label: 'Eyelashes',  color: '#222' },
    ],
  },
  {
    group: 'Hair',
    parts: [
      { key: 'sheva_hair', label: 'Hair', color: '#542' },
    ],
  },
  {
    group: 'Outfit (Resident Evil 5)',
    parts: [
      { key: 'sheva_top',         label: 'Top',         color: '#864' },
      { key: 'sheva_pants',       label: 'Pants',       color: '#321' },
      { key: 'sheva_harness',     label: 'Harness',     color: '#544' },
      { key: 'sheva_belt_1',      label: 'Belt 1',      color: '#642' },
      { key: 'sheva_belt_2',      label: 'Belt 2',      color: '#642' },
      { key: 'sheva_bracer',      label: 'Bracer',      color: '#544' },
      { key: 'sheva_glove',       label: 'Glove',       color: '#321' },
      { key: 'sheva_armlet',      label: 'Armlet',      color: '#cc8' },
      { key: 'sheva_necklace_1',  label: 'Necklace 1',  color: '#cc8' },
      { key: 'sheva_necklace_2',  label: 'Necklace 2',  color: '#cc8' },
      { key: 'sheva_boot',        label: 'Boot',        color: '#321' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair',
    visibleKeys: () => ['sheva_body', 'sheva_eyelashes', 'sheva_hair'],
    bg: 'rgba(60,40,40,0.5)',
    fg: '#fcc',
  },
  {
    label: 'Full Outfit',
    visibleKeys: () => [
      'sheva_body', 'sheva_eyelashes', 'sheva_hair',
      'sheva_top', 'sheva_pants', 'sheva_harness',
      'sheva_belt_1', 'sheva_belt_2',
      'sheva_bracer', 'sheva_glove', 'sheva_armlet',
      'sheva_necklace_1', 'sheva_necklace_2',
      'sheva_boot',
    ],
    bg: 'rgba(60,30,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['sheva_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function ShevaPreviewPage() {
  return (
    <MustardUIPreview
      title="Sheva Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['sheva_body', 'sheva_eyelashes', 'sheva_hair']}
      quickPresets={QUICK_PRESETS}
      bodyKey="sheva_body"
    />
  );
}
