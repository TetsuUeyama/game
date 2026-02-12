import { useCallback, useEffect, useRef, useState } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  SceneLoader,
  StandardMaterial,
  Color3,
  KeyboardEventTypes,
  AbstractMesh,
  Skeleton,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { BlendController } from "../character/BlendController";
import { PoseBlender } from "../character/PoseBlender";
import { IKSystem } from "../character/IKSystem";
import { TargetPose } from "../character/TargetPose";
import { createPoseData, createSingleMotionPoseData, captureRestPoses, RestPoseCache } from "../character/AnimationFactory";
import { MotionPlayer } from "../character/MotionPlayer";
import {
  createProceduralHumanoid,
  ProceduralHumanoidResult,
  AppearanceConfig,
} from "../character/ProceduralHumanoid";
import {
  DEFAULT_MOTION_CONFIG,
  BlendInput,
} from "../types/CharacterMotionConfig";
import { FaceParams, FACE_CONFIGS, faceConfigToParams } from "../ui/CheckModeTypes";
import { createFacePartsFromParams } from "../character/FaceFactory";
import { MotionDefinition } from "../motion/MotionTypes";
import { IDLE_MOTION } from "../motion/IdleMotion";

const MODEL_PATH = "/";
const MODEL_FILE = "rigged_clothed_body.glb";

/** ── 髪パーツ設定 ── */
const HAIR_PATH = "/kawaki/";
const HAIR_FILE = "scene.gltf";
/** 髪の位置微調整（rootMeshローカル座標） */
const HAIR_OFFSET = new Vector3(0, 0, 0);
const HAIR_SCALE = 1.0;

/** ── 身長比較設定（ここを変更して比較） ── */
const CHARACTER_A_HEIGHT_CM = 170;
const CHARACTER_B_HEIGHT_CM = 190;
const BASE_HEIGHT_CM = 180;

const HEIGHTS = [CHARACTER_A_HEIGHT_CM, CHARACTER_B_HEIGHT_CM];
const X_POSITIONS = [-1.0, 1.0];

/** 各キャラクターの外見設定 */
const APPEARANCES: Partial<AppearanceConfig>[] = [
  { shirtColor: new Color3(0.2, 0.4, 0.8), pantsColor: new Color3(0.2, 0.2, 0.4) },
  { shirtColor: new Color3(0.8, 0.2, 0.2), pantsColor: new Color3(0.4, 0.4, 0.4) },
];

/** 初期 FaceParams を FACE_CONFIGS から生成 */
const INITIAL_FACE_PARAMS = FACE_CONFIGS.map(faceConfigToParams);

/** 通常時のカメラ設定 */
const NORMAL_CAM_ALPHA = -Math.PI / 2;
const NORMAL_CAM_BETA = Math.PI / 3;
const NORMAL_CAM_RADIUS = 5;

/** 顔アップ時のカメラ初期設定 */
export interface FaceCamConfig {
  targetY: number;
  radius: number;
  alpha: number;
  beta: number;
}

const DEFAULT_FACE_CAM: FaceCamConfig = {
  targetY: 1.6,
  radius: 1.26,
  alpha: -Math.PI / 2,
  beta: Math.PI / 2,
};

/** 各キャラクターのリソースをまとめたもの */
interface CharacterInstance {
  rootMesh: AbstractMesh;
  poseBlender: PoseBlender | null;
  blendController: BlendController | null;
  ik: IKSystem;
  pose: TargetPose;
  procedural: ProceduralHumanoidResult | null;
  hairMeshes: AbstractMesh[];
  faceMeshes: AbstractMesh[];
}

