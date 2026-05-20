'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

// Per-model config. Add entries here and switch via URL: ?model=<key>.
// Each model needs three folders under `base`:
//   qm/                    shared QM body voxel + skeleton
//   <originalFolder>/      raw model body + skeleton
//   <transplantedFolder>/  body re-shaped to QM, with QM-fit outfits
interface OutfitDef {
  key: string;
  label: string;
  color: string;
}
interface ModelConfig {
  label: string;
  base: string;
  originalFolder: string;
  transplantedFolder: string;
  originalAccent: string;
  transplantedAccent: string;
  outfits: ReadonlyArray<OutfitDef>;
}

const HELENA_OUTFITS: OutfitDef[] = [
  { key: 'hair',           label: 'Hair',             color: '#fa8' },
  { key: 'bodysuit',       label: 'Bodysuit',         color: '#88f' },
  { key: 'dark_prison_a',  label: 'Dark Prison A',    color: '#a4a' },
  { key: 'dark_prison_b',  label: 'Dark Prison B',    color: '#a4a' },
  { key: 'rs_panties',     label: 'RS Panties',       color: '#fc8' },
  { key: 'rs_shirt_normal', label: 'RS Shirt Normal', color: '#f8f' },
  { key: 'rs_shirt_nude',  label: 'RS Shirt Nude',    color: '#f8f' },
  { key: 'qipao',          label: 'Qipao',            color: '#f48' },
  { key: 'qipao_panty',    label: 'Qipao Panty',      color: '#fc8' },
  { key: 'qipao_shoe',     label: 'Qipao Shoe',       color: '#cca' },
  { key: 'qipao_sock',     label: 'Qipao Sock',       color: '#aaa' },
];

const RACHEL_OUTFITS: OutfitDef[] = [
  // Colors sampled from Rachel_Rework.blend albedo textures using the MEDIAN of
  // UV-mapped pixels (mean was diluted by transparent/gray background). Verified
  // visually: thong/bra are black "LOVE ATTITUDE" garments, panties2/breasts_top/
  // chest_cover are purple metallic, gloves_l/belt/shoulder_strap are dark cloth.
  // Pure-black medians lifted to #1a1a1a so voxels stay visible against bg #0c0c14.
  { key: 'casual_thong',   label: 'Casual Thong',   color: '#1a1a1a' },
  { key: 'casual_bra',     label: 'Casual Bra',     color: '#1a1a1a' },
  { key: 'panties2',       label: 'Panties (2)',    color: '#8a6eb3' },
  { key: 'breasts_top',    label: 'Breasts Top',    color: '#8b62b3' },
  { key: 'gloves_l',       label: 'Gloves L',       color: '#404040' },
  { key: 'belt',           label: 'Belt',           color: '#727272' },
  { key: 'chest_cover',    label: 'Chest Cover',    color: '#825fb3' },
  { key: 'shoulder_strap', label: 'Shoulder Strap', color: '#474040' },
];

const VAULTGIRL_OUTFITS: OutfitDef[] = [
  { key: 'vault_suit',      label: 'Vault Suit',       color: '#3a4a6a' },
  { key: 'vaultsuit1',      label: 'Vault Suit (alt)', color: '#3a4a6a' },
  { key: 'vault_suit_boot', label: 'Vault Suit Boot',  color: '#3a2010' },
  { key: 'bikini5_top',     label: 'Bikini Top',       color: '#aa3344' },
  { key: 'bikini5_bottom',  label: 'Bikini Bottom',    color: '#aa3344' },
  { key: 'pipboy',          label: 'Pipboy',           color: '#8aaa66' },
  { key: 'faith_hair',      label: 'Faith Hair',       color: '#5a3a1a' },
  { key: 'hair_2',          label: 'Hair (2)',         color: '#3a2a1a' },
  { key: 'base_black',      label: 'Hair Base Black',  color: '#1a1a1a' },
  { key: 'base_blonde',     label: 'Hair Base Blonde', color: '#caa66a' },
];

