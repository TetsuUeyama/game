'use client';

import MustardUIPreview, {
  MustardUIPartGroup, QuickPreset,
} from '@/components/MustardUIPreview';

const PART_GROUPS: MustardUIPartGroup[] = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'nina_body',      label: 'Nina Body',      color: '#fdb' },
      { key: 'nina_eyes',      label: 'Nina Eyes',      color: '#48a' },
      { key: 'nina_eyebrows',  label: 'Nina Eyebrows',  color: '#532' },
      { key: 'nina_eyelashes', label: 'Nina Eyelashes', color: '#222' },
      { key: 'nina_tear',      label: 'Nina Tear',      color: '#ace' },
      { key: 'nina_teeth_up',  label: 'Nina Teeth Up',  color: '#eed' },
      { key: 'nina_teeth_low', label: 'Nina Teeth Low', color: '#eed' },
      { key: 'nina_tongue',    label: 'Nina Tongue',    color: '#e88' },
    ],
  },
  {
    group: 'Hair',
    parts: [
      { key: 'nina_hair_dbd',      label: 'Hair DBD',      color: '#a76' },
      { key: 'nina_hair_ponytail', label: 'Hair Ponytail', color: '#a76' },
      { key: 'nina_hair_t8',       label: 'Hair T8',       color: '#a76' },
    ],
  },
  {
    group: 'Battlesuit',
    parts: [
      { key: 'nina_battlesuit_suit',    label: 'Battle Suit',    color: '#444' },
      { key: 'nina_battlesuit_boots',   label: 'Battle Boots',   color: '#321' },
      { key: 'nina_battlesuit_gloves',  label: 'Battle Gloves',  color: '#444' },
      { key: 'nina_battlesuit_holster', label: 'Battle Holster', color: '#321' },
    ],
  },
  {
    group: 'Biker Suit',
    parts: [
      { key: 'nina_biker_jacket', label: 'Biker Jacket', color: '#333' },
      { key: 'nina_biker_bottom', label: 'Biker Bottom', color: '#333' },
      { key: 'nina_biker_gloves', label: 'Biker Gloves', color: '#222' },
      { key: 'nina_biker_boots',  label: 'Biker Boots',  color: '#321' },
    ],
  },
  {
    group: 'Casual',
    parts: [
      { key: 'nina_casual_top',              label: 'Casual Top',              color: '#cca' },
      { key: 'nina_casual_bra',              label: 'Casual Bra',              color: '#fcc' },
      { key: 'nina_casual_leggings',         label: 'Casual Leggings',         color: '#666' },
      { key: 'nina_casual_leggings_exposed', label: 'Casual Leggings (Exp)',   color: '#666' },
      { key: 'nina_casual_shoes',            label: 'Casual Shoes',            color: '#321' },
    ],
  },
  {
    group: 'Gym',
    parts: [
      { key: 'nina_gym_sports_bra', label: 'Gym Sports Bra', color: '#fc8' },
      { key: 'nina_gym_shorts',     label: 'Gym Shorts',     color: '#aaa' },
      { key: 'nina_gym_shoes',      label: 'Gym Shoes',      color: '#caa' },
    ],
  },
  {
    group: 'Intelligence Outfit',
    parts: [
      { key: 'nina_intel_jacket',      label: 'Intel Jacket',      color: '#444' },
      { key: 'nina_intel_pants',       label: 'Intel Pants',       color: '#332' },
      { key: 'nina_intel_boots',       label: 'Intel Boots',       color: '#321' },
      { key: 'nina_intel_gloves',      label: 'Intel Gloves',      color: '#222' },
      { key: 'nina_intel_scarf',       label: 'Intel Scarf',       color: '#a44' },
      { key: 'nina_intel_necklace',    label: 'Intel Necklace',    color: '#cc8' },
      { key: 'nina_intel_leg_belt',    label: 'Intel Leg Belt',    color: '#642' },
      { key: 'nina_intel_gun',         label: 'Intel Gun',         color: '#444' },
      { key: 'nina_intel_gun_holster', label: 'Intel Gun Holster', color: '#321' },
    ],
  },
  {
    group: 'Lingerie',
    parts: [
      { key: 'nina_lingerie_suit',      label: 'Lingerie Suit',      color: '#fcc' },
      { key: 'nina_lingerie_stockings', label: 'Lingerie Stockings', color: '#fdd' },
      { key: 'nina_lingerie_sleeves',   label: 'Lingerie Sleeves',   color: '#fcc' },
    ],
  },
  {
    group: 'Swimsuit',
    parts: [
      { key: 'nina_swimsuit_swimsuit',                 label: 'Swimsuit',              color: '#cef' },
      { key: 'nina_swimsuit_swimsuit_exposed_left',    label: 'Swimsuit (Exp L)',      color: '#cef' },
      { key: 'nina_swimsuit_swimsuit_exposed_right',   label: 'Swimsuit (Exp R)',      color: '#cef' },
      { key: 'nina_swimsuit_arm_acc',                  label: 'Swimsuit Arm Acc',      color: '#cef' },
      { key: 'nina_swimsuit_leg_acc',                  label: 'Swimsuit Leg Acc',      color: '#cef' },
      { key: 'nina_swimsuit_shoes',                    label: 'Swimsuit Shoes',        color: '#cef' },
    ],
  },
  {
    group: 'T8 Swimsuit',
    parts: [
      { key: 'nina_t8_swimsuit_top',                  label: 'T8 Sw Top',          color: '#cef' },
      { key: 'nina_t8_swimsuit_top_exposed',          label: 'T8 Sw Top (Exp)',    color: '#cef' },
      { key: 'nina_t8_swimsuit_bottom',               label: 'T8 Sw Bottom',       color: '#cef' },
      { key: 'nina_t8_swimsuit_bottom_exposed_left',  label: 'T8 Sw Bot (Exp L)',  color: '#cef' },
      { key: 'nina_t8_swimsuit_bottom_exposed_right', label: 'T8 Sw Bot (Exp R)',  color: '#cef' },
    ],
  },
  {
    group: 'Tekken 8',
    parts: [
      { key: 'nina_t8_jacket',                label: 'T8 Jacket',           color: '#864' },
      { key: 'nina_t8_dress',                 label: 'T8 Dress',            color: '#a82' },
      { key: 'nina_t8_belt',                  label: 'T8 Belt',             color: '#642' },
      { key: 'nina_t8_stockings',             label: 'T8 Stockings',        color: '#666' },
      { key: 'nina_t8_panties',               label: 'T8 Panties',          color: '#864' },
      { key: 'nina_t8_panties_exposed_left',  label: 'T8 Panties (Exp L)',  color: '#864' },
      { key: 'nina_t8_panties_exposed_right', label: 'T8 Panties (Exp R)',  color: '#864' },
      { key: 'nina_t8_shoes',                 label: 'T8 Shoes',            color: '#321' },
      { key: 'nina_t8_glove_l',               label: 'T8 Glove L',          color: '#864' },
      { key: 'nina_t8_glove_r',               label: 'T8 Glove R',          color: '#864' },
      { key: 'nina_t8_gun',                   label: 'T8 Gun',              color: '#222' },
      { key: 'nina_t8_knife',                 label: 'T8 Knife',            color: '#aaa' },
    ],
  },
  {
    group: 'Wedding',
    parts: [
      { key: 'nina_wedding_dress',                label: 'Wedding Dress',          color: '#fff' },
      { key: 'nina_wedding_dress_skirt',          label: 'Wedding Skirt',          color: '#fff' },
      { key: 'nina_wedding_veil',                 label: 'Wedding Veil',           color: '#fff' },
      { key: 'nina_wedding_gloves',               label: 'Wedding Gloves',         color: '#fff' },
      { key: 'nina_wedding_shoes',                label: 'Wedding Shoes',          color: '#eed' },
      { key: 'nina_wedding_bracelet',             label: 'Wedding Bracelet',       color: '#cc8' },
      { key: 'nina_wedding_earrings',             label: 'Wedding Earrings',       color: '#cc8' },
      { key: 'nina_wedding_panty',                label: 'Wedding Panty',          color: '#fff' },
      { key: 'nina_wedding_panty_exposed_left',   label: 'Wedding Panty (Exp L)',  color: '#fff' },
      { key: 'nina_wedding_panty_exposed_right',  label: 'Wedding Panty (Exp R)',  color: '#fff' },
      { key: 'nina_wedding_leg_bands',            label: 'Wedding Leg Bands',      color: '#eee' },
      { key: 'nina_wedding_leg_gear_r',           label: 'Wedding Leg Gear R',     color: '#642' },
      { key: 'nina_wedding_holster',              label: 'Wedding Holster',        color: '#321' },
      { key: 'nina_wedding_gun',                  label: 'Wedding Gun',            color: '#444' },
      { key: 'nina_wedding_knife',                label: 'Wedding Knife',          color: '#aaa' },
      { key: 'nina_wedding_grenade',              label: 'Wedding Grenade',        color: '#442' },
      { key: 'nina_wedding_ammo',                 label: 'Wedding Ammo',           color: '#cc8' },
    ],
  },
  {
    group: 'Extras',
    parts: [
      { key: 'nina_extras_earrings_a',  label: 'Earrings A',  color: '#cc8' },
      { key: 'nina_extras_earrings_b',  label: 'Earrings B',  color: '#cc8' },
      { key: 'nina_extras_sunglasses',  label: 'Sunglasses',  color: '#111' },
      { key: 'nina_extras_lace_mask',   label: 'Lace Mask',   color: '#222' },
      { key: 'nina_extras_gun',         label: 'Gun',         color: '#444' },
      { key: 'nina_extras_katana',      label: 'Katana',      color: '#aaa' },
    ],
  },
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: 'Body + Hair T8',
    visibleKeys: () => ['nina_body', 'nina_hair_t8'],
    bg: 'rgba(60,40,80,0.5)',
    fg: '#fcf',
  },
  {
    label: 'Body + Hair Ponytail',
    visibleKeys: () => ['nina_body', 'nina_hair_ponytail'],
    bg: 'rgba(40,60,80,0.5)',
    fg: '#cff',
  },
  {
    label: 'Body only',
    visibleKeys: () => ['nina_body'],
    bg: 'rgba(40,40,40,0.5)',
    fg: '#ddd',
  },
];

export default function NinaPreviewPage() {
  return (
    <MustardUIPreview
      title="Nina (Tekken 8) Preview"
      partGroups={PART_GROUPS}
      defaultVisibleKeys={['nina_body', 'nina_hair_t8']}
      quickPresets={QUICK_PRESETS}
      bodyKey="nina_body"
    />
  );
}
