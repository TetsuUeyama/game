import { useEffect, useRef, useState } from "react";
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
  Mesh,
  VertexData,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { BlendController } from "../character/BlendController";
import { PoseBlender } from "../character/PoseBlender";
import { IKSystem } from "../character/IKSystem";
import { TargetPose } from "../character/TargetPose";
import { createPoseData } from "../character/AnimationFactory";
import {
  createProceduralHumanoid,
  ProceduralHumanoidResult,
  AppearanceConfig,
} from "../character/ProceduralHumanoid";
import {
  DEFAULT_MOTION_CONFIG,
  BlendInput,
} from "../types/CharacterMotionConfig";

const MODEL_PATH = "/";
const MODEL_FILE = "rigged_clothed_body.glb";

/** ── 髪パーツ設定 ── */
const HAIR_PATH = "/kawaki/";
const HAIR_FILE = "scene.gltf";
/** 髪の位置微調整（rootMeshローカル座標） */
const HAIR_OFFSET = new Vector3(0, 0, 0);
const HAIR_SCALE = 1.0;

/** ── 顔パーツプリセット ── */
interface EyePreset {
  diameter: number;
  scaleX: number;     // 横方向スケール（1.0=球、>1で横長）
  scaleY: number;     // 縦方向スケール
  spacing: number;    // 中心からの左右距離
  y: number;
  z: number;
  angle: number;      // Z軸回転（rad）正=外側上がり（左右対称に適用）
}
interface NosePreset {
  shape: "box" | "wedge" | "halfCone";
  width: number;
  height: number;
  depth: number;
  y: number;
  z: number;
  topRatio?: number;  // halfCone用: 上面の底面に対する比率（0=頂点, 0<r<1=錐台）
}
interface MouthPreset {
  halfWidth: number;  // 片側の幅
  height: number;
  depth: number;
  y: number;
  z: number;
  angle: number;      // Z軸回転（rad）正=口角上がり（笑顔）
}
interface FaceConfig {
  eyes: string;
  nose: string;
  mouth: string;
}

const EYE_PRESETS: Record<string, EyePreset> = {
  round:  { diameter: 0.025, scaleX: 1.0, scaleY: 1.0, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0 },
  narrow: { diameter: 0.022, scaleX: 1.4, scaleY: 0.6, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0 },
  large:  { diameter: 0.035, scaleX: 1.0, scaleY: 1.0, spacing: 0.035, y: 1.63, z: 0.12, angle: 0 },
  angry:  { diameter: 0.024, scaleX: 1.3, scaleY: 0.7, spacing: 0.03,  y: 1.63, z: 0.12, angle: -0.2 },
  sad:    { diameter: 0.024, scaleX: 1.3, scaleY: 0.7, spacing: 0.03,  y: 1.63, z: 0.12, angle: 0.2 },
};

const NOSE_PRESETS: Record<string, NosePreset> = {
  normal:       { shape: "box",      width: 0.015, height: 0.025, depth: 0.02,  y: 1.59, z: 0.13 },
  pointed:      { shape: "wedge",    width: 0.02, height: 0.03 * Math.sqrt(3), depth: 0.03, y: 1.59, z: 0.13 },
  halfCone:     { shape: "halfCone", width: 0.025, height: 0.04,  depth: 0.025, y: 1.59, z: 0.12, topRatio: 0 },
  halfConeTrunc:{ shape: "halfCone", width: 0.025, height: 0.04,  depth: 0.025, y: 1.59, z: 0.12, topRatio: 0.4 },
  flat:         { shape: "box",      width: 0.025, height: 0.015, depth: 0.015, y: 1.59, z: 0.13 },
};

const MOUTH_PRESETS: Record<string, MouthPreset> = {
  normal: { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0 },
  smile:  { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0.3 },
  frown:  { halfWidth: 0.02,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: -0.3 },
  wide:   { halfWidth: 0.03,  height: 0.008, depth: 0.01,  y: 1.55, z: 0.12, angle: 0 },
  small:  { halfWidth: 0.012, height: 0.006, depth: 0.008, y: 1.55, z: 0.12, angle: 0 },
};

/** 各キャラクターの顔設定（プリセット名を指定） */
const FACE_CONFIGS: FaceConfig[] = [
  { eyes: "round",  nose: "normal",  mouth: "normal" }, // Character A（左）
  { eyes: "angry",  nose: "halfConeTrunc", mouth: "smile" },  // Character B（右）
];

/** ── 身長比較設定（ここを変更して比較） ── */
const CHARACTER_A_HEIGHT_CM = 170; // 左のキャラクター（cm）
const CHARACTER_B_HEIGHT_CM = 190; // 右のキャラクター（cm）
const BASE_HEIGHT_CM = 180;        // プロシージャルモデルの基準身長

