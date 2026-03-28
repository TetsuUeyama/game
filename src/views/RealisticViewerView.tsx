'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, Mesh, StandardMaterial, MeshBuilder, Matrix,
} from '@babylonjs/core';
import { SCALE } from '@/lib/vox-parser';
import { CharacterSelectorTmp } from '@/templates/realistic-viewer/CharacterSelectorTmp';
import { AnimationControlTmp } from '@/templates/realistic-viewer/AnimationControlTmp';
import { HairSwapTmp } from '@/templates/realistic-viewer/HairSwapTmp';
import { PartListTmp } from '@/templates/realistic-viewer/PartListTmp';
import type { VoxModel, SegmentBundleData } from '@/types/vox';
import type { MotionData, RawMotionData } from '@/types/motion';
import { buildBundleMeshes } from '@/lib/vox-mesh';
import {
  processRawMotionData, resolveMotionBoneName, applyMatPointBlender, applyMatPointBabylon,
  buildBoneHierarchyViewer, type ViewerBoneHierarchyEntry,
} from '@/lib/motion-converter';
import { loadVoxMesh } from '@/lib/vox-mesh';

// parseVox, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS は @/lib/vox-parser からインポート済み
// VoxModel, SegmentBundleData は @/types/vox からインポート済み
// MotionData, RawMotionData は @/types/motion からインポート済み
// buildVoxMesh, buildBundleMeshes は @/lib/vox-mesh からインポート済み

const CACHE_BUST = `?v=${Date.now()}`;

// ========================================================================
// Part manifest type & character config（パーツマニフェスト型とキャラクター設定）
// ========================================================================

// パーツエントリの型定義（マニフェストJSONの1要素）
interface PartEntry {
  key: string;         // パーツキー（一意識別子）
  file: string;        // VOXファイルのパス
  voxels: number;      // ボクセル数
  default_on: boolean; // デフォルト表示フラグ
  meshes: string[];    // 元メッシュ名のリスト
  is_body: boolean;    // ボディパーツかどうか
  category?: string;   // カテゴリ（body/hair/clothing等）
}

// グリッド情報の型定義
interface GridInfo {
  voxel_size: number;  // ボクセルサイズ（メートル）
  gx: number;          // X方向グリッド数
  gy: number;          // Y方向グリッド数
  gz: number;          // Z方向グリッド数
}

// キャラクターカテゴリ型
type CharCategory = 'female' | 'male' | 'base' | 'weapons';

// キャラクター設定の型定義
interface CharacterConfig {
  label: string;          // 表示ラベル
  manifest: string;       // パーツマニフェストJSONのURL
  gridJson: string;       // グリッド情報JSONのURL
  gender: 'female' | 'male';  // 性別
  category: CharCategory; // カテゴリ
}

// 髪スワップオプションの型定義
interface HairOption {
  label: string;       // 表示ラベル
  charKey: string;     // キャラクターキー
  file: string;        // VOXファイルのフルAPIパス
  partKey: string;     // parts.json内のパーツキー
  voxels: number;      // ボクセル数
  anchorsUrl: string;  // hair_anchors.jsonのURL
}

// アンカーポイントの型定義（髪のアライメント用）
interface AnchorPoints {
  top: number[];    // 頭頂部のアンカー座標
  front: number[];  // 前面のアンカー座標
  back: number[];   // 背面のアンカー座標
  left: number[];   // 左側のアンカー座標
  right: number[];  // 右側のアンカー座標
  width: number;    // 頭部の幅
  depth: number;    // 頭部の奥行
}

// 髪アンカーデータの型定義
interface HairAnchorsData {
  voxel_size: number;                        // ボクセルサイズ
  body_head?: AnchorPoints;                  // ボディの頭部アンカー
  hairs?: Record<string, AnchorPoints>;      // 髪パーツごとのアンカー
}


// ジョイントスフィア設定の型定義（関節の球体表示用）
interface JointSphereConfig {
  position_voxel: number[];   // ボクセル空間での位置
  bone: string;               // 所属ボーン名
  radius_voxels: number | number[];  // 半径（ボクセル単位）
  shape: 'sphere' | 'ellipsoid';    // 形状
  color: { r: number; g: number; b: number };  // 表示色
}

// セグメントデータの型定義（ボーン分割ボクセル情報）
interface SegmentsData {
  voxel_size: number;  // ボクセルサイズ
  grid: { gx: number; gy: number; gz: number };  // グリッドサイズ
  bb_min?: number[];   // バウンディングボックス最小座標
  bb_max?: number[];   // バウンディングボックス最大座標
  bone_positions: Record<string, {
    head_voxel: number[];  // ボーンのヘッド位置（ボクセル座標）
    tail_voxel: number[];  // ボーンのテール位置（ボクセル座標）
  }>;
  segments: Record<string, { file: string; voxels: number }>;  // ボーン名→ファイル・ボクセル数
  joint_spheres?: Record<string, JointSphereConfig>;  // ジョイントスフィア設定
}

// ========================================================================
// Bone hierarchy for joint correction（ジョイント補正用のボーン階層）
// ========================================================================

