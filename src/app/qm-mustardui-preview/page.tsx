'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh, VertexBuffer,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import { buildExteriorOracle } from '@/lib/vox-mesh';

const BASE = '/box5/qm_mustardui';

interface Grid {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number; gy: number; gz: number;
}

interface Skeleton {
  armature: string;
  bone_count: number;
  bones: Array<{
    name: string;
    parent: string | null;
    use_deform: boolean;
    head_rest: [number, number, number];
    tail_rest: [number, number, number];
  }>;
}

/** 現状ボクセル化予定のパーツ。グルーピング付き */
const PART_GROUPS: Array<{ group: string; parts: Array<{ key: string; label: string; color: string }> }> = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'body',  label: 'Body',  color: '#faa' },
      { key: 'hair',  label: 'Hair',  color: '#fa8' },
      { key: 'eyes',  label: 'Eyes',  color: '#fff' },
      // [removed] lips.vox = 別モデル流用 (このモデルでは不要)
      // 内蔵パーツ (口腔内メッシュ) は body voxelize に統合する別対応で実装予定
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
      { key: 'bikini_bra',             label: 'Bra',                   color: '#fc8' },
      { key: 'bikini_bra_cup',         label: 'Bra Cup (no strap, thin)', color: '#fa6' },
      { key: 'bikini_panties',         label: 'Panties',       color: '#fc8' },
      { key: 'bikini_panties_crotch',       label: 'Panties Crotch (back)',        color: '#f80' },
    ],
  },
  {
    group: 'DE-retargeted (DarkElfBlader → QM)',
    parts: [
      { key: 'de_armor_suit_bra', label: 'DE Suit Bra', color: '#f6c' },
      { key: 'de_hair',           label: 'DE Hair',     color: '#f84' },
    ],
  },
  {
    group: 'Helena-fitted (MeshDeform → QM)',
    parts: [
      { key: 'helena_default_dress', label: 'Helena Dress',                    color: '#fa0' },
      { key: 'helena_bodysuit',      label: 'Helena Bodysuit (LBS v4 dir+vol)', color: '#48c' },
      { key: 'helena_bodysuit_cf',   label: 'Helena Bodysuit (cf v6 PBD)',      color: '#4cf' },
      { key: 'helena_bodysuit_arap', label: 'Helena Bodysuit (cf v6 ARAP)',     color: '#0cf' },
      { key: 'helena_bodysuit_arap_p3', label: 'Helena Bodysuit (cf v6 ARAP+P3)',     color: '#08f' },
      { key: 'helena_bodysuit_step4',   label: 'Helena Bodysuit (cf v6 ARAP+P3+Step4)', color: '#06c' },
      { key: 'helena_bodysuit_cf2',     label: 'Helena Bodysuit (cf v6 contact-line)',  color: '#04a' },
      { key: 'helena_bodysuit_guided',  label: 'Helena Bodysuit (cf2 + crotch guide)',  color: '#028' },
      { key: 'helena_bodysuit_v3_guided', label: 'Helena Bodysuit (v3 d_helena + guide)', color: '#06f' },
      { key: 'helena_bodysuit_sw',        label: 'Helena Bodysuit (Shrinkwrap 5mm)',      color: '#0af' },
      { key: 'helena_bodysuit_sw2',       label: 'Helena Bodysuit (Shrinkwrap 8mm)',      color: '#08c' },
      { key: 'helena_bodysuit_pt',        label: 'Helena Bodysuit (passthrough, no fit)', color: '#0f8' },
    ],
  },
  {
    group: 'Helena DOA Outfits (TPS+Push to QM)',
    parts: [
      { key: 'helena_rs_panties',       label: 'RS Panties (LBS v4)', color: '#fc8' },
      { key: 'helena_rs_panties_cf',    label: 'RS Panties (cf v6 PBD)',  color: '#fda' },
      { key: 'helena_rs_panties_arap',     label: 'RS Panties (cf v6 ARAP)',    color: '#fc4' },
      { key: 'helena_rs_panties_arap_p3',  label: 'RS Panties (cf v6 ARAP+P3)',       color: '#fa0' },
      { key: 'helena_rs_panties_step4',    label: 'RS Panties (cf v6 ARAP+P3+Step4)',    color: '#f80' },
      { key: 'helena_rs_panties_cf2',      label: 'RS Panties (cf v6 contact-line)',     color: '#e60' },
      { key: 'helena_rs_panties_guided',   label: 'RS Panties (cf2 + crotch guide)',     color: '#c40' },
      { key: 'helena_rs_panties_v3_guided', label: 'RS Panties (v3 d_helena + guide)',   color: '#f60' },
      { key: 'helena_rs_panties_sw',        label: 'RS Panties (Shrinkwrap 5mm)',        color: '#fa4' },
      { key: 'helena_rs_panties_sw2',       label: 'RS Panties (Shrinkwrap 8mm)',        color: '#f82' },
      { key: 'helena_rs_panties_pt',        label: 'RS Panties (passthrough, no fit)',   color: '#0f8' },
      { key: 'helena_rs_shirt_normal',  label: 'RS Shirt Normal',     color: '#f8f' },
      { key: 'helena_rs_shirt_nude',    label: 'RS Shirt Nude',       color: '#f8c' },
      { key: 'helena_dark_prison_a',    label: 'Dark Prison A',       color: '#a4a' },
      { key: 'helena_dark_prison_b',    label: 'Dark Prison B',       color: '#a48' },
      { key: 'helena_qipao',            label: 'Qipao (LBS v4)',      color: '#f48' },
      { key: 'helena_qipao_cf',         label: 'Qipao (cloth-first v6)', color: '#f8c' },
      { key: 'helena_qipao_panty',      label: 'Qipao Panty',         color: '#fc8' },
      { key: 'helena_qipao_shoe',       label: 'Qipao Shoe',          color: '#cca' },
      { key: 'helena_qipao_sock',       label: 'Qipao Sock',          color: '#aaa' },
    ],
  },
  {
    group: 'Pharah (DAZ G8F PBG rig) — warp-fitted to QM',
    parts: [
      { key: 'pharah_body',             label: 'Pharah Body',          color: '#a85' },
      { key: 'pharah_lashes',           label: 'Pharah Eyelashes',     color: '#222' },
      { key: 'pharah_eyebrows',         label: 'Pharah Eyebrows',      color: '#532' },
      { key: 'pharah_hair_default',     label: 'Pharah Hair Default',  color: '#221' },
      { key: 'pharah_hair_ponytail',    label: 'Pharah Hair Ponytail', color: '#221' },
      { key: 'pharah_hair_short',       label: 'Pharah Hair Short',    color: '#221' },
      { key: 'pharah_armor_torso',      label: 'Pharah OW2 Torso',     color: '#2a3b5a' },
      { key: 'pharah_armor_zerosuit',   label: 'Pharah OW2 ZeroSuit',  color: '#222' },
      { key: 'pharah_armor_helmet',     label: 'Pharah OW2 Helmet',    color: '#446' },
      { key: 'pharah_armor_thighs',     label: 'Pharah OW2 Thighs',    color: '#446' },
      { key: 'pharah_armor_feet',       label: 'Pharah OW2 Feet',      color: '#446' },
      { key: 'pharah_armor_gloves',     label: 'Pharah OW2 Gloves',    color: '#446' },
      { key: 'pharah_armor_wings',      label: 'Pharah OW2 Wings',     color: '#446' },
      { key: 'pharah_bodysuit',         label: 'Pharah Bodysuit',      color: '#222' },
      { key: 'pharah_bikini_bra',       label: 'Pharah Bikini Bra',    color: '#a44' },
      { key: 'pharah_bikini_bottom',    label: 'Pharah Bikini Btm',    color: '#a44' },
      { key: 'pharah_combat_top',       label: 'Pharah Combat Top',    color: '#664' },
      { key: 'pharah_combat_shorts',    label: 'Pharah Combat Shorts', color: '#642' },
      { key: 'pharah_lingerie_top',     label: 'Pharah Lingerie Top',  color: '#a52' },
      { key: 'pharah_lingerie_bottom',  label: 'Pharah Lingerie Btm',  color: '#a52' },
      { key: 'pharah_sports_top',       label: 'Pharah Sports Top',    color: '#48a' },
      { key: 'pharah_sports_shorts',    label: 'Pharah Sports Shorts', color: '#48a' },
      { key: 'pharah_yoga_pants',       label: 'Pharah Yoga Pants',    color: '#444' },
      { key: 'pharah_underwear_top',    label: 'Pharah Underwear Top', color: '#fcc' },
      { key: 'pharah_underwear_bottom', label: 'Pharah Underwear Btm', color: '#fcc' },
      { key: 'pharah_pistol',           label: 'Pharah Pistol',        color: '#222' },
    ],
  },
  {
    group: 'BlackWidow (Rigify + DAZ G8F) — warp-fitted to QM',
    parts: [
      { key: 'blackwidow_body',             label: 'BW Body',             color: '#fdb' },
      { key: 'blackwidow_eyes',             label: 'BW Eyes',             color: '#48a' },
      { key: 'blackwidow_lashes',           label: 'BW Eyelashes',        color: '#222' },
      { key: 'blackwidow_hair1',            label: 'BW Hair 1',           color: '#a55' },
      { key: 'blackwidow_hair2',            label: 'BW Hair 2',           color: '#522' },
      { key: 'blackwidow_bw_suit',          label: 'BW Suit',             color: '#222' },
      { key: 'blackwidow_bw_harness',       label: 'BW Harness',          color: '#444' },
      { key: 'blackwidow_bw_armbands',      label: 'BW Armbands',         color: '#111' },
      { key: 'blackwidow_bw_belt',          label: 'BW Belt',             color: '#222' },
      { key: 'blackwidow_bw_boots',         label: 'BW Boots',            color: '#222' },
      { key: 'blackwidow_bodysuit',         label: 'Bodysuit',            color: '#333' },
      { key: 'blackwidow_boots',            label: 'Boots',               color: '#321' },
      { key: 'blackwidow_boots_punk',       label: 'Boots Punk',          color: '#1a1a1a' },
      { key: 'blackwidow_shoes',            label: 'Shoes',               color: '#222' },
      { key: 'blackwidow_casual_pants',     label: 'Casual Pants',        color: '#446' },
      { key: 'blackwidow_casual_shirt',     label: 'Casual Shirt',        color: '#ccc' },
      { key: 'blackwidow_bw_jacket',        label: 'Business Jacket',     color: '#444' },
      { key: 'blackwidow_bw_skirt',         label: 'Business Skirt',      color: '#333' },
      { key: 'blackwidow_school_choker',    label: 'School Choker',       color: '#222' },
      { key: 'blackwidow_school_panty',     label: 'School Panty',        color: '#fff' },
      { key: 'blackwidow_school_shirt',     label: 'School Shirt',        color: '#fff' },
      { key: 'blackwidow_school_skirt',     label: 'School Skirt',        color: '#a44' },
      { key: 'blackwidow_school_stockings', label: 'School Stockings',    color: '#222' },
      { key: 'blackwidow_nurse_corset',     label: 'Nurse Corset',        color: '#a22' },
      { key: 'blackwidow_nurse_gloves',     label: 'Nurse Gloves',        color: '#222' },
      { key: 'blackwidow_nurse_pasties',    label: 'Nurse Pasties',       color: '#a22' },
      { key: 'blackwidow_nurse_stockings',  label: 'Nurse Stockings',     color: '#222' },
      { key: 'blackwidow_babydoll',         label: 'Babydoll',            color: '#caa' },
      { key: 'blackwidow_corset_stockings', label: 'Corset+Stockings',    color: '#444' },
      { key: 'blackwidow_pantyhose',        label: 'Pantyhose',           color: '#222' },
      { key: 'blackwidow_glasses',          label: 'Glasses',             color: '#111' },
      { key: 'blackwidow_gun_l',            label: 'Gun L',               color: '#444' },
      { key: 'blackwidow_gun_r',            label: 'Gun R',               color: '#444' },
      { key: 'blackwidow_gun_holstered_l',  label: 'Gun Holstered L',     color: '#444' },
      { key: 'blackwidow_gun_holstered_r',  label: 'Gun Holstered R',     color: '#444' },
    ],
  },
  {
    group: 'Nyotengu (DAZ G8F + import_daz) — warp-fitted to QM',
    parts: [
      { key: 'nyotengu_body',   label: 'Nyotengu Body',     color: '#fdb' },
      { key: 'nyotengu_eyes',   label: 'Nyotengu Eyes',     color: '#48a' },
      { key: 'nyotengu_lashes', label: 'Nyotengu Eyelashes',color: '#222' },
      { key: 'nyotengu_hair1',  label: 'Nyotengu Hair 1',   color: '#a76' },
      { key: 'nyotengu_hair2',  label: 'Nyotengu Hair 2',   color: '#a76' },
    ],
  },
  {
    group: 'Vaultgirl V1 (Rigify + DAZ G8F) — warp-fitted to QM',
    parts: [
      { key: 'vaultgirl_body',            label: 'Vaultgirl Body',            color: '#fcb' },
      { key: 'vaultgirl_faith_hair',      label: 'Vaultgirl Faith Hair',      color: '#5a3a1a' },
      { key: 'vaultgirl_hair_2',          label: 'Vaultgirl Hair (2)',        color: '#3a2a1a' },
      { key: 'vaultgirl_base_black',      label: 'Vaultgirl Hair Base Black', color: '#1a1a1a' },
      { key: 'vaultgirl_base_blonde',     label: 'Vaultgirl Hair Base Blonde',color: '#caa66a' },
      { key: 'vaultgirl_vault_suit',      label: 'Vaultgirl Vault Suit',      color: '#3a4a6a' },
      { key: 'vaultgirl_vaultsuit1',      label: 'Vaultgirl Vault Suit (alt)',color: '#3a4a6a' },
      { key: 'vaultgirl_vault_suit_boot', label: 'Vaultgirl Vault Suit Boot', color: '#3a2010' },
      { key: 'vaultgirl_bikini5_top',     label: 'Vaultgirl Bikini Top',      color: '#aa3344' },
      { key: 'vaultgirl_bikini5_bottom',  label: 'Vaultgirl Bikini Bottom',   color: '#aa3344' },
      { key: 'vaultgirl_pipboy',          label: 'Vaultgirl Pipboy',          color: '#8aaa66' },
    ],
  },
  {
    group: 'Rachel (DAZ G8F) — warp-fitted to QM',
    parts: [
      { key: 'rachel_body',           label: 'Rachel Body',            color: '#fcb' },
      { key: 'rachel_hair',           label: 'Rachel Hair',            color: '#fc9' },
      // Suit
      { key: 'rachel_suit',           label: 'Rachel Suit',            color: '#a44' },
      { key: 'rachel_suit2',          label: 'Rachel Suit (2)',        color: '#a44' },
      { key: 'rachel_arms',           label: 'Rachel Arms',            color: '#c66' },
      { key: 'rachel_breasts_top',    label: 'Rachel Breasts Top',     color: '#a44' },
      { key: 'rachel_chest_cover',    label: 'Rachel Chest Cover',     color: '#a44' },
      { key: 'rachel_belt',           label: 'Rachel Belt',            color: '#642' },
      { key: 'rachel_shoulder_strap', label: 'Rachel Shoulder Strap',  color: '#864' },
      { key: 'rachel_neck',           label: 'Rachel Neck',            color: '#864' },
      { key: 'rachel_gloves_l',       label: 'Rachel Gloves L',        color: '#642' },
      { key: 'rachel_gloves_r',       label: 'Rachel Gloves R',        color: '#642' },
      { key: 'rachel_boots',          label: 'Rachel Boots',           color: '#321' },
      { key: 'rachel_botforts',       label: 'Rachel Botforts',        color: '#642' },
      // Jewelry
      { key: 'rachel_arm_r_jewelry',  label: 'Rachel Arm R Jewelry',   color: '#cc8' },
      { key: 'rachel_rings',          label: 'Rachel Rings',           color: '#cc8' },
      { key: 'rachel_rings3',         label: 'Rachel Rings (3)',       color: '#cc8' },
      { key: 'rachel_item_l',         label: 'Rachel Item L',          color: '#cca' },
      { key: 'rachel_item_r',         label: 'Rachel Item R',          color: '#cca' },
      // Casual underwear
      { key: 'rachel_casual_bra',     label: 'Rachel Casual Bra',      color: '#fcc' },
      { key: 'rachel_casual_thong',   label: 'Rachel Casual Thong',    color: '#fcc' },
      { key: 'rachel_panties2',       label: 'Rachel Panties (2)',     color: '#fcc' },
      // Secretary uniform
      { key: 'rachel_secretary_uniform', label: 'Rachel Secretary Uniform', color: '#866' },
    ],
  },
  {
    group: 'Helena (DOA) Outfits — same as helena-qm-compare?model=helena',
    parts: [
      { key: 'helena_hair',             label: 'Helena Hair',             color: '#fa8' },
      { key: 'helena_bodysuit',         label: 'Helena Bodysuit',         color: '#88f' },
      { key: 'helena_dark_prison_a',    label: 'Helena Dark Prison A',    color: '#a4a' },
      { key: 'helena_dark_prison_b',    label: 'Helena Dark Prison B',    color: '#a4a' },
      { key: 'helena_rs_panties',       label: 'Helena RS Panties',       color: '#fc8' },
      { key: 'helena_rs_shirt_normal',  label: 'Helena RS Shirt Normal',  color: '#f8f' },
      { key: 'helena_rs_shirt_nude',    label: 'Helena RS Shirt Nude',    color: '#f8f' },
      { key: 'helena_qipao',            label: 'Helena Qipao',            color: '#f48' },
      { key: 'helena_qipao_panty',      label: 'Helena Qipao Panty',      color: '#fc8' },
      { key: 'helena_qipao_shoe',       label: 'Helena Qipao Shoe',       color: '#cca' },
      { key: 'helena_qipao_sock',       label: 'Helena Qipao Sock',       color: '#aaa' },
    ],
  },
  {
    group: 'Anna (Tekken 8) Outfits — warp-fitted to QM',
    parts: [
      // Blackmottled
      { key: 'anna_blackmottled_top',    label: 'Anna Blackmottled Top',    color: '#666' },
      { key: 'anna_blackmottled_pants',  label: 'Anna Blackmottled Pants',  color: '#444' },
      { key: 'anna_blackmottled_boots',  label: 'Anna Blackmottled Boots',  color: '#321' },
      { key: 'anna_blackmottled_gloves', label: 'Anna Blackmottled Gloves', color: '#543' },
      // T8
      { key: 'anna_t8_top',     label: 'Anna T8 Top',     color: '#a82' },
      { key: 'anna_t8_pants',   label: 'Anna T8 Pants',   color: '#642' },
      { key: 'anna_t8_boots',   label: 'Anna T8 Boots',   color: '#321' },
      { key: 'anna_t8_gloves',  label: 'Anna T8 Gloves',  color: '#864' },
      { key: 'anna_t8_coat',    label: 'Anna T8 Coat',    color: '#864' },
      { key: 'anna_t8_choker',  label: 'Anna T8 Choker',  color: '#aaa' },
      { key: 'anna_t8_thong',   label: 'Anna T8 Thong',   color: '#864' },
      // Suit
      { key: 'anna_suit_top',       label: 'Anna Suit Top',       color: '#88a' },
      { key: 'anna_suit_skirt',     label: 'Anna Suit Skirt',     color: '#668' },
      { key: 'anna_suit_pantyhose', label: 'Anna Suit Pantyhose', color: '#665' },
      { key: 'anna_suit_boots',     label: 'Anna Suit Boots',     color: '#321' },
      { key: 'anna_suit_gloves',    label: 'Anna Suit Gloves',    color: '#88a' },
      { key: 'anna_suit_hat',       label: 'Anna Suit Hat',       color: '#88a' },
      // Gym
      { key: 'anna_gym_croptop', label: 'Anna Gym Croptop', color: '#fc8' },
      { key: 'anna_gym_hoodie',  label: 'Anna Gym Hoodie',  color: '#cca' },
      { key: 'anna_gym_shorts',  label: 'Anna Gym Shorts',  color: '#aaa' },
      { key: 'anna_gym_shoes',   label: 'Anna Gym Shoes',   color: '#caa' },
      // Lingerie
      { key: 'anna_lingerie_bra',       label: 'Anna Lingerie Bra',       color: '#fcc' },
      { key: 'anna_lingerie_thong',     label: 'Anna Lingerie Thong',     color: '#fcc' },
      { key: 'anna_lingerie_stockings', label: 'Anna Lingerie Stockings', color: '#fdd' },
      { key: 'anna_lingerie_heels',     label: 'Anna Lingerie Heels',     color: '#fcc' },
      { key: 'anna_lingerie_sleeves',   label: 'Anna Lingerie Sleeves',   color: '#fcc' },
      { key: 'anna_lingerie_choker',    label: 'Anna Lingerie Choker',    color: '#fcc' },
      { key: 'anna_lingerie_pasties',   label: 'Anna Lingerie Pasties',   color: '#fcc' },
      // Swimsuit
      { key: 'anna_swimsuit_top',    label: 'Anna Swimsuit Top',    color: '#cef' },
      { key: 'anna_swimsuit_bottom', label: 'Anna Swimsuit Bottom', color: '#cef' },
      // Hair
      { key: 'anna_hair_classic', label: 'Anna Hair Classic', color: '#fa6' },
      { key: 'anna_hair_t8',      label: 'Anna Hair T8',      color: '#fc8' },
    ],
  },
];
const PARTS = PART_GROUPS.flatMap(g => g.parts);