const BLACKWIDOW_OUTFITS: OutfitDef[] = [
  // Hair / face
  { key: 'eyes',             label: 'Eyes',             color: '#48a' },
  { key: 'lashes',           label: 'Eyelashes',        color: '#222' },
  { key: 'hair1',            label: 'Hair 1',           color: '#a55' },
  { key: 'hair2',            label: 'Hair 2',           color: '#522' },
  // BW signature suit
  { key: 'bw_suit',          label: 'BW Suit',          color: '#222' },
  { key: 'bw_harness',       label: 'BW Harness',       color: '#444' },
  { key: 'bw_armbands',      label: 'BW Armbands',      color: '#111' },
  { key: 'bw_belt',          label: 'BW Belt',          color: '#222' },
  { key: 'bw_boots',         label: 'BW Boots',         color: '#222' },
  { key: 'bodysuit',         label: 'Bodysuit',         color: '#333' },
  // Footwear
  { key: 'boots',            label: 'Boots',            color: '#321' },
  { key: 'boots_punk',       label: 'Boots Punk',       color: '#1a1a1a' },
  { key: 'shoes',            label: 'Shoes',            color: '#222' },
  // Casual
  { key: 'casual_pants',     label: 'Casual Pants',     color: '#446' },
  { key: 'casual_shirt',     label: 'Casual Shirt',     color: '#ccc' },
  // Business
  { key: 'bw_jacket',        label: 'Business Jacket',  color: '#444' },
  { key: 'bw_skirt',         label: 'Business Skirt',   color: '#333' },
  // School
  { key: 'school_choker',    label: 'School Choker',    color: '#222' },
  { key: 'school_panty',     label: 'School Panty',     color: '#fff' },
  { key: 'school_shirt',     label: 'School Shirt',     color: '#fff' },
  { key: 'school_skirt',     label: 'School Skirt',     color: '#a44' },
  { key: 'school_stockings', label: 'School Stockings', color: '#222' },
  // Nurse
  { key: 'nurse_corset',     label: 'Nurse Corset',     color: '#a22' },
  { key: 'nurse_gloves',     label: 'Nurse Gloves',     color: '#222' },
  { key: 'nurse_pasties',    label: 'Nurse Pasties',    color: '#a22' },
  { key: 'nurse_stockings',  label: 'Nurse Stockings',  color: '#222' },
  // Underwear
  { key: 'babydoll',         label: 'Babydoll',         color: '#caa' },
  { key: 'corset_stockings', label: 'Corset+Stockings', color: '#444' },
  { key: 'pantyhose',        label: 'Pantyhose',        color: '#222' },
  // Accessories
  { key: 'glasses',          label: 'Glasses',          color: '#111' },
  { key: 'gun_l',            label: 'Gun L',            color: '#444' },
  { key: 'gun_r',            label: 'Gun R',            color: '#444' },
  { key: 'gun_holstered_l',  label: 'Gun Holstered L',  color: '#444' },
  { key: 'gun_holstered_r',  label: 'Gun Holstered R',  color: '#444' },
];

