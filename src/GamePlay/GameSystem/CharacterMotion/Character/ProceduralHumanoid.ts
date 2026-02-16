import {
  Scene,
  Skeleton,
  Bone,
  Matrix,
  Vector3,
  Quaternion,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  AnimationGroup,
} from "@babylonjs/core";
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterMotion/Types/CharacterMotionConfig";
import { createAnimationsForSkeleton } from "@/GamePlay/GameSystem/CharacterMotion/Character/AnimationFactory";

const B = MIXAMO_BONE_NAMES;

/** キャラクター外見設定 */
export interface AppearanceConfig {
  skinColor: Color3;
  shirtColor: Color3;
  pantsColor: Color3;
  shoesColor: Color3;
  eyeColor: Color3;
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  skinColor: new Color3(0.9, 0.75, 0.6),
  shirtColor: new Color3(0.2, 0.4, 0.8),
  pantsColor: new Color3(0.3, 0.3, 0.5),
  shoesColor: new Color3(0.3, 0.2, 0.15),
  eyeColor: new Color3(0.1, 0.1, 0.1),
};

/** セグメント型ビジュアル（2ボーン間に配置） */
interface SegmentVisual {
  mesh: Mesh;
  startBone: string;
  endBone: string;
}

/** ポイント型ビジュアル（1ボーン位置に配置） */
interface PointVisual {
  mesh: Mesh;
  boneName: string;
  offset: Vector3;
}

export interface ProceduralHumanoidResult {
  rootMesh: Mesh;
  skeleton: Skeleton;
  idleAnimation: AnimationGroup;
  walkAnimation: AnimationGroup;
  /** 毎フレーム呼び出してビジュアルメッシュをボーン位置に同期 */
  updateVisuals(): void;
  dispose(): void;
}

/**
 * プロシージャル人型キャラクターを生成する。
 * GLBファイル不要 - スケルトン、ビジュアル、アニメーションを全てコードで生成。
 * アニメーションは AnimationFactory に委譲（コード重複を排除）。
 */
