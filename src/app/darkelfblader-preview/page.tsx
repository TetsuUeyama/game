'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh,
  VertexData, LinesMesh, VertexBuffer,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import { buildExteriorOracle } from '@/lib/vox-mesh';

const BASE = '/api/box5/darkelfblader_arp';

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

/** DarkElfBlader のパーツ構成。Body mesh に Eyes/Hair material 統合、Hair は別 mesh、Armor 14 / Weapon 4。 */
const PART_GROUPS: Array<{ group: string; parts: Array<{ key: string; label: string; color: string }> }> = [
  {
    group: 'Body & Face',
    parts: [
      { key: 'body',  label: 'Body (顔/体/目/髪 統合)', color: '#faa' },
      { key: 'hair',  label: 'Hair (別 mesh)',          color: '#fa8' },
    ],
  },
  {
    group: 'Armor (Default Outfit)',
    parts: [
      { key: 'armor_arms',              label: 'Arms',              color: '#8ff' },
      { key: 'armor_belt_cape',         label: 'Belt Cape',         color: '#88f' },
      { key: 'armor_belt_inner',        label: 'Belt Inner',        color: '#aaf' },
      { key: 'armor_belt_outer',        label: 'Belt Outer',        color: '#aaf' },
      { key: 'armor_belt_scabbards',    label: 'Belt Scabbards',    color: '#cca' },
      { key: 'armor_cape',              label: 'Cape',              color: '#fa8' },
      { key: 'armor_earrings',          label: 'Earrings',          color: '#ffa' },
      { key: 'armor_legs',              label: 'Legs',              color: '#8af' },
      { key: 'armor_mask',              label: 'Mask',              color: '#f8f' },
      { key: 'armor_shoulders',         label: 'Shoulders',         color: '#aff' },
      { key: 'armor_shoulders_clavice', label: 'Shoulders Clavice', color: '#aff' },
      { key: 'armor_suit',              label: 'Suit',              color: '#f88' },
      { key: 'armor_suit_bra',          label: 'Suit Bra',          color: '#f6c' },
      { key: 'armor_suit_plates',       label: 'Suit Plates',       color: '#fc8' },
    ],
  },
  {
    group: 'Weapons',
    parts: [
      { key: 'weapon_a',           label: 'Weapon A',           color: '#fa0' },
      { key: 'weapon_a_scabbard',  label: 'Weapon A Scabbard',  color: '#a80' },
      { key: 'weapon_b',           label: 'Weapon B',           color: '#fa0' },
      { key: 'weapon_b_scabbard',  label: 'Weapon B Scabbard',  color: '#a80' },
    ],
  },
];
const PARTS = PART_GROUPS.flatMap(g => g.parts);

// DarkElfBlader: Eyes は Body mesh に統合済み (独立した eyes パーツなし)
// 内部パーツ判定用 (body 内側)。今のところ独立内部 mesh なし → 空 set。
const INSIDE_BODY_PARTS = new Set<string>();

// [Phase 2/3] 各 part が持ちうる MustardUI エフェクト slot リスト
// armor 系は ARMOR_VARIATIONS で動的生成 (各 mesh 共通の azure/crimson/royal)
const ARMOR_VARIATIONS = ['azure', 'crimson', 'royal'] as const;
const ARMOR_PART_KEYS = [
  'armor_arms', 'armor_belt_cape', 'armor_belt_inner', 'armor_belt_outer', 'armor_belt_scabbards',
  'armor_cape', 'armor_earrings', 'armor_legs', 'armor_mask',
  'armor_shoulders', 'armor_shoulders_clavice', 'armor_suit', 'armor_suit_bra', 'armor_suit_plates',
  'weapon_a', 'weapon_a_scabbard', 'weapon_b', 'weapon_b_scabbard',
];
const EFFECT_SLOTS_PER_PART: Record<string, string[]> = {
  body: [
    'blush_color', 'tattoo_color',
    'skin_body_dark', 'skin_body_light', 'skin_body_lightroyal',
    'skin_head_dark', 'skin_head_light', 'skin_head_lightroyal',
    'hair_body_azure', 'hair_body_crimson', 'hair_body_royal',
    'eyes_crimson', 'eyes_royal',
  ],
  hair: ['hair_azure', 'hair_crimson', 'hair_royal'],
  // 各 armor / weapon mesh は <variant>_color slot を持つ (azure/crimson/royal の 3 種)
  ...Object.fromEntries(ARMOR_PART_KEYS.map(k => [k, ARMOR_VARIATIONS.map(v => `armor_${v}`)])),
};

