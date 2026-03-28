'use client'; // クライアントサイドレンダリングを有効化

// Reactフック群をインポート
import { useEffect, useRef, useState, useCallback } from 'react';
// Babylon.jsの3D関連クラス群をインポート
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color3, Color4, Mesh, MeshBuilder, StandardMaterial,
  VertexData, Effect, ShaderMaterial,
} from '@babylonjs/core';

// ========================================================================
// 型定義
// ========================================================================
// 色付きボクセルのエントリ
interface VoxelEntry { x: number; y: number; z: number; r: number; g: number; b: number; }

// ボディ領域の定義
interface RegionDef {
  label: string;                      // 英語ラベル
  labelJa: string;                    // 日本語ラベル
  color: [number, number, number];    // 表示色(0-1)
  zMin: number; zMax: number;         // Z方向の範囲
  xMin: number; xMax: number;         // X方向の範囲
}

// テンプレート情報
interface TemplateInfo {
  key: string;                        // テンプレートキー
  label: string;                      // 英語ラベル
  labelJa: string;                    // 日本語ラベル
  regions: string[];                  // 含まれる領域キー
  color: [number, number, number];    // テンプレート色(0-1)
}

// 保存済みテンプレート情報
interface SavedTemplate {
  name: string;     // テンプレート名
  size: number;     // ファイルサイズ
  modified: string; // 更新日時
}

// ========================================================================
// 定数
// ========================================================================
// ボディVOXファイルのURL
const BODY_VOX_URL = '/box2/cyberpunk_elf_body_base.vox';
// ボクセルのワールド空間スケール
const VSCALE = 0.01;

// デフォルトのボディ領域定義（Z/X境界でボディを部位に分割）
const DEFAULT_REGIONS: Record<string, RegionDef> = {
  head:     { label: 'Head',      labelJa: '頭部',   color: [1.0, 0.4, 0.4], zMin: 79, zMax: 999, xMin: 0, xMax: 999 },
  torso:    { label: 'Torso',     labelJa: '胴体',   color: [0.4, 0.7, 1.0], zMin: 35, zMax: 79,  xMin: 28, xMax: 54 },
  leftArm:  { label: 'Left Arm',  labelJa: '左腕',   color: [0.4, 1.0, 0.5], zMin: 35, zMax: 79,  xMin: 0,  xMax: 28 },
  rightArm: { label: 'Right Arm', labelJa: '右腕',   color: [0.3, 0.9, 0.4], zMin: 35, zMax: 79,  xMin: 54, xMax: 999 },
  leftLeg:  { label: 'Left Leg',  labelJa: '左脚',   color: [1.0, 0.8, 0.3], zMin: 0,  zMax: 35,  xMin: 0,  xMax: 41 },
  rightLeg: { label: 'Right Leg', labelJa: '右脚',   color: [0.9, 0.7, 0.2], zMin: 0,  zMax: 35,  xMin: 41, xMax: 999 },
};

