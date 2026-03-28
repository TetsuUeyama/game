// ========================================================================
// Babylon.js シーン初期化の共通フック
// 全3Dページ（realistic-viewer, motion-lab, model-import, template-editor, equip-config）で使用
// ========================================================================

import { useEffect, useRef } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color4,
} from '@babylonjs/core';

export interface BabylonSceneOptions {
  /** キャンバスの背景色（デフォルト: 暗い青） */
  clearColor?: [number, number, number, number];
  /** カメラの初期alpha（デフォルト: -Math.PI/2） */
  cameraAlpha?: number;
  /** カメラの初期beta（デフォルト: Math.PI/2.5） */
  cameraBeta?: number;
  /** カメラの初期radius（デフォルト: 2） */
  cameraRadius?: number;
  /** カメラのターゲット位置（デフォルト: [0, 0.5, 0]） */
  cameraTarget?: [number, number, number];
  /** DirectionalLightを追加するか（デフォルト: false） */
  addDirectionalLight?: boolean;
  /** シーン作成後のコールバック */
  onSceneReady?: (scene: Scene, engine: Engine, camera: ArcRotateCamera) => void;
}

export interface BabylonSceneResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  sceneRef: React.RefObject<Scene | null>;
  engineRef: React.RefObject<Engine | null>;
  cameraRef: React.RefObject<ArcRotateCamera | null>;
}

export function useBabylonScene(options: BabylonSceneOptions = {}): BabylonSceneResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);

  const {
    clearColor = [0.08, 0.08, 0.14, 1],
    cameraAlpha = -Math.PI / 2,
    cameraBeta = Math.PI / 2.5,
    cameraRadius = 2,
    cameraTarget = [0, 0.5, 0],
    addDirectionalLight = false,
    onSceneReady,
  } = options;

  // onSceneReadyをrefで保持（依存配列に含めない）
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;

    const scene = new Scene(engine);
    scene.clearColor = new Color4(...clearColor);
    sceneRef.current = scene;

    const camera = new ArcRotateCamera(
      'camera', cameraAlpha, cameraBeta, cameraRadius,
      new Vector3(...cameraTarget), scene,
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 100;
    camera.minZ = 0.001;
    cameraRef.current = camera;

    new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
    if (addDirectionalLight) {
      new DirectionalLight('dirLight', new Vector3(-1, -2, -1), scene);
    }

    engine.runRenderLoop(() => scene.render());

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    if (onSceneReadyRef.current) {
      onSceneReadyRef.current(scene, engine, camera);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      sceneRef.current = null;
      engineRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, sceneRef, engineRef, cameraRef };
}