// Skin Color バリアント名 (default は素のベース)
const SKIN_COLOR_OPTIONS = [
  { id: 'default',     label: 'Default (DarkElf)' },
  { id: 'dark',        label: 'Dark Blue' },
  { id: 'light',       label: 'Light Skin' },
  { id: 'lightroyal',  label: 'Light Royal' },
] as const;
type SkinColorId = typeof SKIN_COLOR_OPTIONS[number]['id'];

// Hair Color バリアント名
const HAIR_COLOR_OPTIONS = [
  { id: 'default',     label: 'Default' },
  { id: 'azure',       label: 'Azure' },
  { id: 'crimson',     label: 'Crimson' },
  { id: 'royal',       label: 'Royal White' },
] as const;
type HairColorId = typeof HAIR_COLOR_OPTIONS[number]['id'];

// Eyes Color (デフォルトは Azure ベイク済み)
const EYES_COLOR_OPTIONS = [
  { id: 'default',  label: 'Default (Azure)' },
  { id: 'crimson',  label: 'Crimson' },
  { id: 'royal',    label: 'Royal White' },
] as const;
type EyesColorId = typeof EYES_COLOR_OPTIONS[number]['id'];

// Armor Variation (全 armor / weapon mesh 一斉切替)
const ARMOR_COLOR_OPTIONS = [
  { id: 'default',  label: 'Default' },
  { id: 'azure',    label: 'Azure' },
  { id: 'crimson',  label: 'Crimson' },
  { id: 'royal',    label: 'Royal White' },
] as const;
type ArmorColorId = typeof ARMOR_COLOR_OPTIONS[number]['id'];

// 各パーツの追加 z オフセット (m単位)。DarkElfBlader は eyes が body に統合のため未使用。
const PART_FORWARD_OFFSET: Record<string, number> = {
};