// テンプレート定義（どの領域を含むか）
const TEMPLATES: TemplateInfo[] = [
  { key: 'hair_cap',        label: 'Hair Cap',        labelJa: 'ヘアキャップ',   regions: ['head'],     color: [0.8, 0.5, 0.2] },
  { key: 'shirt_shell',     label: 'Shirt Shell',     labelJa: '上半身シェル',   regions: ['torso', 'leftArm', 'rightArm'], color: [0.3, 0.5, 0.9] },
  { key: 'pants_shell',     label: 'Pants Shell',     labelJa: '下半身シェル',   regions: ['leftLeg', 'rightLeg'], color: [0.3, 0.8, 0.5] },
  { key: 'boots_shell',     label: 'Boots Shell',     labelJa: '足元シェル',     regions: [],           color: [0.6, 0.4, 0.2] },
  { key: 'gloves_shell',    label: 'Gloves Shell',    labelJa: '手シェル',       regions: [],           color: [0.7, 0.5, 0.3] },
  { key: 'full_body_shell', label: 'Full Body Shell', labelJa: '全身シェル',     regions: ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'], color: [0.5, 0.3, 0.7] },
];

// ブーツ/グローブ用の特殊領域（標準領域に基づかない）
const BOOTS_REGION = { zMin: 0, zMax: 12, xMin: 0, xMax: 999 };       // 足元
const GLOVES_REGIONS = [
  { zMin: 55, zMax: 70, xMin: 0, xMax: 20 },   // 左手
  { zMin: 55, zMax: 70, xMin: 65, xMax: 999 },  // 右手
];
const PANTS_HIP = { zMin: 35, zMax: 50, xMin: 0, xMax: 999 };         // ヒップ領域

// ========================================================================
// ブラウザ版VOXパーサー
// ========================================================================
function parseVoxBrowser(buf: ArrayBuffer) {
  const view = new DataView(buf);
  let off = 0;
  const r32 = () => { const v = view.getUint32(off, true); off += 4; return v; };
  const r8 = () => { const v = view.getUint8(off); off += 1; return v; };
  const rStr = (n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(off + i)); off += n; return s; };

  if (rStr(4) !== 'VOX ') throw new Error('Invalid VOX');
  r32(); rStr(4);
  const mc = r32(); const mch = r32(); const end = off + mch + mc;
  const voxels: { x: number; y: number; z: number; colorIndex: number }[] = [];
  const palette: { r: number; g: number; b: number }[] = [];
  let sizeX = 0, sizeY = 0, sizeZ = 0;

  while (off < end) {
    const id = rStr(4); const cs = r32(); r32(); const ds = off;
    if (id === 'SIZE') { sizeX = r32(); sizeY = r32(); sizeZ = r32(); }
    else if (id === 'XYZI') { const n = r32(); for (let i = 0; i < n; i++) voxels.push({ x: r8(), y: r8(), z: r8(), colorIndex: r8() }); }
    else if (id === 'RGBA') { for (let i = 0; i < 256; i++) { palette.push({ r: r8() / 255, g: r8() / 255, b: r8() / 255 }); r8(); } }
    off = ds + cs;
  }
  if (palette.length === 0) for (let i = 0; i < 256; i++) palette.push({ r: 0.8, g: 0.8, b: 0.8 });
  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// ========================================================================
// VOXエクスポート（ブラウザ版、Blobとして出力）
// ========================================================================
function exportVoxBlob(voxels: VoxelEntry[], sizeX: number, sizeY: number, sizeZ: number): Blob {
  // カラーマップとパレットを構築
  const cMap = new Map<string, number>(); const pal: { r: number; g: number; b: number }[] = [];
  for (const v of voxels) {
    const k = `${Math.round(v.r * 255)},${Math.round(v.g * 255)},${Math.round(v.b * 255)}`;
    if (!cMap.has(k) && pal.length < 255) { cMap.set(k, pal.length + 1); pal.push({ r: v.r, g: v.g, b: v.b }); }
  }
  const vd = voxels.map(v => ({ x: v.x, y: v.y, z: v.z, ci: cMap.get(`${Math.round(v.r * 255)},${Math.round(v.g * 255)},${Math.round(v.b * 255)}`) ?? 1 }));
  const szC = 12, xyC = 4 + vd.length * 4, rgC = 1024;
  const chSz = (12 + szC) + (12 + xyC) + (12 + rgC);
  const buf = new ArrayBuffer(8 + 12 + chSz); const dv = new DataView(buf); let o = 0;
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  const w32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  const w8 = (v: number) => { dv.setUint8(o, v); o += 1; };
  ws('VOX '); w32(200); ws('MAIN'); w32(0); w32(chSz);
  ws('SIZE'); w32(szC); w32(0); w32(sizeX); w32(sizeY); w32(sizeZ);
  ws('XYZI'); w32(xyC); w32(0); w32(vd.length);
  for (const v of vd) { w8(v.x); w8(v.y); w8(v.z); w8(v.ci); }
  ws('RGBA'); w32(rgC); w32(0);
  for (let i = 0; i < 256; i++) { const c = pal[i] ?? { r: 0, g: 0, b: 0 }; w8(Math.round(c.r * 255)); w8(Math.round(c.g * 255)); w8(Math.round(c.b * 255)); w8(255); }
  return new Blob([buf], { type: 'application/octet-stream' });
}

// ========================================================================
// ボクセル処理ユーティリティ
// ========================================================================
// 6方向の隣接オフセット
const NEIGHBORS_6: [number, number, number][] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// ボクセル座標の占有セットを構築
function buildOccSet(voxels: { x: number; y: number; z: number }[]): Set<string> {
  const s = new Set<string>();
  for (const v of voxels) s.add(`${v.x},${v.y},${v.z}`);
  return s;
}

// 表面ボクセルを検出（空き隣接を持つボクセル）
function findSurface(voxels: { x: number; y: number; z: number }[], occ: Set<string>) {
  return voxels.filter(v => NEIGHBORS_6.some(([dx, dy, dz]) => !occ.has(`${v.x + dx},${v.y + dy},${v.z + dz}`)));
}

// 領域でボクセルをフィルタリング
function filterRegion<T extends { x: number; z: number }>(voxels: T[], reg: { zMin: number; zMax: number; xMin: number; xMax: number }): T[] {
  return voxels.filter(v => v.z >= reg.zMin && v.z < reg.zMax && v.x >= reg.xMin && v.x < reg.xMax);
}

// 表面ボクセルから外側にシェルを生成（BFS拡張）
function generateShell(
  surfaceVoxels: { x: number; y: number; z: number }[],
  bodyOcc: Set<string>, offset: number,
  sizeX: number, sizeY: number, sizeZ: number,
  color: [number, number, number],
): VoxelEntry[] {
  const shellSet = new Set<string>();
  let frontier: { x: number; y: number; z: number }[] = [];
  // 表面の空き隣接からスタート
  for (const v of surfaceVoxels) {
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const nx = v.x + dx, ny = v.y + dy, nz = v.z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
      const key = `${nx},${ny},${nz}`;
      if (!bodyOcc.has(key) && !shellSet.has(key)) {
        shellSet.add(key); frontier.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  // BFSでoffsetボクセル分拡張
  for (let d = 2; d <= offset; d++) {
    const next: { x: number; y: number; z: number }[] = [];
    for (const f of frontier) {
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = f.x + dx, ny = f.y + dy, nz = f.z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
        const key = `${nx},${ny},${nz}`;
        if (!bodyOcc.has(key) && !shellSet.has(key)) { shellSet.add(key); next.push({ x: nx, y: ny, z: nz }); }
      }
    }
    frontier = next;
  }
  return Array.from(shellSet).map(k => {
    const [x, y, z] = k.split(',').map(Number);
    return { x, y, z, r: color[0], g: color[1], b: color[2] };
  });
}

// ヘアキャップ生成（頭部ボクセルの球殻）
function generateHairCap(
  headVoxels: { x: number; y: number; z: number }[],
  bodyOcc: Set<string>,
  sizeX: number, sizeY: number, sizeZ: number,
  color: [number, number, number],
): VoxelEntry[] {
  if (headVoxels.length === 0) return [];
  // 頭部の重心と最大半径を計算
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const v of headVoxels) { sumX += v.x; sumY += v.y; sumZ += v.z; }
  const n = headVoxels.length;
  const cx = sumX / n, cy = sumY / n, cz = sumZ / n;
  let maxR = 0;
  for (const v of headVoxels) {
    const r = Math.sqrt((v.x - cx) ** 2 + (v.y - cy) ** 2 + (v.z - cz) ** 2);
    if (r > maxR) maxR = r;
  }
  // 球殻を生成
  const innerR = maxR + 0.5, outerR = maxR + 3.5;
  const result: VoxelEntry[] = [];
  const mnX = Math.max(0, Math.floor(cx - outerR)), mxX = Math.min(sizeX - 1, Math.ceil(cx + outerR));
  const mnY = Math.max(0, Math.floor(cy - outerR)), mxY = Math.min(sizeY - 1, Math.ceil(cy + outerR));
  const mnZ = Math.max(0, Math.floor(cz - 2)), mxZ = Math.min(sizeZ - 1, Math.ceil(cz + outerR));
  for (let x = mnX; x <= mxX; x++) {
    for (let y = mnY; y <= mxY; y++) {
      for (let z = mnZ; z <= mxZ; z++) {
        const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2);
        if (r >= innerR && r <= outerR && !bodyOcc.has(`${x},${y},${z}`)) {
          result.push({ x, y, z, r: color[0], g: color[1], b: color[2] });
        }
      }
    }
  }
  return result;
}

