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
  TransformNode,
  Skeleton,
} from "@babylonjs/core";
import { Camera, CAMERA_PRESETS } from "@/GamePlay/Object/Entities/Camera";
import type { FaceCamConfig } from "@/GamePlay/Object/Entities/Camera";
import "@babylonjs/loaders/glTF";
import { BlendController } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/BlendController";
import { PoseBlender } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/PoseBlender";
import { IKSystem } from "@/GamePlay/GameSystem/CharacterModel/Character/IKSystem";
import { TargetPose } from "@/GamePlay/GameSystem/CharacterModel/Character/TargetPose";
import { createPoseData, createSingleMotionPoseData, captureRestPoses, RestPoseCache, findBoneForJoint, getJointCorrection } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";
import { MotionPlayer } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionPlayer";
import {
  createProceduralHumanoid,
  ProceduralHumanoidResult,
  AppearanceConfig,
} from "@/GamePlay/GameSystem/CharacterModel/Character/ProceduralHumanoid";
import { logBoneOffsetsForProcedural } from "@/GamePlay/GameSystem/CharacterModel/Character/BoneExtractor";
import {
  DEFAULT_MOTION_CONFIG,
  BlendInput,
} from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { FaceParams, FACE_CONFIGS, faceConfigToParams } from "@/GamePlay/GameSystem/CharacterModel/UI/CheckModeTypes";
import { MotionDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDefinitionTypes";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/ViewerIdleMotion";

const MODEL_PATH = "/";
const MODEL_FILE = "seconf.glb";

/** ── 髪差し替え設定 ── */
const HAIR_MODEL_FILE = "newmodel.glb";
/** メインモデルで非表示にするメッシュ名 */
const MAIN_HIDE_MESHES = ["Ch42_Hair1", "Cube"];
/** 髪モデルで表示するメッシュ名（それ以外は非表示） */
const HAIR_SHOW_MESHES = ["Hair"];
/** 髪モデルのスケール補正（seconf Hips高さ / newmodel Hips高さ） */
const HAIR_SCALE_RATIO = 96.37 / 209.15;

/** ── キャラクター配置設定 ── */
const BASE_HEIGHT_CM = 180;
/** GLBモデル（左側） */
const GLB_HEIGHT_CM = 180;
const GLB_X = -1.0;
/** ProceduralHumanoid（右側） */
const PROCEDURAL_HEIGHT_CM = 180;
const PROCEDURAL_X = 1.0;

/** 各キャラクターの外見設定 */
const APPEARANCES: Partial<AppearanceConfig>[] = [
  { shirtColor: new Color3(0.2, 0.4, 0.8), pantsColor: new Color3(0.2, 0.2, 0.4) },
  { shirtColor: new Color3(0.8, 0.2, 0.2), pantsColor: new Color3(0.4, 0.4, 0.4) },
];

/** 初期 FaceParams（新モデルには顔パーツ内蔵のため生成不要だが、UI互換のため保持） */
const INITIAL_FACE_PARAMS = FACE_CONFIGS.map(faceConfigToParams);

// FaceCamConfig を re-export（FaceCheckPanel.tsx が依存）
export type { FaceCamConfig } from "@/GamePlay/Object/Entities/Camera";

const DEFAULT_FACE_CAM: FaceCamConfig = { ...CAMERA_PRESETS.humanoidFace };

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
  /** 髪モデルのスケルトン（メインスケルトンと同期させる） */
  hairSkeleton: Skeleton | null;
  /** 髪モデルのルートメッシュ（dispose用） */
  hairRootMesh: AbstractMesh | null;
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
  /** ジョイントインジケータ用（補正ノード含む） */
  const indicatorMeshesRef = useRef<TransformNode[]>([]);

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

    const camera = Camera.createHumanoidCamera(scene, canvas);
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
        // GLBモデル1体 + 髪モデル1体を並列読み込み
        const [glbResult, hairResult] = await Promise.all([
          SceneLoader.ImportMeshAsync("", MODEL_PATH, MODEL_FILE, scene),
          SceneLoader.ImportMeshAsync("", MODEL_PATH, HAIR_MODEL_FILE, scene),
        ]);
        if (!mounted) return;

        // 埋め込みアニメーションを停止・破棄（PoseBlenderとの競合を防止）
        for (const ag of scene.animationGroups) {
          ag.stop();
          ag.dispose();
        }

        const instances: CharacterInstance[] = [];
        const skeletons: Skeleton[] = [];
        const restCaches: RestPoseCache[] = [];

        // ── instance[0]: GLBモデル（左側）──
        {
          const rootMesh = glbResult.meshes[0];
          const skeleton = glbResult.skeletons[0];
          if (!skeleton) {
            throw new Error("GLBにスケルトンが含まれていません");
          }

          logBoneOffsetsForProcedural(skeleton);

          const restCache = captureRestPoses(skeleton) ?? new Map();
          skeletons.push(skeleton);
          restCaches.push(restCache);

          rootMesh.position.x = GLB_X;
          rootMesh.scaling.setAll(GLB_HEIGHT_CM / BASE_HEIGHT_CM);

          const poseData = createPoseData(skeleton, restCache);
          if (!poseData) {
            throw new Error("スケルトンのボーン名が認識できません");
          }
          const poseBlender = new PoseBlender(poseData, config);

          const ik = new IKSystem(scene, config);
          ik.initialize(skeleton, rootMesh);

          const pose = new TargetPose();
          pose.initialize(skeleton);

          // メインモデルの不要メッシュを非表示
          for (const m of glbResult.meshes) {
            if (MAIN_HIDE_MESHES.includes(m.name)) {
              m.setEnabled(false);
            }
          }

          // ── 髪モデルのセットアップ ──
          const hairRootMesh = hairResult.meshes[0];
          const hairSkeleton = hairResult.skeletons[0] ?? null;

          hairRootMesh.position.copyFrom(rootMesh.position);
          hairRootMesh.scaling.copyFrom(rootMesh.scaling);
          hairRootMesh.scaling.scaleInPlace(HAIR_SCALE_RATIO);

          for (const m of hairResult.meshes) {
            if (m !== hairRootMesh && !HAIR_SHOW_MESHES.includes(m.name)) {
              m.setEnabled(false);
            }
          }

          const hairMeshes = hairResult.meshes.filter(
            m => m !== hairRootMesh && HAIR_SHOW_MESHES.includes(m.name)
          );

          instances.push({
            rootMesh,
            poseBlender,
            blendController: null,
            ik,
            pose,
            procedural: null,
            hairMeshes,
            faceMeshes: [],
            hairSkeleton,
            hairRootMesh,
          });
        }

        // ── instance[1]: ProceduralHumanoid（右側）──
        {
          const humanoid = createProceduralHumanoid(scene, APPEARANCES[1]);
          humanoid.rootMesh.position.x = PROCEDURAL_X;
          humanoid.rootMesh.scaling.setAll(PROCEDURAL_HEIGHT_CM / BASE_HEIGHT_CM);

          // ProceduralHumanoid のアニメーションを停止（MotionPlayer で制御するため）
          humanoid.idleAnimation.stop();
          humanoid.walkAnimation.stop();

          const procSkeleton = humanoid.skeleton;
          const procRestCache = captureRestPoses(procSkeleton) ?? new Map();
          skeletons.push(procSkeleton);
          restCaches.push(procRestCache);

          const ik = new IKSystem(scene, config);
          ik.initialize(procSkeleton, humanoid.rootMesh);

          const pose = new TargetPose();
          pose.initialize(procSkeleton);

          instances.push({
            rootMesh: humanoid.rootMesh,
            poseBlender: null,
            blendController: null,
            ik,
            pose,
            procedural: humanoid,
            hairMeshes: [],
            faceMeshes: [],
            hairSkeleton: null,
            hairRootMesh: null,
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
              instances[i].ik.update(0);
              instances[i].pose.capture();
              // ProceduralHumanoid のビジュアルをボーン位置に同期
              instances[i].procedural?.updateVisuals();
            }
            // 髪スケルトンをメインに同期
            syncAllHairSkeletons(instances, skeletons);
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
              // GLBモデルは PoseBlender、ProceduralHumanoid はスキップ（モーションチェック専用）
              inst.poseBlender?.update(input, dt);
              if (input.turnRate !== 0) {
                inst.rootMesh.rotate(Vector3.Up(), -input.turnRate * config.turnSpeed * dt);
              }
              if (input.speed > 0) {
                inst.rootMesh.translate(Vector3.Forward(), input.speed * config.walkSpeed * dt);
              }
              // 髪モデルのルートをメインに追従
              if (inst.hairRootMesh) {
                inst.hairRootMesh.position.copyFrom(inst.rootMesh.position);
                inst.hairRootMesh.rotationQuaternion = inst.rootMesh.rotationQuaternion?.clone() ?? null;
              }
              inst.ik.update(input.speed);
              inst.pose.capture();
              inst.procedural?.updateVisuals();
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
              inst.poseBlender?.update(idleInput, dt);
              inst.ik.update(0);
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

          // 髪スケルトンをメインに同期（全モード共通）
          syncAllHairSkeletons(instances, skeletons);
        });

        if (mounted) {
          setLoading(false);
          setError(null);
        }
      } catch {
        if (!mounted) return;

        try {
          const instances: CharacterInstance[] = [];
          const fallbackHeights = [GLB_HEIGHT_CM, PROCEDURAL_HEIGHT_CM];
          const fallbackXPositions = [GLB_X, PROCEDURAL_X];

          for (let i = 0; i < 2; i++) {
            const humanoid = createProceduralHumanoid(scene, APPEARANCES[i]);
            humanoid.rootMesh.position.x = fallbackXPositions[i];
            humanoid.rootMesh.scaling.setAll(fallbackHeights[i] / BASE_HEIGHT_CM);

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
              hairSkeleton: null,
              hairRootMesh: null,
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
      for (const m of indicatorMeshesRef.current) m.dispose();
      indicatorMeshesRef.current = [];
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
        inst.hairRootMesh?.dispose();
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

  /** 顔パラメータ更新（新モデルは顔パーツ内蔵のため状態更新のみ） */
  const updateFaceParams = useCallback(
    (index: number, params: FaceParams) => {
      setFaceParams((prev) => {
        const next = [...prev];
        next[index] = params;
        return next;
      });
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
      camera.alpha = CAMERA_PRESETS.humanoidNormal.alpha;
      camera.beta = CAMERA_PRESETS.humanoidNormal.beta;
      camera.radius = CAMERA_PRESETS.humanoidNormal.radius;
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
      // ProceduralHumanoid のアニメーションを停止（MotionPlayer で制御するため）
      for (const inst of instancesRef.current) {
        if (inst.procedural) {
          inst.procedural.idleAnimation.stop();
          inst.procedural.walkAnimation.stop();
        }
      }
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

  /**
   * 腕IKターゲットを設定する。
   * @param charIndex キャラクターインデックス
   * @param side "left" | "right"
   * @param target シーン内のTransformNode。null で解除。
   */
  const setArmTarget = useCallback(
    (charIndex: number, side: "left" | "right", target: TransformNode | null) => {
      const inst = instancesRef.current[charIndex];
      if (!inst) return;
      inst.ik.setArmTarget(side, target);
    },
    []
  );

  /** 選択中のジョイントをハイライト表示（XYZ矢印付き、右側ボーン補正対応） */
  const setHighlightedJoint = useCallback((jointName: string | null) => {
    // 既存のインジケータを破棄
    for (const m of indicatorMeshesRef.current) m.dispose();
    indicatorMeshesRef.current = [];

    if (!jointName) return;

    const scene = sceneRef.current;
    if (!scene) return;

    // renderingGroup 1 は深度クリアして常に手前に描画
    scene.setRenderingAutoClearDepthStencil(1, true, true);

    const skeletons = skeletonsRef.current;
    const caches = restPoseCachesRef.current;
    const nodes: TransformNode[] = [];
    const arrowLen = 0.25;

    for (let si = 0; si < skeletons.length; si++) {
      const skeleton = skeletons[si];
      const bone = findBoneForJoint(skeleton, jointName);
      if (!bone) continue;

      const boneNode = bone.getTransformNode() ?? bone;

      // 右側ボーンの補正がある場合、中間ノードで矢印軸を補正
      const corr = getJointCorrection(skeleton, jointName, caches[si]);
      let parentNode: TransformNode | typeof bone = boneNode;
      if (corr) {
        const comp = new TransformNode("jind_comp", scene);
        comp.parent = boneNode;
        comp.rotationQuaternion = corr.clone();
        nodes.push(comp);
        parentNode = comp;
      }

      // ジョイント位置のハイライト球
      const sphere = MeshBuilder.CreateSphere("jind_sphere", { diameter: 0.05 }, scene);
      const sphereMat = new StandardMaterial("jind_sphereMat", scene);
      sphereMat.emissiveColor = new Color3(1, 1, 0);
      sphereMat.disableLighting = true;
      sphere.material = sphereMat;
      sphere.parent = parentNode;
      sphere.renderingGroupId = 1;

      // X軸（赤）
      const xLine = MeshBuilder.CreateLines("jind_x", {
        points: [Vector3.Zero(), new Vector3(arrowLen, 0, 0)],
      }, scene);
      xLine.color = new Color3(1, 0, 0);
      xLine.parent = parentNode;
      xLine.renderingGroupId = 1;

      const xTip = MeshBuilder.CreateSphere("jind_xTip", { diameter: 0.025 }, scene);
      xTip.position = new Vector3(arrowLen, 0, 0);
      const xMat = new StandardMaterial("jind_xMat", scene);
      xMat.emissiveColor = new Color3(1, 0, 0);
      xMat.disableLighting = true;
      xTip.material = xMat;
      xTip.parent = parentNode;
      xTip.renderingGroupId = 1;

      // Y軸（緑）
      const yLine = MeshBuilder.CreateLines("jind_y", {
        points: [Vector3.Zero(), new Vector3(0, arrowLen, 0)],
      }, scene);
      yLine.color = new Color3(0, 1, 0);
      yLine.parent = parentNode;
      yLine.renderingGroupId = 1;

      const yTip = MeshBuilder.CreateSphere("jind_yTip", { diameter: 0.025 }, scene);
      yTip.position = new Vector3(0, arrowLen, 0);
      const yMat = new StandardMaterial("jind_yMat", scene);
      yMat.emissiveColor = new Color3(0, 1, 0);
      yMat.disableLighting = true;
      yTip.material = yMat;
      yTip.parent = parentNode;
      yTip.renderingGroupId = 1;

      // Z軸（青）
      const zLine = MeshBuilder.CreateLines("jind_z", {
        points: [Vector3.Zero(), new Vector3(0, 0, arrowLen)],
      }, scene);
      zLine.color = new Color3(0, 0, 1);
      zLine.parent = parentNode;
      zLine.renderingGroupId = 1;

      const zTip = MeshBuilder.CreateSphere("jind_zTip", { diameter: 0.025 }, scene);
      zTip.position = new Vector3(0, 0, arrowLen);
      const zMat = new StandardMaterial("jind_zMat", scene);
      zMat.emissiveColor = new Color3(0, 0, 1);
      zMat.disableLighting = true;
      zTip.material = zMat;
      zTip.parent = parentNode;
      zTip.renderingGroupId = 1;

      nodes.push(sphere, xLine, xTip, yLine, yTip, zLine, zTip);
    }

    indicatorMeshesRef.current = nodes;
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
    setHighlightedJoint,
    setArmTarget,
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

/**
 * 髪モデルのスケルトンをメインスケルトンに同期する。
 * 同名ボーンの rotationQuaternion をコピーして、
 * 髪メッシュがメインキャラクターのポーズに追従するようにする。
 */
function syncAllHairSkeletons(
  instances: CharacterInstance[],
  mainSkeletons: Skeleton[],
): void {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const hairSkel = inst.hairSkeleton;
    const mainSkel = mainSkeletons[i];
    if (!hairSkel || !mainSkel) continue;

    for (const mainBone of mainSkel.bones) {
      const srcNode = mainBone.getTransformNode();
      if (!srcNode?.rotationQuaternion) continue;

      const hairBone = hairSkel.bones.find(b => b.name === mainBone.name);
      if (!hairBone) continue;

      const tgtNode = hairBone.getTransformNode();
      if (!tgtNode) continue;

      if (!tgtNode.rotationQuaternion) {
        tgtNode.rotationQuaternion = srcNode.rotationQuaternion.clone();
      } else {
        tgtNode.rotationQuaternion.copyFrom(srcNode.rotationQuaternion);
      }
    }
  }
}