const HEIGHTS = [CHARACTER_A_HEIGHT_CM, CHARACTER_B_HEIGHT_CM];
const X_POSITIONS = [-1.0, 1.0]; // 左、右

/** 各キャラクターの外見設定 */
const APPEARANCES: Partial<AppearanceConfig>[] = [
  { // Character A（左）: 青シャツ・紺パンツ
    shirtColor: new Color3(0.2, 0.4, 0.8),
    pantsColor: new Color3(0.2, 0.2, 0.4),
  },
  { // Character B（右）: 赤シャツ・グレーパンツ
    shirtColor: new Color3(0.8, 0.2, 0.2),
    pantsColor: new Color3(0.4, 0.4, 0.4),
  },
];

/** 各キャラクターのリソースをまとめたもの */
interface CharacterInstance {
  rootMesh: AbstractMesh;
  poseBlender: PoseBlender | null;
  blendController: BlendController | null;
  ik: IKSystem;
  pose: TargetPose;
  procedural: ProceduralHumanoidResult | null;
  hairMeshes: AbstractMesh[];
}

/**
 * 人型キャラクター制御 React Hook（2体配置・身長比較用）
 *
 * 初期化の流れ:
 * 1. GLBロードを試行（2体分ロード）
 * 2. GLBが無い場合はプロシージャル人型にフォールバック（2体分生成）
 * 3. 各キャラクターに PoseBlender/BlendController + IKSystem + TargetPose を統合
 *
 * WASD キーボード入力 → 両キャラクター同時に適用
 */
