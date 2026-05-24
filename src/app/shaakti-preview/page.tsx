'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'shaakti_body',   label: 'Shaak Ti Body', color: '#e8a' },
      { key: 'shaakti_eyes',   label: 'Eyes',          color: '#48a' },
      { key: 'shaakti_lashes', label: 'Lashes',        color: '#222' },
      { key: 'shaakti_mouth',  label: 'Mouth',         color: '#a44' },
      { key: 'shaakti_face_lp', label: 'Face LP',      color: '#e8a' },
    ],
  },
  {
    group: 'Outfit',
    parts: [
      { key: 'shaakti_headdress',   label: 'Headdress',    color: '#864' },
      { key: 'shaakti_headwrap',    label: 'HeadWrap',     color: '#864' },
      { key: 'shaakti_beads',       label: 'Beads',        color: '#cc8' },
      { key: 'shaakti_torso_wraps', label: 'Torso Wraps',  color: '#a72' },
      { key: 'shaakti_arm_acc',     label: 'Arm Accessories', color: '#864' },
    ],
  },
  {
    group: 'Weapon',
    parts: [
      { key: 'shaakti_saber', label: 'Lightsaber', color: '#0cf' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Face',
    visibleKeys: () => ['shaakti_body', 'shaakti_eyes', 'shaakti_lashes', 'shaakti_mouth'],
    bg: 'rgba(60,40,60,0.5)',
    fg: '#fcf',
  },
  {
    label: 'Full Outfit',
    visibleKeys: () => [
      'shaakti_body', 'shaakti_eyes', 'shaakti_lashes', 'shaakti_mouth',
      'shaakti_headdress', 'shaakti_headwrap', 'shaakti_beads',
      'shaakti_torso_wraps', 'shaakti_arm_acc', 'shaakti_saber',
    ],
    bg: 'rgba(60,40,30,0.5)',
    fg: '#fc8',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['shaakti_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function ShaaktiPreviewPage() {
  return (
    <MustardUIPreview
      title="Shaak Ti Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['shaakti_body', 'shaakti_eyes', 'shaakti_lashes', 'shaakti_mouth']}
      quickPresets={QUICK_PRESETS}
      bodyKey="shaakti_body"
    />
  );
}
