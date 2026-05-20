'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, Mesh, VertexData,
  Matrix,
} from '@babylonjs/core';
import { parseVox, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';

// Blender (Z-up) → Babylon (Y-up, 右手系): (bx, bz, -by)
const bToB = (bx: number, by: number, bz: number): [number, number, number] => [bx, bz, -by];

// Bone pipeline visual debugger.
// 2 panels: source bones and Phase 2 output (QM @ source proportions).
// Mesh display is intentionally not built — see project notes for context.
// QM canonical and QM final panels are hidden — they are common to all
// models, so the focus is comparing source vs QM @ source proportions.
//
// Select model via URL: /build?model=rachel (or anna / helena / helena_douglas)

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

// Bone category classification (mutually exclusive, first-match wins in CATEGORY_ORDER).
// Each category is its own sub-mesh so toggles hide/show them independently.
type BoneCategory =
  | 'body' | 'face' | 'hands' | 'feet'
  | 'hair' | 'clothing' | 'control'
  | 'anatomy_male' | 'anatomy_female' | 'anatomy_back' | 'anatomy_chest';
const CATEGORY_ORDER: BoneCategory[] = [
  'body', 'face', 'hands', 'feet',
  'hair', 'clothing', 'control',
  'anatomy_male', 'anatomy_female', 'anatomy_back', 'anatomy_chest',
];
const CATEGORY_LABEL: Record<BoneCategory, string> = {
  body:            'Body',
  face:            'Face',
  hands:           'Hands+Fingers',
  feet:            'Feet+Toes',
  hair:            'Hair',
  clothing:        'Clothing/Accessory',
  control:         'Control (knee/elbow/butt helpers)',
  anatomy_male:    'Anatomy: male (shaft/scrotum/testicle)',
  anatomy_female:  'Anatomy: female (vagina/clitoris/labia)',
  anatomy_back:    'Anatomy: back (anus/rectum/colon)',
  anatomy_chest:   'Anatomy: chest (nipple/areola/genital)',
};
const CATEGORY_COLOR: Record<BoneCategory, string | null> = {
  body:            null,
  face:            '#aaff66',
  hands:           '#bbbbbb',
  feet:            '#888888',
  hair:            '#ffdd44',
  clothing:        '#ff66bb',
  control:         '#ff6666',
  anatomy_male:    '#88ccff',
  anatomy_female:  '#ff88cc',
  anatomy_back:    '#cc88ff',
  anatomy_chest:   '#ffaa88',
};

// Classification — priority order matters because keywords overlap
// (e.g. 'c_toes_thumb' should be feet, not hands).
function classifyBone(name: string): BoneCategory {
  const n = name.toLowerCase();

  // 1. Control / joint-direction helper bones (knee/elbow/butt with no real joint)
  //    Includes ARP IK pole targets, twist-rest bones (nostr), QM's knee_l/r,
  //    Anna's c_*_out direction control bones, etc.
  if (
    /^(knee|lowerarm_elbow|butt|elbow)[._]?[lr]?$/.test(n) ||  // QM/Rigify butt.L/R, knee_l, etc.
    /(^|[._\- ])(pole|nostr|ik_target|ik_pole|track_pole|stretch_pole)([._\- ]|\d|$)/.test(n) ||
    /(^|[._\- ])(marker|controller|hint|aim)([._\- ]|\d|$)/.test(n) ||
    /^(c_)?p_root/.test(n) ||                       // ARP root proxy
    /^c_\w+_out([._\d]|$)/.test(n)                  // ARP direction-out bones (c_elbow_out, c_knee_out_01.l, etc.)
  ) return 'control';

  // 2. Anatomy detail bones — substring match for camelCase prefix support
  // (DAZ names like 'lNipple', 'rTesticle', 'lLabiumMajora1' have single-letter
  //  L/R prefix without separator, so boundary-based regex fails).
  // Each keyword is unique to its anatomy domain — no body collisions.
  // Male-only (optional for female models)
  if (/shaft|scrotum|testicle/.test(n)) return 'anatomy_male';
  // Female-only
  if (/vagina|clitoris|labium|labia/.test(n)) return 'anatomy_female';
  // Back anatomy (anus/rectum/colon — both sexes have these)
  if (/anus|rectum|colon/.test(n)) return 'anatomy_back';
  // Chest detail (nipple/areola/genital)
  if (/genital|nipple|areola/.test(n)) return 'anatomy_chest';

  // 3. Hair
  //    - Standard names: hair / ponytail / sidehair / bang / braid
  //    - DAZ Hair curve plugin: 'C010_LINE000_Ctrl000_1_1', 'C010_Root' etc.
  if (
    /(^|[._\- ])(hair|ponytail|sidehair|bang|braid|frontbang|sidebang)([._\- ]|\d|$)/.test(n) ||
    /^c\d{3}_/.test(n)
  ) return 'hair';

  // 4. Clothing / accessories
  //    Standard names (with space separator support for Anna's 'coat front left' etc.)
  //    + Rachel/DAZ short-name jewelry conventions:
  //    - ChL/ChR/Chl2/ChR2 = chain (clavicle-parented)
  //    - R/R1-R8/RL/RR = earring (ear-parented)
  //    - AL/AR + digits = armlet (arm-parented)
  //    - BLL/BRL/BLf/BRf = boots/leg accessory
  //    - B/B1/BBetl = bra/belt (spine-parented)
  //    - Clock = wristwatch
  //    - flap = Helena dress flap (FrontFlap01-15, BackFlap01-...)
  if (
    /(^|[._\- ])(dress|skirt|belt|cape|coat|scarf|cloth|fabric|strap|necklace|armband|circlet|bracelet|earring|ribbon|veil|hood|hat|flap)([._\- ]|\d|$)/.test(n) ||
    /frontflap|backflap|sideflap/.test(n) ||      // Helena FrontFlap*/BackFlap* (camelCase)
    /(^|[._\- ])belt_tail([._\- ]|\d|$)/.test(n) ||
    /^ch[lr]\d*$/.test(n) ||      // ChL, ChR, Chl2 (chain)
    /^r\d*$/.test(n) ||           // R, R1-R8 (earring)
    /^r[lr]$/.test(n) ||          // RL, RR
    /^ring[lr]\d*$/.test(n) ||    // RingL, RingR (earring camelCase)
    /^a[lr]\d*$/.test(n) ||       // AL, AR, AL1-AL2, AR1-AR6 (armlet)
    /^b[lr][lf]\d*$/.test(n) ||   // BLL, BLf, BRL, BRf (boot/leg)
    /^bbetl$/.test(n) ||          // BBetl (belt)
    /^b\d?$/.test(n) ||           // B, B1 (bra/belt)
    /^clock$/.test(n) ||          // Clock (watch)
    /^bone(\.\d+)?(\.[lr])?(\.\d+)?$/.test(n)  // generic 'Bone.NNN.L.NNN' chains (Helena Douglas dress)
  ) return 'clothing';

  // 5. Face — all face-region bones including expression / mouth parts.
  //    Substring match for long+safe keywords (handle DAZ camelCase).
  //    Includes head-region words (temple/nape/throat) and ear-side composites (upear/lowear).
  //    'ear' alone needs boundary because 'forearm' contains 'ear' substring.
  if (
    /eyelid|eyebrow|jaw|teeth|tongue|tong_|mouth|cheek|chin|nostril|squint|nasolabial|forehead|nose|lip|brow|eye|pupil|lash|temple|nape|throat|upear|lowear/.test(n) ||
    /(^|[._\- ])ear([._\- ]|\d|$)/.test(n) ||
    /(^|[._\- ])lid([._\- ]|\d|$)/.test(n)                  // Rigify abbreviated eyelid (DEF-lid.B.L etc.)
  ) return 'face';

  // 6. Feet (toes, foot, tarsal). MUST come before hands to catch 'c_toes_thumb*'.
  //    DAZ 'lMetatarsals' / 'rMetatarsals' (plural + camelCase L/R) matched via substring.
  if (
    /(^|[._\- ])(foot|toe|toes|tarsal|metatarsal|big_toe|small_toe|c_toes)([._\- ]|\d|$)/.test(n) ||
    /metatarsal/.test(n)  // catches lMetatarsals / rMetatarsals
  ) return 'feet';

  // 7. Hands (hand + fingers)
  if (
    /(^|[._\- ])(hand|thumb|index|middle|ring|pinky|finger|carpal|palm|f_index|f_middle|f_ring|f_pinky|c_index|c_middle|c_ring|c_pinky|c_thumb|ringl|ringr)([._\- ]|\d|$)/.test(n)
  ) return 'hands';

  // 8. Default: body
  return 'body';
}

interface SourceConfig {
  label: string;
  sourcePath: string;           // raw model skeleton (rest pose)
  qmAtSourcePath: string;       // Phase 2: QM rest pose, source-sized bones
  phase2VoxelDir?: string;      // dir with grid.json + body.vox voxelized via Phase 2 armature
  phase2VoxelPrefix?: string;   // .vox filename prefix (e.g. "rachel_body")
}

const SOURCE_MODELS: Record<string, SourceConfig> = {
  rachel: {
    label: 'Rachel',
    sourcePath: '/box5/rachel_qm_compare/rachel/skeleton.json',
    qmAtSourcePath: '/box5/build/rachel/qm_at_source.skeleton.json',
    phase2VoxelDir: '/box5/rachel_phase2',
    phase2VoxelPrefix: 'rachel_body',
  },
  anna: {
    label: 'Anna',
    sourcePath: '/box5/anna_qm_compare/anna/skeleton.json',
    qmAtSourcePath: '/box5/build/anna/qm_at_source.skeleton.json',
  },
  helena: {
    label: 'Helena (Final)',
    sourcePath: '/box5/helena_qm_compare/helena/skeleton.json',
    qmAtSourcePath: '/box5/build/helena/qm_at_source.skeleton.json',
  },
  helena_douglas: {
    label: 'Helena Douglas',
    sourcePath: '/box5/helena_douglas_compare/helena/skeleton.json',
    qmAtSourcePath: '/box5/build/helena_douglas/qm_at_source.skeleton.json',
  },
};
const DEFAULT_MODEL = 'rachel';
const QM_PATH = '/box5/qm_mustardui/skeleton.json';

// 4 panels: QM canonical, source, Phase 2 bones, Phase 2 voxelized body.
type PanelKey = 'qm_canonical' | 'source_bones' | 'qm_at_source_bones' | 'qm_at_source_voxel';

interface PanelDef {
  key: PanelKey;
  label: string;
  skelPath: string;
  accent: string;
  voxelDir?: string;          // when set, panel also loads body.vox + grid.json
  voxelPrefix?: string;
  note?: string;
}

interface Grid {
  voxel_size: number;
  grid_origin: [number, number, number];
  gx: number; gy: number; gz: number;
}

function buildPanels(cfg: SourceConfig): PanelDef[] {
  return [
    { key: 'qm_canonical',
      label: 'QM canonical — bones',
      skelPath: QM_PATH,                accent: '#ffbb44',
      note: 'Target armature, never modified.' },
    { key: 'source_bones',
      label: `${cfg.label} (source) — bones`,
      skelPath: cfg.sourcePath,         accent: '#ffee88',
      note: 'Raw import skeleton at source rest pose.' },
    { key: 'qm_at_source_bones',
      label: 'QM @ source proportions — bones',
      skelPath: cfg.qmAtSourcePath,     accent: '#44ccff',
      note: 'Phase 2 output: QM rest pose, per-bone resize to source.' },
    { key: 'qm_at_source_voxel',
      label: 'QM @ source proportions — voxelized body',
      skelPath: cfg.qmAtSourcePath,     accent: '#44ffaa',
      voxelDir: cfg.phase2VoxelDir,
      voxelPrefix: cfg.phase2VoxelPrefix,
      note: 'Source body voxelized using Phase 2 armature (QM bone names, source-resized).' },
  ];
}

interface PanelState {
  engine?: Engine;
  scene?: Scene;
  cam?: ArcRotateCamera;
  boneMeshes?: Map<BoneCategory, Mesh>;
  categoryCounts?: Record<BoneCategory, number>;
  bones?: number;
  missing?: boolean;
  error?: string;
  // Per-bone region meshes keyed by QM bone name
  boneRegionMeshes?: Map<string, Mesh>;
  bodyVoxelMesh?: Mesh | null;
}

// List of QM bones whose mesh region can be toggled on/off in /build.
// Each spec describes:
//   - qmBone: primary QM bone name (also used as region JSON filename)
//   - subBones: sub-bones for LBS blend (e.g. nipple_l for breast_l)
//   - sourceBoneOf: per-model source bone name (mapped via vg_rename)
interface ProbeBoneSpec {
  qmBone: string;
  subBones: string[];
  sourceBoneOf: Record<string, string>;
}
const PROBE_BONES: ProbeBoneSpec[] = [
  { qmBone: 'breast_l',         subBones: ['nipple_l'], sourceBoneOf: { helena_douglas: 'DEF-breast.L' } },
  { qmBone: 'breast_r',         subBones: ['nipple_r'], sourceBoneOf: { helena_douglas: 'DEF-breast.R' } },
  { qmBone: 'shoulder.l',       subBones: [], sourceBoneOf: { helena_douglas: 'DEF-shoulder.L' } },
  { qmBone: 'shoulder.r',       subBones: [], sourceBoneOf: { helena_douglas: 'DEF-shoulder.R' } },
  { qmBone: 'c_arm_stretch.l',  subBones: [], sourceBoneOf: { helena_douglas: 'DEF-upper_arm.L' } },
  { qmBone: 'c_arm_stretch.r',  subBones: [], sourceBoneOf: { helena_douglas: 'DEF-upper_arm.R' } },
  { qmBone: 'c_forearm_stretch.l', subBones: [], sourceBoneOf: { helena_douglas: 'DEF-forearm.L' } },
  { qmBone: 'c_forearm_stretch.r', subBones: [], sourceBoneOf: { helena_douglas: 'DEF-forearm.R' } },
  { qmBone: 'hand.l',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-hand.L' } },
  { qmBone: 'hand.r',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-hand.R' } },
  { qmBone: 'c_thigh_stretch.l',subBones: [], sourceBoneOf: { helena_douglas: 'DEF-thigh.L' } },
  { qmBone: 'c_thigh_stretch.r',subBones: [], sourceBoneOf: { helena_douglas: 'DEF-thigh.R' } },
  { qmBone: 'c_leg_stretch.l',  subBones: [], sourceBoneOf: { helena_douglas: 'DEF-shin.L' } },
  { qmBone: 'c_leg_stretch.r',  subBones: [], sourceBoneOf: { helena_douglas: 'DEF-shin.R' } },
  { qmBone: 'foot.l',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-foot.L' } },
  { qmBone: 'foot.r',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-foot.R' } },
  { qmBone: 'c_root_bend.x',    subBones: [], sourceBoneOf: { helena_douglas: 'DEF-spine' } },
  { qmBone: 'c_spine_01_bend.x',subBones: [], sourceBoneOf: { helena_douglas: 'DEF-spine.001' } },
  { qmBone: 'c_spine_03_bend.x',subBones: [], sourceBoneOf: { helena_douglas: 'DEF-spine.003' } },
  { qmBone: 'neck.x',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-spine.004' } },
  { qmBone: 'head.x',           subBones: [], sourceBoneOf: { helena_douglas: 'DEF-spine.006' } },
];
const QM_REGION_DIR = '/box5/build/qm_bone_regions';
function sourceRegionDir(modelKey: string): string {
  return `/box5/build/${modelKey}/source_bone_regions`;
}
interface BoneRegion {
  bone: string;
  vertex_count: number;
  triangle_count: number;
  positions_zup: number[];   // Blender Z-up coords
  indices: number[];
  weights: number[];          // weight to primary bone per vertex
  weights_extra?: Record<string, number[]>;  // extra bone weights per vertex
}

export default function BuildPage() {
  const canvasRefs = useRef<Record<PanelKey, HTMLCanvasElement | null>>({
    qm_canonical: null, source_bones: null, qm_at_source_bones: null, qm_at_source_voxel: null,
  });
  const panelStateRef = useRef<Record<PanelKey, PanelState>>({
    qm_canonical: {}, source_bones: {}, qm_at_source_bones: {}, qm_at_source_voxel: {},
  });
  const syncingRef = useRef(false);

  // Defer model resolution to post-mount to avoid SSR/client hydration mismatch.
  const [modelKey, setModelKey] = useState<string>(DEFAULT_MODEL);
  useEffect(() => {
    const m = new URL(window.location.href).searchParams.get('model');
    if (m && SOURCE_MODELS[m] && m !== modelKey) setModelKey(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cfg = SOURCE_MODELS[modelKey] ?? SOURCE_MODELS[DEFAULT_MODEL];
  const panels = useMemo(() => buildPanels(cfg), [cfg]);

  const [status, setStatusMap] = useState<Record<PanelKey, string>>({
    qm_canonical: '...', source_bones: '...', qm_at_source_bones: '...', qm_at_source_voxel: '...',
  });
  const setStatus = useCallback((k: PanelKey, msg: string) => {
    setStatusMap(s => ({ ...s, [k]: msg }));
  }, []);

  // Per-category visibility toggle (default: body + hands + feet ON, rest OFF for clarity)
  const [catVisible, setCatVisible] = useState<Record<BoneCategory, boolean>>({
    body: true, face: false, hands: true, feet: true,
    hair: false, clothing: false, control: false,
    anatomy_male: false, anatomy_female: false,
    anatomy_back: false, anatomy_chest: false,
  });

  // Per-QM-bone toggle state for probe region overlay
  const [probeVisible, setProbeVisible] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of PROBE_BONES) init[p.qmBone] = false;
    return init;
  });

  // ---- Camera sync ----
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

  // ---- Bone mesh builder — one Mesh per category, octahedral shape.
  // Each bone is a small 8-triangle octahedron from Head to Tail.
  // Categories (body/face/fingers/toes/hair/clothing) are separate meshes
  // so they can be toggled independently.
  const buildBoneOctahedra = useCallback((
    scene: Scene, name: string, skel: Skeleton, accent: string,
  ): { meshes: Map<BoneCategory, Mesh>; counts: Record<BoneCategory, number> } => {
    const toBabylon = (p: [number, number, number]) => new Vector3(p[0], p[2], -p[1]);
    const accentRgb = Color3.FromHexString(accent);
    const buckets: Record<BoneCategory, {
      positions: number[]; indices: number[]; normals: number[]; colors: number[];
    }> = {
      body:            { positions: [], indices: [], normals: [], colors: [] },
      face:            { positions: [], indices: [], normals: [], colors: [] },
      hands:           { positions: [], indices: [], normals: [], colors: [] },
      feet:            { positions: [], indices: [], normals: [], colors: [] },
      hair:            { positions: [], indices: [], normals: [], colors: [] },
      clothing:        { positions: [], indices: [], normals: [], colors: [] },
      control:         { positions: [], indices: [], normals: [], colors: [] },
      anatomy_male:    { positions: [], indices: [], normals: [], colors: [] },
      anatomy_female:  { positions: [], indices: [], normals: [], colors: [] },
      anatomy_back:    { positions: [], indices: [], normals: [], colors: [] },
      anatomy_chest:   { positions: [], indices: [], normals: [], colors: [] },
    };
    const counts: Record<BoneCategory, number> = {
      body: 0, face: 0, hands: 0, feet: 0,
      hair: 0, clothing: 0, control: 0,
      anatomy_male: 0, anatomy_female: 0,
      anatomy_back: 0, anatomy_chest: 0,
    };

    const Y = Vector3.Up();
    for (const b of skel.bones) {
      const head = toBabylon(b.head_rest);
      const tail = toBabylon(b.tail_rest);
      const dir = tail.subtract(head);
      const len = dir.length();
      if (len < 1e-6) continue;
      dir.normalize();

      // Stable perpendicular axis
      const perp1 = Math.abs(dir.dot(Y)) < 0.95
        ? Vector3.Cross(dir, Y).normalize()
        : Vector3.Cross(dir, new Vector3(1, 0, 0)).normalize();
      const perp2 = Vector3.Cross(dir, perp1).normalize();

      const ringDistance = len * 0.1;
      const ringRadius = Math.min(Math.max(len / 8, 0.003), 0.025);
      const ringCenter = head.add(dir.scale(ringDistance));
      const ring: Vector3[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ring.push(ringCenter
          .add(perp1.scale(Math.cos(a) * ringRadius))
          .add(perp2.scale(Math.sin(a) * ringRadius)));
      }

      const cat = classifyBone(b.name);
      counts[cat]++;
      const buf = buckets[cat];

      // Category color overrides panel accent (except 'body')
      const catColor = CATEGORY_COLOR[cat];
      const baseRgb = catColor ? Color3.FromHexString(catColor) : accentRgb;
      const dim = b.use_deform ? 1.0 : 0.7;
      const gray = b.use_deform ? 0.0 : 0.25;
      const cr = baseRgb.r * dim + gray;
      const cg = baseRgb.g * dim + gray;
      const cb = baseRgb.b * dim + gray;

      const tris: Vector3[][] = [];
      for (let i = 0; i < 4; i++) {
        const a = ring[i], bv = ring[(i + 1) % 4];
        tris.push([head, a, bv]);
        tris.push([tail, bv, a]);
      }
      for (const t of tris) {
        const e1 = t[1].subtract(t[0]);
        const e2 = t[2].subtract(t[0]);
        const nrm = Vector3.Cross(e1, e2).normalize();
        for (const v of t) {
          buf.positions.push(v.x, v.y, v.z);
          buf.normals.push(nrm.x, nrm.y, nrm.z);
          buf.colors.push(cr, cg, cb, 1.0);
        }
        const i0 = buf.positions.length / 3 - 3;
        buf.indices.push(i0, i0 + 1, i0 + 2);
      }
    }

    const meshes = new Map<BoneCategory, Mesh>();
    for (const cat of CATEGORY_ORDER) {
      const buf = buckets[cat];
      if (buf.positions.length === 0) continue;
      const vd = new VertexData();
      vd.positions = buf.positions;
      vd.indices = buf.indices;
      vd.normals = buf.normals;
      vd.colors = buf.colors;
      const mesh = new Mesh(`${name}_${cat}`, scene);
      vd.applyToMesh(mesh);
      const mat = new StandardMaterial(`${name}_${cat}_mat`, scene);
      mat.disableLighting = true;
      mat.emissiveColor = Color3.White();
      mat.backFaceCulling = false;
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      meshes.set(cat, mesh);
    }
    return { meshes, counts };
  }, []);

  // ---- Init scene for one panel ----
  const initPanel = useCallback((canvas: HTMLCanvasElement, key: PanelKey) => {
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.07, 0.07, 0.11, 1);
    scene.useRightHandedSystem = true;

    const cam = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0,
      new Vector3(0, 0.95, 0), scene);
    cam.attachControl(canvas, true);
    cam.lowerRadiusLimit = 0.3;
    cam.upperRadiusLimit = 15;
    cam.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new Color3(0.15, 0.15, 0.2);
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.5;

    // Ground hint plane
    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4, subdivisions: 8 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    ground.material = gm;
    ground.position.y = -0.005;

    engine.runRenderLoop(() => scene.render());
    cam.onViewMatrixChangedObservable.add(() => syncOthers(cam, key));

    return { engine, scene, cam };
  }, [syncOthers]);


  // ---- Build a frame matrix at bone head with Y axis toward tail (Blender Z-up
  //      coords, row-vec multiplication convention) ----
  const frameMatrixZup = useCallback((
    head: [number, number, number], tail: [number, number, number],
  ): Matrix => {
    const o = new Vector3(head[0], head[1], head[2]);
    const t = new Vector3(tail[0], tail[1], tail[2]);
    const y = t.subtract(o);
    const len = y.length();
    if (len < 1e-9) return Matrix.Translation(o.x, o.y, o.z);
    y.normalize();
    // Pick a stable perpendicular axis: use Blender Z-up (world up) unless the
    // bone is nearly vertical, in which case fall back to world X.
    const seed = Math.abs(y.z) < 0.95 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const x = Vector3.Cross(seed, y).normalize();
    const z = Vector3.Cross(x, y).normalize();
    // Row-major storage of column basis matrix (Babylon convention).
    return Matrix.FromValues(
      x.x, x.y, x.z, 0,
      y.x, y.y, y.z, 0,
      z.x, z.y, z.z, 0,
      o.x, o.y, o.z, 1,
    );
  }, []);

  // ---- Phase 3 deformation: skin the SOURCE mesh region (Helena) onto the
  //      Phase 2 bones (QM-named, source-resized). For each Helena vertex:
  //        1. Find nearest QM vertex in bone-local space → inherit QM's
  //           (w_breast, w_nipple) so Helena's mesh is logically partitioned
  //           using QM's bone topology (Helena lacks a nipple bone).
  //        2. P_breast = Helena vertex transformed via (DEF-breast.L → Phase2 breast_l)
  //        3. P_nipple = Helena vertex transformed via (DEF-breast.L → Phase2 nipple_l)
  //        4. Final = wB · P_breast + wN · P_nipple
  //      The result is HELENA's mesh (Helena topology, Helena character) re-bound
  //      to the deformed QM bone setup at source proportions.
  const skinSourceToPhase2 = useCallback((
    srcPositions: number[],
    srcBone: SkeletonBone,
    qmBreast: SkeletonBone,
    targetBreast: SkeletonBone, targetNipple: SkeletonBone,
    qmPositions: number[],
    qmWeightsBreast: number[], qmWeightsNipple: number[],
  ): number[] => {
    const buildT = (src: SkeletonBone, dst: SkeletonBone): Matrix => {
      const sH = src.head_rest, sT = src.tail_rest;
      const tH = dst.head_rest, tT = dst.tail_rest;
      const Ls = Math.hypot(sT[0]-sH[0], sT[1]-sH[1], sT[2]-sH[2]);
      const Lt = Math.hypot(tT[0]-tH[0], tT[1]-tH[1], tT[2]-tH[2]);
      const ratio = Ls > 1e-9 ? Lt / Ls : 1;
      const Fs = frameMatrixZup(sH, sT);
      const Ft = frameMatrixZup(tH, tT);
      return Matrix.Invert(Fs).multiply(Matrix.Scaling(ratio, ratio, ratio)).multiply(Ft);
    };
    // Helena has only DEF-breast.L; map it to BOTH Phase 2 bones so the
    // tip portion follows nipple_l while the body follows breast_l.
    const T_breast = buildT(srcBone, targetBreast);
    const T_nipple = buildT(srcBone, targetNipple);
    // Bone-local nearest-neighbor lookup: project Helena & QM verts into
    // their respective breast bone's local space, then match by Euclidean
    // distance in this shared parametric space.
    const F_src_inv = Matrix.Invert(frameMatrixZup(srcBone.head_rest, srcBone.tail_rest));
    const F_qm_inv  = Matrix.Invert(frameMatrixZup(qmBreast.head_rest, qmBreast.tail_rest));
    const nQm = qmPositions.length / 3;
    const qmLocal: { x: number; y: number; z: number }[] = [];
    const tmpQ = new Vector3();
    const tmpQLoc = new Vector3();
    for (let i = 0; i < nQm; i++) {
      tmpQ.set(qmPositions[i*3], qmPositions[i*3+1], qmPositions[i*3+2]);
      Vector3.TransformCoordinatesToRef(tmpQ, F_qm_inv, tmpQLoc);
      qmLocal.push({ x: tmpQLoc.x, y: tmpQLoc.y, z: tmpQLoc.z });
    }
    const out: number[] = [];
    const pIn = new Vector3();
    const pLocal = new Vector3();
    const pBreast = new Vector3();
    const pNipple = new Vector3();
    for (let i = 0; i < srcPositions.length; i += 3) {
      pIn.set(srcPositions[i], srcPositions[i+1], srcPositions[i+2]);
      Vector3.TransformCoordinatesToRef(pIn, F_src_inv, pLocal);
      // nearest QM in shared bone-local space
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let q = 0; q < nQm; q++) {
        const dx = qmLocal[q].x - pLocal.x;
        const dy = qmLocal[q].y - pLocal.y;
        const dz = qmLocal[q].z - pLocal.z;
        const d2 = dx*dx + dy*dy + dz*dz;
        if (d2 < bestD2) { bestD2 = d2; bestIdx = q; }
      }
      const wB = qmWeightsBreast[bestIdx] ?? 0;
      const wN = qmWeightsNipple[bestIdx] ?? 0;
      const total = wB + wN;
      const blendB = total > 1e-9 ? wB / total : 1;
      const blendN = total > 1e-9 ? wN / total : 0;
      Vector3.TransformCoordinatesToRef(pIn, T_breast, pBreast);
      Vector3.TransformCoordinatesToRef(pIn, T_nipple, pNipple);
      out.push(
        blendB * pBreast.x + blendN * pNipple.x,
        blendB * pBreast.y + blendN * pNipple.y,
        blendB * pBreast.z + blendN * pNipple.z,
      );
    }
    return out;
  }, [frameMatrixZup]);

  // ---- Compute a per-vertex RGB gradient from Z-up positions so the same
  //      vertex has the same color in source and transformed views, making
  //      deformation visually traceable. R = left-right, G = front-back, B = up-down.
  const computePositionGradient = useCallback((positionsZup: number[]): number[] => {
    const n = positionsZup.length / 3;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = positionsZup[i*3], y = positionsZup[i*3+1], z = positionsZup[i*3+2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const dX = (maxX - minX) || 1;
    const dY = (maxY - minY) || 1;
    const dZ = (maxZ - minZ) || 1;
    const colors: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = positionsZup[i*3], y = positionsZup[i*3+1], z = positionsZup[i*3+2];
      const r = (x - minX) / dX; // X = left-right
      const g = (y - minY) / dY; // Y = front-back (Blender Y = front)
      const b = (z - minZ) / dZ; // Z = up-down
      colors.push(r, g, b, 1);
    }
    return colors;
  }, []);

  // ---- Build body voxel mesh from .vox + grid metadata ----
  const buildVoxelBodyMesh = useCallback((
    scene: Scene, name: string,
    voxels: ReturnType<typeof parseVox>['voxels'],
    palette: ReturnType<typeof parseVox>['palette'],
    origin: [number, number, number], voxelSize: number,
  ): Mesh => {
    const occ = new Set<string>();
    for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (const v of voxels) {
      const col = palette[v.colorIndex - 1] ?? { r: 0.85, g: 0.7, b: 0.6 };
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
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    return mesh;
  }, []);

  // ---- Build mesh for a QM bone region (vertices weighted to one bone) ----
  // colorsOverride: optional RGBA colors per vertex (4 floats each). When
  // provided (e.g. position gradient), used instead of the weight-based color.
  const buildBoneRegionMesh = useCallback((
    scene: Scene, name: string, region: BoneRegion, colorsOverride?: number[],
  ): Mesh => {
    const src = region.positions_zup;
    const positions: number[] = [];
    const colors: number[] = [];
    const n = src.length / 3;
    // Blender Z-up → Babylon Y-up: (bx, bz, -by)
    for (let i = 0; i < n; i++) {
      const bx = src[i * 3];
      const by = src[i * 3 + 1];
      const bz = src[i * 3 + 2];
      positions.push(bx, bz, -by);
      if (colorsOverride) {
        colors.push(
          colorsOverride[i * 4],
          colorsOverride[i * 4 + 1],
          colorsOverride[i * 4 + 2],
          colorsOverride[i * 4 + 3],
        );
      } else {
        const w = region.weights[i] ?? 1;
        colors.push(1.0, 0.4 + w * 0.6, 0.2, 1.0);
      }
    }
    const indices = region.indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.colors = colors;
    const mesh = new Mesh(name, scene);
    vd.applyToMesh(mesh);
    const mat = new StandardMaterial(`${name}_mat`, scene);
    mat.disableLighting = !!colorsOverride;  // gradient: emissive only, no shading
    mat.emissiveColor = colorsOverride ? Color3.White() : new Color3(0.4, 0.15, 0.05);
    mat.diffuseColor = new Color3(1, 0.6, 0.2);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    return mesh;
  }, []);

  // ---- Load skeleton for one panel ----
  const loadPanel = useCallback(async (panel: PanelDef, scene: Scene) => {
    setStatus(panel.key, 'loading…');
    try {
      const bust = `?v=${Date.now()}`;
      const skelResp = await fetch(`${panel.skelPath}${bust}`);
      if (scene.isDisposed) return;
      if (!skelResp.ok) {
        panelStateRef.current[panel.key].missing = true;
        setStatus(panel.key, '(skeleton not generated yet)');
        return;
      }
      const skel: Skeleton = await skelResp.json();
      if (scene.isDisposed) return;
      const { meshes, counts } = buildBoneOctahedra(scene, `bones_${panel.key}`, skel, panel.accent);
      panelStateRef.current[panel.key].boneMeshes = meshes;
      panelStateRef.current[panel.key].categoryCounts = counts;
      panelStateRef.current[panel.key].bones = skel.bones.length;

      const parts = CATEGORY_ORDER
        .filter(c => counts[c] > 0)
        .map(c => `${CATEGORY_LABEL[c]} ${counts[c]}`)
        .join(' / ');
      setStatus(panel.key, `${skel.bones.length} bones (${parts})`);

      // Load body voxel for the qm_at_source_voxel panel (if model has phase2 voxel data)
      if (panel.voxelDir && panel.voxelPrefix) {
        try {
          const [gridResp, voxResp] = await Promise.all([
            fetch(`${panel.voxelDir}/grid.json${bust}`),
            fetch(`${panel.voxelDir}/${panel.voxelPrefix}.vox${bust}`),
          ]);
          if (scene.isDisposed) return;
          if (gridResp.ok && voxResp.ok) {
            const grid: Grid = await gridResp.json();
            const vox = parseVox(await voxResp.arrayBuffer());
            const bodyMesh = buildVoxelBodyMesh(
              scene, `body_${panel.key}`, vox.voxels, vox.palette,
              grid.grid_origin, grid.voxel_size,
            );
            panelStateRef.current[panel.key].bodyVoxelMesh = bodyMesh;
            setStatus(panel.key, `${skel.bones.length} bones + ${vox.voxels.length} voxels`);
          } else {
            setStatus(panel.key, `${skel.bones.length} bones (voxel data missing)`);
          }
        } catch (e) {
          console.error('voxel load failed', e);
        }
      }

      // Probe bone region meshes — one per QM bone in PROBE_BONES, hidden until toggled.
      //   qm_canonical        → QM Body region
      //   source_bones        → source body region (file named after QM bone via vg_rename)
      //   qm_at_source_bones  → source mesh deformed by LBS onto Phase 2 bones
      const boneRegionMeshes = new Map<string, Mesh>();
      panelStateRef.current[panel.key].boneRegionMeshes = boneRegionMeshes;
      const cfg = SOURCE_MODELS[modelKey];
      // Cache loaded skeletons for Phase 3 LBS work (loaded once per panel)
      let srcSkelCache: Skeleton | null = null;
      let qmCanonCache: Skeleton | null = null;
      for (const probe of PROBE_BONES) {
        try {
          if (panel.key === 'qm_canonical') {
            const r = await fetch(`${QM_REGION_DIR}/${probe.qmBone}.json${bust}`);
            if (scene.isDisposed) return;
            if (!r.ok) continue;
            const region: BoneRegion = await r.json();
            const colors = computePositionGradient(region.positions_zup);
            const mesh = buildBoneRegionMesh(scene, `region_${panel.key}_${probe.qmBone}`, region, colors);
            mesh.isVisible = false;
            boneRegionMeshes.set(probe.qmBone, mesh);
          } else if (panel.key === 'source_bones') {
            const r = await fetch(`${sourceRegionDir(modelKey)}/${probe.qmBone}.json${bust}`);
            if (scene.isDisposed) return;
            if (!r.ok) continue;
            const region: BoneRegion = await r.json();
            const colors = computePositionGradient(region.positions_zup);
            const mesh = buildBoneRegionMesh(scene, `region_${panel.key}_${probe.qmBone}`, region, colors);
            mesh.isVisible = false;
            boneRegionMeshes.set(probe.qmBone, mesh);
          } else if (panel.key === 'qm_at_source_bones') {
            // Phase 3: bind source mesh region to Phase 2 bones (LBS blend if sub-bones exist)
            const srcBoneName = probe.sourceBoneOf[modelKey];
            if (!srcBoneName) continue;
            const [regionResp, qmRegionResp] = await Promise.all([
              fetch(`${sourceRegionDir(modelKey)}/${probe.qmBone}.json${bust}`),
              fetch(`${QM_REGION_DIR}/${probe.qmBone}.json${bust}`),
            ]);
            if (scene.isDisposed) return;
            if (!regionResp.ok || !qmRegionResp.ok) continue;
            const region: BoneRegion = await regionResp.json();
            const qmRegion: BoneRegion = await qmRegionResp.json();
            // Lazy load skeletons (only if any Phase 3 mesh is to be built)
            if (!srcSkelCache) {
              const r = await fetch(`${cfg.sourcePath}${bust}`);
              if (!r.ok) continue;
              srcSkelCache = await r.json();
            }
            if (!qmCanonCache) {
              const r = await fetch(`${QM_PATH}${bust}`);
              if (!r.ok) continue;
              qmCanonCache = await r.json();
            }
            const srcBone = srcSkelCache!.bones.find(b => b.name === srcBoneName);
            const qmCanonicalBone = qmCanonCache!.bones.find(b => b.name === probe.qmBone);
            const targetBone = skel.bones.find(b => b.name === probe.qmBone);
            if (!srcBone || !qmCanonicalBone || !targetBone) continue;
            // Optional sub-bone LBS blend (e.g. nipple_l for breast_l)
            const subBoneName = probe.subBones[0]; // currently support up to one sub-bone
            const subWeights = subBoneName ? qmRegion.weights_extra?.[subBoneName] : undefined;
            const targetSubBone = subBoneName ? skel.bones.find(b => b.name === subBoneName) : undefined;
            const colors = computePositionGradient(region.positions_zup);
            let deformedPositions: number[];
            if (subBoneName && subWeights && targetSubBone) {
              deformedPositions = skinSourceToPhase2(
                region.positions_zup,
                srcBone, qmCanonicalBone,
                targetBone, targetSubBone,
                qmRegion.positions_zup,
                qmRegion.weights, subWeights,
              );
            } else {
              // Single-bone deformation: nipple weights = 0 → falls back to pure breast transform
              const zeros = new Array(qmRegion.weights.length).fill(0);
              deformedPositions = skinSourceToPhase2(
                region.positions_zup,
                srcBone, qmCanonicalBone,
                targetBone, targetBone,
                qmRegion.positions_zup,
                qmRegion.weights, zeros,
              );
            }
            const transformed: BoneRegion = { ...region, positions_zup: deformedPositions };
            const mesh = buildBoneRegionMesh(scene, `region_${panel.key}_${probe.qmBone}`, transformed, colors);
            mesh.isVisible = false;
            boneRegionMeshes.set(probe.qmBone, mesh);
          }
        } catch { /* skip this probe bone */ }
      }
      console.log(`[probe regions] ${panel.key}: loaded ${boneRegionMeshes.size}/${PROBE_BONES.length}`);
    } catch (e) {
      panelStateRef.current[panel.key].error = String(e);
      setStatus(panel.key, `error: ${(e as Error).message ?? e}`);
    }
  }, [buildBoneOctahedra, buildBoneRegionMesh, buildVoxelBodyMesh, computePositionGradient, skinSourceToPhase2, modelKey, setStatus]);

  // ---- Mount panels (re-mounts when modelKey changes) ----
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const p of panels) {
      const canvas = canvasRefs.current[p.key];
      if (!canvas) continue;
      const { engine, scene, cam } = initPanel(canvas, p.key);
      panelStateRef.current[p.key] = { engine, scene, cam };
      void loadPanel(p, scene);
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        const st = panelStateRef.current[p.key];
        st.boneMeshes?.forEach(m => m.dispose());
        st.boneRegionMeshes?.forEach(m => m.dispose());
        st.bodyVoxelMesh?.dispose();
        engine.dispose();
        panelStateRef.current[p.key] = {};
      });
    }
    return () => { for (const f of cleanups) f(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  // Apply category visibility on toggle change
  useEffect(() => {
    for (const p of panels) {
      const ms = panelStateRef.current[p.key].boneMeshes;
      if (!ms) continue;
      ms.forEach((m, cat) => { m.isVisible = !!catVisible[cat]; });
    }
  }, [catVisible, panels]);

  // Apply probe bone region visibility (per-probe)
  useEffect(() => {
    for (const p of panels) {
      const map = panelStateRef.current[p.key].boneRegionMeshes;
      if (!map) continue;
      map.forEach((mesh, boneName) => { mesh.isVisible = !!probeVisible[boneName]; });
    }
  }, [probeVisible, panels]);

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
          Build — Bone retarget pipeline inspector ({cfg.label})
        </span>
        <span style={{ fontSize: 11, color: '#888' }}>
          ?model=rachel / anna / helena / helena_douglas — drag to rotate, all 4 cameras synced
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {CATEGORY_ORDER.map(cat => {
            const col = CATEGORY_COLOR[cat] ?? '#ddd';
            return (
              <label key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, padding: '2px 6px',
                background: 'rgba(30,30,50,0.6)', borderRadius: 3,
                cursor: 'pointer',
              }}>
                <input type="checkbox" checked={!!catVisible[cat]}
                  onChange={e => setCatVisible(s => ({ ...s, [cat]: e.target.checked }))} />
                <span style={{
                  display: 'inline-block', width: 8, height: 8,
                  background: col, borderRadius: 2,
                }} />
                {CATEGORY_LABEL[cat]}
              </label>
            );
          })}
          <span style={{ fontSize: 10, color: '#888', alignSelf: 'center', marginLeft: 8 }}>
            QM bone regions:
          </span>
          <button onClick={() => {
            const allOn = PROBE_BONES.every(p => probeVisible[p.qmBone]);
            const next: Record<string, boolean> = {};
            for (const p of PROBE_BONES) next[p.qmBone] = !allOn;
            setProbeVisible(next);
          }} style={{
            fontSize: 10, padding: '2px 6px', cursor: 'pointer',
            background: 'rgba(60,30,20,0.8)', border: '1px solid #f93',
            borderRadius: 3, color: '#fc9',
          }}>all</button>
          {PROBE_BONES.map(probe => (
            <label key={probe.qmBone} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 10, padding: '2px 5px',
              background: 'rgba(60,30,20,0.6)', borderRadius: 3,
              cursor: 'pointer', border: '1px solid #f93',
            }}>
              <input type="checkbox" checked={!!probeVisible[probe.qmBone]}
                onChange={e => setProbeVisible(s => ({ ...s, [probe.qmBone]: e.target.checked }))} />
              {probe.qmBone}
              {probe.subBones.length > 0 && <span style={{ color: '#fb9', fontSize: 9 }}>+{probe.subBones.join(',')}</span>}
            </label>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {panels.map(p => (
          <div key={p.key} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #222', minWidth: 0,
          }}>
            <div style={{
              padding: '6px 10px', background: 'rgba(0,0,0,0.3)',
              borderBottom: '1px solid #222', fontSize: 11,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  background: p.accent, borderRadius: 2,
                }} />
                <span style={{ color: p.accent, fontWeight: 'bold' }}>{p.label}</span>
                <span style={{ color: '#888', marginLeft: 'auto', fontSize: 10 }}>
                  {status[p.key]}
                </span>
              </div>
              {p.note && (
                <div style={{ color: '#777', fontSize: 10, marginTop: 2, lineHeight: 1.3 }}>
                  {p.note}
                </div>
              )}
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

      <div style={{
        padding: '6px 14px', background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid #333', fontSize: 10, color: '#888',
      }}>
        2 panels: source skeleton (left) and Phase 2 output (QM @ source proportions, right).
        Phase 2 data: <code>public/box5/build/{modelKey}/qm_at_source.skeleton.json</code>.
      </div>
    </div>
  );
}