// ボーン階層エントリの型定義
// API エンドポイント定数
const GAME_ASSETS_API = '/api/game-assets';  // ゲームアセットAPI
const VOX_API = '/api/vox';                  // VOXファイルAPI

// キャラクター設定の定義（全キャラクター）
const CHARACTERS: Record<string, CharacterConfig> = {
  // ---- ベースボディ（単一モデル、全モーション互換） ----
  base_female: { label: 'Base Female (CyberpunkElf)', manifest: `${VOX_API}/female/CyberpunkElf-Detailed/parts.json`, gridJson: `${VOX_API}/female/CyberpunkElf-Detailed/grid.json`, gender: 'female', category: 'base' },
  base_bunnyakali: { label: 'Base Female (BunnyAkali)', manifest: `${VOX_API}/female/BunnyAkali-Base/parts.json`, gridJson: `${VOX_API}/female/BunnyAkali-Base/grid.json`, gender: 'female', category: 'base' },
  base_darkelfblader: { label: 'Base Female (DarkElfBlader)', manifest: `${VOX_API}/female/DarkElfBlader-Base/parts.json`, gridJson: `${VOX_API}/female/DarkElfBlader-Base/grid.json`, gender: 'female', category: 'base' },
  // ---- 女性キャラクター ----
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
  queenmarika_default: { label: 'QueenMarika Default', manifest: `${VOX_API}/female/realistic-queenmarika-default/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-default/grid.json`, gender: 'female', category: 'female' },
  queenmarika_goldenbikini: { label: 'QueenMarika GoldenBikini', manifest: `${VOX_API}/female/realistic-queenmarika-goldenbikini/parts.json`, gridJson: `${VOX_API}/female/realistic-queenmarika-goldenbikini/grid.json`, gender: 'female', category: 'female' },
  bunnyakali: { label: 'BunnyAkali', manifest: `${VOX_API}/female/realistic-bunnyakali/parts.json`, gridJson: `${VOX_API}/female/realistic-bunnyakali/grid.json`, gender: 'female', category: 'female' },
  artorialancer_default: { label: 'ArtoriaLancer Default', manifest: `${VOX_API}/female/realistic-artorialancer-default/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-default/grid.json`, gender: 'female', category: 'female' },
  artorialancer_alter: { label: 'ArtoriaLancer Alter', manifest: `${VOX_API}/female/realistic-artorialancer-alter/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-alter/grid.json`, gender: 'female', category: 'female' },
  artorialancer_bunnysuit: { label: 'ArtoriaLancer BunnySuit', manifest: `${VOX_API}/female/realistic-artorialancer-bunnysuit/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-bunnysuit/grid.json`, gender: 'female', category: 'female' },
  elfpaladin: { label: 'ElfPaladin', manifest: `${VOX_API}/female/realistic-elfpaladin/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin/grid.json`, gender: 'female', category: 'female' },
  // ---- 男性キャラクター ----
  radagon: { label: 'Radagon', manifest: `${VOX_API}/male/realistic-radagon/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon/grid.json`, gender: 'male', category: 'male' },
  vagrant: { label: 'Vagrant', manifest: `${VOX_API}/male/realistic-vagrant/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite: { label: 'SpartanHoplite', manifest: `${VOX_API}/male/realistic-spartanhoplite/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite/grid.json`, gender: 'male', category: 'male' },
  radagon_tall: { label: 'Radagon (Tall)', manifest: `${VOX_API}/male/realistic-radagon-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-tall/grid.json`, gender: 'male', category: 'male' },
  spartanhoplite_tall: { label: 'SpartanHoplite (Tall)', manifest: `${VOX_API}/male/realistic-spartanhoplite-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-tall/grid.json`, gender: 'male', category: 'male' },
  vagrant_tall: { label: 'Vagrant (Tall)', manifest: `${VOX_API}/male/realistic-vagrant-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-vagrant-tall/grid.json`, gender: 'male', category: 'male' },
  dido: { label: 'Dido (MaleSmall2)', manifest: `${VOX_API}/male/realistic-dido/parts.json`, gridJson: `${VOX_API}/male/realistic-dido/grid.json`, gender: 'male', category: 'male' },
  // ---- 武器 ----
  artorialancer_weapons: { label: 'ArtoriaLancer Weapons', manifest: `${VOX_API}/female/realistic-artorialancer-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-artorialancer-weapons/grid.json`, gender: 'female', category: 'weapons' },
  elfpaladin_weapons: { label: 'ElfPaladin Weapons', manifest: `${VOX_API}/female/realistic-elfpaladin-weapons/parts.json`, gridJson: `${VOX_API}/female/realistic-elfpaladin-weapons/grid.json`, gender: 'female', category: 'weapons' },
  radagon_weapons: { label: 'Radagon Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_weapons: { label: 'SpartanHoplite Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons/grid.json`, gender: 'male', category: 'weapons' },
  radagon_tall_weapons: { label: 'Radagon (Tall) Weapons', manifest: `${VOX_API}/male/realistic-radagon-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-radagon-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
  spartanhoplite_tall_weapons: { label: 'SpartanHoplite (Tall) Weapons', manifest: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/parts.json`, gridJson: `${VOX_API}/male/realistic-spartanhoplite-weapons-tall/grid.json`, gender: 'male', category: 'weapons' },
};

