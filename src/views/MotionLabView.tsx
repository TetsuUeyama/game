'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color4, Mesh, StandardMaterial, Matrix,
} from '@babylonjs/core';

import type { SegmentBundleData, SegmentsData } from '@/types/vox';
import type { BoneHierarchyEntry, PoseData, Keyframe, BonePhysics } from '@/types/motion';
import { buildBundleMeshes } from '@/lib/vox-mesh';
import { buildBoneHierarchyARP } from '@/lib/bone-hierarchy';
import { applyPose, blendPoseData, initAngularPhysics, stepAngularPhysics, applyHitImpulse, DEG } from '@/lib/bone-physics';
import { BoneRotationPanelTmp } from '@/templates/motion-lab/BoneRotationPanelTmp';
import { TransitionControlTmp } from '@/templates/motion-lab/TransitionControlTmp';

const CACHE_BUST = `?v=${Date.now()}`;
const VOX_API = '/api/vox';


// getBoneMass, ARP_HIERARCHY, buildBoneHierarchyARP は @/lib/bone-hierarchy からインポート済み
// applyPose, blendPoseData, initAngularPhysics, stepAngularPhysics, applyHitImpulse, DEG は @/lib/bone-physics からインポート済み

// 以下のローカル関数は削除済み（lib/に移動）

// ========================================================================
// Component（Reactコンポーネント）
// ========================================================================

// 利用可能なモデルの定義（キー→ラベルとフォルダパス）
const MODELS: Record<string, { label: string; folder: string }> = {
  ce: { label: 'CyberpunkElf', folder: 'female/CyberpunkElf-Detailed' },       // サイバーパンクエルフ（詳細モデル）
  ba: { label: 'BunnyAkali', folder: 'female/BunnyAkali-Base' },               // バニーアカリ（ベースモデル）
  de: { label: 'DarkElfBlader', folder: 'female/DarkElfBlader-Base' },          // ダークエルフブレイダー（ベースモデル）
};

// UIに表示するボーングループの定義（グループ名→ボーン名配列）
const BONE_GROUPS: Record<string, string[]> = {
  'Spine': ['c_root_bend.x','c_spine_01_bend.x','c_spine_02_bend.x','c_spine_03_bend.x'], // 脊椎グループ
  'Head': ['neck.x','head.x','jawbone.x'],                                                  // 頭部グループ
  'Arm L': ['shoulder.l','c_arm_twist.l','c_arm_stretch.l','c_forearm_stretch.l','hand.l'],  // 左腕グループ
  'Arm R': ['shoulder.r','c_arm_twist.r','c_arm_stretch.r','c_forearm_stretch.r','hand.r'],  // 右腕グループ
  'Leg L': ['c_thigh_twist.l','c_thigh_stretch.l','c_leg_stretch.l','foot.l'],               // 左脚グループ
  'Leg R': ['c_thigh_twist.r','c_thigh_stretch.r','c_leg_stretch.r','foot.r'],               // 右脚グループ
};