// ========================================================================
// Unlitボクセルメッシュビルダー
// ========================================================================
const FACE_DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_VERTS = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]],
];
const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

let shaderIdx = 0;
// Unlitシェーダーマテリアルを作成（頂点カラーのみで描画）
function createUnlit(scene: Scene): ShaderMaterial {
  const id = `tmplUnlit_${shaderIdx++}`;
  Effect.ShadersStore[id + 'VertexShader'] = `precision highp float;attribute vec3 position;attribute vec4 color;uniform mat4 worldViewProjection;varying vec4 vColor;void main(){gl_Position=worldViewProjection*vec4(position,1.0);vColor=color;}`;
  Effect.ShadersStore[id + 'FragmentShader'] = `precision highp float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;
  const mat = new ShaderMaterial(id, scene, { vertex: id, fragment: id }, { attributes: ['position', 'color'], uniforms: ['worldViewProjection'] });
  mat.backFaceCulling = false;
  return mat;
}

// ボクセルメッシュを構築
function buildVoxelMesh(voxels: VoxelEntry[], scene: Scene, name: string, cx: number, cy: number): Mesh {
  const occ = new Set<string>();
  for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], idx: number[] = [];
  for (const vx of voxels) {
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occ.has(`${vx.x + dx},${vx.y + dy},${vx.z + dz}`)) continue;
      const bi = pos.length / 3;
      const fv = FACE_VERTS[f], fn = FACE_NORMALS[f];
      for (let vi = 0; vi < 4; vi++) {
        pos.push((vx.x + fv[vi][0] - cx) * VSCALE, (vx.z + fv[vi][2]) * VSCALE, -(vx.y + fv[vi][1] - cy) * VSCALE);
        nrm.push(fn[0], fn[2], -fn[1]);
        col.push(vx.r, vx.g, vx.b, 1);
      }
      idx.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
  }
  const vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.colors = col; vd.indices = idx;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  m.material = createUnlit(scene);
  return m;
}

// ========================================================================
// テンプレートエディタページコンポーネント
// ========================================================================
export default function TemplateEditorPage() {
  // Ref定義
  const canvasRef = useRef<HTMLCanvasElement>(null);       // キャンバス要素
  const sceneRef = useRef<Scene | null>(null);              // Babylon.jsシーン
  const engineRef = useRef<Engine | null>(null);            // レンダリングエンジン
  const bodyMeshRef = useRef<Mesh | null>(null);            // ボディメッシュ
  const templateMeshRef = useRef<Mesh | null>(null);        // テンプレートメッシュ

  // State定義
  const [initialized, setInitialized] = useState(false);           // 初期化完了フラグ
  const [bodyLoaded, setBodyLoaded] = useState(false);             // ボディ読み込み完了
  const [bodyInfo, setBodyInfo] = useState('');                     // ボディ情報テキスト
  const [regions, setRegions] = useState(DEFAULT_REGIONS);         // 領域定義
  const [shellOffset, setShellOffset] = useState(2);               // シェルオフセット
  const [showBody, setShowBody] = useState(true);                  // ボディ表示
  const [showRegionColors, setShowRegionColors] = useState(true);  // 領域色表示
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);  // 選択中テンプレート
  const [generating, setGenerating] = useState(false);             // 生成中フラグ
  const [generatedTemplates, setGeneratedTemplates] = useState<Record<string, VoxelEntry[]>>({});  // 生成済みテンプレート
  const [savedFiles, setSavedFiles] = useState<SavedTemplate[]>([]); // サーバー保存済みファイル
  const [status, setStatus] = useState('');                        // ステータスメッセージ

  // ボディデータRef（リレンダリング回避）
  const bodyDataRef = useRef<{
    voxels: { x: number; y: number; z: number; colorIndex: number }[];
    palette: { r: number; g: number; b: number }[];
    sizeX: number; sizeY: number; sizeZ: number;
  } | null>(null);

  // エンジン初期化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.12, 1);
    // グラウンドグリッド
    const ground = MeshBuilder.CreateGround('ground', { width: 6, height: 6 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25); gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat; ground.isPickable = false;
    // カメラ
    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 3, new Vector3(0, 0.5, 0), scene);
    camera.attachControl(canvas, true); camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = 15; camera.wheelPrecision = 50;
    // ライト
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.7; hemi.groundColor = new Color3(0.1, 0.1, 0.15);
    sceneRef.current = scene; engineRef.current = engine; setInitialized(true);
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // 初期化後にボディ読み込み
  useEffect(() => {
    if (!initialized) return;
    loadBody();
    loadSavedFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // サーバーの保存済みテンプレートを取得
  const loadSavedFiles = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setSavedFiles(data.files ?? []);
    } catch { /* エラーは無視 */ }
  };

  // ボディVOXを読み込み
  const loadBody = async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    setStatus('Loading EC body...');
    try {
      const resp = await fetch(BODY_VOX_URL + `?v=${Date.now()}`);
      if (!resp.ok) throw new Error(`Failed to load body: ${resp.status}`);
      const parsed = parseVoxBrowser(await resp.arrayBuffer());
      bodyDataRef.current = parsed;
      setBodyInfo(`${parsed.sizeX}x${parsed.sizeY}x${parsed.sizeZ} (${parsed.voxels.length} voxels)`);
      rebuildBodyMesh(scene, parsed, regions, showRegionColors);
      setBodyLoaded(true);
      setStatus('Body loaded');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ボディメッシュを再構築（領域色 or 元色で着色）
  const rebuildBodyMesh = useCallback((
    scene: Scene,
    data: NonNullable<typeof bodyDataRef.current>,
    regs: Record<string, RegionDef>,
    colorByRegion: boolean,
  ) => {
    if (bodyMeshRef.current) { bodyMeshRef.current.dispose(); bodyMeshRef.current = null; }
    const cx = data.sizeX / 2, cy = data.sizeY / 2;
    const colored: VoxelEntry[] = data.voxels.map(v => {
      const pal = data.palette[v.colorIndex - 1] ?? { r: 0.6, g: 0.6, b: 0.6 };
      if (!colorByRegion) return { x: v.x, y: v.y, z: v.z, r: pal.r, g: pal.g, b: pal.b };
      for (const reg of Object.values(regs)) {
        if (v.z >= reg.zMin && v.z < reg.zMax && v.x >= reg.xMin && v.x < reg.xMax) {
          return { x: v.x, y: v.y, z: v.z, r: reg.color[0] * 0.6, g: reg.color[1] * 0.6, b: reg.color[2] * 0.6 };
        }
      }
      return { x: v.x, y: v.y, z: v.z, r: 0.3, g: 0.3, b: 0.3 };
    });
    bodyMeshRef.current = buildVoxelMesh(colored, scene, 'body', cx, cy);
  }, []);

  // 領域色/表示設定変更時にメッシュ再構築
  useEffect(() => {
    const scene = sceneRef.current;
    const data = bodyDataRef.current;
    if (!scene || !data || !bodyLoaded) return;
    rebuildBodyMesh(scene, data, regions, showRegionColors);
    if (bodyMeshRef.current) bodyMeshRef.current.isVisible = showBody;
  }, [showRegionColors, showBody, regions, bodyLoaded, rebuildBodyMesh]);

  // ボディ表示切替
  useEffect(() => {
    if (bodyMeshRef.current) bodyMeshRef.current.isVisible = showBody;
  }, [showBody]);

  // 単一テンプレートを生成
  const generateTemplate = useCallback((tmplKey: string) => {
    const data = bodyDataRef.current;
    if (!data) return;
    setGenerating(true);
    setStatus(`Generating ${tmplKey}...`);
    // UIの更新を許可するためsetTimeoutを使用
    setTimeout(() => {
      const bodyOcc = buildOccSet(data.voxels);
      const surface = findSurface(data.voxels, bodyOcc);
      const tmpl = TEMPLATES.find(t => t.key === tmplKey)!;
      let result: VoxelEntry[] = [];
      // テンプレートタイプに応じた生成ロジック
      if (tmplKey === 'hair_cap') {
        const headVoxels = filterRegion(data.voxels, regions.head);
        result = generateHairCap(headVoxels, bodyOcc, data.sizeX, data.sizeY, data.sizeZ, tmpl.color);
      } else if (tmplKey === 'boots_shell') {
        const feetSurface = filterRegion(surface, BOOTS_REGION);
        result = generateShell(feetSurface, bodyOcc, shellOffset, data.sizeX, data.sizeY, data.sizeZ, tmpl.color);
      } else if (tmplKey === 'gloves_shell') {
        const handSurface = GLOVES_REGIONS.flatMap(reg => filterRegion(surface, reg));
        result = generateShell(handSurface, bodyOcc, shellOffset, data.sizeX, data.sizeY, data.sizeZ, tmpl.color);
      } else if (tmplKey === 'pants_shell') {
        const regSurface = tmpl.regions.flatMap(rk => filterRegion(surface, regions[rk]));
        const hipSurface = filterRegion(surface, PANTS_HIP);
        result = generateShell([...regSurface, ...hipSurface], bodyOcc, shellOffset, data.sizeX, data.sizeY, data.sizeZ, tmpl.color);
      } else {
        const regSurface = tmpl.regions.flatMap(rk => filterRegion(surface, regions[rk]));
        result = generateShell(regSurface, bodyOcc, shellOffset, data.sizeX, data.sizeY, data.sizeZ, tmpl.color);
      }
      setGeneratedTemplates(prev => ({ ...prev, [tmplKey]: result }));
      setStatus(`${tmplKey}: ${result.length} voxels`);
      setGenerating(false);
      showTemplatePreview(tmplKey, result);
    }, 20);
  }, [regions, shellOffset, rebuildBodyMesh]);

  // 全テンプレートを一括生成
  const generateAll = useCallback(async () => {
    for (const tmpl of TEMPLATES) {
      generateTemplate(tmpl.key);
      await new Promise(r => setTimeout(r, 50));
    }
  }, [generateTemplate]);

  // テンプレートの3Dプレビューを表示
  const showTemplatePreview = (key: string, voxels: VoxelEntry[]) => {
    const scene = sceneRef.current;
    const data = bodyDataRef.current;
    if (!scene || !data) return;
    if (templateMeshRef.current) { templateMeshRef.current.dispose(); templateMeshRef.current = null; }
    if (voxels.length === 0) return;
    const cx = data.sizeX / 2, cy = data.sizeY / 2;
    templateMeshRef.current = buildVoxelMesh(voxels, scene, `tmpl_${key}`, cx, cy);
    setSelectedTemplate(key);
  };

  // テンプレートを.voxファイルとしてダウンロード
  const downloadTemplate = (key: string) => {
    const voxels = generatedTemplates[key];
    const data = bodyDataRef.current;
    if (!voxels?.length || !data) return;
    const blob = exportVoxBlob(voxels, data.sizeX, data.sizeY, data.sizeZ);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${key}.vox`; a.click();
  };

  // テンプレートをサーバーに保存
  const saveTemplate = async (key: string) => {
    const voxels = generatedTemplates[key];
    const data = bodyDataRef.current;
    if (!voxels?.length || !data) return;
    setStatus(`Saving ${key}...`);
    const blob = exportVoxBlob(voxels, data.sizeX, data.sizeY, data.sizeZ);
    const formData = new FormData();
    formData.append('name', key);
    formData.append('file', blob, `${key}.vox`);
    try {
      const res = await fetch('/api/templates', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.ok) { setStatus(`Saved ${key} (${json.size} bytes)`); loadSavedFiles(); }
      else { setStatus(`Error: ${json.error}`); }
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 全生成済みテンプレートを一括保存
  const saveAll = async () => {
    for (const key of Object.keys(generatedTemplates)) {
      await saveTemplate(key);
    }
  };

  // 領域スライダー変更ハンドラー
  const updateRegion = (key: string, field: keyof RegionDef, value: number) => {
    setRegions(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  return (
    // ルートコンテナ: 横並びフレックスレイアウト
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* 左パネル: コントロールUI */}
      <div style={{ width: 400, minWidth: 400, background: '#0f0f23', color: '#ccc', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ヘッダー */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>Template Editor</div>
          <div style={{ fontSize: 11, color: '#888' }}>EC Body base: {bodyInfo || 'loading...'}</div>
        </div>

        {/* 表示オプション */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', gap: 12 }}>
          <label style={{ fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={showBody} onChange={e => setShowBody(e.target.checked)} /> Body
          </label>
          <label style={{ fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={showRegionColors} onChange={e => setShowRegionColors(e.target.checked)} /> Region Colors
          </label>
        </div>

        {/* シェルオフセットスライダー */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span>Shell Offset</span>
            <input type="range" min="1" max="5" step="1" value={shellOffset}
              onChange={e => setShellOffset(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ color: '#8cf', minWidth: 20 }}>{shellOffset}</span>
          </div>
        </div>

        {/* スクロール可能な設定エリア */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* 領域設定（Z/X境界のスライダー） */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Body Regions (Z/X boundaries)</div>
            {Object.entries(regions).map(([key, reg]) => (
              <div key={key} style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 4, background: `rgba(${reg.color.map(c => Math.round(c * 255)).join(',')}, 0.1)`, border: `1px solid rgba(${reg.color.map(c => Math.round(c * 255)).join(',')}, 0.3)` }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: `rgb(${reg.color.map(c => Math.round(c * 255)).join(',')})`, marginBottom: 4 }}>
                  {reg.labelJa} ({reg.label})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 30px', gap: '2px', alignItems: 'center', fontSize: 10 }}>
                  <span>Z min</span>
                  <input type="range" min="0" max="120" value={reg.zMin} onChange={e => updateRegion(key, 'zMin', Number(e.target.value))} />
                  <span style={{ color: '#8cf' }}>{reg.zMin}</span>
                  <span>Z max</span>
                  <input type="range" min="0" max="999" value={Math.min(reg.zMax, 120)} onChange={e => updateRegion(key, 'zMax', Number(e.target.value))} />
                  <span style={{ color: '#8cf' }}>{reg.zMax > 200 ? 'max' : reg.zMax}</span>
                  <span>X min</span>
                  <input type="range" min="0" max="100" value={reg.xMin} onChange={e => updateRegion(key, 'xMin', Number(e.target.value))} />
                  <span style={{ color: '#8cf' }}>{reg.xMin}</span>
                  <span>X max</span>
                  <input type="range" min="0" max="999" value={Math.min(reg.xMax, 100)} onChange={e => updateRegion(key, 'xMax', Number(e.target.value))} />
                  <span style={{ color: '#8cf' }}>{reg.xMax > 200 ? 'max' : reg.xMax}</span>
                </div>
              </div>
            ))}
          </div>

          {/* テンプレートカード一覧 */}
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Templates</div>
            {TEMPLATES.map(tmpl => {
              const gen = generatedTemplates[tmpl.key];
              const saved = savedFiles.find(f => f.name === tmpl.key);
              const isSelected = selectedTemplate === tmpl.key;
              return (
                <div key={tmpl.key} style={{
                  marginBottom: 6, padding: '8px', borderRadius: 4,
                  background: isSelected ? '#1a2a3a' : '#111',
                  border: `1px solid ${isSelected ? '#48f' : '#2a2a3a'}`,
                }}>
                  {/* テンプレート名とカラーインジケーター */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                      background: `rgb(${tmpl.color.map(c => Math.round(c * 255)).join(',')})` }} />
                    <span style={{ fontSize: 12, fontWeight: 'bold', flex: 1 }}>{tmpl.labelJa}</span>
                    <span style={{ fontSize: 9, color: '#666' }}>{tmpl.label}</span>
                  </div>
                  {/* 生成済みのボクセル数 */}
                  {gen && <div style={{ fontSize: 10, color: '#4c4', marginBottom: 4 }}>{gen.length} voxels</div>}
                  {/* 保存済みのファイルサイズ */}
                  {saved && <div style={{ fontSize: 9, color: '#886', marginBottom: 4 }}>Saved: {(saved.size / 1024).toFixed(1)} KB</div>}
                  {/* アクションボタン */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => generateTemplate(tmpl.key)} disabled={generating || !bodyLoaded}
                      style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#253', color: '#8cf', border: '1px solid #48f', cursor: 'pointer' }}>
                      Generate
                    </button>
                    {gen && (<>
                      <button onClick={() => showTemplatePreview(tmpl.key, gen)}
                        style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#234', color: '#8cf', border: '1px solid #48f', cursor: 'pointer' }}>
                        Preview
                      </button>
                      <button onClick={() => downloadTemplate(tmpl.key)}
                        style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#234', color: '#aaa', border: '1px solid #555', cursor: 'pointer' }}>
                        .vox
                      </button>
                      <button onClick={() => saveTemplate(tmpl.key)}
                        style={{ padding: '3px 8px', fontSize: 10, borderRadius: 3, background: '#342', color: '#ac8', border: '1px solid #584', cursor: 'pointer' }}>
                        Save
                      </button>
                    </>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 下部アクション */}
        <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {status && <div style={{ fontSize: 11, color: '#888' }}>{status}</div>}
          {/* 全テンプレート一括生成ボタン */}
          <button onClick={generateAll} disabled={generating || !bodyLoaded}
            style={{ padding: '10px', borderRadius: 4, background: generating ? '#532' : '#253', color: '#8cf', border: '1px solid #48f', cursor: generating ? 'wait' : 'pointer', fontSize: 14, fontWeight: 'bold' }}>
            {generating ? 'Generating...' : 'Generate All'}
          </button>
          {/* 全テンプレート一括保存ボタン */}
          {Object.keys(generatedTemplates).length > 0 && (
            <button onClick={saveAll}
              style={{ padding: '8px', borderRadius: 4, background: '#342', color: '#ac8', border: '1px solid #584', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              Save All to Server
            </button>
          )}
        </div>
      </div>

      {/* 3Dキャンバス */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
        {!bodyLoaded && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#555', fontSize: 16 }}>
            Loading EC Body...
          </div>
        )}
      </div>
    </div>
  );
}