// ========================================================================
// Component（コンポーネント）
// ========================================================================

// ラッパーコンポーネント（Suspenseでローディングフォールバックを提供）
export default function RealisticViewerView() {
  return (
    <Suspense fallback={<div style={{ background: '#12121f', width: '100vw', height: '100vh' }} />}>
      <RealisticViewerPage />
    </Suspense>
  );
}

// リアリスティックビューアのメインページコンポーネント
function RealisticViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);          // 3D描画用キャンバスの参照
  const sceneRef = useRef<Scene | null>(null);               // Babylon.jsシーンの参照
  const bodyMatRef = useRef<StandardMaterial | null>(null);   // ボディ用マテリアルの参照
  const partMatRef = useRef<StandardMaterial | null>(null);   // パーツ用マテリアルの参照（zOffset付き）

  const meshesRef = useRef<Record<string, Mesh>>({});        // パーツキー→メッシュのマップ

  const [selectedCategory, setSelectedCategory] = useState<CharCategory>('base');  // 選択中のカテゴリ
  const [charKey, setCharKey] = useState('base_female');      // 選択中のキャラクターキー
  const [parts, setParts] = useState<PartEntry[]>([]);        // パーツ一覧
  const [partVisibility, setPartVisibility] = useState<Record<string, boolean>>({});  // パーツ表示状態
  const [loading, setLoading] = useState(true);              // 読み込み中フラグ
  const [error, setError] = useState<string | null>(null);   // エラーメッセージ

  // 髪スワップ関連の状態
  const [hairOptions, setHairOptions] = useState<HairOption[]>([]);  // 利用可能な髪オプション
  const [selectedHair, setSelectedHair] = useState<string>('');      // 選択中の髪（"charKey::partKey" または空文字）
  const [hairLoading, setHairLoading] = useState(false);             // 髪読み込み中フラグ

  // アニメーション関連の状態
  const [animPlaying, setAnimPlaying] = useState(false);      // アニメーション再生中フラグ
  const [animReady, setAnimReady] = useState(false);          // アニメーションデータ読み込み完了フラグ
  const [selectedMotion, setSelectedMotion] = useState('');    // 選択中のモーションA
  const [selectedMotionB, setSelectedMotionB] = useState(''); // 選択中のモーションB（ブレンド用）
  const [blendDuration, setBlendDuration] = useState(30);     // クロスフェードのフレーム数
  const motionDataRef = useRef<MotionData | null>(null);      // モーションAデータの参照
  const motionDataBRef = useRef<MotionData | null>(null);     // モーションBデータの参照
  const segmentsDataRef = useRef<SegmentsData | null>(null);  // セグメントデータの参照
  const boneHierarchyRef = useRef<ViewerBoneHierarchyEntry[]>([]);  // ボーン階層の参照
  const animFrameRef = useRef(0);                             // 現在のアニメーションフレーム
  const frameDisplayRef = useRef<HTMLSpanElement>(null);       // フレーム表示用DOM要素の参照
  // restVoxelsRef削除済み — アニメーションにはfreezeWorldMatrixを使用
  const [hairSizeDiff, setHairSizeDiff] = useState<string>('');  // 髪スワップ時のサイズ差表示
  const voxelScaleRef = useRef<number>(SCALE);                // 現在のボクセルスケール
  const jointBonesRef = useRef<Record<string, [string, string]>>({}); // ジョイントキー→[ボーンA, ボーンB]
  const bodyAnchorsRef = useRef<AnchorPoints | null>(null);   // ボディの頭部アンカーポイント

  // 個別パーツの表示/非表示トグル関数
  const togglePart = useCallback((key: string) => {
    setPartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const mesh = meshesRef.current[key];
      if (mesh) mesh.setEnabled(next[key]);  // メッシュの有効/無効を切り替え
      return next;
    });
  }, []);

  // 全パーツの一括表示/非表示トグル関数
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

  // カテゴリ別（ボディ/パーツ）の一括表示/非表示トグル関数
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

  // 同性別の全キャラクターから髪オプションを収集する副作用
  useEffect(() => {
    const currentGender = CHARACTERS[charKey]?.gender;
    if (!currentGender) return;
    let cancelled = false;  // キャンセルフラグ

    (async () => {
      // 同性別のキャラクターをフィルタ
      const sameGenderChars = Object.entries(CHARACTERS).filter(
        ([, cfg]) => cfg.gender === currentGender
      );

      const options: HairOption[] = [];
      // 全キャラクターのマニフェストを並行読み込み
      await Promise.all(
        sameGenderChars.map(async ([ck, cfg]) => {
          try {
            const resp = await fetch(cfg.manifest + CACHE_BUST);
            if (!resp.ok) return;
            const allParts: PartEntry[] = await resp.json();
            const manifestPath = cfg.manifest.replace(VOX_API + '/', '');
            const genderPrefix = manifestPath.split('/')[0];
            // 髪カテゴリのパーツを抽出
            const hairParts = allParts.filter(
              p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body)
            );
            // マニフェストパスからアンカーURLを構築
            const charFolder = manifestPath.split('/').slice(0, -1).join('/');
            const anchorsUrl = `${VOX_API}/${charFolder}/hair_anchors.json`;
            // 各髪パーツをオプションに追加
            for (const hp of hairParts) {
              const fullFile = hp.file.startsWith(VOX_API)
                ? hp.file
                : `${VOX_API}/${genderPrefix}${hp.file}`;
              options.push({
                label: `${cfg.label} - ${hp.meshes[0] || hp.key}`,
                charKey: ck,
                file: fullFile,
                partKey: hp.key,
                voxels: hp.voxels,
                anchorsUrl,
              });
            }
          } catch {
            // マニフェストが読み込めないキャラクターはスキップ
          }
        })
      );

      if (!cancelled) {
        options.sort((a, b) => a.label.localeCompare(b.label));  // ラベル順にソート
        setHairOptions(options);
      }
    })();

    return () => { cancelled = true; };  // クリーンアップ
  }, [charKey]);

  // 髪スワップ: 現在の髪メッシュを破棄し、選択された髪をロードしてアンカーベースでアライメント
  const swapHair = useCallback(async (hairId: string) => {
    const scene = sceneRef.current;
    const partMat = partMatRef.current;
    if (!scene || !partMat) return;

    setSelectedHair(hairId);
    setHairSizeDiff('');

    // 現在の髪パーツキーを全て検索して破棄
    const hairPartKeys = parts
      .filter(p => p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
      .map(p => p.key);
    for (const hk of hairPartKeys) {
      const mesh = meshesRef.current[hk];
      if (mesh) { mesh.dispose(); delete meshesRef.current[hk]; }
    }

    if (hairId === '') {
      // デフォルト髪に戻す: 現在のキャラクターの元の髪をリロード
      const config = CHARACTERS[charKey];
      if (!config) return;
      setHairLoading(true);
      try {
        const resp = await fetch(config.manifest + CACHE_BUST);
        if (!resp.ok) return;
        const allParts: PartEntry[] = await resp.json();
        const manifestPath = config.manifest.replace(VOX_API + '/', '');
        const genderPrefix = manifestPath.split('/')[0];
        // 髪パーツを再読み込み
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

    // 選択された髪をアンカーベースのアライメントでロード
    const option = hairOptions.find(o => `${o.charKey}::${o.partKey}` === hairId);
    if (!option) return;

    setHairLoading(true);
    try {
      // ソースキャラクターのアンカーを読み込み
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
      } catch { /* アンカーが利用できない場合、現在のキャラクターのスケールにフォールバック */ }

      const targetBodyAnchors = bodyAnchorsRef.current;
      const swapKey = `swapped_hair_${option.partKey}`;  // スワップ後のパーツキー

      // 髪のVOXメッシュをロード
      const mesh = await loadVoxMesh(scene, option.file, `part_${swapKey}`, sourceVoxelSize);
      mesh.material = partMat;

      // アンカーベースのアライメントを適用
      if (targetBodyAnchors && sourceHairAnchors) {
        // スケール: ターゲットボディの頭部サイズ vs ソースボディの頭部サイズ
        const srcBody = sourceBodyAnchors || targetBodyAnchors;
        const scaleW = targetBodyAnchors.width / srcBody.width;   // 幅のスケール比
        const scaleD = targetBodyAnchors.depth / srcBody.depth;   // 奥行のスケール比
        const uniformScale = (scaleW + scaleD) / 2;               // 均一スケール（平均）

        mesh.scaling = new Vector3(uniformScale, uniformScale, uniformScale);  // スケーリング適用

        // 位置オフセット: 髪の接触頭頂部をターゲットボディの頭頂部に合わせる
        const offsetX = targetBodyAnchors.top[0] - sourceHairAnchors.top[0] * uniformScale;
        const offsetY = targetBodyAnchors.top[1] - sourceHairAnchors.top[1] * uniformScale + 2 * sourceVoxelSize;
        const offsetZ = targetBodyAnchors.top[2] - sourceHairAnchors.top[2] * uniformScale - 2 * sourceVoxelSize;
        mesh.position = new Vector3(offsetX, offsetY, offsetZ);

        // サイズ差をパーセンテージで表示
        const pctDiff = Math.round((uniformScale - 1) * 100);
        setHairSizeDiff(pctDiff === 0 ? '' : `${pctDiff > 0 ? '+' : ''}${pctDiff}%`);
      } else {
        // アンカーなし: 変換なし
        mesh.position = Vector3.Zero();
      }

      mesh.setEnabled(true);
      meshesRef.current[swapKey] = mesh;
      setPartVisibility(prev => ({ ...prev, [swapKey]: true }));

      // パーツリストを更新（既存の髪を除去し、スワップした髪を追加）
      setParts(prev => {
        const nonHair = prev.filter(
          p => !(p.category === 'hair' || (p.key.includes('hair') && p.key !== 'body_hair' && !p.is_body))
        );
        return [...nonHair, {
          key: swapKey,
          file: option.file,
          voxels: option.voxels,
          default_on: true,
          meshes: [option.label],
          is_body: false,
          category: 'hair',
        }];
      });
    } catch (e) {
      console.error(`Failed to load swapped hair:`, e);
    } finally {
      setHairLoading(false);
    }
  }, [parts, charKey, hairOptions]);

  // シーン初期化の副作用（マウント時に1回実行）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Babylon.jsエンジンを作成（アンチエイリアスなし、パフォーマンス重視）
    const engine = new Engine(canvas, false, { preserveDrawingBuffer: false });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.06, 0.06, 0.10, 1);  // 暗い背景色

    // アークロテートカメラの作成と設定
    const camera = new ArcRotateCamera('cam', -Math.PI / 4, Math.PI / 3, 3.0, new Vector3(0, 0.8, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3;   // 最小ズーム距離
    camera.upperRadiusLimit = 15;    // 最大ズーム距離
    camera.wheelPrecision = 80;      // ズーム感度

    // 半球ライト（環境光）
    const hemi = new HemisphericLight('hemi', new Vector3(0.3, 1, 0.5), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.2, 0.2, 0.25);  // 地面反射色

    // ディレクショナルライト
    const dir = new DirectionalLight('dir', new Vector3(-0.5, -1, -0.8), scene);
    dir.intensity = 0.45;

    // グラウンドメッシュ（ワイヤーフレームグリッド）
    const ground = MeshBuilder.CreateGround('ground', { width: 10, height: 10, subdivisions: 10 }, scene);
    const gm = new StandardMaterial('gm', scene);
    gm.diffuseColor = new Color3(0.12, 0.12, 0.16);
    gm.specularColor = Color3.Black();
    gm.wireframe = true;
    gm.freeze();  // マテリアルをフリーズ（パフォーマンス最適化）
    ground.material = gm;
    ground.freezeWorldMatrix();  // ワールド行列をフリーズ

    // ボディ用マテリアル（照明無効、頂点カラーで表示）
    const bodyMat = new StandardMaterial('bodyMat', scene);
    bodyMat.emissiveColor = Color3.White();   // エミッシブを白に（照明の影響なし）
    bodyMat.disableLighting = true;           // ライティング無効
    bodyMat.backFaceCulling = false;          // 両面描画
    bodyMat.freeze();
    bodyMatRef.current = bodyMat;

    // パーツ用マテリアル（ボディの上に描画するためzOffset付き）
    const partMat = new StandardMaterial('partMat', scene);
    partMat.emissiveColor = Color3.White();
    partMat.disableLighting = true;
    partMat.backFaceCulling = false;
    partMat.zOffset = -2;  // Zオフセットでボディの手前に描画
    partMat.freeze();
    partMatRef.current = partMat;

    engine.runRenderLoop(() => scene.render());  // レンダリングループ開始
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // キャラクター変更時にパーツを読み込む副作用
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

      // 既存メッシュを破棄
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
        // grid.jsonを読み込んでボクセルサイズを取得（正しい物理スケール）
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

        // バンドルベースの高速ロードを最初に試行（単一ファイル）
        const bundleUrl = `${VOX_API}/${charFolder}/segments_bundle.json`;
        const bundleResp = await fetch(bundleUrl + CACHE_BUST);

        if (bundleResp.ok && config.category === 'base') {
          // 高速パス: バンドルファイルから全ボーンメッシュを一括構築
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
          setParts(partEntries);
          setPartVisibility(vis);
          jointBonesRef.current = {};
        } else {
          // フォールバック: 個別VOXファイルの読み込み（非ベースキャラクター）
          const resp = await fetch(config.manifest + CACHE_BUST);
          if (!resp.ok) {
            setError(`${config.label}: parts.json not found.`);
            setLoading(false);
            return;
          }
          const allParts: PartEntry[] = await resp.json();
          if (cancelled) return;
          // ファイルパスにAPIプレフィックスを付与
          for (const p of allParts) {
            if (!p.file.startsWith(VOX_API)) {
              p.file = `${VOX_API}/${genderPrefix}${p.file}`;
            }
          }
          setParts(allParts);

          // パーツの表示状態とジョイントボーンマッピングを構築
          const vis: Record<string, boolean> = {};
          const jointBonesMap: Record<string, [string, string]> = {};
          for (const part of allParts) {
            vis[part.key] = part.default_on;
            const partAnyJ = part as unknown as Record<string, unknown>;
            if (partAnyJ.joint_bones && Array.isArray(partAnyJ.joint_bones)) {
              jointBonesMap[part.key] = partAnyJ.joint_bones as [string, string];
            }
          }

          // 全パーツのVOXメッシュを並行読み込み
          const meshResults = await Promise.all(
            allParts.map(async (part) => {
              try {
                return { part, mesh: await loadVoxMesh(scene, part.file, `part_${part.key}`, voxelScale) };
              } catch { return null; }
            })
          );
          if (cancelled) { for (const r of meshResults) if (r) r.mesh.dispose(); return; }
          // メッシュにマテリアルを設定して登録
          for (const r of meshResults) {
            if (!r) continue;
            r.mesh.material = (r.part.is_body && r.part.key !== 'eyes') ? bodyMat : partMat;
            r.mesh.setEnabled(vis[r.part.key] ?? true);
            meshesRef.current[r.part.key] = r.mesh;
          }
          setPartVisibility(vis);
          jointBonesRef.current = jointBonesMap;
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

  // ベースボディ/分割キャラクター用のアニメーションデータ読み込み
  useEffect(() => {
    if (CHARACTERS[charKey]?.category !== 'base') return;  // ベースカテゴリ以外はスキップ
    const config = CHARACTERS[charKey];
    if (!config) return;
    // マニフェストパスからフォルダ名を抽出
    const manifestPath = config.manifest.replace(VOX_API + '/', '');
    const pathParts = manifestPath.split('/');
    const gender = pathParts[0];
    const folderName = pathParts[1];

    // モデルごとのデフォルトモーション
    const defaultMotion: Record<string, string> = {
      'CyberpunkElf-Detailed': 'walk_cycle_arp.motion.json',
      'BunnyAkali-Base': 'bunnyakali_cozywinter.motion.json',
      'DarkElfBlader-Base': 'darkelfblader_titsuck.motion.json',
    };
    const motionFile = selectedMotion || defaultMotion[folderName] || 'walk_cycle_arp.motion.json';

    (async () => {
      try {
        // segments.json（ボーン位置情報）を読み込み
        const segResp = await fetch(`${VOX_API}/${gender}/${folderName}/segments.json${CACHE_BUST}`);
        if (segResp.ok) {
          const segData: SegmentsData = await segResp.json();
          segmentsDataRef.current = segData;
          boneHierarchyRef.current = buildBoneHierarchyViewer(segData);  // ボーン階層を構築
        }
        // 選択されたモーションファイルを読み込み
        const motionResp = await fetch(`${GAME_ASSETS_API}/motion/${motionFile}${CACHE_BUST}`);
        if (motionResp.ok) {
          const motionJson = await motionResp.json();
          // 生フォーマットの場合はBabylon.js形式に変換
          if (motionJson.format === 'blender_raw') {
            motionDataRef.current = processRawMotionData(motionJson as RawMotionData);
          } else {
            motionDataRef.current = motionJson;
          }
          setAnimReady(true);
        }
      } catch (e) {
        console.error('Failed to load animation data:', e);
      }
    })();

    // クリーンアップ
    return () => {
      motionDataRef.current = null;
      segmentsDataRef.current = null;
      boneHierarchyRef.current = [];
      setAnimPlaying(false);
      setAnimReady(false);
    };
  }, [charKey, selectedMotion]);

  // ブレンド用モーションBの読み込み
  useEffect(() => {
    if (!selectedMotionB || CHARACTERS[charKey]?.category !== 'base') {
      motionDataBRef.current = null;
      return;
    }
    (async () => {
      try {
        const resp = await fetch(`${GAME_ASSETS_API}/motion/${selectedMotionB}${CACHE_BUST}`);
        if (resp.ok) {
          const json = await resp.json();
          // 生フォーマットの場合は変換
          motionDataBRef.current = json.format === 'blender_raw'
            ? processRawMotionData(json as RawMotionData) : json;
        }
      } catch (e) {
        console.error('Failed to load Motion B:', e);
      }
    })();
    return () => { motionDataBRef.current = null; };
  }, [charKey, selectedMotionB]);

  // Note: レストポーズ頂点の保存は削除済み — アニメーションにはfreezeWorldMatrixを使用（頂点単位の変換なし）

  // アニメーションループ — requestAnimationFrameとフレームレート制限、React状態更新なし
  useEffect(() => {
    if (!animPlaying) return;  // 再生中でなければスキップ
    const motion = motionDataRef.current;
    if (!motion) return;

    let frameCounter = animFrameRef.current;  // フレームカウンター
    const motionB = motionDataBRef.current;
    const frameDuration = 1000 / (motion.fps || 30);  // 1フレームの時間（ミリ秒）
    const blendFrames = blendDuration;
    // 合計フレーム: モーションA全体 + ブレンド遷移 + モーションB全体（B存在時）
    const totalFramesA = motion.frame_count;
    const totalFrames = motionB
      ? totalFramesA + motionB.frame_count
      : totalFramesA;

    // ボーン名マッピングの構築（セグメント名→モーションボーン名）
    const allBoneSets = [new Set(Object.keys(motion.bones))];
    if (motionB) allBoneSets.push(new Set(Object.keys(motionB.bones)));
    const boneNameMap: Record<string, string> = {};
    // メッシュキーからモーションボーン名を解決
    for (const segKey of Object.keys(meshesRef.current)) {
      for (const boneSet of allBoneSets) {
        const resolved = resolveMotionBoneName(segKey, boneSet);
        if (resolved) { boneNameMap[segKey] = resolved; break; }
      }
    }
    // ボーン階層エントリからもモーションボーン名を解決
    for (const entry of boneHierarchyRef.current) {
      if (!boneNameMap[entry.bone]) {
        for (const boneSet of allBoneSets) {
          const resolved = resolveMotionBoneName(entry.bone, boneSet);
          if (resolved) { boneNameMap[entry.bone] = resolved; break; }
        }
      }
    }
    let lastTime = 0;
    let rafId = 0;

    // 行列配列→Babylon.js Matrixへの変換関数
    // babylonFormat: 既にBabylon規約、直接使用
    // レガシーフォーマット: Blender行優先、転置が必要
    const isBabylon = motion.babylonFormat === true;
    const toMatrix = (m: number[]) => isBabylon
      ? Matrix.FromArray(m)
      : Matrix.FromArray([
          m[0], m[4], m[8],  m[12],
          m[1], m[5], m[9],  m[13],
          m[2], m[6], m[10], m[14],
          m[3], m[7], m[11], m[15],
        ]);

    // アニメーションティック関数（requestAnimationFrameコールバック）
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const elapsed = now - lastTime;
      if (elapsed < frameDuration) return;  // フレーム時間未満なら描画をスキップ
      lastTime = now - (elapsed % frameDuration);

      frameCounter = (frameCounter + 1) % totalFrames;  // フレームカウンターを進める（ループ）
      animFrameRef.current = frameCounter;

      // サンプルするモーションとブレンド比率の決定
      let frameA = -1, frameB = -1, blendT = 0;
      if (!motionB) {
        frameA = frameCounter;  // 単一モーション: Aをループ
      } else if (frameCounter < totalFramesA - blendFrames) {
        frameA = frameCounter;  // 純粋なモーションA
      } else if (frameCounter < totalFramesA) {
        // A→Bのクロスフェード区間
        frameA = frameCounter;
        frameB = frameCounter - (totalFramesA - blendFrames);
        blendT = (frameCounter - (totalFramesA - blendFrames)) / blendFrames;
      } else {
        frameB = frameCounter - totalFramesA + blendFrames;  // 純粋なモーションB
      }

      // フレーム表示をDOM直接操作で更新（React再レンダリングを回避）
      if (frameDisplayRef.current) {
        const phase = blendT > 0 ? ` [blend ${Math.round(blendT*100)}%]` : (frameB >= 0 && frameA < 0 ? ' [B]' : '');
        frameDisplayRef.current.textContent = `Frame: ${frameCounter}/${totalFrames}${phase}`;
      }

      // ボクセル→バインドポーズのオフセット補正（babylonFormat/blender_raw処理済み行列のみ）
      const segData = segmentsDataRef.current;
      let ox = 0, oy = 0, oz = 0;
      if (isBabylon && segData?.bb_min) {
        const g = segData.grid, sc = segData.voxel_size;
        ox = -(g.gx / 2) * sc - segData.bb_min[0];  // Xオフセット
        oy = -segData.bb_min[2];                       // Yオフセット
        oz = (g.gy / 2) * sc + segData.bb_min[1];     // Zオフセット
      }
      const hasOffset = isBabylon && (Math.abs(ox) > 0.001 || Math.abs(oy) > 0.001 || Math.abs(oz) > 0.001);

      // Babylon形式のスキン行列にボクセル-バインドオフセット補正を適用する関数
      const correctMatrix = (m: number[]): number[] => {
        if (!hasOffset) return m;
        const c = m.slice();  // コピーを作成
        // 平行移動成分を補正
        c[12] = m[12] - (ox * m[0] + oy * m[4] + oz * m[8]) + ox;
        c[13] = m[13] - (ox * m[1] + oy * m[5] + oz * m[9]) + oy;
        c[14] = m[14] - (ox * m[2] + oy * m[6] + oz * m[10]) + oz;
        return c;
      };

      // 現在のフレームでのブレンド済み行列を取得する関数
      const getBlendedRaw = (boneName: string): number[] | undefined => {
        const motionName = boneNameMap[boneName] || boneName;
        let matA: number[] | undefined;
        let matBm: number[] | undefined;
        // モーションAのフレーム行列を取得
        if (frameA >= 0) {
          const d = motion.bones[motionName];
          if (d) matA = d.matrices[Math.min(frameA, d.matrices.length - 1)];
        }
        // モーションBのフレーム行列を取得
        if (frameB >= 0 && motionB) {
          const d = motionB.bones[motionName];
          if (d) matBm = d.matrices[Math.min(frameB, d.matrices.length - 1)];
        }
        // 両方存在しブレンド中なら線形補間
        if (matA && matBm && blendT > 0) {
          return matA.map((v, i) => v * (1 - blendT) + matBm[i] * blendT);
        }
        return matA || matBm;  // 片方のみならそちらを返す
      };

      // ジョイント補正カスケード（ルート→リーフ順にオフセット補正済み行列を適用）
      const hierarchy = boneHierarchyRef.current;
      const applyPoint = isBabylon ? applyMatPointBabylon : applyMatPointBlender;
      const correctedMats: Record<string, number[]> = {};
      if (hierarchy.length > 0) {
        for (const entry of hierarchy) {
          const blendedRaw = getBlendedRaw(entry.bone);
          let raw: number[] | undefined;
          if (blendedRaw) {
            raw = correctMatrix(blendedRaw);  // オフセット補正を適用
          } else if (entry.parent && correctedMats[entry.parent]) {
            raw = correctedMats[entry.parent];  // 親の行列を継承
          }
          if (!raw) continue;
          if (!entry.parent || !correctedMats[entry.parent]) {
            correctedMats[entry.bone] = raw;  // ルートボーンはそのまま
          } else {
            // 親子間のジョイント補正: ジョイントポイントでの位置ずれを解消
            const parentMat = correctedMats[entry.parent];
            const jp = entry.jointPoint;
            const pByParent = applyPoint(parentMat, jp);  // 親行列でジョイントポイントを変換
            const pByChild = applyPoint(raw, jp);          // 子行列でジョイントポイントを変換
            const corrected = raw.slice();
            // 平行移動成分を補正して位置ずれを解消
            corrected[12] += pByParent[0] - pByChild[0];
            corrected[13] += pByParent[1] - pByChild[1];
            corrected[14] += pByParent[2] - pByChild[2];
            correctedMats[entry.bone] = corrected;
          }
        }
      }

      // 行列をメッシュに適用
      for (const [segKey, mesh] of Object.entries(meshesRef.current)) {
        let skinMat: Matrix | null = null;
        const jointBones = jointBonesRef.current[segKey];
        if (jointBones) {
          // ジョイントボーンの場合: 2つのボーン行列を平均
          const [boneJA, boneJB] = jointBones;
          const matJA = correctedMats[boneJA] || getBlendedRaw(boneJA);
          const matJB = correctedMats[boneJB] || getBlendedRaw(boneJB);
          if (matJA && matJB) {
            const blended = matJA.map((v: number, i: number) => (v + matJB[i]) / 2);
            skinMat = toMatrix(blended);
          } else if (matJA) {
            skinMat = toMatrix(matJA);
          } else if (matJB) {
            skinMat = toMatrix(matJB);
          }
        } else {
          // 通常のボーン: 補正済みまたはブレンド済み行列を使用
          const mat = correctedMats[segKey] || getBlendedRaw(segKey);
          if (!mat) continue;
          skinMat = toMatrix(mat);
        }
        if (!skinMat) continue;
        mesh.freezeWorldMatrix(skinMat);  // ワールド行列をフリーズ（パフォーマンス最適化）
      }
    };

    rafId = requestAnimationFrame(tick);  // アニメーションループ開始
    return () => cancelAnimationFrame(rafId);  // クリーンアップ
  }, [animPlaying]);

  // JSXレンダリング
  return (
    // 全画面フレックスレイアウト（サイドパネル＋3Dキャンバス）
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#101018', display: 'flex' }}>
      {/* サイドパネル */}
      <div style={{
        width: 280, minWidth: 280, padding: '14px 16px', overflowY: 'auto',
        background: 'rgba(0,0,0,0.55)', color: '#ddd', fontFamily: 'monospace', fontSize: 12,
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* タイトル */}
        <h2 style={{ margin: '0 0 6px', fontSize: 16, color: '#fff' }}>
          Realistic Viewer
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#888' }}>
          Original proportions - no deformation
        </p>

        <CharacterSelectorTmp
          characters={CHARACTERS}
          selectedCategory={selectedCategory}
          charKey={charKey}
          onCategoryChange={(cat, firstKey) => { setSelectedCategory(cat); setCharKey(firstKey); }}
          onCharChange={setCharKey}
        />

        {/* アニメーションコントロール（ベースボディのみ表示） */}
        {CHARACTERS[charKey]?.category === 'base' && !loading && animReady && (
          <AnimationControlTmp
            selectedMotion={selectedMotion}
            selectedMotionB={selectedMotionB}
            blendDuration={blendDuration}
            animPlaying={animPlaying}
            animFrameRef={animFrameRef}
            frameDisplayRef={frameDisplayRef}
            frameCount={motionDataRef.current?.frame_count || 0}
            onMotionChange={(val) => { setAnimPlaying(false); setSelectedMotion(val); }}
            onMotionBChange={(val) => { setAnimPlaying(false); setSelectedMotionB(val); }}
            onBlendDurationChange={setBlendDuration}
            onTogglePlay={() => setAnimPlaying(!animPlaying)}
          />
        )}

        {/* ローディング表示 */}
        {loading && (
          <div style={{ color: '#8af', fontSize: 13, padding: '20px 0' }}>
            Loading parts...
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ color: '#f88', fontSize: 12, padding: '10px', background: 'rgba(200,50,50,0.15)', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {/* 読み込み完了後の操作パネル */}
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
              onTogglePart={togglePart}
              onToggleAll={toggleAll}
              onToggleCategory={toggleCategory}
            />
          </>
        )}

        {/* 操作ガイド */}
        <div style={{
          marginTop: 20, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          opacity: 0.4, fontSize: 10, lineHeight: 1.6,
        }}>
          Drag to rotate / Scroll to zoom / Right-drag to pan
        </div>
      </div>

      {/* 3Dキャンバス（フレックスで残り全幅を使用） */}
      <canvas ref={canvasRef} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}