export function useHumanoidControl(
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const instancesRef = useRef<CharacterInstance[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    const config = { ...DEFAULT_MOTION_CONFIG };
    const keys: Record<string, boolean> = {};

    // --- Engine + Scene ---
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    sceneRef.current = scene;

    // カメラ: 2体の中間を見る、やや引いた位置
    const camera = new ArcRotateCamera(
      "cam", -Math.PI / 2, Math.PI / 3, 5,
      new Vector3(0, 1, 0), scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 30;

    new HemisphericLight("light", new Vector3(0, 1, 0.3), scene);

    // 地面
    const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.3, 0.5, 0.3);
    ground.material = groundMat;
    ground.receiveShadows = true;

    // キーボードイベント
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

    // --- GLBロード → フォールバック ---
    const initAsync = async () => {
      try {
        // GLBからメッシュ＋スケルトンをロード（2体分）
        const results = await Promise.all(
          HEIGHTS.map(() =>
            SceneLoader.ImportMeshAsync("", MODEL_PATH, MODEL_FILE, scene)
          )
        );
        if (!mounted) return;

        // GLB既存アニメーションを全停止（PoseBlenderで直接制御するため）
        for (const ag of scene.animationGroups) {
          ag.stop();
        }

        const instances: CharacterInstance[] = [];

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const rootMesh = result.meshes[0];
          const skeleton = result.skeletons[0];

          if (!skeleton) {
            throw new Error("GLBにスケルトンが含まれていません");
          }

          // 位置・スケール
          rootMesh.position.x = X_POSITIONS[i];
          rootMesh.scaling.setAll(HEIGHTS[i] / BASE_HEIGHT_CM);

          // PoseBlender用のキーフレームデータを生成
          const poseData = createPoseData(skeleton);
          if (!poseData) {
            throw new Error("スケルトンのボーン名が認識できません");
          }
          const poseBlender = new PoseBlender(poseData, config);

          const ik = new IKSystem(scene, config);
          ik.initialize(skeleton, rootMesh);

          const pose = new TargetPose();
          pose.initialize(skeleton);

          // 髪パーツをロードしてrootMeshの子として配置
          // （髪モデルの頂点座標が既にY≈1.6にあるため、頭の位置に一致する）
          const extraMeshes: AbstractMesh[] = [];
          const hairResult = await SceneLoader.ImportMeshAsync(
            "", HAIR_PATH, HAIR_FILE, scene
          );
          extraMeshes.push(...hairResult.meshes);
          const hairRoot = hairResult.meshes[0];
          hairRoot.parent = rootMesh;
          hairRoot.position.copyFrom(HAIR_OFFSET);
          hairRoot.scaling.setAll(HAIR_SCALE);

          // 顔パーツをプリセットから生成
          const faceMeshes = createFaceParts(scene, rootMesh, FACE_CONFIGS[i], i);
          extraMeshes.push(...faceMeshes);

          instances.push({
            rootMesh,
            poseBlender,
            blendController: null,
            ik,
            pose,
            procedural: null,
            hairMeshes: extraMeshes,
          });
        }

        instancesRef.current = instances;

        // 毎フレーム: 全キャラクター更新（PoseBlenderは直接bone設定のためonBeforeRender）
        scene.onBeforeRenderObservable.add(() => {
          const dt = engine.getDeltaTime() / 1000;
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

          // カメラ追従（2体の中間点）
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
      } catch {
        // GLBが無い → プロシージャルにフォールバック
        if (!mounted) return;

        try {
          const instances: CharacterInstance[] = [];

          for (let i = 0; i < HEIGHTS.length; i++) {
            const humanoid = createProceduralHumanoid(scene, APPEARANCES[i]);

            // 位置・スケール
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
            });
          }

          instancesRef.current = instances;

          // Phase 1: 入力 → Blend更新 → 移動（アニメーション評価前）
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

          // Phase 2: IK + ビジュアル + ポーズ（アニメーション評価後）
          scene.onAfterAnimationsObservable.add(() => {
            for (const inst of instances) {
              inst.ik.update();
              inst.pose.capture();
              inst.procedural?.updateVisuals();
            }

            // カメラ追従（2体の中間点）
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

    // --- Cleanup ---
    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      for (const inst of instancesRef.current) {
        inst.poseBlender?.dispose();
        inst.blendController?.dispose();
        inst.ik.dispose();
        inst.pose.dispose();
        inst.procedural?.dispose();
        for (const m of inst.hairMeshes) m.dispose();
      }
      instancesRef.current = [];
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
 * 直角三角形の断面を持つ楔形メッシュを生成（鼻用）
 *
 * 横から見た断面:
 *   top-back |\
 *            | \  slope（鼻筋）
 *            |  \
 *   bot-back |___\ bot-front（鼻先）
 *
 * back 面が顔表面に接し、tip が前方に突き出る
 */
function createWedgeNose(
  name: string, width: number, height: number, depth: number, scene: Scene,
): Mesh {
  const mesh = new Mesh(name, scene);
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;

  // 各面ごとに頂点を定義（法線を面ごとに正しく設定するため）
  const positions = [
    // Bottom (Y = -h)
    -w, -h, -d,   w, -h, -d,   w, -h,  d,  -w, -h,  d,
    // Back (Z = -d)
    -w, -h, -d,  -w,  h, -d,   w,  h, -d,   w, -h, -d,
    // Slope (top-back → bottom-front)
    -w,  h, -d,  -w, -h,  d,   w, -h,  d,   w,  h, -d,
    // Left triangle (X = -w)
    -w, -h, -d,  -w, -h,  d,  -w,  h, -d,
    // Right triangle (X = w)
     w, -h, -d,   w,  h, -d,   w, -h,  d,
  ];

  const indices = [
    0, 1, 2,   0, 2, 3,      // bottom
    4, 5, 6,   4, 6, 7,      // back
    8, 9, 10,  8, 10, 11,    // slope
    12, 13, 14,               // left
    15, 16, 17,               // right
  ];

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  return mesh;
}

/**
 * 半円錐 / 半円錐台メッシュを生成（鼻用）
 *
 * 円錐を縦に半分に割った形:
 *   - 上面: 半円（topRatio>0 の場合）または頂点（topRatio=0）
 *   - 底面: 半円（鼻の穴側）
 *   - 背面（平面）: 顔に接する面
 *   - 前面（曲面）: 前方に膨らむ面
 *
 * width    = 底面の左右幅（直径）
 * height   = 上下の高さ
 * depth    = 前方への突出量（半円の半径）
 * topRatio = 上面の底面に対する比率（0=頂点, 0<r≤1=錐台）
 */
function createHalfConeNose(
  name: string, width: number, height: number, depth: number, scene: Scene,
  topRatio: number = 0, segments: number = 12,
): Mesh {
  const mesh = new Mesh(name, scene);
  const w = width / 2;
  const h = height / 2;
  const tr = Math.max(0, Math.min(1, topRatio));

  // 半円ポイントを生成するヘルパー
  function makeHalfCircle(
    halfW: number, y: number, d: number,
  ): [number, number, number][] {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * i) / segments;
      pts.push([halfW * Math.cos(angle), y, d * Math.sin(angle)]);
    }
    return pts;
  }

  // 底面（下端 Y=-h）
  const bottom = makeHalfCircle(w, -h, depth);

  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;

  // 頂点を追加するショートカット
  function push3(p: [number, number, number]) {
    positions.push(p[0], p[1], p[2]);
  }

  if (tr === 0) {
    // ── 頂点モード（三角錐）──
    const apex: [number, number, number] = [0, h, 0];

    // 曲面: 頂点→底面半円の三角形ファン
    for (let i = 0; i < segments; i++) {
      push3(apex); push3(bottom[i]); push3(bottom[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }

    // 背面（平面三角形）: 頂点→左端→右端
    push3(apex); push3(bottom[segments]); push3(bottom[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
  } else {
    // ── 錐台モード（上面あり）──
    const top = makeHalfCircle(w * tr, h, depth * tr);

    // 曲面: 上下の半円をクワッドストリップで接続
    for (let i = 0; i < segments; i++) {
      push3(top[i]); push3(bottom[i]); push3(bottom[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
      push3(top[i]); push3(bottom[i + 1]); push3(top[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }

    // 背面（平面四角形）: Z=0 平面上の台形
    push3(top[segments]); push3(bottom[segments]); push3(bottom[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
    push3(top[segments]); push3(bottom[0]); push3(top[0]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;

    // 上面キャップ: 半円ファン
    const topC: [number, number, number] = [0, h, 0];
    for (let i = 0; i < segments; i++) {
      push3(topC); push3(top[i]); push3(top[i + 1]);
      indices.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
  }

  // 底面キャップ（共通）: 半円ファン
  const botC: [number, number, number] = [0, -h, 0];
  for (let i = 0; i < segments; i++) {
    push3(botC); push3(bottom[i + 1]); push3(bottom[i]);
    indices.push(vi, vi + 1, vi + 2);
    vi += 3;
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  return mesh;
}

/** プリセットに基づいて顔パーツ（目・鼻・口）を生成 */
function createFaceParts(
  scene: Scene,
  rootMesh: AbstractMesh,
  face: FaceConfig,
  index: number,
): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];

  // 目
  const ep = EYE_PRESETS[face.eyes];
  const eyeMat = new StandardMaterial(`eyeMat_${index}`, scene);
  eyeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);

  const eyeL = MeshBuilder.CreateSphere(`eyeL_${index}`, { diameter: ep.diameter }, scene);
  eyeL.material = eyeMat;
  eyeL.parent = rootMesh;
  eyeL.position.set(-ep.spacing, ep.y, ep.z);
  eyeL.scaling.set(ep.scaleX, ep.scaleY, 1.0);
  eyeL.rotation.z = ep.angle;      // 正=外側上がり

  const eyeR = MeshBuilder.CreateSphere(`eyeR_${index}`, { diameter: ep.diameter }, scene);
  eyeR.material = eyeMat;
  eyeR.parent = rootMesh;
  eyeR.position.set(ep.spacing, ep.y, ep.z);
  eyeR.scaling.set(ep.scaleX, ep.scaleY, 1.0);
  eyeR.rotation.z = -ep.angle;     // 左右対称に反転

  // 鼻
  const np = NOSE_PRESETS[face.nose];
  const skinMat = new StandardMaterial(`skinMat_${index}`, scene);
  skinMat.diffuseColor = new Color3(0.85, 0.7, 0.55);
  skinMat.backFaceCulling = false;

  const nose = np.shape === "halfCone"
    ? createHalfConeNose(`nose_${index}`, np.width, np.height, np.depth, scene, np.topRatio ?? 0)
    : np.shape === "wedge"
    ? createWedgeNose(`nose_${index}`, np.width, np.height, np.depth, scene)
    : MeshBuilder.CreateBox(`nose_${index}`, {
        width: np.width, height: np.height, depth: np.depth,
      }, scene);
  nose.material = skinMat;
  nose.parent = rootMesh;
  nose.position.set(0, np.y, np.z);

  // 口（左右2本線）
  const mp = MOUTH_PRESETS[face.mouth];
  const mouthMat = new StandardMaterial(`mouthMat_${index}`, scene);
  mouthMat.diffuseColor = new Color3(0.6, 0.3, 0.3);

  const mouthL = MeshBuilder.CreateBox(`mouthL_${index}`, {
    width: mp.halfWidth, height: mp.height, depth: mp.depth,
  }, scene);
  mouthL.material = mouthMat;
  mouthL.parent = rootMesh;
  mouthL.position.set(-mp.halfWidth / 2, mp.y, mp.z);
  mouthL.setPivotPoint(new Vector3(mp.halfWidth / 2, 0, 0));  // 内側端を支点
  mouthL.rotation.z = mp.angle;    // 正=口角上がり（笑顔）

  const mouthR = MeshBuilder.CreateBox(`mouthR_${index}`, {
    width: mp.halfWidth, height: mp.height, depth: mp.depth,
  }, scene);
  mouthR.material = mouthMat;
  mouthR.parent = rootMesh;
  mouthR.position.set(mp.halfWidth / 2, mp.y, mp.z);
  mouthR.setPivotPoint(new Vector3(-mp.halfWidth / 2, 0, 0)); // 内側端を支点
  mouthR.rotation.z = -mp.angle;   // 左右対称に反転

  meshes.push(eyeL, eyeR, nose, mouthL, mouthR);
  return meshes;
}
