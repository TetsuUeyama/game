// React フック: useEffect(副作用), useRef(参照保持), useState(状態管理)
import { useEffect, useRef, useState } from "react";
// Babylon.js コアモジュール: レンダリングエンジン、シーン、カメラ、ライト、ベクトル
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
} from "@babylonjs/core";
// Havok物理エンジン管理クラス
import { PhysicsWorld } from "@/GamePlay/GameSystem/MarbleSimulation/Physics/PhysicsWorld";
// ビー玉・地面・壁の生成・管理クラス
import { MarbleBody } from "@/GamePlay/GameSystem/MarbleSimulation/Physics/MarbleBody";
// 力の制御クラス（コース別ロジック + ヒューマノイド物理）
import { ForceController } from "@/GamePlay/GameSystem/MarbleSimulation/Physics/ForceController";
// 設定型定義とデフォルト値
import { DEFAULT_CONFIG, SimulationConfig, CourseType } from "@/GamePlay/GameSystem/MarbleSimulation/Types/MarbleConfig";

/**
 * ビー玉シミュレーション統合React Hook
 *
 * courseType を受け取り、変更時にシミュレーション全体を再構築する。
 *
 * @param canvasRef - Babylon.js描画先のcanvas要素への参照
 * @param courseType - 現在選択されているコースタイプ
 * @returns loading(初期化中フラグ)とerror(エラーメッセージ)の状態
 */
export function useMarbleControl(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  courseType: CourseType,
) {
  /** ローディング状態: 物理エンジン初期化完了まで true */
  const [loading, setLoading] = useState(true);
  /** エラー状態: 初期化失敗時にエラーメッセージを保持。正常時はnull */
  const [error, setError] = useState<string | null>(null);

  /** Babylon.jsレンダリングエンジンへの参照 */
  const engineRef = useRef<Engine | null>(null);
  /** Babylon.jsシーンへの参照 */
  const sceneRef = useRef<Scene | null>(null);
  /** Havok物理エンジン管理インスタンスへの参照 */
  const physicsWorldRef = useRef<PhysicsWorld | null>(null);
  /** ビー玉・地面・壁の管理インスタンスへの参照 */
  const marbleBodyRef = useRef<MarbleBody | null>(null);
  /** 力の制御インスタンスへの参照 */
  const forceControllerRef = useRef<ForceController | null>(null);

  /** courseType変更時にシミュレーション全体を再構築するEffect */
  useEffect(() => {
    // canvas要素を取得。存在しなければ何もしない
    const canvas = canvasRef.current;
    if (!canvas) return;

    /** マウント状態フラグ: クリーンアップ後の非同期コールバック実行を防ぐ */
    let mounted = true;
    /** 設定をデフォルトからディープコピーし、courseTypeを上書き */
    const config: SimulationConfig = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), courseType };

    // ランダムモード: フィールドを狭く、壁を高くして脚付き箱が飛び出さないようにする
    if (courseType === CourseType.RANDOM) {
      config.groundSize = 16;       // 地面を16m四方に縮小
      config.random.areaSize = 10;  // 移動エリアを10m四方に縮小
      config.wallHeight = 12;       // 壁を12mに高く
    }

    // --- 同期部分: Engine + Scene + RenderLoop ---

    /** Babylon.jsレンダリングエンジンを生成（WebGL, アンチエイリアス有効） */
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,  // スクリーンショット対応
      stencil: true,                // ステンシルバッファ有効
    });
    engineRef.current = engine;

    /** Babylon.jsシーンを生成 */
    const scene = new Scene(engine);
    sceneRef.current = scene;

    // カメラ: コースタイプに応じた位置・アングルで生成
    const cam = createCamera(config, scene, canvas);
    /** カメラの最小ズーム距離 */
    cam.lowerRadiusLimit = 10;
    /** カメラの最大ズーム距離 */
    cam.upperRadiusLimit = 120;

    /** 半球ライト: 上方向から照らす環境光を生成 */
    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    /** レンダリングループ: 毎フレームシーンを描画 */
    engine.runRenderLoop(() => {
      scene.render();
    });

    /** ウィンドウリサイズ時にエンジンのビューポートを更新するハンドラー */
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    // --- 非同期部分: Havok初期化 + コース構築 ---

    /** Havok物理エンジンの初期化とコース構築を非同期で実行 */
    const initPhysicsAsync = async () => {
      try {
        // Havok物理エンジンを初期化してシーンに適用
        const physicsWorld = new PhysicsWorld();
        await physicsWorld.initialize(scene);
        // アンマウント後なら何もしない
        if (!mounted) return;
        physicsWorldRef.current = physicsWorld;

        // ビー玉・地面・壁・装飾をシーンに生成
        const marbleBody = new MarbleBody(scene);
        /** 生成されたビー玉エントリ配列 */
        const entries = marbleBody.createAll(config);
        marbleBodyRef.current = marbleBody;

        // 力の制御を初期化（コース別ロジック + リセットコールバック）
        const forceController = new ForceController(
          entries,
          config,
          scene,
          () => marbleBody.resetMarbles(config.marble), // リセット時に全ビー玉をスタート位置へ
        );
        forceControllerRef.current = forceController;

        /** 毎フレーム物理更新: デルタタイム(秒)でForceControllerを更新 */
        scene.onBeforeRenderObservable.add(() => {
          const dt = engine.getDeltaTime() / 1000; // ミリ秒→秒変換
          forceController.update(dt);
        });

        // 初期化完了: ローディングを解除
        if (mounted) {
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        // 初期化失敗: エラーメッセージを設定
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize simulation");
          setLoading(false);
        }
      }
    };

    // 非同期初期化を開始
    initPhysicsAsync();

    // --- Cleanup: コンポーネントアンマウントまたはcourseType変更時に全リソースを破棄 ---
    return () => {
      mounted = false; // 非同期コールバック無効化
      window.removeEventListener("resize", onResize); // リサイズハンドラー解除
      forceControllerRef.current?.dispose();          // 力の制御を破棄
      forceControllerRef.current = null;
      marbleBodyRef.current?.dispose();               // ビー玉・地面・壁を破棄
      marbleBodyRef.current = null;
      if (sceneRef.current && physicsWorldRef.current) {
        physicsWorldRef.current.dispose(sceneRef.current); // 物理エンジンを破棄
      }
      physicsWorldRef.current = null;
      engine.stopRenderLoop();  // レンダリングループを停止
      scene.dispose();          // シーンを破棄
      engine.dispose();         // エンジンを破棄
      sceneRef.current = null;
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseType]); // courseType変更時に再実行

  return { loading, error };
}