// Motion Lab ページのメインコンポーネント
export default function MotionLabView() {
  // キャンバス要素へのRef（Babylon.jsのレンダリング先）
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Babylon.jsシーンへのRef
  const sceneRef = useRef<Scene | null>(null);
  // ボーン名→メッシュのマップへのRef
  const meshesRef = useRef<Record<string, Mesh>>({});
  // ボーン階層データへのRef
  const hierarchyRef = useRef<BoneHierarchyEntry[]>([]);
  // ボーンごとの角度物理演算パラメータへのRef
  const angPhysicsRef = useRef<Record<string, BonePhysics>>({});

  // 現在選択中のモデルキー（'ce', 'ba', 'de'のいずれか）
  const [modelKey, setModelKey] = useState('ce');
  // モデルの読み込みが完了してポーズ操作可能な状態かどうか
  const [ready, setReady] = useState(false);
  // モデル読み込み中かどうか
  const [loading, setLoading] = useState(false);
  // 現在UIで選択されているボーン名（null=未選択）
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  // 現在展開されているボーングループ名（null=全て閉じている）
  const [openGroup, setOpenGroup] = useState<string | null>('Spine');
  // キーフレームの配列（デフォルトでPose AとPose Bの2つ、初期ポーズは空=Tポーズ）
  const [keyframes, setKeyframes] = useState<Keyframe[]>([
    { label: 'Pose A', pose: {} }, { label: 'Pose B', pose: {} },
  ]);
  // 現在編集中のキーフレームインデックス（0=Pose A, 1=Pose B）
  const [editingKf, setEditingKf] = useState(0);
  // アニメーション再生中かどうか
  const [playing, setPlaying] = useState(false);
  // トランジション（ポーズ間遷移）のフレーム数
  const [transitionDuration, setTransitionDuration] = useState(60);
  // ループモード（'once'=A→Bの一方向ループ, 'pingpong'=A→B→Aの往復ループ）
  const [loopMode, setLoopMode] = useState<'once'|'pingpong'>('pingpong');
  // 現在のアニメーションフレーム番号（UIに表示用、Refで管理してリレンダリングを避ける）
  const frameRef = useRef(0);
  // フレーム番号表示用のspan要素へのRef（直接DOM操作でパフォーマンスを最適化）
  const frameDisplayRef = useRef<HTMLSpanElement>(null);

  // シーン初期化のエフェクト（コンポーネントマウント時に1回だけ実行）
  useEffect(() => {
    // キャンバス要素を取得（なければ終了）
    const canvas = canvasRef.current; if (!canvas) return;
    // Babylon.jsエンジンを作成（第2引数trueでアンチエイリアス有効）
    const engine = new Engine(canvas, true);
    // 新しいシーンを作成
    const scene = new Scene(engine);
    // 背景色を暗い紺色に設定
    scene.clearColor = new Color4(0.06, 0.06, 0.1, 1);
    // シーンをRefに保存（他のエフェクトからアクセスするため）
    sceneRef.current = scene;
    // アークローテートカメラを設定: 水平角-90°、仰角72°、距離2.5、注視点(0, 0.85, 0)
    const cam = new ArcRotateCamera('cam', -Math.PI/2, Math.PI/2.5, 2.5, new Vector3(0,0.85,0), scene);
    // カメラのコントロールを有効化し、ズーム範囲と精度を設定
    cam.attachControl(canvas, true); cam.lowerRadiusLimit=0.5; cam.upperRadiusLimit=8; cam.wheelPrecision=80; cam.minZ=0.01;
    // 半球ライト（環境光）を追加（上方向から照射、強度0.7）
    new HemisphericLight('h', new Vector3(0,1,0), scene).intensity = 0.7;
    // 平行光源を追加（左上奥から照射、強度0.8）
    const d = new DirectionalLight('d', new Vector3(-1,-2,1), scene); d.intensity=0.8; d.position=new Vector3(3,5,-3);
    // レンダリングループを開始（毎フレームシーンを描画）
    engine.runRenderLoop(() => scene.render());
    // ウィンドウリサイズ時にエンジンをリサイズするイベントリスナー
    const resize = () => engine.resize();
    window.addEventListener('resize', resize);
    // クリーンアップ関数（コンポーネントアンマウント時にリソースを解放）
    return () => { window.removeEventListener('resize', resize); engine.dispose(); };
  }, []); // 依存配列が空なので初回マウント時のみ実行

  // モデル読み込みのエフェクト（modelKeyが変わるたびに実行）
  useEffect(() => {
    // シーンが初期化されていなければ終了
    const scene = sceneRef.current; if (!scene) return;
    // 状態をリセット: ローディング開始、準備完了をfalseに、再生を停止
    setLoading(true); setReady(false); setPlaying(false);
    // 既存のメッシュを全て破棄（前のモデルのリソース解放）
    for (const m of Object.values(meshesRef.current)) m.dispose();
    // メッシュマップをクリア
    meshesRef.current = {};
    // モデル設定を取得（存在しなければローディング解除して終了）
    const config = MODELS[modelKey]; if (!config) { setLoading(false); return; }
    // 非同期でモデルデータを読み込み
    (async () => {
      try {
        // セグメントメタデータ（ボーン位置情報等）をAPIから取得
        const segData: SegmentsData = await (await fetch(`${VOX_API}/${config.folder}/segments.json${CACHE_BUST}`)).json();
        // ボーン階層構造を構築
        hierarchyRef.current = buildBoneHierarchyARP(segData);
        // セグメントバンドル（全ボーンのボクセルデータ）をAPIから取得
        const bundle: SegmentBundleData = await (await fetch(`${VOX_API}/${config.folder}/segments_bundle.json${CACHE_BUST}`)).json();
        // 頂点カラーを使用するマテリアルを作成
        const mat = new StandardMaterial('m', scene);
        // vertexColorEnabledプロパティを有効化（型安全のためキャスト）
        (mat as unknown as {vertexColorEnabled:boolean}).vertexColorEnabled = true;
        // バンドルデータからボーンごとのメッシュを生成
        meshesRef.current = buildBundleMeshes(bundle, scene, mat, segData.voxel_size);
        // 角度物理演算パラメータを初期化
        angPhysicsRef.current = initAngularPhysics(hierarchyRef.current);
        // 準備完了状態に設定
        setReady(true);
        // レストポーズ（初期姿勢）を適用
        const mats = applyPose(hierarchyRef.current, {});
        // 各メッシュにワールド変換行列を設定（freezeWorldMatrixで静的最適化）
        for (const [s, mesh] of Object.entries(meshesRef.current)) {
          const m = mats[s]; mesh.freezeWorldMatrix(m ? Matrix.FromArray(m) : Matrix.Identity());
        }
      } catch (e) { console.error('Load failed:', e); } // 読み込みエラー時のログ出力
      // ローディング完了
      setLoading(false);
    })();
  }, [modelKey]); // modelKeyが変更されるたびにモデルを再読み込み

  // 現在のポーズをモデルに適用するコールバック関数
  const applyCurrentPose = useCallback(() => {
    // 階層データがなければ何もしない
    if (hierarchyRef.current.length === 0) return;
    // 現在編集中のキーフレームのポーズデータでFK計算を実行
    const mats = applyPose(hierarchyRef.current, keyframes[editingKf]?.pose || {});
    // 各メッシュにワールド変換行列を適用
    for (const [s, mesh] of Object.entries(meshesRef.current)) {
      const m = mats[s]; mesh.freezeWorldMatrix(m ? Matrix.FromArray(m) : Matrix.Identity());
    }
  }, [keyframes, editingKf]); // keyframesまたはeditingKfが変わったら関数を再生成

  // 再生中でない時にポーズが変更されたらモデルに反映するエフェクト
  useEffect(() => { if (!playing && ready) applyCurrentPose(); }, [keyframes, editingKf, ready, playing, applyCurrentPose]);

  // ボーンの回転角度を更新するコールバック関数
  const updateBoneAngle = useCallback((bone: string, axis: 'rx'|'ry'|'rz', value: number) => {
    setKeyframes(prev => {
      // キーフレーム配列をコピー
      const next = [...prev]; const kf = {...next[editingKf]};
      // ポーズデータをコピーし、指定ボーン・軸の値を更新
      const pose = {...kf.pose}; const a = {...(pose[bone]||{rx:0,ry:0,rz:0})};
      a[axis] = value; pose[bone] = a; kf.pose = pose; next[editingKf] = kf; return next;
    });
  }, [editingKf]); // editingKfが変わったら関数を再生成

  // キャンバスクリックのハンドラー（ボーン選択 or ヒットリアクション）
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // シーンがなければ終了
    const scene = sceneRef.current; if (!scene) return;
    // クリック位置でレイキャスト（3D空間のオブジェクトとの交差判定）
    const pick = scene.pick(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    // メッシュにヒットしなかった場合は終了
    if (!pick?.hit || !pick.pickedMesh) return;
    // メッシュ名から"seg_"プレフィックスを除去してボーン名を取得
    const boneName = pick.pickedMesh.name.replace('seg_', '');
    // 再生中でない場合: ボーンを選択し、対応するグループを展開
    if (!playing) {
      setSelectedBone(boneName);
      // クリックされたボーンが属するグループを探して展開
      for (const [g, bones] of Object.entries(BONE_GROUPS)) { if (bones.includes(boneName)) { setOpenGroup(g); break; } }
      return;
    }
    // 再生中の場合: ヒットリアクションを発動
    let dir: Vector3;
    // ヒット法線が取得できればそれを使用、なければランダムな方向を生成
    if (pick.getNormal) { const n = pick.getNormal(); dir = n ? n.normalize() : Vector3.Right(); }
    else dir = new Vector3(Math.random()-0.5, 0.2, Math.random()-0.5).normalize();
    // ヒットインパルスを適用（力の大きさに若干のランダム性を付与）
    applyHitImpulse(boneName, dir.scale(0.15+Math.random()*0.1), angPhysicsRef.current, hierarchyRef.current);
  }, [playing]); // playingが変わったら関数を再生成

  // アニメーションループのエフェクト（再生中のみ動作）
  useEffect(() => {
    // 再生中でない、またはモデルが準備できていなければ何もしない
    if (!playing || !ready) return;
    // 現在のボーン階層データを取得
    const hierarchy = hierarchyRef.current;
    // キーフレームAとBのポーズデータを取得
    const poseA = keyframes[0]?.pose || {}, poseB = keyframes[1]?.pose || {};
    // トランジションフレーム数
    const dur = transitionDuration;
    // 総フレーム数（ピンポンなら往復分で2倍、onceならそのまま）
    const total = loopMode === 'pingpong' ? dur*2 : dur;
    // 物理演算パラメータの参照を取得
    const angPhys = angPhysicsRef.current;
    // フレームカウンターと前回時刻、requestAnimationFrameのIDを初期化
    let frame = 0, lastTime = 0, rafId = 0;

    // 毎フレーム呼ばれるアニメーションティック関数
    const tick = (now: number) => {
      // 次のフレームをリクエスト
      rafId = requestAnimationFrame(tick);
      // 30FPS制限: 前回から1/30秒経過していなければスキップ
      if (now - lastTime < 1000/30) return;
      // 前回時刻を更新
      lastTime = now;
      // フレームカウンターを進めてループ
      frame = (frame+1) % total; frameRef.current = frame;
      // 補間パラメータtを計算: ピンポンなら前半は0→1、後半は1→0。onceなら0→1
      const t = loopMode === 'pingpong' ? (frame < dur ? frame/dur : (total-frame)/dur) : frame/dur;

      // 物理演算を1ステップ実行（バネ減衰による揺れの更新）
      stepAngularPhysics(angPhys);
      // 2つのポーズをtで線形補間
      const blended = blendPoseData(poseA, poseB, t);
      // 物理オフセットを加算した最終ポーズを構築
      const finalPose: PoseData = {};
      for (const e of hierarchy) {
        // ブレンドされた基本ポーズを取得
        const base = blended[e.bone] || {rx:0,ry:0,rz:0};
        // 物理演算によるオフセットを取得
        const p = angPhys[e.bone];
        // 基本ポーズに物理オフセットを加算（ラジアン→度に変換して加算）
        finalPose[e.bone] = p ? { rx: base.rx+p.ox/DEG, ry: base.ry+p.oy/DEG, rz: base.rz+p.oz/DEG } : base;
      }
      // 最終ポーズでFK計算を実行し、各ボーンのワールド変換行列を取得
      const mats = applyPose(hierarchy, finalPose);
      // 各メッシュにワールド変換行列を適用
      for (const [s, mesh] of Object.entries(meshesRef.current)) {
        const m = mats[s]; if (m) mesh.freezeWorldMatrix(Matrix.FromArray(m));
      }
      // フレーム番号と補間率の表示を更新（DOM直接操作でリレンダリングを回避）
      if (frameDisplayRef.current) frameDisplayRef.current.textContent = `${frame}/${total} (${Math.round(t*100)}%)`;
    };
    // アニメーションループを開始
    rafId = requestAnimationFrame(tick);
    // クリーンアップ関数（停止時にアニメーションフレームをキャンセル）
    return () => cancelAnimationFrame(rafId);
  }, [playing, ready, keyframes, transitionDuration, loopMode]); // これらの値が変わるとアニメーションを再開

  // ========================================================================
  // UI レンダリング
  // ========================================================================

  // 現在編集中のキーフレームのポーズデータを取得
  const curPose = keyframes[editingKf]?.pose || {};
  // セレクトボックス等の共通スタイル定義
  const ss = { width:'100%', padding:'4px 6px', fontSize:11, marginBottom:6, background:'#1a1a2e', color:'#ddd', border:'1px solid #555', borderRadius:4, fontFamily:'monospace' as const };

  return (
    // ルートコンテナ: 画面全体を使用、横並びフレックスレイアウト
    <div style={{width:'100vw',height:'100vh',overflow:'hidden',background:'#101018',display:'flex'}}>
      {/* 左サイドパネル: コントロールUI（幅300px固定、スクロール可能） */}
      <div style={{width:300,minWidth:300,padding:'14px 16px',overflowY:'auto',background:'rgba(0,0,0,0.55)',color:'#ddd',fontFamily:'monospace',fontSize:12,borderRight:'1px solid rgba(255,255,255,0.08)'}}>
        {/* タイトル */}
        <h2 style={{margin:'0 0 4px',fontSize:16,color:'#fff'}}>Motion Lab</h2>
        {/* サブタイトル（機能説明） */}
        <p style={{margin:'0 0 8px',fontSize:10,color:'#888'}}>Pose editor + keyframe blend + hit reaction</p>
        {/* モデル選択ラベル */}
        <div style={{fontWeight:'bold',color:'#fa0',fontSize:11,marginBottom:4}}>Model</div>
        {/* モデル選択ドロップダウン */}
        <select value={modelKey} onChange={e=>setModelKey(e.target.value)} style={ss}>
          {/* MODELSオブジェクトからオプションを動的生成 */}
          {Object.entries(MODELS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {/* ローディング中の表示 */}
        {loading && <div style={{color:'#8af',padding:'10px 0'}}>Loading...</div>}
        {/* モデル読み込み完了後のUI */}
        {ready && (<>
          <TransitionControlTmp
            keyframes={keyframes}
            editingKf={editingKf}
            playing={playing}
            transitionDuration={transitionDuration}
            loopMode={loopMode}
            frameDisplayRef={frameDisplayRef}
            onSelectKf={(i) => { setEditingKf(i); setPlaying(false); }}
            onResetPose={() => setKeyframes(p => { const n = [...p]; n[editingKf] = { ...n[editingKf], pose: {} }; return n; })}
            onSetDuration={setTransitionDuration}
            onSetLoopMode={setLoopMode}
            onTogglePlay={() => { frameRef.current = 0; setPlaying(!playing); }}
          />
          <BoneRotationPanelTmp
            boneGroups={BONE_GROUPS}
            availableBones={new Set(Object.keys(meshesRef.current))}
            currentPose={curPose}
            selectedBone={selectedBone}
            openGroup={openGroup}
            editingLabel={keyframes[editingKf].label}
            onSelectBone={setSelectedBone}
            onToggleGroup={setOpenGroup}
            onUpdateAngle={updateBoneAngle}
          />
        </>)}
      </div>
      {/* Babylon.jsの3Dレンダリングキャンバス: フレックスで残りスペースを使用、再生中はcrosshairカーソル */}
      <canvas ref={canvasRef} onClick={handleCanvasClick} style={{flex:1,cursor:playing?'crosshair':'pointer'}}/>
    </div>
  );
}