export function createProceduralHumanoid(
  scene: Scene,
  appearance?: Partial<AppearanceConfig>,
): ProceduralHumanoidResult {
  const app = { ...DEFAULT_APPEARANCE, ...appearance };
  // --- Root Mesh ---
  const rootMesh = new Mesh("humanoid_root", scene);

  // --- Skeleton & Bones ---
  const skeleton = new Skeleton("humanoid", "humanoid", scene);
  rootMesh.skeleton = skeleton;

  const boneMap = new Map<string, Bone>();

  function makeBone(name: string, parent: Bone | null, x: number, y: number, z: number): Bone {
    const bone = new Bone(name, skeleton, parent, Matrix.Translation(x, y, z));
    boneMap.set(name, bone);
    return bone;
  }

  // Bone hierarchy (positions are local to parent)
  const root = makeBone("Root", null, 0, 0, 0);
  const hips = makeBone(B.hips, root, 0, 0.95, 0);

  // Spine chain
  const spine = makeBone(B.spine, hips, 0, 0.12, 0);
  const spine1 = makeBone(B.spine1, spine, 0, 0.12, 0);
  const spine2 = makeBone(B.spine2, spine1, 0, 0.12, 0);
  const neck = makeBone(B.neck, spine2, 0, 0.1, 0);
  makeBone(B.head, neck, 0, 0.15, 0);

  // Left arm（腕を体の横に垂らした状態 — T-ポーズだとX軸回転が効かない）
  const lShoulder = makeBone(B.leftShoulder, spine2, -0.10, 0.06, 0);
  const lArm = makeBone(B.leftArm, lShoulder, -0.04, -0.12, 0);
  const lForeArm = makeBone(B.leftForeArm, lArm, 0, -0.26, 0);
  makeBone(B.leftHand, lForeArm, 0, -0.20, 0);

  // Right arm（同上）
  const rShoulder = makeBone(B.rightShoulder, spine2, 0.10, 0.06, 0);
  const rArm = makeBone(B.rightArm, rShoulder, 0.04, -0.12, 0);
  const rForeArm = makeBone(B.rightForeArm, rArm, 0, -0.26, 0);
  makeBone(B.rightHand, rForeArm, 0, -0.20, 0);

  // Left leg（脚を体の外側に離して配置し、胴体との重なりを軽減）
  const lUpLeg = makeBone(B.leftUpLeg, hips, -0.12, -0.04, 0);
  const lLeg = makeBone(B.leftLeg, lUpLeg, 0, -0.42, 0);
  const lFoot = makeBone(B.leftFoot, lLeg, 0, -0.42, 0);
  makeBone(B.leftToeBase, lFoot, 0, -0.09, 0.12);

  // Right leg（同上）
  const rUpLeg = makeBone(B.rightUpLeg, hips, 0.12, -0.04, 0);
  const rLeg = makeBone(B.rightLeg, rUpLeg, 0, -0.42, 0);
  const rFoot = makeBone(B.rightFoot, rLeg, 0, -0.42, 0);
  makeBone(B.rightToeBase, rFoot, 0, -0.09, 0.12);

  // --- Animations（AnimationFactory に委譲）---
  const anims = createAnimationsForSkeleton(scene, skeleton);
  if (!anims) {
    throw new Error("ProceduralHumanoid: Failed to create animations for skeleton");
  }
  const { idle: idleAnimation, walk: walkAnimation } = anims;

  // --- Materials ---
  const skinMat = makeMat("skin", app.skinColor, scene);
  const shirtMat = makeMat("shirt", app.shirtColor, scene);
  const pantsMat = makeMat("pants", app.pantsColor, scene);
  const shoesMat = makeMat("shoes", app.shoesColor, scene);
  const eyeMat = makeMat("eye", app.eyeColor, scene);
  const allMaterials = [skinMat, shirtMat, pantsMat, shoesMat, eyeMat];

  // --- Visual Meshes ---
  const segments: SegmentVisual[] = [];
  const points: PointVisual[] = [];
  const allMeshes: Mesh[] = [];

  function addSegment(
    name: string, start: string, end: string,
    w: number, h: number, d: number, mat: StandardMaterial
  ) {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.material = mat;
    mesh.rotationQuaternion = Quaternion.Identity();
    segments.push({ mesh, startBone: start, endBone: end });
    allMeshes.push(mesh);
  }

  function addPoint(
    name: string, boneName: string,
    opts: { width?: number; height?: number; depth?: number; diameter?: number },
    mat: StandardMaterial, offset: Vector3
  ) {
    const mesh = opts.diameter
      ? MeshBuilder.CreateSphere(name, { diameter: opts.diameter }, scene)
      : MeshBuilder.CreateBox(name, opts, scene);
    mesh.material = mat;
    points.push({ mesh, boneName, offset });
    allMeshes.push(mesh);
  }

  // Head
  addPoint("head_vis", B.head, { diameter: 0.2 }, skinMat, new Vector3(0, 0.1, 0));
  // Face
  addPoint("eye_L", B.head, { diameter: 0.03 }, eyeMat, new Vector3(-0.04, 0.13, 0.08));
  addPoint("eye_R", B.head, { diameter: 0.03 }, eyeMat, new Vector3(0.04, 0.13, 0.08));
  addPoint("nose", B.head, { width: 0.02, height: 0.03, depth: 0.03 }, skinMat, new Vector3(0, 0.1, 0.1));
  // Torso (Hips → Neck) — 幅を縮小して脚との重なりを軽減
  addSegment("torso_vis", B.hips, B.neck, 0.28, 0.46, 0.18, shirtMat);
  // Hip area
  addPoint("hips_vis", B.hips, { width: 0.26, height: 0.08, depth: 0.16 }, pantsMat, Vector3.Zero());
  // Arms — 腕は下に垂れた状態に合わせたサイズ
  addSegment("lUpperArm_vis", B.leftArm, B.leftForeArm, 0.08, 0.26, 0.08, shirtMat);
  addSegment("lForeArm_vis", B.leftForeArm, B.leftHand, 0.07, 0.20, 0.07, skinMat);
  addSegment("rUpperArm_vis", B.rightArm, B.rightForeArm, 0.08, 0.26, 0.08, shirtMat);
  addSegment("rForeArm_vis", B.rightForeArm, B.rightHand, 0.07, 0.20, 0.07, skinMat);
  // Legs — 太もも断面を少し小さく
  addSegment("lUpperLeg_vis", B.leftUpLeg, B.leftLeg, 0.11, 0.42, 0.11, pantsMat);
  addSegment("lLowerLeg_vis", B.leftLeg, B.leftFoot, 0.09, 0.42, 0.09, pantsMat);
  addSegment("rUpperLeg_vis", B.rightUpLeg, B.rightLeg, 0.11, 0.42, 0.11, pantsMat);
  addSegment("rLowerLeg_vis", B.rightLeg, B.rightFoot, 0.09, 0.42, 0.09, pantsMat);
  // Feet
  addPoint("lFoot_vis", B.leftFoot, { width: 0.09, height: 0.06, depth: 0.2 }, shoesMat, new Vector3(0, -0.03, 0.05));
  addPoint("rFoot_vis", B.rightFoot, { width: 0.09, height: 0.06, depth: 0.2 }, shoesMat, new Vector3(0, -0.03, 0.05));

  // --- Update & Dispose ---
  function updateVisuals() {
    // ボーンの絶対行列を強制再計算
    // rootMesh にジオメトリが無いため skeleton.prepare() が自動で呼ばれない
    skeleton.computeAbsoluteMatrices(true);

    for (const seg of segments) {
      const b1 = boneMap.get(seg.startBone);
      const b2 = boneMap.get(seg.endBone);
      if (!b1 || !b2) continue;
      const p1 = b1.getAbsolutePosition(rootMesh);
      const p2 = b2.getAbsolutePosition(rootMesh);
      alignMeshBetween(seg.mesh, p1, p2);
    }
    for (const pt of points) {
      const bone = boneMap.get(pt.boneName);
      if (!bone) continue;
      const pos = bone.getAbsolutePosition(rootMesh);
      pt.mesh.position.set(pos.x + pt.offset.x, pos.y + pt.offset.y, pos.z + pt.offset.z);
    }
  }

  function dispose() {
    idleAnimation.dispose();
    walkAnimation.dispose();
    for (const m of allMeshes) m.dispose();
    for (const m of allMaterials) m.dispose();
    skeleton.dispose();
    rootMesh.dispose();
  }

  return { rootMesh, skeleton, idleAnimation, walkAnimation, updateVisuals, dispose };
}

