'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, StandardMaterial, MeshBuilder,
} from '@babylonjs/core';
import { SCALE } from '@/lib/vox-parser';
import { CharacterSelectorTmp } from '@/templates/realistic-viewer/CharacterSelectorTmp';
import { HairSwapTmp } from '@/templates/realistic-viewer/HairSwapTmp';
import { PartListTmp } from '@/templates/realistic-viewer/PartListTmp';
import type { SegmentBundleData } from '@/types/vox';
import { buildBundleMeshes, loadVoxMesh } from '@/lib/vox-mesh';

const CACHE_BUST = `?v=${Date.now()}`;

// ========================================================================
// 型定義
// ========================================================================

interface PartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
  meshes: string[];
  is_body: boolean;
  category?: string;
}

interface GridInfo {
  voxel_size: number;
  gx: number;
  gy: number;
  gz: number;
}

type CharCategory = 'female' | 'male' | 'base' | 'weapons';

interface CharacterConfig {
  label: string;
  manifest: string;
  gridJson: string;
  gender: 'female' | 'male';
  category: CharCategory;
}

interface HairOption {
  label: string;
  charKey: string;
  file: string;
  partKey: string;
  voxels: number;
  anchorsUrl: string;
}

interface AnchorPoints {
  top: number[];
  front: number[];
  back: number[];
  left: number[];
  right: number[];
  width: number;
  depth: number;
}

interface HairAnchorsData {
  voxel_size: number;
  body_head?: AnchorPoints;
  hairs?: Record<string, AnchorPoints>;
}

// API エンドポイント
const VOX_API = '/api/vox';