/**
 * コースタイプに応じたカメラを生成
 *
 * 各コースに最適な視点・距離・注視点でArcRotateCameraを設定する
 *
 * @param config - シミュレーション設定
 * @param scene - Babylon.jsシーン
 * @param canvas - カメラ操作を紐づけるcanvas要素
 * @returns 生成されたArcRotateCamera
 */
function createCamera(config: SimulationConfig, scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  switch (config.courseType) {
    case CourseType.STRAIGHT: {
      // 直線コース: コース中央を注視、横から斜め上の視点
      const midZ = config.straight.goalDistance / 2; // ゴールの中間地点
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.5, 50, new Vector3(0, 0, midZ), scene);
      camera.attachControl(canvas, true); // マウス/タッチ操作を有効化
      return camera;
    }
    case CourseType.LATERAL_SHUTTLE: {
      // 反復横跳びコース: ビー玉のZ位置(5)を注視、やや近い視点
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 4, 30, new Vector3(0, 0, 5), scene);
      camera.attachControl(canvas, true); // マウス/タッチ操作を有効化
      return camera;
    }
    case CourseType.COLLISION: {
      // 衝突実験コース: 衝突ポイント（中間地点）を注視
      const midZ = config.collision.startDistance / 2; // 対向の中間地点
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.5, 40, new Vector3(0, 0, midZ), scene);
      camera.attachControl(canvas, true); // マウス/タッチ操作を有効化
      return camera;
    }
    case CourseType.RANDOM: {
      // ランダムコース: 斜め上から俯瞰で狭いフィールドを見渡す
      const camera = new ArcRotateCamera("cam", -Math.PI / 4, Math.PI / 3, 20, Vector3.Zero(), scene);
      camera.attachControl(canvas, true); // マウス/タッチ操作を有効化
      return camera;
    }
  }
}