export default function DarkElfBladerPreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const meshMapRef = useRef<Map<string, Mesh>>(new Map());
  const boneLinesRef = useRef<LinesMesh | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [skel, setSkel] = useState<Skeleton | null>(null);
  const [partInfo, setPartInfo] = useState<Record<string, { voxels: number } | 'missing'>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(PARTS.map(p => [p.key,
      // 初期表示: body / hair のみ ON (DarkElfBlader は eyes が body 統合)
      // 他の armor / weapon はチェック OFF (ユーザーが必要なら手動 ON)
      p.key === 'body' || p.key === 'hair'
    ]))
  );
  const [showBones, setShowBones] = useState(false);
  const [boneFilter, setBoneFilter] = useState('');
  const [subGridForwardMm, setSubGridForwardMm] = useState(-2);  // サブグリッドの前方オフセット (mm) — eyes 位置補正

  // MustardUI Body エフェクト slider (0-1)
  const [blushSlider, setBlushSlider] = useState(0);
  const [tattooSlider, setTattooSlider] = useState(0);

  // Skin Color / Hair Color radio (default = 素のベイク色)
  const [skinColor, setSkinColor] = useState<SkinColorId>('default');
  const [hairColor, setHairColor] = useState<HairColorId>('default');
  const [eyesColor, setEyesColor] = useState<EyesColorId>('default');
  const [armorColor, setArmorColor] = useState<ArmorColorId>('default');

  // Dress Texture Number (1=Default / 2=Red / 3=White) — DarkElfBlader では未使用
  const [dressTexNum, setDressTexNum] = useState(1);

  // 各 part の頂点 ↔ voxel sub-grid index マッピング (effect 再計算用)
  // [i*3..i*3+2] = vertex i に対応する voxel の (ix, iy, iz)
  const partVoxelIdxRef = useRef<Map<string, Int32Array>>(new Map());
  // 各 part の base 頂点色 (effect 適用前、build 時に確定)
  const partBaseColorsRef = useRef<Map<string, Float32Array>>(new Map());
  // body のみ: 各 vertex のカテゴリ (0=skin, 1=eyes, 2=internal mouth)
  // showEyes / showInternal で alpha=0 → ALPHATEST で discard
  const partVertexCategoryRef = useRef<Map<string, Uint8Array>>(new Map());

  // 表示 ON/OFF (body の category 別)
  const [showEyesReal, setShowEyesReal] = useState(true);          // Eyes material 球体 (本物の目玉)
  const [showEyesOverlay, setShowEyesOverlay] = useState(false);   // 顔表面の目絵柄 (default OFF で消す)
  const [showInternalMouth, setShowInternalMouth] = useState(true); // 内蔵口腔

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
    // 内蔵パーツ voxel の sub-grid 座標 Set ("ix,iy,iz") — vertex category 判定用
    internalVoxelKeys?: Set<string>;
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
        let internalVoxelKeys: Set<string> | undefined;
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
              // sub-grid 座標 Set (vertex category 判定用)
              internalVoxelKeys = new Set(iv.internal_voxels.map(([ix, iy, iz]) => `${ix},${iy},${iz}`));
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

        partsData.set(p.key, { partGrid, chunks, internalVoxelWorldCenters, internalVoxelKeys, effects });
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

    // [DEB 最適化] DarkElfBlader では body sub-grid x3 vs armor common grid で
    // bodyHideSet (同 grid 衣装での body voxel skip) は機能しないので無効化。
    // → 結果として body も含めて全 part を「初回のみ build、以降スキップ」に。
    // visibility は別 useEffect の mesh.isVisible で瞬時に切替。
    const bodyHideSet = new Set<string>();  // 常に空 (機能無効)

    for (const p of PARTS) {
      const data = partsData.get(p.key);
      if (!data || data.chunks.length === 0) {
        info[p.key] = 'missing';
        continue;
      }
      const isBody = p.key === 'body';
      // 全 part: 既存 mesh あれば build skip (voxel count 情報のみ更新)
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
      // [P-X] internal voxels (口腔内など) + eyes voxels (眼球) を seed として渡し、
      //       閉じた cavity も exterior 扱い (内蔵パーツ + 眼球が body 内部から覗く)
      let oracleSeeds: Array<[number, number, number]> | undefined;
      if (isBody) {
        const seeds: Array<[number, number, number]> = [...(data.internalVoxelWorldCenters ?? [])];
        // eyes voxel の world center を eyes_crimson の key から復元
        const eyesMap = data.effects?.eyes_crimson;
        if (eyesMap && partGrid) {
          const [gox, goy, goz] = partGrid.grid_origin;
          for (const k of eyesMap.keys()) {
            const [ix, iy, iz] = k.split(',').map(Number);
            seeds.push([
              gox + (ix + 0.5) * vs,
              goy + (iy + 0.5) * vs,
              goz + (iz + 0.5) * vs,
            ]);
          }
        }
        oracleSeeds = seeds;
      }
      const bodyOracle = isBody
        ? buildExteriorOracle(
            data.chunks.map(ch => ({ origin: ch.gridOrigin, voxels: ch.model.voxels })),
            vs,
            2,
            oracleSeeds,
          )
        : null;
      if (bodyOracle) {
        const s = bodyOracle.stats;
        console.log(`[preview body] exterior oracle: ${s.gx}x${s.gy}x${s.gz}, voxels=${s.voxels}, exteriorCells=${s.exteriorCells}, internalSeeds=${s.internalSeeds ?? 0}, ${s.ms.toFixed(0)}ms`);
      }

      // effect 持ち part: 各 vertex に対応する voxel の sub-grid 全体座標 (effect lerp 再計算用)
      const hasEffects = !!(data.effects && Object.keys(data.effects).length > 0);
      const partVoxelIdx: number[] = hasEffects ? [] : (null as unknown as number[]);
      // body のみ: vertex category 配列 (0=skin, 1=eyes_real, 2=internal mouth, 3=eyes_overlay)
      const partVertexCategory: number[] = isBody ? [] : (null as unknown as number[]);
      // 内蔵 voxel の sub-grid 座標 Set (body のみ)
      const internalKeys = isBody ? data.internalVoxelKeys : null;
      // eyes_real: Eyes material voxel そのもの (本物の眼球)
      const eyesRealKeys = isBody ? new Set<string>([
        ...(data.effects?.eyes_crimson?.keys() ?? []),
        ...(data.effects?.eyes_royal?.keys() ?? []),
      ]) : null;
      // eyes_overlay: Eyes voxel の球状近傍 (radius=3 voxel = ~7mm) で eyes_real を除いたもの
      // → 顔表面 (Head material) に描かれた目絵柄 voxel が対象。default OFF で「絵柄消し」
      const eyesOverlayKeys = isBody && eyesRealKeys ? (() => {
        const expanded = new Set<string>();
        const r = 3;
        const r2 = r * r;
        for (const k of eyesRealKeys) {
          const [ix, iy, iz] = k.split(',').map(Number);
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dz = -r; dz <= r; dz++) {
                if (dx*dx + dy*dy + dz*dz <= r2) {
                  const nk = `${ix + dx},${iy + dy},${iz + dz}`;
                  if (!eyesRealKeys.has(nk)) expanded.add(nk);  // eyes_real は除外
                }
              }
            }
          }
        }
        return expanded;
      })() : null;
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
              if (isBody) {
                const k = `${fullIx},${fullIy},${fullIz}`;
                let cat = 0;
                // 優先順: eyes_real (本物の眼球) > internal (口腔) > eyes_overlay (顔絵柄)
                if (eyesRealKeys?.has(k)) cat = 1;
                else if (internalKeys?.has(k)) cat = 2;
                else if (eyesOverlayKeys?.has(k)) cat = 3;
                partVertexCategory.push(cat);
              }
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
      if (isBody) {
        partVertexCategoryRef.current.set(p.key, new Uint8Array(partVertexCategory));
        const eyesRealCount = partVertexCategory.filter(c => c === 1).length;
        const internalCount = partVertexCategory.filter(c => c === 2).length;
        const eyesOverlayCount = partVertexCategory.filter(c => c === 3).length;
        const skinCount = partVertexCategory.length - eyesRealCount - internalCount - eyesOverlayCount;
        console.log(`[preview body] vertex categories: skin=${skinCount}, eyes_real=${eyesRealCount}, internal=${internalCount}, eyes_overlay=${eyesOverlayCount}`);
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
      // body のみ: vertex color の alpha チャンネルを material alpha 計算に使う
      // (eyes/internal カテゴリの ON/OFF を ALPHATEST discard で実現するため)
      if (isBody) {
        mesh.hasVertexAlpha = true;
      }

      const mat = new StandardMaterial(`mat_${p.key}`, scene);
      // [C3] body も backFaceCulling=false に — realistic-viewer 規約に統一
      // (元: mat.backFaceCulling = isBody → RH での winding 反転で外側 face が cull される疑い)
      mat.backFaceCulling = false;
      mat.specularColor = new Color3(0, 0, 0);
      if (isBody) {
        // [C1] realistic-viewer 流の Unlit 化 — 内側透け/断面/凹凸の主因対策
        mat.disableLighting = true;
        mat.emissiveColor = Color3.White();
        // body のみ: vertex alpha で eyes / internal mouth を ALPHATEST discard
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHATEST;
        mat.useAlphaFromDiffuseTexture = false;
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
    // visible は依存配列から外す → toggle で build 走らない (build は初回のみ)
    // visibility は別の useEffect (mesh.isVisible) で瞬時切替。
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

  // ---- MustardUI Body エフェクト (Skin/Hair Color swap + Blush/Tattoo lerp) ----
  // 順序: 1. Skin Color swap → 2. Hair Color swap → 3. Blush lerp → 4. Tattoo lerp
  useEffect(() => {
    const mesh = meshMapRef.current.get('body');
    const baseColors = partBaseColorsRef.current.get('body');
    const voxelIdx = partVoxelIdxRef.current.get('body');
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get('body')?.effects;
    if (!effects) return;

    // Skin Color (body + head 両方の variants をまとめて検索、key 一致するほうを使用)
    const skinBodyVar = skinColor === 'default' ? null : effects[`skin_body_${skinColor}`];
    const skinHeadVar = skinColor === 'default' ? null : effects[`skin_head_${skinColor}`];
    // 診断ログ (問題切り分け用、後で削除)
    if (skinColor !== 'default') {
      console.log(`[diag skin] skinColor=${skinColor} bodyVar size=${skinBodyVar?.size ?? 'null'}, headVar size=${skinHeadVar?.size ?? 'null'}`);
      // sample 1 つ取り出して確認
      if (skinHeadVar) {
        const firstKey = skinHeadVar.keys().next().value;
        console.log(`  skinHeadVar first key='${firstKey}', sample=${JSON.stringify(skinHeadVar.get(firstKey ?? ''))}`);
      }
      // body 内の vertex 1 個目の key と match を確認
      if (voxelIdx.length >= 3) {
        const sampleKey = `${voxelIdx[0]},${voxelIdx[1]},${voxelIdx[2]}`;
        console.log(`  voxelIdx[0..2] key='${sampleKey}' bodyHit=${!!skinBodyVar?.get(sampleKey)} headHit=${!!skinHeadVar?.get(sampleKey)}`);
      }
    }
    // Hair Color (body 内の Hair material region のみ)
    const hairBodyVar = hairColor === 'default' ? null : effects[`hair_body_${hairColor}`];
    // Eyes Color (body 内の Eyes material region のみ、default = Azure はベイク済み色)
    const eyesVar = eyesColor === 'default' ? null : effects[`eyes_${eyesColor}`];
    const blush = effects.blush_color;
    const tattoo = effects.tattoo_color;
    const blushOn = !!(blush && blushSlider > 0);
    const tattooOn = !!(tattoo && tattooSlider > 0);

    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);
    const categoryArr = partVertexCategoryRef.current.get('body');

    for (let i = 0; i < numVerts; i++) {
      let r = baseColors[i * 4], g = baseColors[i * 4 + 1], b = baseColors[i * 4 + 2];
      let a = baseColors[i * 4 + 3];
      const key = `${voxelIdx[i * 3]},${voxelIdx[i * 3 + 1]},${voxelIdx[i * 3 + 2]}`;
      // category 制御: 該当カテゴリが OFF なら alpha=0 (ALPHATEST discard)
      if (categoryArr) {
        const cat = categoryArr[i];
        if (cat === 1 && !showEyesReal) a = 0;          // eyes_real (本物の眼球)
        else if (cat === 2 && !showInternalMouth) a = 0; // internal mouth (口腔内)
        else if (cat === 3 && !showEyesOverlay) a = 0;   // eyes_overlay (顔表面の目絵柄)
      }

      // 1. Skin Color swap (body region 優先、なければ head region)
      if (skinBodyVar || skinHeadVar) {
        const s = skinBodyVar?.get(key) ?? skinHeadVar?.get(key);
        if (s && s[3] > 0) { r = s[0]/255; g = s[1]/255; b = s[2]/255; }
      }
      // 2. Hair Color swap (body 内の Hair material のみ)
      if (hairBodyVar) {
        const s = hairBodyVar.get(key);
        if (s && s[3] > 0) { r = s[0]/255; g = s[1]/255; b = s[2]/255; }
      }
      // 2b. Eyes Color swap (body 内の Eyes material のみ)
      if (eyesVar) {
        const s = eyesVar.get(key);
        if (s && s[3] > 0) { r = s[0]/255; g = s[1]/255; b = s[2]/255; }
      }
      // 3. Blush 差分加算 (Skin swap 後の色に「Blush - 素 base」の差分を加算)
      // 絶対値 lerp だと Blush sample 全体が頬以外でも default 肌色 → Skin swap が打ち消されてしまう
      // 差分加算なら Skin Color に依らず Blush の「追加色」のみ乗る
      if (blushOn) {
        const s = blush!.get(key);
        if (s) {
          const baseR0 = baseColors[i * 4], baseG0 = baseColors[i * 4 + 1], baseB0 = baseColors[i * 4 + 2];
          const aMask = (s[3] / 255) * blushSlider;
          r += ((s[0] / 255) - baseR0) * aMask;
          g += ((s[1] / 255) - baseG0) * aMask;
          b += ((s[2] / 255) - baseB0) * aMask;
        }
      }
      // 4. Tattoo 差分加算 (同上)
      if (tattooOn) {
        const s = tattoo!.get(key);
        if (s) {
          const baseR0 = baseColors[i * 4], baseG0 = baseColors[i * 4 + 1], baseB0 = baseColors[i * 4 + 2];
          const aMask = (s[3] / 255) * tattooSlider;
          r += ((s[0] / 255) - baseR0) * aMask;
          g += ((s[1] / 255) - baseG0) * aMask;
          b += ((s[2] / 255) - baseB0) * aMask;
        }
      }
      newColors[i * 4] = r; newColors[i * 4 + 1] = g; newColors[i * 4 + 2] = b; newColors[i * 4 + 3] = a;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [skinColor, hairColor, eyesColor, blushSlider, tattooSlider, showEyesReal, showEyesOverlay, showInternalMouth, partInfo]);

  // ---- Armor Variation (全 armor / weapon mesh 一斉 swap) ----
  useEffect(() => {
    const variantSlot = armorColor === 'default' ? null : `armor_${armorColor}`;
    for (const partKey of ARMOR_PART_KEYS) {
      const mesh = meshMapRef.current.get(partKey);
      const baseColors = partBaseColorsRef.current.get(partKey);
      const voxelIdx = partVoxelIdxRef.current.get(partKey);
      if (!mesh || !baseColors || !voxelIdx) continue;
      const variant = variantSlot ? partsDataRef.current.get(partKey)?.effects?.[variantSlot] : null;
      const numVerts = baseColors.length / 4;
      const newColors = new Float32Array(baseColors.length);
      if (!variant) {
        newColors.set(baseColors);
      } else {
        for (let i = 0; i < numVerts; i++) {
          const r0 = baseColors[i*4], g0 = baseColors[i*4+1], b0 = baseColors[i*4+2];
          const a0 = baseColors[i*4+3];
          const key = `${voxelIdx[i*3]},${voxelIdx[i*3+1]},${voxelIdx[i*3+2]}`;
          const s = variant.get(key);
          if (s && s[3] > 0) {
            newColors[i*4] = s[0]/255; newColors[i*4+1] = s[1]/255; newColors[i*4+2] = s[2]/255; newColors[i*4+3] = a0;
          } else {
            newColors[i*4] = r0; newColors[i*4+1] = g0; newColors[i*4+2] = b0; newColors[i*4+3] = a0;
          }
        }
      }
      mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
    }
  }, [armorColor, partInfo]);

  // ---- Hair (別 mesh) Hair Color swap ----
  useEffect(() => {
    const mesh = meshMapRef.current.get('hair');
    const baseColors = partBaseColorsRef.current.get('hair');
    const voxelIdx = partVoxelIdxRef.current.get('hair');
    if (!mesh || !baseColors || !voxelIdx) return;
    const effects = partsDataRef.current.get('hair')?.effects;

    const variant = hairColor === 'default' ? null : effects?.[`hair_${hairColor}`];
    const numVerts = baseColors.length / 4;
    const newColors = new Float32Array(baseColors.length);

    if (!variant) {
      newColors.set(baseColors);
    } else {
      for (let i = 0; i < numVerts; i++) {
        const r0 = baseColors[i*4], g0 = baseColors[i*4+1], b0 = baseColors[i*4+2];
        const a0 = baseColors[i*4+3];
        const key = `${voxelIdx[i*3]},${voxelIdx[i*3+1]},${voxelIdx[i*3+2]}`;
        const s = variant.get(key);
        if (s && s[3] > 0) {
          newColors[i*4] = s[0]/255; newColors[i*4+1] = s[1]/255; newColors[i*4+2] = s[2]/255; newColors[i*4+3] = a0;
        } else {
          newColors[i*4] = r0; newColors[i*4+1] = g0; newColors[i*4+2] = b0; newColors[i*4+3] = a0;
        }
      }
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, newColors, true);
  }, [hairColor, partInfo]);

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
            DarkElfBlader (ARP) Preview
          </span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 12 }}>
            game-assets/vox-model/box5/darkelfblader_arp/
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
              PARTS.map(p => [p.key, !p.key.startsWith('weapon_')])
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
          ※ Eyes Color / Armor Variation の radio は次フェーズで追加予定
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Body 部位の表示:
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showEyesReal} onChange={e => setShowEyesReal(e.target.checked)} />
            Eyes (内部の眼球パーツ)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showEyesOverlay} onChange={e => setShowEyesOverlay(e.target.checked)} />
            Eyes Overlay (顔表面の目絵柄)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInternalMouth} onChange={e => setShowInternalMouth(e.target.checked)} />
            Internal Mouth (口腔内)
          </label>
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Skin Color (Body + Head):
          </div>
          {SKIN_COLOR_OPTIONS.map(({ id, label }) => (
            <label key={id} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              padding: '2px 4px', cursor: 'pointer',
            }}>
              <input type="radio" name="skin_color"
                checked={skinColor === id}
                onChange={() => setSkinColor(id)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Hair Color (Body + Hair mesh):
          </div>
          {HAIR_COLOR_OPTIONS.map(({ id, label }) => (
            <label key={id} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              padding: '2px 4px', cursor: 'pointer',
            }}>
              <input type="radio" name="hair_color"
                checked={hairColor === id}
                onChange={() => setHairColor(id)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Eyes Color (Body 内 Eyes material):
          </div>
          {EYES_COLOR_OPTIONS.map(({ id, label }) => (
            <label key={id} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              padding: '2px 4px', cursor: 'pointer',
            }}>
              <input type="radio" name="eyes_color"
                checked={eyesColor === id}
                onChange={() => setEyesColor(id)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334' }}>
          <div style={{ fontSize: 11, color: '#ddd', marginBottom: 4 }}>
            Armor Variation (全 armor / weapon mesh):
          </div>
          {ARMOR_COLOR_OPTIONS.map(({ id, label }) => (
            <label key={id} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              padding: '2px 4px', cursor: 'pointer',
            }}>
              <input type="radio" name="armor_color"
                checked={armorColor === id}
                onChange={() => setArmorColor(id)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #334', fontSize: 10, color: '#888' }}>
          <i>(QM 用 Dress Texture Number は DarkElfBlader にはなし)</i>
          {false && [
            { num: 1, label: '1: Default' },
          ].map(({ num, label }) => (
            <label key={num}>
              <input type="radio" checked={dressTexNum === num} onChange={() => setDressTexNum(num)} />
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
          Files under <b>game-assets/vox-model/box5/darkelfblader_arp/</b>.<br/>
          Reload (Ctrl+Shift+R) after adding new parts.
        </div>
      </div>
    </div>
  );
}