// キャラクター設定
const CHARACTERS: Record<string, CharacterConfig> = {
  // ベースボディ（衣装着せ替え対応）
  queenmarika_default: { label: 'QueenMarika Default', manifest: `${VOX_API}/female/realistic-queenmarika-default/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-default/grid.json`, gender: 'female', category: 'base' },
  // 女性キャラクター
  base_female: { label: 'Base Female (CyberpunkElf)', manifest: `${VOX_API}/female/CyberpunkElf-Detailed/parts.json`, gridJson: `${VOX_API}/female/CyberpunkElf-Detailed/grid.json`, gender: 'female', category: 'female' },
  base_bunnyakali: { label: 'Base Female (BunnyAkali)', manifest: `${VOX_API}/female/BunnyAkali-Base/parts.json`, gridJson: `${VOX_API}/female/BunnyAkali-Base/grid.json`, gender: 'female', category: 'female' },
  base_darkelfblader: { label: 'Base Female (DarkElfBlader)', manifest: `${VOX_API}/female/DarkElfBlader-Base/parts.json`, gridJson: `${VOX_API}/female/DarkElfBlader-Base/grid.json`, gender: 'female', category: 'female' },
  cyberpunkelf: { label: 'CyberpunkElf', manifest: `${VOX_API}/female/realistic/parts.json`, gridJson: `${VOX_API}/female/realistic/grid.json`, gender: 'female', category: 'female' },
  darkelfblader: { label: 'DarkElfBlader', manifest: `${VOX_API}/female/realistic-darkelf/parts.json`, gridJson: `${VOX_API}/female/realistic-darkelf/grid.json`, gender: 'female', category: 'female' },
  highpriestess: { label: 'HighPriestess', manifest: `${VOX_API}/female/realistic-highpriestess/parts.json`, gridJson: `${VOX_API}/female/realistic-highpriestess/grid.json`, gender: 'female', category: 'female' },
  pillarwoman: { label: 'PillarWoman', manifest: `${VOX_API}/female/realistic-pillarwoman/parts.json`, gridJson: `${VOX_API}/female/realistic-pillarwoman/grid.json`, gender: 'female', category: 'female' },
  bunnyirelia: { label: 'BunnyIrelia', manifest: `${VOX_API}/female/realistic-bunnyirelia/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyirelia/grid.json`, gender: 'female', category: 'female' },
  daemongirl: { label: 'DaemonGirl', manifest: `${VOX_API}/female/realistic-daemongirl/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl/grid.json`, gender: 'female', category: 'female' },
  daemongirl_default: { label: 'DaemonGirl Default', manifest: `${VOX_API}/female/realistic-daemongirl-default/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-default/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunny: { label: 'DaemonGirl Bunny', manifest: `${VOX_API}/female/realistic-daemongirl-bunny/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunny/grid.json`, gender: 'female', category: 'female' },
  daemongirl_bunnysuit: { label: 'DaemonGirl BunnySuit', manifest: `${VOX_API}/female/realistic-daemongirl-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  daemongirl_ponytail: { label: 'DaemonGirl Ponytail', manifest: `${VOX_API}/female/realistic-daemongirl-ponytail/parts.json`, gridJson: `${VOX_API}/female/realistic-daemongirl-ponytail/grid.json`, gender: 'female', category: 'female' },
  primrose_egypt: { label: 'Primrose Egypt', manifest: `${VOX_API}/female/realistic-primrose-egypt/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-egypt/grid.json`, gender: 'female', category: 'female' },
  primrose_officelady: { label: 'Primrose OfficeLady', manifest: `${VOX_API}/female/realistic-primrose-officelady/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-officelady/grid.json`, gender: 'female', category: 'female' },
  primrose_bunnysuit: { label: 'Primrose Bunnysuit', manifest: `${VOX_API}/female/realistic-primrose-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  primrose_swimsuit: { label: 'Primrose Swimsuit', manifest: `${VOX_API}/female/realistic-primrose-swimsuit/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-swimsuit/grid.json`, gender: 'female', category: 'female' },
  primrose_milkapron: { label: 'Primrose MilkApron', manifest: `${VOX_API}/female/realistic-primrose-milkapron/parts.json`, gridJson: `${VOX_API}/female/realistic-primrose-milkapron/grid.json`, gender: 'female', category: 'female' },
  queenmarika_goldenbikini: { label: 'QueenMarika GoldenBikini', manifest: `${VOX_API}/female/realistic-queenmarika-goldenbikini/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-goldenbikini/grid.json`, gender: 'female', category: 'female' },
  bunnyakali: { label: 'BunnyAkali', manifest: `${VOX_API}/female/realistic-bunnyakali/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyakali/grid.json`, gender: 'female', category: 'female' },
  artorialancer_default: { label: 'ArtoriaLancer Default', manifest: `${VOX_API}/female/realistic-artorialancer-default/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-default/grid.json`, gender: 'female', category: 'female' },
  artorialancer_alter: { label: 'ArtoriaLancer Alter', manifest: `${VOX_API}/female/realistic-artorialancer-alter/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-alter/grid.json`, gender: 'female', category: 'female' },
  artorialancer_bunnysuit: { label: 'ArtoriaLancer BunnySuit', manifest: `${VOX_API}/female/realistic-artorialancer-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  elfpaladin: { label: 'ElfPaladin', manifest: `${VOX_API}/female/realistic-elfpaladin/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin/grid.json`, gender: 'female', category: 'female' },
  nina_normalized: { label: 'Nina Williams (Normalized 0.5)', manifest: `${VOX_API}/female/nina-williams-normalized/parts.json`, gridJson: `${VOX_API}/female/nina-williams-normalized/grid.json`, gender: 'female', category: 'female' },
  nina_original: { label: 'Nina Williams (Original)', manifest: `${VOX_API}/female/nina-williams-original/parts.json`, gridJson: `${VOX_API}/female/nina-williams-original/grid.json`, gender: 'female', category: 'female' },
  // 男性キャラクター
  radagon: { label: 'Radagon', manifest: `${VOX_API}/male/realistic-radagon/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon/grid.json`, gender: 'male', category: 'male' },
  vagrant: { label: 'Vagrant', manifest: `${VOX_API}/male/realistic-vagrant/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite: { label: 'SpartanHoplite', manifest: `${VOX_API}/male/realistic-spartanhoplite/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite/grid.json`, gender: 'male', category: 'male' },
  radagon_tall: { label: 'Radagon (Tall)', manifest: `${VOX_API}/male/realistic-radagon-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-tall/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite_tall: { label: 'SpartanHoplite (Tall)', manifest: `${VOX_API}/male/realistic-spartanhoplite-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-tall/grid.json`, gender: 'male', category: 'male' },
  vagrant_tall: { label: 'Vagrant (Tall)', manifest: `${VOX_API}/male/realistic-vagrant-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant-tall/grid.json`, gender: 'male', category: 'male' },
  dido: { label: 'Dido (MaleSmall2)', manifest: `${VOX_API}/male/realistic-dido/parts.json`, gridJson: `${VOX_API}/male/realistic-dido/grid.json`, gender: 'male', category: 'male' },
  // 武器
  artorialancer_weapons: { label: 'ArtoriaLancer Weapons', manifest: `${VOX_API}/female/realistic-artorialancer-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-weapons/grid.json`, gender: 'female', category: 'weapons' },
  elfpaladin_weapons: { label: 'ElfPaladin Weapons', manifest: `${VOX_API}/female/realistic-elfpaladin-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin-weapons/grid.json`, gender: 'female', category: 'weapons' },
  radagon_weapons: { label: 'Radagon Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_weapons: { label: 'SpartanHoplite Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons/grid.json`, gender: 'male', category: 'weapons' },
  radagon_tall_weapons: { label: 'Radagon (Tall) Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_tall_weapons: { label: 'SpartanHoplite (Tall) Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
};

// ========================================================================
// Component
// ========================================================================

export default function VoxelViewerView() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <VoxelViewerPage />
    </Suspense>
  );
}

function VoxelViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const bodyMatRef = useRef<StandardMaterial | null>(null);
  const partMatRef = useRef<StandardMaterial | null>(null);
  const meshesRef = useRef<Record<string, Mesh>>({});

  const [selectedCategory, setSelectedCategory] = useState<CharCategory>('base');
  const [charKey, setCharKey] = useState('queenmarika_default');
  const [parts, setParts] = useState<PartEntry[]>([]);
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingParts, setLoadingParts] = useState<Set<string>>(new Set());

  // 髪スワップ関連
  const [hairOptions, setHairOptions] = useState<HairOption[]>([]);
  const [selectedHair, setSelectedHair] = useState<string>('');
  const [hairLoading, setHairLoading] = useState(false);
  const [hairSizeDiff, setHairSizeDiff] = useState<string>('');
  const voxelScaleRef = useRef<number>(SCALE);
  const bodyAnchorsRef = useRef<AnchorPoints | null>(null);

  // パーツ情報マップ（遅延ロード用）
  const partsRef = useRef<Record<string, PartEntry>>({});

  const togglePart = useCallback(async (key: string) => {
    const mesh = meshesRef.current[key];
    if (mesh) {
      // 既にロード済み: 表示/非表示トグル
      setPartVisibility(prev => {
        const next = { ...prev, [key]: !prev[key] };
        mesh.setEnabled(next[key]);
        return next;
      });
      return;
    }
    // 未ロード: オンデマンドでロード
    const partInfo = partsRef.current[key];
    const scene = sceneRef.current;
    const bodyMat = bodyMatRef.current;
    const partMat = partMatRef.current;
    if (!partInfo || !scene || !bodyMat || !partMat) return;

    setLoadingParts(prev => new Set(prev).add(key));
    try {
      const loaded = await loadVoxMesh(scene, partInfo.file, `part_${key}`, voxelScaleRef.current);
      loaded.material = (partInfo.is_body && key !== 'eyes') ? bodyMat : partMat;
      loaded.setEnabled(true);
      meshesRef.current[key] = loaded;
      setPartVisibility(prev => ({ ...prev, [key]: true }));
    } catch (e) {
      console.error(`Failed to load part ${key}:`, e);
    } finally {
      setLoadingParts(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    setPartVisibility(prev => {
      const next: Record<string, boolean> = {};
      for (const key in prev) {
        next[key] = on;
        const mesh = meshesRef.current[key];
        if (mesh) mesh.setEnabled(on);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((isBody: boolean, on: boolean) => {
    setPartVisibility(prev => {
      const next = { ...prev };
      for (const p of parts) {
        if (p.is_body === isBody) {
          next[p.key] = on;
          const mesh = meshesRef.current[p.key];
          if (mesh) mesh.setEnabled(on);
        }
      }
      return next;
    });
  }, [parts]);

  // 髪オプション収集
  useEffect(() => {
    const currentGender = CHARACTERS[charKey]?.gender;
    if (!currentGender) return;
    let cancelled = false;

    (async () => {
      const sameGenderChars = Object.entries(CHARACTERS).filter(
        ([, cfg]) => cfg.gender === currentGender
      );
      const options: HairOption[] = [];
      await Promise.all(
        sameGenderChars.map(async ([ck, cfg]) => {
          try {
            const resp = await fetch(cfg.manifest + CACHE_BUST);
            if (!resp.ok) return;
            const allParts: PartEntry[] = await resp.json();
            const manifestPath = cfg.manifest.replace(VOX_API + '/', '');
            const genderPrefix = manifestPath.split('/')[0];
            const hairParts = allParts.filter(
              p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
            );
            const charFolder = manifestPath.split('/').slice(0, -1).join('/');
            const anchorsUrl = `${VOX_API}/${charFolder}/hair_anchors.json`;
            for (const hp of hairParts) {
              const fullFile = hp.file.startsWith(VOX_API)
                ? hp.file
                : `${VOX_API}/${genderPrefix}${hp.file}`;
              options.push({
                label: `${cfg.label} - ${hp.meshes[0] || hp.key}`,
                charKey: ck, file: fullFile, partKey: hp.key,
                voxels: hp.voxels, anchorsUrl,
              });
            }
          } catch { /* skip */ }
        })
      );
      if (!cancelled) {
        options.sort((a, b) => a.label.localeCompare(b.label));
        setHairOptions(options);
      }
    })();

    return () => { cancelled = true; };
  }, [charKey]);

  // 髪スワップ
  const swapHair = useCallback(async (hairId: string) => {
    const scene = sceneRef.current;
    const partMat = partMatRef.current;
    if (!scene || !partMat) return;

    setSelectedHair(hairId);
    setHairSizeDiff('');

    const hairPartKeys = parts
      .filter(p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
      .map(p => p.key);
    for (const hk of hairPartKeys) {
      const mesh = meshesRef.current[hk];
      if (mesh) { mesh.dispose(); delete meshesRef.current[hk]; }
    }

    if (hairId === '') {
      const config = CHARACTERS[charKey];
      if (!config) return;
      setHairLoading(true);
      try {
        const resp = await fetch(config.manifest + CACHE_BUST);
        if (!resp.ok) return;
        const allParts: PartEntry[] = await resp.json();
        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        for (const hp of allParts) {
          if (!(hp.category === 'hair' || (hp.key.includes('hair') && hp.key !== 'body_hair' && !hp.is_body))) continue;
          const fullFile = hp.file.startsWith(VOX_API) ? hp.file : `${VOX_API}/${genderPrefix}${hp.file}`;
          try {
            const mesh = await loadVoxMesh(scene, fullFile, `part_${hp.key}`, voxelScaleRef.current);
            mesh.material = partMat;
            mesh.setEnabled(true);
            meshesRef.current[hp.key] = mesh;
            setPartVisibility(prev => ({ ...prev, [hp.key]: true }));
          } catch (e) {
            console.error(`Failed to reload hair ${fullFile}:`, e);
          }
        }
      } finally {
        setHairLoading(false);
      }
      return;
    }

    const option = hairOptions.find(o => `${o.charKey}::${o.partKey}` === hairId);
    if (!option) return;

    setHairLoading(true);
    try {
      let sourceHairAnchors: AnchorPoints | null = null;
      let sourceBodyAnchors: AnchorPoints | null = null;
      let sourceVoxelSize = voxelScaleRef.current;
      try {
        const anchResp = await fetch(option.anchorsUrl + CACHE_BUST);
        if (anchResp.ok) {
          const anchData: HairAnchorsData = await anchResp.json();
          sourceHairAnchors = anchData.hairs?.[option.partKey] ?? null;
          sourceBodyAnchors = anchData.body_head ?? null;
          sourceVoxelSize = anchData.voxel_size;
        }
      } catch { /* fallback */ }

      const targetBodyAnchors = bodyAnchorsRef.current;
      const swapKey = `swapped_hair_${option.partKey}`;

      const mesh = await loadVoxMesh(scene, option.file, `part_${swapKey}`, sourceVoxelSize);
      mesh.material = partMat;

      if (targetBodyAnchors && sourceHairAnchors) {
        const srcBody = sourceBodyAnchors || targetBodyAnchors;
        const scaleW = targetBodyAnchors.width / srcBody.width;
        const scaleD = targetBodyAnchors.depth / srcBody.depth;
        const uniformScale = (scaleW + scaleD) / 2;

        mesh.scaling = new Vector3(uniformScale, uniformScale, uniformScale);

        const offsetX = targetBodyAnchors.top[0] - sourceHairAnchors.top[0] * uniformScale;
        const offsetY = targetBodyAnchors.top[1] - sourceHairAnchors.top[1] * uniformScale + 2 * sourceVoxelSize;
        const offsetZ = targetBodyAnchors.top[2] - sourceHairAnchors.top[2] * uniformScale - 2 * sourceVoxelSize;
        mesh.position = new Vector3(offsetX, offsetY, offsetZ);

        const pctDiff = Math.round((uniformScale - 1) * 100);
        setHairSizeDiff(pctDiff === 0 ? '' : `${pctDiff > 0 ? '+' : ''}${pctDiff}%`);
      } else {
        mesh.position = Vector3.Zero();
      }

      mesh.setEnabled(true);
      meshesRef.current[swapKey] = mesh;
      setPartVisibility(prev => ({ ...prev, [swapKey]: true }));

      setParts(prev => {
        const nonHair = prev.filter(
          p => !(p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
        );
        return [...nonHair, {
          key: swapKey, file: option.file, voxels: option.voxels,
          default_on: true, meshes: [option.label], is_body: false, category: 'hair',
        }];
      });
    } catch (e) {
      console.error(`Failed to load swapped hair:`, e);
    } finally {
      setHairLoading(false);
    }
  }, [parts, charKey, hairOptions]);

  // シーン初期化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, false, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);

    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 80;

    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);

    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 10 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    gm.freeze();
    ground.material = gm;
    ground.freezeWorldMatrix();

    const bodyMat = new StandardMaterial('bodyMat', scene);
    bodyMat.emissiveColor = Color3.White();
    bodyMat.disableLighting = true;
    bodyMat.backFaceCulling = false;
    bodyMat.freeze();
    bodyMatRef.current = bodyMat;

    const partMat = new StandardMaterial('partMat', scene);
    partMat.emissiveColor = Color3.White();
    partMat.disableLighting = true;
    partMat.backFaceCulling = false;
    partMat.zOffset = -2;
    partMat.freeze();
    partMatRef.current = partMat;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // キャラクター変更時にパーツ読み込み
  useEffect(() => {
    const scene = sceneRef.current;
    const bodyMat = bodyMatRef.current;
    const partMat = partMatRef.current;
    if (!scene || !bodyMat || !partMat) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setSelectedHair('');
      setHairSizeDiff('');
      bodyAnchorsRef.current = null;

      for (const mesh of Object.values(meshesRef.current)) {
        mesh.dispose();
      }
      meshesRef.current = {};

      const config = CHARACTERS[charKey];
      if (!config) {
        setError(`Unknown character: ${charKey}`);
        setLoading(false);
        return;
      }

      try {
        const gridResp = await fetch(config.gridJson + CACHE_BUST);
        let voxelScale = SCALE;
        if (gridResp.ok) {
          const grid: GridInfo = await gridResp.json();
          voxelScale = grid.voxel_size;
        }
        voxelScaleRef.current = voxelScale;

        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        const charFolder = manifestPath.split('/').slice(0, -1).join('/');

        // バンドルベースの高速ロード
        const bundleUrl = `${VOX_API}/${charFolder}/segments_bundle.json`;
        const bundleResp = await fetch(bundleUrl + CACHE_BUST);

        if (bundleResp.ok && config.category === 'base') {
          const bundle: SegmentBundleData = await bundleResp.json();
          if (cancelled) return;

          const builtMeshes = buildBundleMeshes(bundle, scene, bodyMat, voxelScale);
          const vis: Record<string, boolean> = {};
          const partEntries: PartEntry[] = [];
          for (const boneName of Object.keys(builtMeshes)) {
            meshesRef.current[boneName] = builtMeshes[boneName];
            vis[boneName] = true;
            partEntries.push({ key: boneName, file: '', voxels: 0, default_on: true, meshes: [boneName], is_body: true });
          }

          // parts.jsonから衣装パーツのリストも取得（メッシュはロードしない）
          try {
            const partsResp = await fetch(config.manifest + CACHE_BUST);
            if (partsResp.ok) {
              const allParts: PartEntry[] = await partsResp.json();
              const newPartsMap: Record<string, PartEntry> = {};
              for (const p of allParts) {
                if (!p.file.startsWith(VOX_API)) {
                  p.file = `${VOX_API}/${genderPrefix}${p.file}`;
                }
                if (!p.is_body) {
                  vis[p.key] = false; // 衣装は初期非表示
                  partEntries.push(p);
                  newPartsMap[p.key] = p;
                }
              }
              partsRef.current = newPartsMap;
            }
          } catch { /* parts.json optional for base */ }

          setParts(partEntries);
          setPartVisibility(vis);
        } else {
          // 個別VOXファイル読み込み
          const resp = await fetch(config.manifest + CACHE_BUST);
          if (!resp.ok) {
            setError(`${config.label}: parts.json not found.`);
            setLoading(false);
            return;
          }
          const allParts: PartEntry[] = await resp.json();
          if (cancelled) return;

          for (const p of allParts) {
            if (!p.file.startsWith(VOX_API)) {
              p.file = `${VOX_API}/${genderPrefix}${p.file}`;
            }
          }
          setParts(allParts);
          const newPartsMap: Record<string, PartEntry> = {};
          for (const p of allParts) newPartsMap[p.key] = p;
          partsRef.current = newPartsMap;

          const vis: Record<string, boolean> = {};
          for (const part of allParts) {
            vis[part.key] = part.default_on;
          }

          // default_on のパーツだけ初回ロード、残りはオンデマンド
          const defaultOnParts = allParts.filter(p => p.default_on);
          const meshResults = await Promise.all(
            defaultOnParts.map(async (part) => {
              try {
                return { part, mesh: await loadVoxMesh(scene, part.file, `part_${part.key}`, voxelScale) };
              } catch { return null; }
            })
          );
          if (cancelled) { for (const r of meshResults) if (r) r.mesh.dispose(); return; }

          for (const r of meshResults) {
            if (!r) continue;
            r.mesh.material = (r.part.is_body && r.part.key !== 'eyes') ? bodyMat : partMat;
            r.mesh.setEnabled(true);
            meshesRef.current[r.part.key] = r.mesh;
          }
          setPartVisibility(vis);
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load parts manifest');
          setLoading(false);
          console.error(e);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#101018', display: 'flex' }}>
      <div style={{
        width: 280, minWidth: 280, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.55)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
          Voxel Viewer
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#888' }}>
          Static voxel model viewer - no animation
        </p>

        <CharacterSelectorTmp
          characters={CHARACTERS}
          selectedCategory={selectedCategory}
          charKey={charKey}
          onCategoryChange={(cat, firstKey) => { setSelectedCategory(cat); setCharKey(firstKey); }}
          onCharChange={setCharKey}
        />

        {loading && (
          <div style={{ color: '#8af', fontSize: 13, padding: '20px 0' }}>
            Loading parts...
          </div>
        )}

        {error && (
          <div style={{ color: '#f88', fontSize: 12, padding: '10px', background: 'rgba(200,50,50,0.15)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <HairSwapTmp
              hairOptions={hairOptions}
              selectedHair={selectedHair}
              hairLoading={hairLoading}
              hairSizeDiff={hairSizeDiff}
              onSwapHair={swapHair}
            />
            <PartListTmp
              parts={parts}
              partVisibility={partVisibility}
              loadingParts={loadingParts}
              onTogglePart={togglePart}
              onToggleAll={toggleAll}
              onToggleCategory={toggleCategory}
            />
          </>
        )}

        <div style={{
          marginTop: 20, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          opacity: 0.4, fontSize: 10, lineHeight: 1.6,
        }}>
          Drag to rotate / Scroll to zoom / Right-drag to pan
        </div>
      </div>

      <canvas ref={canvasRef} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}