// ─── Helpers ───────────────────────────────────────────────

function makeMat(name: string, color: Color3, scene: Scene): StandardMaterial {
  const mat = new StandardMaterial(name + "_mat", scene);
  mat.diffuseColor = color;
  return mat;
}

/** メッシュを2点の中間に配置し、Y軸を方向に合わせる */
function alignMeshBetween(mesh: Mesh, p1: Vector3, p2: Vector3): void {
  mesh.position.set(
    (p1.x + p2.x) * 0.5,
    (p1.y + p2.y) * 0.5,
    (p1.z + p2.z) * 0.5
  );

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.0001) return;

  const ny = dy / len;

  if (ny > 0.9999) {
    Quaternion.FromFloatsToRef(0, 0, 0, 1, mesh.rotationQuaternion!);
    return;
  }
  if (ny < -0.9999) {
    Quaternion.RotationAxisToRef(Vector3.Right(), Math.PI, mesh.rotationQuaternion!);
    return;
  }

  const nx = dx / len;
  const nz = dz / len;
  const cx = -nz;
  const cz = nx;
  const cLen = Math.sqrt(cx * cx + cz * cz);
  const angle = Math.acos(Math.max(-1, Math.min(1, ny)));
  _tmpAxis.set(cx / cLen, 0, cz / cLen);
  Quaternion.RotationAxisToRef(_tmpAxis, angle, mesh.rotationQuaternion!);
}

const _tmpAxis = new Vector3();
