import { useEffect, useRef, useState } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
} from "@babylonjs/core";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { MarbleBody } from "../physics/MarbleBody";
import { ForceController } from "../physics/ForceController";
import { DEFAULT_CONFIG, SimulationConfig, CourseType } from "../types/MarbleConfig";

/**
 * ビー玉シミュレーション統合React Hook
 *
 * コースタイプに応じてカメラ位置を自動調整。
 * パラメータは MarbleConfig.ts で変更する（画面UI なし）。
 */
export function useMarbleControl(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const physicsWorldRef = useRef<PhysicsWorld | null>(null);
  const marbleBodyRef = useRef<MarbleBody | null>(null);
  const forceControllerRef = useRef<ForceController | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    const config: SimulationConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // --- 同期部分: Engine + Scene + RenderLoop ---
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;

    // カメラ: コースタイプに応じた位置
    const cam = createCamera(config, scene, canvas);
    cam.lowerRadiusLimit = 10;
    cam.upperRadiusLimit = 120;

    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    // --- 非同期部分: Havok初期化 + コース構築 ---
    const initPhysicsAsync = async () => {
      try {
        const physicsWorld = new PhysicsWorld();
        await physicsWorld.initialize(scene);
        if (!mounted) return;
        physicsWorldRef.current = physicsWorld;

        const marbleBody = new MarbleBody(scene);
        const entries = marbleBody.createAll(config);
        marbleBodyRef.current = marbleBody;

        const forceController = new ForceController(
          entries,
          config,
          () => marbleBody.resetMarbles(config.marble),
        );
        forceControllerRef.current = forceController;

        scene.onBeforeRenderObservable.add(() => {
          const dt = engine.getDeltaTime() / 1000;
          forceController.update(dt);
        });

        if (mounted) {
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to initialize simulation");
          setLoading(false);
        }
      }
    };

    initPhysicsAsync();

    // --- Cleanup ---
    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      forceControllerRef.current?.dispose();
      forceControllerRef.current = null;
      marbleBodyRef.current?.dispose();
      marbleBodyRef.current = null;
      if (sceneRef.current && physicsWorldRef.current) {
        physicsWorldRef.current.dispose(sceneRef.current);
      }
      physicsWorldRef.current = null;
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      sceneRef.current = null;
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, error };
}

function createCamera(config: SimulationConfig, scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  switch (config.courseType) {
    case CourseType.STRAIGHT: {
      const midZ = config.straight.goalDistance / 2;
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.5, 50, new Vector3(0, 0, midZ), scene);
      camera.attachControl(canvas, true);
      return camera;
    }
    case CourseType.LATERAL_SHUTTLE: {
      // 真上寄りの俯瞰で横移動を見やすく
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 4, 30, new Vector3(0, 0, 5), scene);
      camera.attachControl(canvas, true);
      return camera;
    }
    case CourseType.COLLISION: {
      const midZ = config.collision.startDistance / 2;
      const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 3.5, 40, new Vector3(0, 0, midZ), scene);
      camera.attachControl(canvas, true);
      return camera;
    }
  }
}
