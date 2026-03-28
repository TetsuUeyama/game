'use client'; // クライアントサイドレンダリングを有効化

// Reactフック群をインポート
import { useEffect, useRef, useState, useCallback } from 'react';
// Next.jsのルートパラメータ取得フック
import { useParams } from 'next/navigation';
// Next.jsのLinkコンポーネント
import Link from 'next/link';
// Babylon.jsの3D関連クラス群をインポート
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight,
  Vector3, Color4, Mesh, VertexData, ShaderMaterial, Effect,
  MeshBuilder, StandardMaterial, Color3,
} from '@babylonjs/core';
// 共有VOXパーサーとメッシュ定数をインポート
import { loadVoxFile, SCALE, FACE_DIRS, FACE_VERTS, FACE_NORMALS } from '@/lib/vox-parser';
import type { VoxelEntry } from '@/lib/vox-parser';

// ========================================================================
// 型定義
// ========================================================================
// 装備ビヘイビアの種類
type EquipBehavior = 'synced' | 'surface' | 'gravity';

// ビヘイビアデータ（APIとの送受信用）
interface BehaviorData {
  surface: string[];   // 表面維持ボクセルの座標キーリスト
  gravity: string[];   // 重力影響ボクセルの座標キーリスト
}

// パーツマニフェストのエントリ型
interface EquipManifestEntry {
  key: string;          // パーツキー
  file: string;         // VOXファイルパス
  voxels: number;       // ボクセル数
  default_on: boolean;  // デフォルト表示
}

// ビヘイビアタイプごとの表示色（3Dビューア用）
const BEHAVIOR_COLORS: Record<EquipBehavior, { r: number; g: number; b: number }> = {
  synced:  { r: 0.30, g: 0.70, b: 0.40 },  // 緑系
  surface: { r: 0.40, g: 0.55, b: 1.00 },  // 青系
  gravity: { r: 1.00, g: 0.55, b: 0.25 },  // オレンジ系
};

// ビヘイビアタイプの情報（UI表示用）
const BEHAVIOR_INFO: { value: EquipBehavior; label: string; labelJa: string; cssColor: string; shortcut: string }[] = [
  { value: 'synced',  label: 'Synced',  labelJa: 'body同期',  cssColor: '#4a6', shortcut: '1' },
  { value: 'surface', label: 'Surface', labelJa: '表面維持',  cssColor: '#68f', shortcut: '2' },
  { value: 'gravity', label: 'Gravity', labelJa: '重力影響',  cssColor: '#f84', shortcut: '3' },
];

// ツールモードの種類
type ToolMode = 'navigate' | 'paint' | 'box';