const PHARAH_OUTFITS: OutfitDef[] = [
  // Face / hair
  { key: 'lashes',           label: 'Eyelashes',        color: '#222' },
  { key: 'eyebrows',         label: 'Eyebrows',         color: '#532' },
  { key: 'hair_default',     label: 'Hair Default',     color: '#221' },
  { key: 'hair_ponytail',    label: 'Hair Ponytail',    color: '#221' },
  { key: 'hair_short',       label: 'Hair Short',       color: '#221' },
  // OW2 armor
  { key: 'armor_torso',      label: 'OW2 Torso',        color: '#2a3b5a' },
  { key: 'armor_zerosuit',   label: 'OW2 ZeroSuit',     color: '#222' },
  { key: 'armor_helmet',     label: 'OW2 Helmet',       color: '#446' },
  { key: 'armor_thighs',     label: 'OW2 Thighs',       color: '#446' },
  { key: 'armor_feet',       label: 'OW2 Feet',         color: '#446' },
  { key: 'armor_gloves',     label: 'OW2 Gloves',       color: '#446' },
  { key: 'armor_wings',      label: 'OW2 Wings',        color: '#446' },
  // Outfits
  { key: 'bodysuit',         label: 'Bodysuit',         color: '#222' },
  { key: 'bikini_bra',       label: 'Bikini Bra',       color: '#a44' },
  { key: 'bikini_bottom',    label: 'Bikini Bottom',    color: '#a44' },
  { key: 'combat_top',       label: 'Combat Top',       color: '#664' },
  { key: 'combat_shorts',    label: 'Combat Shorts',    color: '#642' },
  { key: 'lingerie_top',     label: 'Lingerie Top',     color: '#a52' },
  { key: 'lingerie_bottom',  label: 'Lingerie Bottom',  color: '#a52' },
  { key: 'sports_top',       label: 'Sports Top',       color: '#48a' },
  { key: 'sports_shorts',    label: 'Sports Shorts',    color: '#48a' },
  { key: 'yoga_pants',       label: 'Yoga Pants',       color: '#444' },
  { key: 'underwear_top',    label: 'Underwear Top',    color: '#fcc' },
  { key: 'underwear_bottom', label: 'Underwear Bottom', color: '#fcc' },
  // Weapon
  { key: 'pistol',           label: 'Pistol',           color: '#222' },
];

const NYOTENGU_OUTFITS: OutfitDef[] = [
  { key: 'eyes',   label: 'Eyes',     color: '#48a' },
  { key: 'lashes', label: 'Eyelashes', color: '#222' },
  { key: 'hair1',  label: 'Hair 1',   color: '#a76' },
  { key: 'hair2',  label: 'Hair 2',   color: '#a76' },
];

const ANNA_OUTFITS: OutfitDef[] = [
  // Blackmottled (default outfit)
  { key: 'blackmottled_top',    label: 'Blackmottled Top',    color: '#666' },
  { key: 'blackmottled_pants',  label: 'Blackmottled Pants',  color: '#444' },
  { key: 'blackmottled_boots',  label: 'Blackmottled Boots',  color: '#321' },
  { key: 'blackmottled_gloves', label: 'Blackmottled Gloves', color: '#543' },
  // T8
  { key: 't8_top',              label: 'T8 Top',              color: '#a82' },
  { key: 't8_pants',            label: 'T8 Pants',            color: '#642' },
  { key: 't8_boots',            label: 'T8 Boots',            color: '#321' },
  { key: 't8_gloves',           label: 'T8 Gloves',           color: '#864' },
  { key: 't8_coat',             label: 'T8 Coat',             color: '#864' },
  { key: 't8_choker',           label: 'T8 Choker',           color: '#aaa' },
  { key: 't8_thong',            label: 'T8 Thong',            color: '#864' },
  // Suit
  { key: 'suit_top',            label: 'Suit Top',            color: '#88a' },
  { key: 'suit_skirt',          label: 'Suit Skirt',          color: '#668' },
  { key: 'suit_pantyhose',      label: 'Suit Pantyhose',      color: '#665' },
  { key: 'suit_boots',          label: 'Suit Boots',          color: '#321' },
  { key: 'suit_gloves',         label: 'Suit Gloves',         color: '#88a' },
  { key: 'suit_hat',            label: 'Suit Hat',            color: '#88a' },
  // Gym
  { key: 'gym_croptop',         label: 'Gym Croptop',         color: '#fc8' },
  { key: 'gym_hoodie',          label: 'Gym Hoodie',          color: '#cca' },
  { key: 'gym_shorts',          label: 'Gym Shorts',          color: '#aaa' },
  { key: 'gym_shoes',           label: 'Gym Shoes',           color: '#caa' },
  // Lingerie
  { key: 'lingerie_bra',        label: 'Lingerie Bra',        color: '#fcc' },
  { key: 'lingerie_thong',      label: 'Lingerie Thong',      color: '#fcc' },
  { key: 'lingerie_stockings',  label: 'Lingerie Stockings',  color: '#fdd' },
  { key: 'lingerie_heels',      label: 'Lingerie Heels',      color: '#fcc' },
  { key: 'lingerie_sleeves',    label: 'Lingerie Sleeves',    color: '#fcc' },
  { key: 'lingerie_choker',     label: 'Lingerie Choker',     color: '#fcc' },
  { key: 'lingerie_pasties',    label: 'Lingerie Pasties',    color: '#fcc' },
  // Swimsuit
  { key: 'swimsuit_top',        label: 'Swimsuit Top',        color: '#cef' },
  { key: 'swimsuit_bottom',     label: 'Swimsuit Bottom',     color: '#cef' },
  // Hair
  { key: 'hair_classic',        label: 'Hair Classic',        color: '#fa6' },
  { key: 'hair_t8',             label: 'Hair T8',             color: '#fc8' },
];