// [C5] body 内側にある voxel パーツ (顔の内側、口の中など)。
// これらは body 表面より手前にずれては困るので zOffset を適用しない。
const INSIDE_BODY_PARTS = new Set(['eyes']);  // lips は別モデル流用なので削除

// [Phase 2/3] 各 part が持ちうる MustardUI エフェクト slot リスト
// 起動時に <part>.<slot>.json を fetch して effects に格納
const EFFECT_SLOTS_PER_PART: Record<string, string[]> = {
  body: ['blush_color', 'tattoo_color', 'tattoo_emissive'],
  dress: ['dress_color_red', 'dress_color_white'],
};

// [C5b] 各パーツの追加 z オフセット (m単位)。voxel データの位置ズレ補正用。
// 正の値で前方 (Babylon +Z = 顔の前方向) にシフトされる。
// 注: subGridForwardMm slider が isSubGrid mesh の position.z を上書きするので、
// eyes (sub-grid) の位置はその slider 値が支配的。この固定値はフォールバック用。
const PART_FORWARD_OFFSET: Record<string, number> = {
  eyes: -0.002,  // 目玉位置補正 -2mm (slider 同等値)
};

export default function QMMustardUIPreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const boneLinesRef = useRef<LinesMesh | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [skel, setSkel] = useState<Skeleton | null>(null);
  const [partInfo, setPartInfo] = useState<Record<string, { voxels: number } | 'missing'>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(PARTS.map(p => [p.key,
      // 初期表示: body / hair / eyes のみ ON (確認用最小セット)
      // 他の衣装・装飾はチェック OFF (ユーザーが必要なら手動 ON)
      p.key === 'body' || p.key === 'hair' || p.key === 'eyes'
    ]))
  );
  const [showBones, setShowBones] = useState(false);
  const [boneFilter, setBoneFilter] = useState('');
  const [subGridForwardMm, setSubGridForwardMm] = useState(-2);  // サブグリッドの前方オフセット (mm) — eyes 位置補正

  // MustardUI Body エフェクト slider (0-1)
  const [blushSlider, setBlushSlider] = useState(0);
  const [tattooSlider, setTattooSlider] = useState(0);

  // Dress Texture Number (1=Default / 2=Red / 3=White)
  const [dressTexNum, setDressTexNum] = useState(1);

  // 各 part の頂点 ↔ voxel sub-grid index マッピング (effect 再計算用)
  // [i*3..i*3+2] = vertex i に対応する voxel の (ix, iy, iz)
  const partVoxelIdxRef = useRef<Map<string, Int32Array>>(new Map());
  // 各 part の base 頂点色 (effect 適用前、build 時に確定)
  const partBaseColorsRef = useRef<Map<string, Float32Array>>(new Map());

  // ---- Scene init ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.12, 1);
    scene.useRightHandedSystem = true;
    sceneRef.current = scene;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.5,
      new Vector3(0, 0.85, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    // 足底の voxel 断面を隠すため、body lowest Z (-0.013m) 直下に solid ground
    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4, subdivisions: 8 }, scene);
    ground.position.y = -0.014;
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    // wireframe → solid に変更（足底断面を遮蔽）
    ground.material = gm;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- Load grid + skeleton ----
  useEffect(() => {
    (async () => {
      const gr = await fetch(`${BASE}/grid.json`).then(r => r.ok ? r.json() : null);
      const sk = await fetch(`${BASE}/skeleton.json`).then(r => r.ok ? r.json() : null);
      setGrid(gr);
      setSkel(sk);
    })();
  }, []);

  // ---- Parts raw data cache (loaded once) ----
  type PartGrid = Grid & {
    scale_factor?: number;
    chunks?: Array<{ vox_file: string; grid_origin: [number, number, number]; gx: number; gy: number; gz: number; voxel_count?: number }>;
  };
  type ChunkData = {
    gridOrigin: [number, number, number];
    model: ReturnType<typeof parseVox>;
  };
  // Effect samples: "ix,iy,iz" → [r, g, b, a] (0-255)
  type EffectSamples = Map<string, [number, number, number, number]>;
  type PartData = {
    partGrid: PartGrid | null;
    chunks: ChunkData[];
    // 内蔵パーツ voxel の world 中心座標 (body のみ、他は undefined)
    internalVoxelWorldCenters?: Array<[number, number, number]>;
    // MustardUI エフェクト samples (body のみ)
    effects?: { [slot: string]: EffectSamples };
  };
  const partsDataRef = useRef<Map<string, PartData>>(new Map());
  const [partsReady, setPartsReady] = useState(false);

  // ---- Phase 1: Load all parts raw data (once per grid) ----
  useEffect(() => {
    if (!grid) return;
    setPartsReady(false);

    (async () => {
      const partsData = new Map<string, PartData>();
      await Promise.all(PARTS.map(async p => {
        const partGridResp = await fetch(`${BASE}/${p.key}.grid.json?v=${Date.now()}`);
        const partGrid = partGridResp.ok ? await partGridResp.json() as PartGrid : null;
        const useGrid = partGrid ?? grid;
        const chunkSpecs = partGrid?.chunks
          ? partGrid.chunks.map(c => ({ vox_file: c.vox_file, grid_origin: c.grid_origin }))
          : [{ vox_file: `${p.key}.vox`, grid_origin: useGrid.grid_origin }];
        const chunks: ChunkData[] = [];
        for (const cs of chunkSpecs) {
          const resp = await fetch(`${BASE}/${cs.vox_file}?v=${Date.now()}`);
          if (!resp.ok) continue;
          const model = parseVox(await resp.arrayBuffer());
          chunks.push({ gridOrigin: cs.grid_origin, model });
        }
        // body のみ内蔵 voxels + effect samples を追加読み込み
        let internalVoxelWorldCenters: Array<[number, number, number]> | undefined;
        let effects: { [slot: string]: EffectSamples } | undefined;
        if (p.key === 'body') {
          try {
            const ivResp = await fetch(`${BASE}/${p.key}.internal_voxels.json?v=${Date.now()}`);
            if (ivResp.ok) {
              const iv = await ivResp.json() as {
                voxel_size: number;
                grid_origin: [number, number, number];
                internal_voxels: number[][];
              };
              const [gox, goy, goz] = iv.grid_origin;
              const ivs = iv.voxel_size;
              internalVoxelWorldCenters = iv.internal_voxels.map(([ix, iy, iz]) => [
                gox + (ix + 0.5) * ivs,
                goy + (iy + 0.5) * ivs,
                goz + (iz + 0.5) * ivs,
              ] as [number, number, number]);
              console.log(`[preview body] loaded ${internalVoxelWorldCenters.length} internal voxels`);
            }
          } catch { /* skip */ }

        }

        // MustardUI エフェクト samples の読み込み (part ごとの slot リスト)
        const slots = EFFECT_SLOTS_PER_PART[p.key];
        if (slots && slots.length > 0) {
          effects = {};
          for (const slot of slots) {
            try {
              const r = await fetch(`${BASE}/${p.key}.${slot}.json?v=${Date.now()}`);
              if (!r.ok) continue;
              const data = await r.json() as { samples: number[][] };
              const map: EffectSamples = new Map();
              for (const s of data.samples) {
                map.set(`${s[0]},${s[1]},${s[2]}`, [s[3], s[4], s[5], s[6]]);
              }
              effects[slot] = map;
              console.log(`[preview ${p.key}] loaded ${map.size} ${slot} samples`);
            } catch { /* skip */ }
          }
        }

        partsData.set(p.key, { partGrid, chunks, internalVoxelWorldCenters, effects });
      }));
      partsDataRef.current = partsData;
      setPartsReady(true);
    })();
  }, [grid]);

  // ---- Build/rebuild meshes (body rebuild on visible change, clothing built once) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !grid || !partsReady) return;

    // Blender (Z-up) → Babylon (Y-up, 右手系): (bx, bz, -by)
    const bToB = (bx: number, by: number, bz: number): [number, number, number] =>
      [bx, bz, -by];

    const info: Record<string, { voxels: number } | 'missing'> = {};
    const partsData = partsDataRef.current;

    // [最適化] DE と同じく bodyHideSet を無効化 → body 再構築不要 → visible toggle が瞬時
    // 副作用: 衣装下の body voxel が描画されるが、partMat の zOffset=-2 で衣装が手前に来るので実害なし
    const bodyHideSet = new Set<string>();  // 常に空

    for (const p of PARTS) {
      const data = partsData.get(p.key);
      if (!data || data.chunks.length === 0) {
        info[p.key] = 'missing';
        continue;
      }
      const isBody = p.key === 'body';
      // [最適化] 全 part を「初回のみ build、以降スキップ」に → visibility は別 useEffect で瞬時切替
      if (meshMapRef.current.has(p.key)) {
        let c = 0;
        for (const ch of data.chunks) c += ch.model.voxels.length;
        info[p.key] = { voxels: c };
        continue;
      }

      const partGrid = data.partGrid;
      const useGrid = partGrid ?? grid;
      const vs = useGrid.voxel_size;
      const isSubGrid = partGrid !== null;

      let totalVoxels = 0;
      const positions: number[] = [];
      const normals: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];

      // [P1-A/B] body のみ exterior oracle を構築 (中空 shell の内側 face skip)
      // [P-X] internal voxels (口腔内など) を seed として渡し、閉じた cavity も exterior 扱い
      const bodyOracle = isBody
        ? buildExteriorOracle(
            data.chunks.map(ch => ({ origin: ch.gridOrigin, voxels: ch.model.voxels })),
            vs,
            2,
            data.internalVoxelWorldCenters,
          )
        : null;
      if (bodyOracle) {
        const s = bodyOracle.stats;
        console.log(`[preview body] exterior oracle: ${s.gx}x${s.gy}x${s.gz}, voxels=${s.voxels}, exteriorCells=${s.exteriorCells}, internalSeeds=${s.internalSeeds ?? 0}, ${s.ms.toFixed(0)}ms`);
      }

      // effect 持ち part: 各 vertex に対応する voxel の sub-grid 全体座標 (effect lerp 再計算用)
      const hasEffects = !!(data.effects && Object.keys(data.effects).length > 0);
      const partVoxelIdx: number[] = hasEffects ? [] : (null as unknown as number[]);
      // sub-grid origin (full unsplit)。chunk gridOrigin との差分で offset 算出。
      const subGridOrigin: [number, number, number] = [
        useGrid.grid_origin[0], useGrid.grid_origin[1], useGrid.grid_origin[2],
      ];

      for (const chunk of data.chunks) {
        const { model, gridOrigin: origin } = chunk;
        const occupied = new Set<string>();
        for (const v of model.voxels) occupied.add(`${v.x},${v.y},${v.z}`);

        // chunk-local voxel 座標 → 全 sub-grid 座標 へのオフセット
        const chunkOfx = Math.round((origin[0] - subGridOrigin[0]) / vs);
        const chunkOfy = Math.round((origin[1] - subGridOrigin[1]) / vs);
        const chunkOfz = Math.round((origin[2] - subGridOrigin[2]) / vs);

        for (const voxel of model.voxels) {
          if (isBody && bodyHideSet.has(`${voxel.x},${voxel.y},${voxel.z}`)) continue;
          const col = model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 };
          // 全 sub-grid 座標 (effect lerp 用)
          const fullIx = voxel.x + chunkOfx;
          const fullIy = voxel.y + chunkOfy;
          const fullIz = voxel.z + chunkOfz;
          for (let f = 0; f < 6; f++) {
            const [dx, dy, dz] = FACE_DIRS[f];
            if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;
            // [P1-A/B] body のみ oracle で内側 face skip
            if (bodyOracle) {
              const nwx = origin[0] + (voxel.x + dx + 0.5) * vs;
              const nwy = origin[1] + (voxel.y + dy + 0.5) * vs;
              const nwz = origin[2] + (voxel.z + dz + 0.5) * vs;
              if (!bodyOracle.isExteriorWorldCell(nwx, nwy, nwz)) continue;
            }
            const bi = positions.length / 3;
            const fv = FACE_VERTS[f];
            const fn = FACE_NORMALS[f];
            const [nx, ny, nz] = bToB(fn[0], fn[1], fn[2]);
            for (let vi = 0; vi < 4; vi++) {
              const [lx, ly, lz] = fv[vi];
              const bx = origin[0] + (voxel.x + lx) * vs;
              const by = origin[1] + (voxel.y + ly) * vs;
              const bz = origin[2] + (voxel.z + lz) * vs;
              const [wx, wy, wz] = bToB(bx, by, bz);
              positions.push(wx, wy, wz);
              normals.push(nx, ny, nz);
              colors.push(col.r, col.g, col.b, 1);
              if (hasEffects) partVoxelIdx.push(fullIx, fullIy, fullIz);
            }
            indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
          }
        }
        totalVoxels += model.voxels.length;
      }

      // effect 持ち part の vertex ↔ voxel 対応 + base colors を ref Map に保存
      if (hasEffects) {
        partVoxelIdxRef.current.set(p.key, new Int32Array(partVoxelIdx));
        partBaseColorsRef.current.set(p.key, new Float32Array(colors));
      }

      if (totalVoxels === 0 || positions.length === 0) {
        info[p.key] = 'missing';
        continue;
      }

      // [C2] body の頂点法線平均化を無効化 — realistic-viewer 規約 (flat normal) に統一
      // (元コード: if (isBody) { ... 法線平均化 ... } を if (false) でスキップ)
      if (false /* [C2] disabled */ && isBody) {
        const accum = new Map<string, [number, number, number]>();
        for (let i = 0; i < positions.length; i += 3) {
          const k = `${Math.round(positions[i]*10000)},${Math.round(positions[i+1]*10000)},${Math.round(positions[i+2]*10000)}`;
          let a = accum.get(k);
          if (!a) { a = [0,0,0]; accum.set(k, a); }
          a[0] += normals[i]; a[1] += normals[i+1]; a[2] += normals[i+2];
        }
        for (let i = 0; i < positions.length; i += 3) {
          const k = `${Math.round(positions[i]*10000)},${Math.round(positions[i+1]*10000)},${Math.round(positions[i+2]*10000)}`;
          const a = accum.get(k)!;
          const len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
          if (len > 1e-6) {
            normals[i] = a[0]/len; normals[i+1] = a[1]/len; normals[i+2] = a[2]/len;
          }
        }
      }

      const vd = new VertexData();
      vd.positions = positions;
      vd.normals = normals;
      vd.colors = colors;
      vd.indices = indices;

      const mesh = new Mesh(`part_${p.key}`, scene);
      // effect 持ち part (body, dress, ...) は updatable=true で頂点色 setVerticesData 反映可能に
      vd.applyToMesh(mesh, hasEffects);

      const mat = new StandardMaterial(`mat_${p.key}`, scene);
      // [C3] body も backFaceCulling=false に — realistic-viewer 規約に統一
      // (元: mat.backFaceCulling = isBody → RH での winding 反転で外側 face が cull される疑い)
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      if (isBody) {
        // [C1] realistic-viewer 流の Unlit 化 — 内側透け/断面/凹凸の主因対策
        mat.disableLighting = true;
        mat.emissiveColor = Color3.White();
      }
      // [C5a] 内部パーツ (eyes, lips) は zOffset を適用しない
      // (body 表面より手前にずれると body 越しに見えてしまう)
      const isInside = INSIDE_BODY_PARTS.has(p.key);
      if (!isInside) {
        if (isSubGrid) {
          mat.zOffset = -2;
          mesh.metadata = { isSubGrid: true };
        } else if (!isBody) {
          mat.zOffset = -1;
        }
      }
      mesh.material = mat;

      // [C5b] パーツ毎の追加前方オフセット (voxel データの位置ズレ補正)
      const fwd = PART_FORWARD_OFFSET[p.key];
      if (fwd) mesh.position.z = fwd;

      const prev = meshMapRef.current.get(p.key);
      if (prev) prev.dispose();
      meshMapRef.current.set(p.key, mesh);
      mesh.isVisible = visible[p.key] ?? true;

      info[p.key] = { voxels: totalVoxels };
    }
    setPartInfo(prev => ({ ...prev, ...info }));
    // [最適化] visible は依存配列から外す → toggle で build 走らない
    // visibility は別 useEffect (mesh.isVisible) で瞬時切替
  }, [grid, partsReady]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      meshMapRef.current.forEach(m => m.dispose());
      meshMapRef.current.clear();
    };
  }, []);

  // ---- Toggle part visibility ----
  useEffect(() => {
    meshMapRef.current.forEach((m, key) => { m.isVisible = !!visible[key]; });
  }, [visible, partInfo]);

  // ---- MustardUI Body エフェクト (Blush/Tattoo) — 頂点色 lerp 再計算 ----
  // base * (1 - alpha*slider) + effect * (alpha*slider)
  useEffect(() => {
    const mesh = meshMapRef.current.get('body');
    const baseColors = partBaseColorsRef.current.get('body');
    const voxelIdx = partVoxelIdxRef.current.get('body');
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get('body')?.effects;
    if (!effects) return;

    const blush = effects.blush_color;
    const tattoo = effects.tattoo_color;
    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);
    const blushOn = blush && blushSlider > 0;
    const tattooOn = tattoo && tattooSlider > 0;

    for (let i = 0; i < numVerts; i++) {
      let r = baseColors[i * 4], g = baseColors[i * 4 + 1], b = baseColors[i * 4 + 2];
      const a = baseColors[i * 4 + 3];
      if (blushOn || tattooOn) {
        const key = `${voxelIdx[i * 3]},${voxelIdx[i * 3 + 1]},${voxelIdx[i * 3 + 2]}`;
        if (blushOn) {
          const s = blush!.get(key);
          if (s) {
            const aMask = (s[3] / 255) * blushSlider;
            r = r * (1 - aMask) + (s[0] / 255) * aMask;
            g = g * (1 - aMask) + (s[1] / 255) * aMask;
            b = b * (1 - aMask) + (s[2] / 255) * aMask;
          }
        }
        if (tattooOn) {
          const s = tattoo!.get(key);
          if (s) {
            const aMask = (s[3] / 255) * tattooSlider;
            r = r * (1 - aMask) + (s[0] / 255) * aMask;
            g = g * (1 - aMask) + (s[1] / 255) * aMask;
            b = b * (1 - aMask) + (s[2] / 255) * aMask;
          }
        }
      }
      newColors[i * 4] = r; newColors[i * 4 + 1] = g; newColors[i * 4 + 2] = b; newColors[i * 4 + 3] = a;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [blushSlider, tattooSlider, partInfo]);

  // ---- Dress Texture Number (1=Default / 2=Red / 3=White) — 頂点色 全置換 ----
  useEffect(() => {
    const mesh = meshMapRef.current.get('dress');
    const baseColors = partBaseColorsRef.current.get('dress');
    const voxelIdx = partVoxelIdxRef.current.get('dress');
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get('dress')?.effects;

    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);

    // Texture Number 1 = base のまま、2 = Red、3 = White
    const variant = dressTexNum === 2 ? effects?.dress_color_red
                  : dressTexNum === 3 ? effects?.dress_color_white
                  : null;

    if (!variant) {
      // 1 (Default) or variant 未ロード → base そのまま
      newColors.set(baseColors);
    } else {
      for (let i = 0; i < numVerts; i++) {
        const r0 = baseColors[i * 4], g0 = baseColors[i * 4 + 1], b0 = baseColors[i * 4 + 2];
        const a0 = baseColors[i * 4 + 3];
        const key = `${voxelIdx[i * 3]},${voxelIdx[i * 3 + 1]},${voxelIdx[i * 3 + 2]}`;
        const s = variant.get(key);
        if (s && s[3] > 0) {
          // sample あり → 完全置換 (variant の alpha が mask)
          newColors[i * 4] = s[0] / 255;
          newColors[i * 4 + 1] = s[1] / 255;
          newColors[i * 4 + 2] = s[2] / 255;
          newColors[i * 4 + 3] = a0;
        } else {
          // sample なし (DressInner 等) → base 維持
          newColors[i * 4] = r0; newColors[i * 4 + 1] = g0; newColors[i * 4 + 2] = b0; newColors[i * 4 + 3] = a0;
        }
      }
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [dressTexNum, partInfo]);

  // ---- Apply sub-grid forward offset ----
  useEffect(() => {
    const dz = subGridForwardMm / 1000;  // mm → m
    meshMapRef.current.forEach(m => {
      if (m.metadata?.isSubGrid) m.position.z = dz;
    });
  }, [subGridForwardMm, partInfo]);

  // ---- Draw bones ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !skel) return;
    if (boneLinesRef.current) {
      boneLinesRef.current.dispose();
      boneLinesRef.current = null;
    }
    if (!showBones) return;

    // Blender (Z-up) → Babylon (Y-up): (bx, bz, -by)
    const toBabylon = (p: [number, number, number]) =>
      new Vector3(p[0], p[2], -p[1]);

    const filter = boneFilter.trim().toLowerCase();
    const lines: Vector3[][] = [];
    const colorArr: Color4[][] = [];
    for (const b of skel.bones) {
      if (filter && !b.name.toLowerCase().includes(filter)) continue;
      const h = toBabylon(b.head_rest);
      const t = toBabylon(b.tail_rest);
      lines.push([h, t]);
      // カラーコード: hair/dress/belt/cage 関連は目立つ色
      let c = new Color4(0.5, 0.9, 0.6, 1);
      const ln = b.name.toLowerCase();
      if (ln.includes('hair_braid')) c = new Color4(1, 0.6, 0.2, 1);
      else if (ln.includes('dress_front')) c = new Color4(1, 0.4, 0.9, 1);
      else if (ln.includes('belt_tail')) c = new Color4(1, 1, 0.4, 1);
      else if (ln.includes('breast')) c = new Color4(1, 0.5, 0.7, 1);
      else if (ln.includes('butt') || ln.includes('genital')) c = new Color4(0.8, 0.5, 1, 1);
      else if (ln.includes('simplicage')) c = new Color4(0.4, 0.7, 1, 1);
      colorArr.push([c, c]);
    }
    const lm = MeshBuilder.CreateLineSystem('bone_lines', {
      lines, colors: colorArr, updatable: false,
    }, scene);
    lm.isPickable = false;
    boneLinesRef.current = lm;
  }, [skel, showBones, boneFilter]);

  // ボーン name のクイック統計
  const boneStats = (() => {
    if (!skel) return null;
    let hair = 0, dress = 0, belt = 0, breast = 0, butt = 0, cage = 0, other = 0;
    for (const b of skel.bones) {
      const n = b.name.toLowerCase();
      if (n.includes('hair_braid')) hair++;
      else if (n.includes('dress_front') || n.includes('dress_back')) dress++;
      else if (n.includes('belt_tail')) belt++;
      else if (n.includes('breast') || n.includes('nipple')) breast++;
      else if (n.includes('butt') || n.includes('genital')) butt++;
      else if (n.includes('simplicage')) cage++;
      else other++;
    }
    return { hair, dress, belt, breast, butt, cage, other, total: skel.bones.length };
  })();

  return (
    <div style={{ display: 'flex', height: '100vh',
                  background: '#12121f', color: '#ddd', fontFamily: 'monospace' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)',
                      borderBottom: '1px solid #333' }}>
          <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
            QM MustardUI Preview
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            public/box5/qm_mustardui/
          </span>
          {grid && (
            <span style={{ fontSize: 10, color: '#666', marginLeft: 12 }}>
              grid: {grid.gx}×{grid.gy}×{grid.gz}, size={grid.voxel_size.toFixed(5)}
            </span>
          )}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div style={{ width: 280, padding: 12, background: 'rgba(0,0,0,0.4)',
                    borderLeft: '1px solid #333', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <button
            onClick={() => setVisible(Object.fromEntries(
              PARTS.map(p => [p.key, p.key === 'body' || p.key === 'hair'])
            ))}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 10,
              border: '1px solid #555', borderRadius: 3,
              background: 'rgba(60,40,80,0.5)', color: '#fcf',
              cursor: 'pointer', fontFamily: 'monospace',
            }}>
            Body + Hair only
          </button>
          <button
            onClick={() => setVisible(Object.fromEntries(
              PARTS.map(p => [p.key,
                p.key !== 'lips' && !p.key.startsWith('bikini_') && !p.key.startsWith('de_')
              ])
            ))}
            style={{
              flex: 1, padding: '6px 8px', fontSize: 10,
              border: '1px solid #555', borderRadius: 3,
              background: 'rgba(40,60,80,0.5)', color: '#cff',
              cursor: 'pointer', fontFamily: 'monospace',
            }}>
            Default Set
          </button>
        </div>
        {PART_GROUPS.map(g => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <h3 style={{
              fontSize: 12, margin: '0 0 6px', color: '#8fa',
              borderBottom: '1px solid #334', paddingBottom: 2,
            }}>{g.group}</h3>
            {g.parts.map(p => {
              const info = partInfo[p.key];
              const exists = info && info !== 'missing';
              return (
                <label key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  padding: '4px 6px', marginBottom: 2,
                  borderRadius: 3,
                  background: exists ? 'rgba(30,30,50,0.6)' : 'rgba(40,20,20,0.4)',
                  opacity: exists ? 1 : 0.5,
                  cursor: exists ? 'pointer' : 'default',
                  userSelect: 'none',
                }}>
                  <input type="checkbox" disabled={!exists}
                    checked={!!visible[p.key]}
                    onChange={e => setVisible(v => ({ ...v, [p.key]: e.target.checked }))} />
                  <span style={{
                    display: 'inline-block', width: 10, height: 10,
                    background: p.color, borderRadius: 2,
                  }} />
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <span style={{ color: '#666', fontSize: 10 }}>
                    {exists ? `${info.voxels}` : '–'}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>Bones</h3>
        {boneStats && (
          <div style={{ fontSize: 10, color: '#aaa', marginBottom: 8, lineHeight: 1.6 }}>
            Total: <b>{boneStats.total}</b> deform bones<br />
            hair_braid: <b>{boneStats.hair}</b> (orange)<br />
            dress_front/back: <b>{boneStats.dress}</b> (magenta)<br />
            belt_tail: <b>{boneStats.belt}</b> (yellow)<br />
            breast/nipple: <b>{boneStats.breast}</b> (pink)<br />
            butt/genital: <b>{boneStats.butt}</b> (purple)<br />
            simplicage: <b>{boneStats.cage}</b> (cyan)<br />
            other body: <b>{boneStats.other}</b> (green)
          </div>
        )}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
          color: '#aaa', cursor: 'pointer', marginBottom: 6,
        }}>
          <input type="checkbox" checked={showBones}
            onChange={e => setShowBones(e.target.checked)} />
          Show bones
        </label>
        <input type="text" placeholder="filter name (e.g., hair, dress, belt)"
          value={boneFilter} onChange={e => setBoneFilter(e.target.value)}
          style={{
            width: '100%', padding: 5, fontSize: 10,
            background: '#222', color: '#ddd', border: '1px solid #444',
            borderRadius: 3, fontFamily: 'monospace',
          }} />

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>MustardUI Effects</h3>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>
          頂点色を per-voxel ベイクテクスチャと lerp ブレンド
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 2 }}>
            Blush (Head): <b>{blushSlider.toFixed(2)}</b>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={blushSlider}
            onChange={e => setBlushSlider(parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 2 }}>
            Tattoo Color (Body): <b>{tattooSlider.toFixed(2)}</b>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={tattooSlider}
            onChange={e => setTattooSlider(parseFloat(e.target.value))}
            style={{ width: '100%' }} />
        </div>

        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
          ※ Tattoo Emissive は per-voxel emissive 描画が必要 (Phase 2-D, スキップ)
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Dress Texture Number (要 Dress 表示):
          </div>
          {[
            { num: 1, label: '1: Default' },
            { num: 2, label: '2: Red' },
            { num: 3, label: '3: White' },
          ].map(({ num, label }) => (
            <label key={num} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              padding: '2px 4px', cursor: 'pointer',
            }}>
              <input type="radio" name="dress_tex_num"
                checked={dressTexNum === num}
                onChange={() => setDressTexNum(num)} />
              {label}
            </label>
          ))}
        </div>

        <h3 style={{ fontSize: 13, margin: '16px 0 8px', color: '#fa8' }}>Sub-grid Offset</h3>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>
          顔パーツ (x2/x4) を character 前方 (+Z) に押し出す量
        </div>
        <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
          Forward: <b>{subGridForwardMm.toFixed(1)} mm</b>
        </div>
        <input type="range" min={-20} max={30} step={0.5} value={subGridForwardMm}
          onChange={e => setSubGridForwardMm(parseFloat(e.target.value))}
          style={{ width: '100%' }} />

        <div style={{ marginTop: 20, padding: 8, fontSize: 10,
                      background: 'rgba(0,0,0,0.3)', borderRadius: 4, color: '#888' }}>
          Files under <b>public/box5/qm_mustardui/</b>.<br/>
          Reload (Ctrl+Shift+R) after adding new parts.
        </div>
      </div>
    </div>
  );
}