// ========================================================================
// Unlitマテリアル作成（頂点カラーのみで描画）
// ========================================================================
function createUnlitMaterial(scene: Scene, name: string): ShaderMaterial {
  // 頂点シェーダー: 位置と色を受け取り、vColorとしてフラグメントシェーダーに渡す
  Effect.ShadersStore[name + 'VertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec4 color;
    uniform mat4 worldViewProjection;
    varying vec4 vColor;
    void main() { gl_Position = worldViewProjection * vec4(position, 1.0); vColor = color; }
  `;
  // フラグメントシェーダー: vColorをそのまま出力
  Effect.ShadersStore[name + 'FragmentShader'] = `
    precision highp float;
    varying vec4 vColor;
    void main() { gl_FragColor = vColor; }
  `;
  const mat = new ShaderMaterial(name, scene, { vertex: name, fragment: name }, {
    attributes: ['position', 'color'], uniforms: ['worldViewProjection'],
  });
  mat.backFaceCulling = false;
  return mat;
}

// ========================================================================
// エディタ用メッシュ構築（ビヘイビア色付き + 面→ボクセルインデックスマッピング）
// ========================================================================
function buildEditorMesh(
  voxels: VoxelEntry[],
  behaviorMap: Map<string, EquipBehavior>,
  scene: Scene,
  cx: number, cy: number,
): { mesh: Mesh; faceToVoxelIdx: number[] } {
  // 占有セット（内部面カリング用）
  const occupied = new Set<string>();
  for (const v of voxels) occupied.add(`${v.x},${v.y},${v.z}`);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const faceToVoxelIdx: number[] = []; // 面インデックス → ボクセル配列インデックス

  for (let vi = 0; vi < voxels.length; vi++) {
    const voxel = voxels[vi];
    const key = `${voxel.x},${voxel.y},${voxel.z}`;
    const behavior = behaviorMap.get(key) ?? 'synced';
    const bc = BEHAVIOR_COLORS[behavior];

    // 色ブレンド: 元の色50% + ビヘイビアティント50%
    const cr = voxel.r * 0.5 + bc.r * 0.5;
    const cg = voxel.g * 0.5 + bc.g * 0.5;
    const cb = voxel.b * 0.5 + bc.b * 0.5;

    // 各面を処理
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      if (occupied.has(`${voxel.x + dx},${voxel.y + dy},${voxel.z + dz}`)) continue;

      const bi = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];
      for (let fvi = 0; fvi < 4; fvi++) {
        positions.push(
          (voxel.x + fv[fvi][0] - cx) * SCALE,
          (voxel.z + fv[fvi][2]) * SCALE,
          -(voxel.y + fv[fvi][1] - cy) * SCALE,
        );
        normals.push(fn[0], fn[2], -fn[1]);
        colors.push(cr, cg, cb, 1);
      }
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
      // 1面 = 2三角形、各三角形が同じボクセルインデックスを指す
      faceToVoxelIdx.push(vi);
      faceToVoxelIdx.push(vi);
    }
  }

  const vd = new VertexData();
  vd.positions = positions; vd.normals = normals; vd.colors = colors; vd.indices = indices;
  const mesh = new Mesh('editor_part', scene);
  vd.applyToMesh(mesh);
  mesh.material = createUnlitMaterial(scene, 'editor_unlit_' + Date.now());
  return { mesh, faceToVoxelIdx };
}

// ========================================================================
// ボクセルビヘイビアエディタページコンポーネント
// ========================================================================
export default function VoxelBehaviorEditorPage() {
  // URLパラメータからパーツキーを取得
  const params = useParams();
  const partKey = params.partKey as string;

  // Refの定義
  const canvasRef = useRef<HTMLCanvasElement>(null);      // キャンバス要素
  const sceneRef = useRef<Scene | null>(null);             // Babylon.jsシーン
  const cameraRef = useRef<ArcRotateCamera | null>(null);  // カメラ
  const meshRef = useRef<Mesh | null>(null);               // エディタメッシュ
  const faceMapRef = useRef<number[]>([]);                 // 面→ボクセルインデックスマップ

  const voxelsRef = useRef<VoxelEntry[]>([]);              // ボクセルデータ
  const behaviorMapRef = useRef<Map<string, EquipBehavior>>(new Map());  // ビヘイビアマップ
  const undoStackRef = useRef<Map<string, EquipBehavior>[]>([]);  // Undoスタック
  const centerRef = useRef({ cx: 0, cy: 0 });             // グリッド中心

  // Stateの定義
  const [partInfo, setPartInfo] = useState<EquipManifestEntry | null>(null);  // パーツ情報
  const [loading, setLoading] = useState(true);            // ローディング状態
  const [error, setError] = useState<string | null>(null); // エラーメッセージ
  const [toolMode, setToolMode] = useState<ToolMode>('navigate');  // 現在のツールモード
  const [paintBehavior, setPaintBehavior] = useState<EquipBehavior>('synced');  // ペイントビヘイビア
  const [stats, setStats] = useState({ synced: 0, surface: 0, gravity: 0 });   // 統計
  const [saving, setSaving] = useState(false);             // 保存中フラグ
  const [dirty, setDirty] = useState(false);               // 未保存変更フラグ
  const [canUndo, setCanUndo] = useState(false);           // Undo可能フラグ
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);  // ホバー情報

  // ボックス選択の状態
  const boxStartRef = useRef<{ x: number; y: number } | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const isPaintingRef = useRef(false);  // ペイント中フラグ

  // ビヘイビア統計を計算
  const computeStats = useCallback(() => {
    const map = behaviorMapRef.current;
    const total = voxelsRef.current.length;
    let surface = 0, gravity = 0;
    for (const b of map.values()) {
      if (b === 'surface') surface++;
      else if (b === 'gravity') gravity++;
    }
    setStats({ synced: total - surface - gravity, surface, gravity });
  }, []);

  // メッシュを再構築
  const rebuildMesh = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || voxelsRef.current.length === 0) return;
    if (meshRef.current) meshRef.current.dispose();
    const { cx, cy } = centerRef.current;
    const { mesh, faceToVoxelIdx } = buildEditorMesh(
      voxelsRef.current, behaviorMapRef.current, scene, cx, cy,
    );
    meshRef.current = mesh;
    faceMapRef.current = faceToVoxelIdx;
    computeStats();
  }, [computeStats]);

  // Undoスタックにプッシュ
  const pushUndo = useCallback(() => {
    undoStackRef.current.push(new Map(behaviorMapRef.current));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  // Undo実行
  const performUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    behaviorMapRef.current = stack.pop()!;
    setCanUndo(stack.length > 0);
    setDirty(true);
    rebuildMesh();
  }, [rebuildMesh]);

  // ボクセルのビヘイビアを設定
  const setVoxelBehavior = useCallback((voxelIdx: number, behavior: EquipBehavior) => {
    const v = voxelsRef.current[voxelIdx];
    if (!v) return;
    const key = `${v.x},${v.y},${v.z}`;
    const current = behaviorMapRef.current.get(key) ?? 'synced';
    if (current === behavior) return;
    if (behavior === 'synced') {
      behaviorMapRef.current.delete(key);  // syncedはデフォルトなので削除
    } else {
      behaviorMapRef.current.set(key, behavior);
    }
    setDirty(true);
  }, []);

  // Babylon.jsシーン初期化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.10, 0.10, 0.16, 1);

    // グラウンドグリッド
    const ground = MeshBuilder.CreateGround('ground', { width: 4, height: 4 }, scene);
    const gMat = new StandardMaterial('gMat', scene);
    gMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    gMat.alpha = 0.3; gMat.wireframe = true;
    ground.material = gMat;
    ground.isPickable = false;

    // カメラ
    const camera = new ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 2.0, new Vector3(0, 0.4, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.3; camera.upperRadiusLimit = 8; camera.wheelPrecision = 80;
    cameraRef.current = camera;

    // ライト
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.5;

    sceneRef.current = scene;
    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => { window.removeEventListener('resize', onResize); engine.dispose(); };
  }, []);

  // データ読み込み
  useEffect(() => {
    if (!sceneRef.current || !partKey) return;
    (async () => {
      try {
        // マニフェストからパーツ情報を取得
        const manifestResp = await fetch(`/box2/cyberpunk_elf_parts.json?v=${Date.now()}`);
        if (!manifestResp.ok) throw new Error('Failed to load manifest');
        const parts: EquipManifestEntry[] = await manifestResp.json();
        const part = parts.find(p => p.key === partKey);
        if (!part) throw new Error(`Part "${partKey}" not found in manifest`);
        setPartInfo(part);

        // ボクセルデータを読み込み
        const { model, voxels } = await loadVoxFile(part.file);
        voxelsRef.current = voxels;
        centerRef.current = { cx: model.sizeX / 2, cy: model.sizeY / 2 };

        // ビヘイビアデータを読み込み
        const behResp = await fetch(`/api/equip-behavior?partKey=${partKey}`);
        if (behResp.ok) {
          const data: BehaviorData = await behResp.json();
          const map = new Map<string, EquipBehavior>();
          for (const k of data.surface ?? []) map.set(k, 'surface');
          for (const k of data.gravity ?? []) map.set(k, 'gravity');
          behaviorMapRef.current = map;
        }

        rebuildMesh();
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
  }, [partKey, rebuildMesh]);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '1') setPaintBehavior('synced');
      else if (e.key === '2') setPaintBehavior('surface');
      else if (e.key === '3') setPaintBehavior('gravity');
      else if (e.key === 'q' || e.key === 'Q') setToolMode('navigate');
      else if (e.key === 'w' || e.key === 'W') setToolMode('paint');
      else if (e.key === 'e' || e.key === 'E') setToolMode('box');
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); performUndo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo]);

  // ツールモードに応じたカメラコントロール切替
  useEffect(() => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;
    if (toolMode === 'navigate') {
      camera.attachControl(canvas, true);
    } else {
      camera.detachControl();  // ペイント/ボックス選択時はカメラ操作を無効化
    }
  }, [toolMode]);

  // シーンクリックからボクセルをピック
  const pickVoxel = useCallback((x: number, y: number): number | null => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const pick = scene.pick(x, y, (m) => m === meshRef.current);
    if (!pick?.hit || pick.faceId < 0) return null;
    return faceMapRef.current[pick.faceId] ?? null;
  }, []);

  // ポインターダウンハンドラー
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (toolMode === 'navigate') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (toolMode === 'paint') {
      pushUndo();
      isPaintingRef.current = true;
      const idx = pickVoxel(x, y);
      if (idx !== null) { setVoxelBehavior(idx, paintBehavior); rebuildMesh(); }
    } else if (toolMode === 'box') {
      boxStartRef.current = { x: e.clientX, y: e.clientY };
      setBoxRect(null);
    }
  }, [toolMode, paintBehavior, pushUndo, pickVoxel, setVoxelBehavior, rebuildMesh]);

  // ポインタームーブハンドラー
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // ホバー情報（全モード共通）
    if (!isPaintingRef.current && !boxStartRef.current) {
      const idx = pickVoxel(x, y);
      if (idx !== null) {
        const v = voxelsRef.current[idx];
        const key = `${v.x},${v.y},${v.z}`;
        const beh = behaviorMapRef.current.get(key) ?? 'synced';
        setHoverInfo(`[${v.x}, ${v.y}, ${v.z}] = ${beh}`);
      } else {
        setHoverInfo(null);
      }
    }

    // ペイントモード: ドラッグ中のボクセルにビヘイビアを適用
    if (toolMode === 'paint' && isPaintingRef.current) {
      const idx = pickVoxel(x, y);
      if (idx !== null) setVoxelBehavior(idx, paintBehavior);
    // ボックス選択モード: 選択矩形を更新
    } else if (toolMode === 'box' && boxStartRef.current) {
      const sx = boxStartRef.current.x;
      const sy = boxStartRef.current.y;
      setBoxRect({
        x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
        w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
      });
    }
  }, [toolMode, paintBehavior, pickVoxel, setVoxelBehavior]);

  // ペイント中のスロットル再構築
  const rebuildTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPaintingRef.current) return;
    if (rebuildTimerRef.current) return;
    rebuildTimerRef.current = window.setInterval(() => {
      if (isPaintingRef.current) rebuildMesh();
    }, 120);
    return () => {
      if (rebuildTimerRef.current) { clearInterval(rebuildTimerRef.current); rebuildTimerRef.current = null; }
    };
  }, [toolMode, rebuildMesh]);

  // ポインターアップハンドラー
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (toolMode === 'paint' && isPaintingRef.current) {
      isPaintingRef.current = false;
      rebuildMesh();
    } else if (toolMode === 'box' && boxStartRef.current) {
      // ボックス選択を適用
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const canvas = canvasRef.current;
      if (!scene || !camera || !canvas) { boxStartRef.current = null; setBoxRect(null); return; }

      const rect = canvas.getBoundingClientRect();
      const sx = Math.min(boxStartRef.current.x, e.clientX) - rect.left;
      const sy = Math.min(boxStartRef.current.y, e.clientY) - rect.top;
      const ex = Math.max(boxStartRef.current.x, e.clientX) - rect.left;
      const ey = Math.max(boxStartRef.current.y, e.clientY) - rect.top;

      if (ex - sx < 5 && ey - sy < 5) {
        // 小さすぎる → シングルクリックとして扱う
        const idx = pickVoxel((sx + ex) / 2, (sy + ey) / 2);
        if (idx !== null) { pushUndo(); setVoxelBehavior(idx, paintBehavior); rebuildMesh(); }
      } else {
        // ボックス選択: 矩形内の全ボクセルにビヘイビアを適用
        pushUndo();
        const { cx, cy } = centerRef.current;
        const engine = scene.getEngine();
        const vpW = engine.getRenderWidth();
        const vpH = engine.getRenderHeight();
        const vm = scene.getViewMatrix();
        const pm = scene.getProjectionMatrix();
        const viewport = camera.viewport.toGlobal(vpW, vpH);

        for (let i = 0; i < voxelsRef.current.length; i++) {
          const v = voxelsRef.current[i];
          const worldPos = new Vector3(
            (v.x + 0.5 - cx) * SCALE, (v.z + 0.5) * SCALE, -(v.y + 0.5 - cy) * SCALE,
          );
          // ワールド座標→スクリーン座標に投影
          const screenPos = Vector3.Project(worldPos, vm, pm, viewport);
          // 矩形内ならビヘイビアを適用
          if (screenPos.x >= sx && screenPos.x <= ex && screenPos.y >= sy && screenPos.y <= ey) {
            setVoxelBehavior(i, paintBehavior);
          }
        }
        rebuildMesh();
      }

      boxStartRef.current = null;
      setBoxRect(null);
    }
  }, [toolMode, paintBehavior, pushUndo, pickVoxel, setVoxelBehavior, rebuildMesh]);

  // 保存処理
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const surface: string[] = [];
      const gravity: string[] = [];
      for (const [k, b] of behaviorMapRef.current) {
        if (b === 'surface') surface.push(k);
        else if (b === 'gravity') gravity.push(k);
      }
      const resp = await fetch('/api/equip-behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partKey, behaviors: { surface, gravity } }),
      });
      if (!resp.ok) throw new Error('Save failed');
      setDirty(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }, [partKey]);

  return (
    // ルートコンテナ: 横並びフレックスレイアウト
    <div style={{ width: '100vw', height: '100vh', display: 'flex', background: '#1a1a2e' }}>
      {/* サイドバー */}
      <div style={{
        width: 280, minWidth: 280, background: '#0f0f23', color: '#ccc',
        borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'auto',
      }}>
        {/* ヘッダー: 戻るリンク、パーツ名、ボクセル数 */}
        <div style={{ padding: '12px', borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Link href="/equip-config" style={{ color: '#68f', fontSize: 12, textDecoration: 'none' }}>← Back</Link>
            <span style={{ fontSize: 10, color: '#555' }}>Voxel Behavior Editor</span>
          </div>
          <div style={{ fontWeight: 'bold', fontSize: 18 }}>{partKey}</div>
          {partInfo && <div style={{ fontSize: 11, color: '#888' }}>{partInfo.voxels} voxels</div>}
        </div>

        {/* エラー/ローディング表示 */}
        {error && <div style={{ padding: 12, color: '#f88', fontSize: 12 }}>Error: {error}</div>}
        {loading && <div style={{ padding: 12, color: '#88f', fontSize: 12 }}>Loading...</div>}

        {/* ツールモード選択 */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
          <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#aaa' }}>Tool Mode</div>
          {([
            { mode: 'navigate' as ToolMode, label: 'Navigate', key: 'Q', icon: '🔄', desc: 'Rotate/zoom camera' },
            { mode: 'paint' as ToolMode, label: 'Paint', key: 'W', icon: '🖌️', desc: 'Click/drag to paint' },
            { mode: 'box' as ToolMode, label: 'Box Select', key: 'E', icon: '⬜', desc: 'Drag to select area' },
          ]).map(t => (
            <button key={t.mode} onClick={() => setToolMode(t.mode)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 10px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
              background: toolMode === t.mode ? '#2a2a5e' : 'transparent',
              border: toolMode === t.mode ? '1px solid #55a' : '1px solid transparent',
              color: toolMode === t.mode ? '#fff' : '#888', fontSize: 12, textAlign: 'left',
            }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              <div>
                <div style={{ fontWeight: toolMode === t.mode ? 'bold' : 'normal' }}>
                  {t.label} <span style={{ fontSize: 10, color: '#666' }}>({t.key})</span>
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>{t.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ペイントビヘイビア選択 */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
          <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, color: '#aaa' }}>Paint Behavior</div>
          {BEHAVIOR_INFO.map(info => (
            <button key={info.value} onClick={() => setPaintBehavior(info.value)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 10px', marginBottom: 4, borderRadius: 4, cursor: 'pointer',
              background: paintBehavior === info.value ? info.cssColor : 'transparent',
              border: paintBehavior === info.value ? `2px solid ${info.cssColor}` : '2px solid transparent',
              color: paintBehavior === info.value ? '#fff' : '#888', fontSize: 12, textAlign: 'left',
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: info.cssColor, display: 'inline-block',
              }} />
              <div>
                <span style={{ fontWeight: paintBehavior === info.value ? 'bold' : 'normal' }}>
                  {info.label} <span style={{ fontSize: 10, color: paintBehavior === info.value ? '#ddd' : '#666' }}>({info.shortcut})</span>
                </span>
                <div style={{ fontSize: 10, color: paintBehavior === info.value ? '#ddd' : '#555' }}>{info.labelJa}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ボクセル統計 */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #333' }}>
          <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6, color: '#aaa' }}>Voxel Stats</div>
          {BEHAVIOR_INFO.map(info => {
            const count = stats[info.value];
            const pct = voxelsRef.current.length > 0 ? Math.round(count / voxelsRef.current.length * 100) : 0;
            return (
              <div key={info.value} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: info.cssColor, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, minWidth: 60 }}>{info.label}</span>
                <span style={{ fontSize: 12, fontWeight: 'bold', minWidth: 40, textAlign: 'right' }}>{count}</span>
                <div style={{ flex: 1, height: 8, background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: info.cssColor, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 10, color: '#888', width: 30, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>

        {/* ホバー情報 */}
        {hoverInfo && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: '#aaa', borderBottom: '1px solid #222' }}>
            Hover: {hoverInfo}
          </div>
        )}

        {/* アクションボタン */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Undoボタン */}
          <button onClick={performUndo} disabled={!canUndo} style={{
            padding: '8px 0', borderRadius: 4, cursor: canUndo ? 'pointer' : 'default',
            background: canUndo ? '#3a3a5e' : '#1a1a2e', color: canUndo ? '#ccc' : '#444',
            border: '1px solid #444', fontSize: 12,
          }}>
            Undo (Ctrl+Z)
          </button>
          {/* 保存ボタン */}
          <button onClick={handleSave} disabled={saving || !dirty} style={{
            padding: '10px 0', borderRadius: 4, cursor: dirty ? 'pointer' : 'default',
            background: dirty ? '#4a6' : '#1a1a2e', color: dirty ? '#fff' : '#444',
            border: dirty ? '2px solid #5b7' : '1px solid #333', fontSize: 13, fontWeight: 'bold',
          }}>
            {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>

        {/* キーボードショートカット凡例 */}
        <div style={{ padding: '10px 12px', marginTop: 'auto', borderTop: '1px solid #222' }}>
          <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
            <div><b>Q</b> Navigate / <b>W</b> Paint / <b>E</b> Box Select</div>
            <div><b>1</b> Synced / <b>2</b> Surface / <b>3</b> Gravity</div>
            <div><b>Ctrl+Z</b> Undo</div>
          </div>
        </div>
      </div>

      {/* キャンバスエリア */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%', height: '100%', outline: 'none',
            cursor: toolMode === 'navigate' ? 'grab' : 'crosshair',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* ボックス選択オーバーレイ */}
        {boxRect && (
          <div style={{
            position: 'fixed', left: boxRect.x, top: boxRect.y,
            width: boxRect.w, height: boxRect.h,
            border: '2px dashed #8af', background: 'rgba(100, 150, 255, 0.15)',
            pointerEvents: 'none', zIndex: 10,
          }} />
        )}

        {/* モードインジケーター */}
        <div style={{
          position: 'absolute', top: 12, left: 12, padding: '4px 10px',
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, fontSize: 12, color: '#aaa',
        }}>
          {toolMode === 'navigate' ? 'Navigate' : toolMode === 'paint' ? `Paint: ${paintBehavior}` : 'Box Select'}
          {dirty && <span style={{ color: '#f84', marginLeft: 8 }}>*unsaved</span>}
        </div>
      </div>
    </div>
  );
}