const MODELS: Record<string, ModelConfig> = {
  helena: {
    label: 'Helena',
    base: '/box5/helena_qm_compare',
    originalFolder: 'helena',
    transplantedFolder: 'helena_qm',
    originalAccent: '#fa8',
    transplantedAccent: '#8cf',
    outfits: HELENA_OUTFITS,
  },
  anna: {
    label: 'Anna',
    base: '/box5/anna_qm_compare',
    originalFolder: 'anna',
    transplantedFolder: 'anna_qm',
    originalAccent: '#fc6',
    transplantedAccent: '#8df',
    outfits: ANNA_OUTFITS,
  },
  rachel: {
    label: 'Rachel',
    base: '/box5/rachel_qm_compare',
    originalFolder: 'rachel',
    transplantedFolder: 'rachel_qm',
    originalAccent: '#fda',
    transplantedAccent: '#adf',
    outfits: RACHEL_OUTFITS,
  },
  vaultgirl: {
    label: 'Vaultgirl',
    base: '/box5/vaultgirl_qm_compare',
    originalFolder: 'vaultgirl',
    transplantedFolder: 'vaultgirl_qm',
    originalAccent: '#ec8',
    transplantedAccent: '#9cf',
    outfits: VAULTGIRL_OUTFITS,
  },
  nyotengu: {
    label: 'Nyotengu',
    base: '/box5/nyotengu_qm_compare',
    originalFolder: 'nyotengu',
    transplantedFolder: 'nyotengu_qm',
    originalAccent: '#fda',
    transplantedAccent: '#acf',
    outfits: NYOTENGU_OUTFITS,
  },
  blackwidow: {
    label: 'BlackWidow',
    base: '/box5/blackwidow_qm_compare',
    originalFolder: 'blackwidow',
    transplantedFolder: 'blackwidow_qm',
    originalAccent: '#e88',
    transplantedAccent: '#8ce',
    outfits: BLACKWIDOW_OUTFITS,
  },
  pharah: {
    label: 'Pharah',
    base: '/box5/pharah_qm_compare',
    originalFolder: 'pharah',
    transplantedFolder: 'pharah_qm',
    originalAccent: '#fc8',
    transplantedAccent: '#9bf',
    outfits: PHARAH_OUTFITS,
  },
};
const DEFAULT_MODEL = 'helena';

type PanelKey = 'qm' | 'original' | 'transplanted';

interface PanelDef {
  key: PanelKey;
  label: string;
  base: string;
  accent: string;
  showOutfits: boolean;
}

function buildPanels(model: ModelConfig): PanelDef[] {
  return [
    { key: 'qm',           label: 'QM (QueenMarika)',
      base: `${model.base}/qm`,
      accent: '#fc8', showOutfits: true },
    { key: 'original',     label: `${model.label} (original)`,
      base: `${model.base}/${model.originalFolder}`,
      accent: model.originalAccent, showOutfits: true },
    { key: 'transplanted', label: `${model.label} + QM bones`,
      base: `${model.base}/${model.transplantedFolder}`,
      accent: model.transplantedAccent, showOutfits: true },
  ];
}

// OUTFITS list per model is now stored in MODELS[<key>].outfits.