export function useHumanoidControl(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [faceParams, setFaceParams] = useState<FaceParams[]>(INITIAL_FACE_PARAMS);
  const [currentMotion, setCurrentMotion] = useState<MotionDefinition>({ ...IDLE_MOTION });
  const [motionPlaying, setMotionPlaying] = useState(true);
  const [faceCamConfig, setFaceCamConfig] = useState<FaceCamConfig>({ ...DEFAULT_FACE_CAM });
  const faceCamRef = useRef<FaceCamConfig>({ ...DEFAULT_FACE_CAM });

  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const instancesRef = useRef<CharacterInstance[]>([]);
  /** 現在のカメラモード: null=通常追従, number=その index のキャラ顔アップ */
  const faceCloseUpRef = useRef<number | null>(null);

  /** モーションチェックモード用 */
  const skeletonsRef = useRef<Skeleton[]>([]);
  const restPoseCachesRef = useRef<RestPoseCache[]>([]);
  const motionCheckActiveRef = useRef(false);
  const motionPlayersRef = useRef<MotionPlayer[]>([]);
  const currentMotionRef = useRef<MotionDefinition>({ ...IDLE_MOTION });
  const motionPlayingRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    const config = { ...DEFAULT_MOTION_CONFIG };
    const keys: Record<string, boolean> = {};

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;

    const camera = new ArcRotateCamera(
      "cam", NORMAL_CAM_ALPHA, NORMAL_CAM_BETA, NORMAL_CAM_RADIUS,
      new Vector3(0, 1, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 0.1;
    camera.upperRadiusLimit = 30;
    cameraRef.current = camera;

    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.3, 0.5, 0.3);
    ground.material = groundMat;
    ground.receiveShadows = true;

    scene.onKeyboardObservable.add((kbInfo) => {
      const key = kbInfo.event.key.toLowerCase();
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        keys[key] = true;
      } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        keys[key] = false;
      }
    });

    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    const initAsync = async () => {
      try {
        const results = await Promise.all(
          HEIGHTS.map(() =>
            SceneLoader.ImportMeshAsync("", MODEL_PATH, MODEL_FILE, scene)
          )
        );
        if (!mounted) return;

        for (const ag of scene.animationGroups) {
          ag.stop();
        }

        const instances: CharacterInstance[] = [];
        const skeletons: Skeleton[] = [];
        const restCaches: RestPoseCache[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const rootMesh = result.meshes[0];
          const skeleton = result.skeletons[0];
          skeletons.push(skeleton);

          if (!skeleton) {
            throw new Error("GLBにスケルトンが含まれていません");
          }

          // PoseBlender 適用前にレスト姿勢をキャッシュ
          const restCache = captureRestPoses(skeleton);
          restCaches.push(restCache ?? new Map());

          rootMesh.position.x = X_POSITIONS[i];
          rootMesh.scaling.setAll(HEIGHTS[i] / BASE_HEIGHT_CM);

          const poseData = createPoseData(skeleton);
          if (!poseData) {
            throw new Error("スケルトンのボーン名が認識できません");
          }
          const poseBlender = new PoseBlender(poseData, config);

          const ik = new IKSystem(scene, config);
          ik.initialize(skeleton, rootMesh);

          const pose = new TargetPose();
          pose.initialize(skeleton);

          const extraMeshes: AbstractMesh[] = [];
          const hairResult = await SceneLoader.ImportMeshAsync(
            "", HAIR_PATH, HAIR_FILE, scene
          );
          extraMeshes.push(...hairResult.meshes);
          const hairRoot = hairResult.meshes[0];
          hairRoot.parent = rootMesh;
          hairRoot.position.copyFrom(HAIR_OFFSET);
          hairRoot.scaling.setAll(HAIR_SCALE);

          const faceMeshes = createFacePartsFromParams(scene, rootMesh, INITIAL_FACE_PARAMS[i], i);

          instances.push({
            rootMesh,
            poseBlender,
            blendController: null,
            ik,
            pose,
            procedural: null,
            hairMeshes: extraMeshes,
            faceMeshes,
          });
        }

        instancesRef.current = instances;
        skeletonsRef.current = skeletons;
        restPoseCachesRef.current = restCaches;

        // ロード完了時に既にモーションチェックモードなら MotionPlayer を生成
        if (motionCheckActiveRef.current) {
          const motion = currentMotionRef.current;
          const players: MotionPlayer[] = [];
          for (let i = 0; i < skeletons.length; i++) {
            const data = createSingleMotionPoseData(skeletons[i], motion, restCaches[i]);
            if (data) {
              const player = new MotionPlayer(data);
              if (motion.isDelta) {
                const baseData = createSingleMotionPoseData(skeletons[i], IDLE_MOTION, restCaches[i]);
                player.setBaseData(baseData);
              }
              players.push(player);
            }
          }
          motionPlayersRef.current = players;
        }

        scene.onBeforeRenderObservable.add(() => {
          const dt = engine.getDeltaTime() / 1000;

          // ── モーションチェックモード ──
          if (motionCheckActiveRef.current) {
            const players = motionPlayersRef.current;
            const advancing = motionPlayingRef.current;
            for (let i = 0; i < instances.length; i++) {
              if (players[i]) {
                players[i].update(advancing ? dt : 0);
              }
              instances[i].ik.update();
              instances[i].pose.capture();
            }
            // カメラ追従（キャラクター位置は固定）
            const posA = instances[0].rootMesh.position;
            const posB = instances[1].rootMesh.position;
            camera.setTarget(new Vector3(
              (posA.x + posB.x) * 0.5,
              1,
              (posA.z + posB.z) * 0.5
            ));
            return;
          }

          const closeUpIdx = faceCloseUpRef.current;

          // 顔アップ中は移動を止める
          if (closeUpIdx === null) {
            const input = wasdToBlendInput(keys);
            for (const inst of instances) {
              inst.poseBlender!.update(input, dt);
              if (input.turnRate !== 0) {
                inst.rootMesh.rotate(Vector3.Up(), -input.turnRate * config.turnSpeed * dt);
              }
              if (input.speed > 0) {
                inst.rootMesh.translate(Vector3.Forward(), input.speed * config.walkSpeed * dt);
              }
              inst.ik.update();
              inst.pose.capture();
            }

            // 通常: カメラ追従
            const posA = instances[0].rootMesh.position;
            const posB = instances[1].rootMesh.position;
            camera.setTarget(new Vector3(
              (posA.x + posB.x) * 0.5,
              1,
              (posA.z + posB.z) * 0.5
            ));
          } else {
            // 顔アップ: アニメーションだけ更新（移動なし）
            const idleInput: BlendInput = { speed: 0, turnRate: 0 };
            for (const inst of instances) {
              inst.poseBlender!.update(idleInput, dt);
              inst.ik.update();
              inst.pose.capture();
            }

            // カメラを対象キャラクターの顔位置に固定（ref から最新値を参照）
            const target = instances[closeUpIdx];
            if (target) {
              const fc = faceCamRef.current;
              const pos = target.rootMesh.position;
              camera.setTarget(new Vector3(pos.x, fc.targetY, pos.z));
              camera.alpha = fc.alpha;
              camera.beta = fc.beta;
              camera.radius = fc.radius;
            }
          }
        });

        if (mounted) {
          setLoading(false);
          setError(null);
        }
      } catch {
        if (!mounted) return;

        try {
          const instances: CharacterInstance[] = [];

          for (let i = 0; i < HEIGHTS.length; i++) {
            const humanoid = createProceduralHumanoid(scene, APPEARANCES[i]);
            humanoid.rootMesh.position.x = X_POSITIONS[i];
            humanoid.rootMesh.scaling.setAll(HEIGHTS[i] / BASE_HEIGHT_CM);

            const blend = new BlendController(
              humanoid.idleAnimation,
              humanoid.walkAnimation,
              config
            );

            const ik = new IKSystem(scene, config);
            ik.initialize(humanoid.skeleton, humanoid.rootMesh);

            const pose = new TargetPose();
            pose.initialize(humanoid.skeleton);

            instances.push({
              rootMesh: humanoid.rootMesh,
              poseBlender: null,
              blendController: blend,
              ik,
              pose,
              procedural: humanoid,
              hairMeshes: [],
              faceMeshes: [],
            });
          }

          instancesRef.current = instances;

          scene.onBeforeAnimationsObservable.add(() => {
            const dt = engine.getDeltaTime() / 1000;
            const input = wasdToBlendInput(keys);

            for (const inst of instances) {
              inst.blendController!.update(input, dt);
              if (input.turnRate !== 0) {
                inst.rootMesh.rotate(Vector3.Up(), -input.turnRate * config.turnSpeed * dt);
              }
              if (input.speed > 0) {
                inst.rootMesh.translate(Vector3.Forward(), input.speed * config.walkSpeed * dt);
              }
            }
          });

          scene.onAfterAnimationsObservable.add(() => {
            for (const inst of instances) {
              inst.ik.update();
              inst.pose.capture();
              inst.procedural?.updateVisuals();
            }

            const posA = instances[0].rootMesh.position;
            const posB = instances[1].rootMesh.position;
            camera.setTarget(new Vector3(
              (posA.x + posB.x) * 0.5,
              1,
              (posA.z + posB.z) * 0.5
            ));
          });

          if (mounted) {
            setLoading(false);
            setError(null);
          }
        } catch (err2) {
          if (mounted) {
            const msg = err2 instanceof Error ? err2.message : "初期化に失敗しました";
            setError(msg);
            setLoading(false);
          }
        }
      }
    };

    initAsync();

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      for (const p of motionPlayersRef.current) p.dispose();
      motionPlayersRef.current = [];
      skeletonsRef.current = [];
      restPoseCachesRef.current = [];
      for (const inst of instancesRef.current) {
        inst.poseBlender?.dispose();
        inst.blendController?.dispose();
        inst.ik.dispose();
        inst.pose.dispose();
        inst.procedural?.dispose();
        for (const m of inst.hairMeshes) m.dispose();
        for (const m of inst.faceMeshes) m.dispose();
      }
      instancesRef.current = [];
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      sceneRef.current = null;
      engineRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 顔パラメータ更新: メッシュを再生成して即時反映 */
  const updateFaceParams = useCallback(
    (index: number, params: FaceParams) => {
      setFaceParams((prev) => {
        const next = [...prev];
        next[index] = params;
        return next;
      });

      const scene = sceneRef.current;
      const inst = instancesRef.current[index];
      if (!scene || !inst) return;

      for (const m of inst.faceMeshes) {
        m.dispose();
      }
      inst.faceMeshes = createFacePartsFromParams(scene, inst.rootMesh, params, index);
    },
    []
  );

  /** カメラを顔アップ / 通常に切り替え */
  const setFaceCloseUp = useCallback((charIndex: number | null) => {
    faceCloseUpRef.current = charIndex;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    if (charIndex === null) {
      // 通常モードに復帰（カメラ操作を再有効化）
      camera.attachControl(canvas, true);
      camera.alpha = NORMAL_CAM_ALPHA;
      camera.beta = NORMAL_CAM_BETA;
      camera.radius = NORMAL_CAM_RADIUS;
    } else {
      const inst = instancesRef.current[charIndex];
      if (!inst) return;
      const fc = faceCamRef.current;
      const pos = inst.rootMesh.position;
      camera.setTarget(new Vector3(pos.x, fc.targetY, pos.z));
      camera.alpha = fc.alpha;
      camera.beta = fc.beta;
      camera.radius = fc.radius;
      // カメラ操作を無効化して固定
      camera.detachControl();
    }
  }, [canvasRef]);

  /** 顔カメラ設定更新 */
  const updateFaceCam = useCallback((config: FaceCamConfig) => {
    faceCamRef.current = config;
    setFaceCamConfig(config);
  }, []);

  /** モーション更新（キーフレーム編集時に MotionPlayer をホットスワップ） */
  const updateMotion = useCallback((motion: MotionDefinition) => {
    const prevName = currentMotionRef.current.name;
    setCurrentMotion(motion);
    currentMotionRef.current = motion;

    if (motionCheckActiveRef.current) {
      const skeletons = skeletonsRef.current;
      const caches = restPoseCachesRef.current;
      const players = motionPlayersRef.current;
      const nameChanged = motion.name !== prevName;

      for (let i = 0; i < players.length; i++) {
        const skeleton = skeletons[i];
        if (!skeleton) continue;
        const data = createSingleMotionPoseData(skeleton, motion, caches[i]);
        if (data) {
          players[i].setData(data);
          // モーション切替時のみベースを更新（キーフレーム編集時は不要）
          if (nameChanged) {
            if (motion.isDelta) {
              const baseData = createSingleMotionPoseData(skeleton, IDLE_MOTION, caches[i]);
              players[i].setBaseData(baseData);
            } else {
              players[i].setBaseData(null);
            }
          }
        }
      }
    }
  }, []);

  /** モーションチェックモードの切り替え */
  const setMotionCheckMode = useCallback((active: boolean) => {
    motionCheckActiveRef.current = active;
    if (active) {
      const motion = currentMotionRef.current;
      const players: MotionPlayer[] = [];
      const skeletons = skeletonsRef.current;
      const caches = restPoseCachesRef.current;
      for (let i = 0; i < skeletons.length; i++) {
        const data = createSingleMotionPoseData(skeletons[i], motion, caches[i]);
        if (data) {
          const player = new MotionPlayer(data);
          if (motion.isDelta) {
            const baseData = createSingleMotionPoseData(skeletons[i], IDLE_MOTION, caches[i]);
            player.setBaseData(baseData);
          }
          players.push(player);
        }
      }
      for (const p of motionPlayersRef.current) p.dispose();
      motionPlayersRef.current = players;
    } else {
      for (const p of motionPlayersRef.current) p.dispose();
      motionPlayersRef.current = [];
    }
  }, []);

  /** 再生/一時停止の切り替え（refも同期） */
  const handleSetMotionPlaying = useCallback((playing: boolean) => {
    setMotionPlaying(playing);
    motionPlayingRef.current = playing;
  }, []);

  /** 現在の再生時刻を取得（UI のタイムバー用） */
  const getPlaybackTime = useCallback((): number => {
    const players = motionPlayersRef.current;
    return players.length > 0 ? players[0].currentTime : 0;
  }, []);

  return {
    loading,
    error,
    faceParams,
    updateFaceParams,
    setFaceCloseUp,
    faceCamConfig,
    updateFaceCam,
    currentMotion,
    updateMotion,
    motionPlaying,
    setMotionPlaying: handleSetMotionPlaying,
    setMotionCheckMode,
    getPlaybackTime,
  };
}

/** WASD キー入力を BlendInput に変換 */
function wasdToBlendInput(keys: Record<string, boolean>): BlendInput {
  let speed = 0;
  let turnRate = 0;

  if (keys["w"]) speed = 1;
  if (keys["s"]) speed = -0.3;
  if (keys["a"]) turnRate = -1;
  if (keys["d"]) turnRate = 1;

  const clampedSpeed = Math.max(speed, 0);
  return { speed: clampedSpeed, turnRate };
}