interface Grid {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number; gy: number; gz: number;
}

interface SkeletonBone {
  name: string;
  parent: string | null;
  use_deform: boolean;
  head_rest: [number, number, number];
  tail_rest: [number, number, number];
}
interface Skeleton {
  armature: string;
  bone_count: number;
  bones: SkeletonBone[];
}

interface PanelState {
  engine?: Engine;
  scene?: Scene;
  cam?: ArcRotateCamera;
  bodyMesh?: Mesh | null;
  boneLines?: LinesMesh | null;
  outfitMeshes?: Map<string, Mesh>;
  grid?: Grid;
  // view-time hide 用: 全 body voxel raw + outfit cell index (key→Set<"x,y,z">)
  bodyVoxRaw?: ReturnType<typeof parseVox>;
  outfitCells?: Map<string, Set<string>>;
}

// Blender (Z-up) → Babylon (Y-up, 右手系): (bx, bz, -by)
const bToB = (bx: number, by: number, bz: number): [number, number, number] => [bx, bz, -by];

export default function HelenaQmComparePage() {
  const canvasRefs = useRef<Record<PanelKey, HTMLCanvasElement | null>>({
    qm: null, original: null, transplanted: null,
  });
  const panelStateRef = useRef<Record<PanelKey, PanelState>>({
    qm: {}, original: {}, transplanted: {},
  });
  const syncingRef = useRef(false);

  // Resolve active model from ?model=<key> once at mount. Unknown keys
  // fall back to DEFAULT_MODEL. To switch model, change the URL and reload.
  const [modelKey] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL;
    const m = new URL(window.location.href).searchParams.get('model');
    return m && MODELS[m] ? m : DEFAULT_MODEL;
  });
  const model = MODELS[modelKey] ?? MODELS[DEFAULT_MODEL];
  const panels = useMemo(() => buildPanels(model), [model]);
  const outfitSource = useMemo(
    () => `${model.base}/${model.transplantedFolder}`,
    [model],
  );

  const [showMesh, setShowMesh] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [outfitVisible, setOutfitVisible] = useState<Record<string, boolean>>(
    () => ({})  // All outfits unchecked by default; user toggles to view
  );
  const [status, setStatusMap] = useState<Record<PanelKey, string>>({
    qm: '...', original: '...', transplanted: '...',
  });
  const setStatus = useCallback((k: PanelKey, msg: string) => {
    setStatusMap(s => ({ ...s, [k]: msg }));
  }, []);

  // ---- Camera sync (3 panels stay aligned) ----
  const syncOthers = useCallback((source: ArcRotateCamera, sourceKey: PanelKey) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    for (const p of panels) {
      if (p.key === sourceKey) continue;
      const t = panelStateRef.current[p.key].cam;
      if (!t) continue;
      t.alpha = source.alpha;
      t.beta = source.beta;
      t.radius = source.radius;
      t.target.copyFrom(source.target);
      

      
    }
    syncingRef.current = false;
  }, [panels]);

  // ---- Build voxel mesh at world coords ----
  const buildVoxelMesh = useCallback((
    scene: Scene, name: string, voxels: ReturnType<typeof parseVox>['voxels'],
    palette: ReturnType<typeof parseVox>['palette'],
    origin: [number, number, number], voxelSize: number,
    overrideColor?: [number, number, number],
    excludeCells?: Set<string>,
  ): Mesh => {
    const occ = new Set<string>();
    for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (const v of voxels) {
      if (excludeCells && excludeCells.has(`${v.x},${v.y},${v.z}`)) continue;
      const col = overrideColor
        ? { r: overrideColor[0], g: overrideColor[1], b: overrideColor[2] }
        : (palette[v.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 });
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = FACE_DIRS[f];
        if (occ.has(`${v.x + dx},${v.y + dy},${v.z + dz}`)) continue;
        const bi = positions.length / 3;
        const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
        const [nx, ny, nz] = bToB(fn[0], fn[1], fn[2]);
        for (let vi = 0; vi < 4; vi++) {
          const [lx, ly, lz] = fv[vi];
          const bx = origin[0] + (v.x + lx) * voxelSize;
          const by = origin[1] + (v.y + ly) * voxelSize;
          const bz = origin[2] + (v.z + lz) * voxelSize;
          const [wx, wy, wz] = bToB(bx, by, bz);
          positions.push(wx, wy, wz);
          normals.push(nx, ny, nz);
          colors.push(col.r, col.g, col.b, 1);
        }
        indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
      }
    }

    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.colors = colors;
    vd.indices = indices;
    const mesh = new Mesh(name, scene);
    vd.applyToMesh(mesh);
    const mat = new StandardMaterial(`${name}_mat`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White();
    mat.backFaceCulling = false;
    mat.specularColor = Color3.Black();
    mesh.material = mat;
    return mesh;
  }, []);

  // ---- Build bone line system ----
  const buildBoneLines = useCallback((
    scene: Scene, name: string, skel: Skeleton, accent: string,
  ): LinesMesh => {
    const toBabylon = (p: [number, number, number]) => new Vector3(p[0], p[2], -p[1]);
    const lines: Vector3[][] = [];
    const colorArr: Color4[][] = [];
    const accentRGB = Color3.FromHexString(accent);
    const ac = new Color4(accentRGB.r, accentRGB.g, accentRGB.b, 1);
    for (const b of skel.bones) {
      lines.push([toBabylon(b.head_rest), toBabylon(b.tail_rest)]);
      colorArr.push([ac, ac]);
    }
    const lm = MeshBuilder.CreateLineSystem(name, {
      lines, colors: colorArr, updatable: false,
    }, scene);
    lm.isPickable = false;
    return lm;
  }, []);

  // ---- Init scene for one panel ----
  const initPanel = useCallback((canvas: HTMLCanvasElement, key: PanelKey) => {
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.78, 0.80, 0.84, 1);  // light gray background for visibility
    scene.useRightHandedSystem = true;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0,
      new Vector3(0, 0.95, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.9;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.5;

    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4, subdivisions: 8 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.55, 0.57, 0.62);  // darker than bg for contrast
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;
    ground.position.y = -0.005;

    engine.runRenderLoop(() => scene.render());
    cam.onViewMatrixChangedObservable.add(() => syncOthers(cam, key));

    return { engine, scene, cam };
  }, [syncOthers]);

  // ---- Load voxels + skeleton for one panel ----
  const loadPanel = useCallback(async (
    panel: PanelDef, scene: Scene,
  ) => {
    setStatus(panel.key, 'loading...');
    try {
      const bust = `?v=${Date.now()}`;
      const [gridResp, voxResp, skelResp] = await Promise.all([
        fetch(`${panel.base}/grid.json${bust}`),
        fetch(`${panel.base}/body.vox${bust}`),
        fetch(`${panel.base}/skeleton.json${bust}`),
      ]);
      if (!gridResp.ok || !voxResp.ok) {
        setStatus(panel.key, 'missing voxel/grid');
        return;
      }
      const grid: Grid = await gridResp.json();
      panelStateRef.current[panel.key].grid = grid;
      const voxBody = parseVox(await voxResp.arrayBuffer());
      panelStateRef.current[panel.key].bodyVoxRaw = voxBody;

      const mesh = buildVoxelMesh(
        scene, `body_${panel.key}`, voxBody.voxels, voxBody.palette,
        grid.grid_origin, grid.voxel_size,
      );
      panelStateRef.current[panel.key].bodyMesh = mesh;

      let nBones = 0;
      if (skelResp.ok) {
        const skel: Skeleton = await skelResp.json();
        nBones = skel.bones.length;
        const lm = buildBoneLines(scene, `bones_${panel.key}`, skel, panel.accent);
        panelStateRef.current[panel.key].boneLines = lm;
      }

      // Load outfits. For `original` panel use panel.base (source-side voxels),
      // for `qm` / `transplanted` use the shared outfitSource (= transplantedFolder).
      // Both folders use `<key>.vox` filenames: original is voxelized from the
      // source mesh; transplanted is voxelized from the LBS-deformed mesh
      // (Blender-side mesh deformation via bone-weight retarget), preserving
      // the original garment silhouette + per-voxel texture-sampled colors.
      const outfitMeshes = new Map<string, Mesh>();
      const outfitCells = new Map<string, Set<string>>();
      let outfitVoxTotal = 0;
      if (panel.showOutfits) {
        const ofBase = panel.key === 'original' ? panel.base : outfitSource;
        const ofGridResp = await fetch(`${ofBase}/grid.json${bust}`);
        const ofGrid: Grid = ofGridResp.ok ? await ofGridResp.json() : grid;
        for (const o of model.outfits) {
          try {
            const fname = `${o.key}.vox`;
            const r = await fetch(`${ofBase}/${fname}${bust}`);
            if (!r.ok) continue;
            const ofModel = parseVox(await r.arrayBuffer());
            if (ofModel.voxels.length === 0) continue;
            // All panels use the per-voxel palette stored in the .vox file
            // (source-side: sampled from mesh albedo textures; retargeted side:
            // mean color of contributing source voxels per bbox-UV bin).
            const om = buildVoxelMesh(
              scene, `outfit_${panel.key}_${o.key}`,
              ofModel.voxels, ofModel.palette,
              ofGrid.grid_origin, ofGrid.voxel_size,
            );
            om.isVisible = !!outfitVisible[o.key];
            outfitMeshes.set(o.key, om);
            outfitVoxTotal += ofModel.voxels.length;
            // Hair は body 表面に乗らないので body hide 用 cells に含めない
            const isHair = o.key.startsWith('hair') || o.key.includes('hair');
            if (!isHair) {
              const cells = new Set<string>();
              for (const v of ofModel.voxels) cells.add(`${v.x},${v.y},${v.z}`);
              outfitCells.set(o.key, cells);
            }
          } catch (e) {
            console.warn(`outfit ${o.key} failed`, e);
          }
        }
      }
      panelStateRef.current[panel.key].outfitMeshes = outfitMeshes;
      panelStateRef.current[panel.key].outfitCells = outfitCells;

      // Voxel index bbox of body (raw counts from .vox)
      let mnX = Infinity, mxX = -Infinity;
      let mnY = Infinity, mxY = -Infinity;
      let mnZ = Infinity, mxZ = -Infinity;
      for (const v of voxBody.voxels) {
        if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
        if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
        if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
      }
      const wMm = ((mxX - mnX + 1) * grid.voxel_size * 1000).toFixed(0);
      const dMm = ((mxY - mnY + 1) * grid.voxel_size * 1000).toFixed(0);
      const hMm = ((mxZ - mnZ + 1) * grid.voxel_size * 1000).toFixed(0);
      const outfitTag = outfitMeshes.size
        ? ` · ${outfitMeshes.size} outfits (${outfitVoxTotal})`
        : '';
      setStatus(panel.key,
        `body ${voxBody.voxels.length} · ${wMm}×${dMm}×${hMm}mm${nBones ? ` · ${nBones} bones` : ''}${outfitTag}`);
    } catch (e) {
      console.error(`load ${panel.key} failed`, e);
      setStatus(panel.key, `error: ${(e as Error).message ?? e}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildVoxelMesh, buildBoneLines, setStatus]);

  // ---- Mount: init all 3 panels ----
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const p of panels) {
      const c = canvasRefs.current[p.key];
      if (!c) continue;
      const { engine, scene, cam } = initPanel(c, p.key);
      panelStateRef.current[p.key] = { engine, scene, cam };
      void loadPanel(p, scene);
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        const st = panelStateRef.current[p.key];
        st.bodyMesh?.dispose();
        st.boneLines?.dispose();
        st.outfitMeshes?.forEach(m => m.dispose());
        engine.dispose();
        panelStateRef.current[p.key] = {};
      });
    }
    return () => { for (const f of cleanups) f(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Toggle visibility ----
  useEffect(() => {
    for (const p of panels) {
      const m = panelStateRef.current[p.key].bodyMesh;
      if (m) m.isVisible = showMesh;
    }
  }, [showMesh, panels]);
  useEffect(() => {
    for (const p of panels) {
      const lm = panelStateRef.current[p.key].boneLines;
      if (lm) lm.isVisible = showSkeleton;
    }
  }, [showSkeleton, panels]);
  useEffect(() => {
    for (const p of panels) {
      const state = panelStateRef.current[p.key];
      const ms = state.outfitMeshes;
      if (ms) {
        ms.forEach((m, key) => { m.isVisible = !!outfitVisible[key]; });
      }
      // View-time body hide: 表示中 outfit の cell を body から除外して再構築
      if (state.bodyVoxRaw && state.outfitCells && state.scene && state.grid) {
        const exclusion = new Set<string>();
        state.outfitCells.forEach((cells, key) => {
          if (outfitVisible[key]) cells.forEach(c => exclusion.add(c));
        });
        state.bodyMesh?.dispose();
        const newMesh = buildVoxelMesh(
          state.scene, `body_${p.key}`,
          state.bodyVoxRaw.voxels, state.bodyVoxRaw.palette,
          state.grid.grid_origin, state.grid.voxel_size,
          undefined, exclusion,
        );
        newMesh.isVisible = showMesh;
        state.bodyMesh = newMesh;
      }
    }
  }, [outfitVisible, panels, buildVoxelMesh, showMesh]);

  // Outfit list (rendered on panels with showOutfits=true)
  const allOutfits = model.outfits;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: '#0c0c14', color: '#ddd', fontFamily: 'monospace',
    }}>
      <div style={{
        padding: '8px 14px', background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid #333', display: 'flex',
        alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ color: '#8af', fontSize: 13, fontWeight: 'bold' }}>
          QM / {model.label} / {model.label}+QMBones — Voxel & Skeleton Compare
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showMesh}
            onChange={e => setShowMesh(e.target.checked)} />
          Show body voxels
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input type="checkbox" checked={showSkeleton}
            onChange={e => setShowSkeleton(e.target.checked)} />
          Show skeleton
        </label>
        <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto' }}>
          drag to rotate · all 3 cameras synced
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {panels.map(p => (
          <div key={p.key} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #222', minWidth: 0,
          }}>
            <div style={{
              padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid #222',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
            }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                background: p.accent, borderRadius: 2,
              }} />
              <span style={{ color: p.accent, fontWeight: 'bold' }}>{p.label}</span>
              <span style={{ color: '#888', marginLeft: 'auto', fontSize: 10 }}>
                {status[p.key]}
              </span>
            </div>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <canvas
                ref={el => { canvasRefs.current[p.key] = el; }}
                style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
              />
            </div>
          </div>
        ))}
      </div>

      {allOutfits.length > 0 && (
        <div style={{
          padding: '6px 14px', background: 'rgba(0,0,0,0.35)',
          borderTop: '1px solid #333', display: 'flex',
          alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: '#8fa', fontWeight: 'bold' }}>
            Outfits (QM + Helena+QM panels):
          </span>
          {allOutfits.map(o => (
            <label key={o.key} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '2px 6px',
              background: 'rgba(30,30,50,0.6)', borderRadius: 3,
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={!!outfitVisible[o.key]}
                onChange={e => setOutfitVisible(s => ({ ...s, [o.key]: e.target.checked }))} />
              <span style={{
                display: 'inline-block', width: 8, height: 8,
                background: o.color, borderRadius: 2,
              }} />
              {o.label}
            </label>
          ))}
        </div>
      )}

      <div style={{
        padding: '6px 14px', background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid #333', fontSize: 10, color: '#888',
      }}>
        Voxels @ resolution=150, surface-only, QM rig retarget. Files under{' '}
        <code>public{model.base}/</code> · model: <code>?model={modelKey}</code>










      </div>
    </div>
    

    


  );
}


