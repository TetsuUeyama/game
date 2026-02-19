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
import { MIXAMO_BONE_NAMES } from "@/GamePlay/GameSystem/CharacterModel/Types/CharacterMotionConfig";
import { createAnimationsForSkeleton } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";
import { BONE_OFFSETS, computeBoneRestQuat, worldToParentLocal } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonConfig";

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
  /** ボーン名→Bone参照マップ */
  boneMap: Map<string, Bone>;
  /** ボーン名→レスト回転マップ */
  restQuatMap: Map<string, Quaternion>;
  /** 毎フレーム呼び出してビジュアルメッシュをボーン位置に同期 */
  updateVisuals(): void;
  /** 全ビジュアルメッシュを取得 */
  getAllVisualMeshes(): Mesh[];
  /** 名前でセグメントメッシュを取得（torso_vis等） */
  getSegmentMeshByName(name: string): Mesh | null;
  /** 名前でポイントメッシュを取得（head_vis等） */
  getPointMeshByName(name: string): Mesh | null;
  dispose(): void;
}

/**
 * プロシージャル人型キャラクターを生成する。
 * GLBファイル不要 - スケルトン、ビジュアル、アニメーションを全てコードで生成。
 * GLBモデルと同一のボーン構造: レスト回転がレストマトリクスに含まれる。
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
  const restQuatMap = new Map<string, Quaternion>();

  /**
   * ボーンを作成する（GLBと同じ構造: Matrix.Compose(scale, restQuat, parentLocalOffset)）。
   */
  function createBone(
    mixamoName: string,
    logicalName: string,
    parent: Bone | null,
    parentAbsRot: Quaternion,
  ): { bone: Bone; absRot: Quaternion } {
    const offset = BONE_OFFSETS[logicalName];
    const localOffset = offset
      ? worldToParentLocal(offset, parentAbsRot)
      : Vector3.Zero();

    const { restQuat, absRot } = computeBoneRestQuat(logicalName, parentAbsRot);
    const restMatrix = Matrix.Compose(Vector3.One(), restQuat, localOffset);
    const bone = new Bone(mixamoName, skeleton, parent, restMatrix);
    boneMap.set(mixamoName, bone);
    restQuatMap.set(mixamoName, restQuat);

    return { bone, absRot };
  }

  // Root
  const rootAbsRot = Quaternion.Identity();
  const root = new Bone("Root", skeleton, null, Matrix.Identity());
  boneMap.set("Root", root);
  restQuatMap.set("Root", Quaternion.Identity());

  // Hips
  const { bone: hips, absRot: hipsAbs } = createBone(B.hips, "hips", root, rootAbsRot);

  // Spine chain
  const { bone: spine, absRot: spineAbs } = createBone(B.spine, "spine", hips, hipsAbs);
  const { bone: spine1, absRot: spine1Abs } = createBone(B.spine1, "spine1", spine, spineAbs);
  const { bone: spine2, absRot: spine2Abs } = createBone(B.spine2, "spine2", spine1, spine1Abs);
  const { bone: neck, absRot: neckAbs } = createBone(B.neck, "neck", spine2, spine2Abs);
  createBone(B.head, "head", neck, neckAbs);

  // Left arm
  const { bone: lShoulder, absRot: lShoulderAbs } = createBone(B.leftShoulder, "leftShoulder", spine2, spine2Abs);
  const { bone: lArm, absRot: lArmAbs } = createBone(B.leftArm, "leftArm", lShoulder, lShoulderAbs);
  const { bone: lForeArm, absRot: lForeArmAbs } = createBone(B.leftForeArm, "leftForeArm", lArm, lArmAbs);
  createBone(B.leftHand, "leftHand", lForeArm, lForeArmAbs);

  // Right arm
  const { bone: rShoulder, absRot: rShoulderAbs } = createBone(B.rightShoulder, "rightShoulder", spine2, spine2Abs);
  const { bone: rArm, absRot: rArmAbs } = createBone(B.rightArm, "rightArm", rShoulder, rShoulderAbs);
  const { bone: rForeArm, absRot: rForeArmAbs } = createBone(B.rightForeArm, "rightForeArm", rArm, rArmAbs);
  createBone(B.rightHand, "rightHand", rForeArm, rForeArmAbs);

  // Left leg
  const { bone: lUpLeg, absRot: lUpLegAbs } = createBone(B.leftUpLeg, "leftUpLeg", hips, hipsAbs);
  const { bone: lLeg, absRot: lLegAbs } = createBone(B.leftLeg, "leftLeg", lUpLeg, lUpLegAbs);
  const { bone: lFoot, absRot: lFootAbs } = createBone(B.leftFoot, "leftFoot", lLeg, lLegAbs);
  createBone(B.leftToeBase, "leftToeBase", lFoot, lFootAbs);

  // Right leg
  const { bone: rUpLeg, absRot: rUpLegAbs } = createBone(B.rightUpLeg, "rightUpLeg", hips, hipsAbs);
  const { bone: rLeg, absRot: rLegAbs } = createBone(B.rightLeg, "rightLeg", rUpLeg, rUpLegAbs);
  const { bone: rFoot, absRot: rFootAbs } = createBone(B.rightFoot, "rightFoot", rLeg, rLegAbs);
  createBone(B.rightToeBase, "rightToeBase", rFoot, rFootAbs);

  // --- Animations（captureRestPoses が正しいレスト回転を取得できるため、明示的キャッシュ不要）---
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

  // ボーンオフセットからセグメント長を自動計算するヘルパー
  function boneLength(key: string): number {
    const o = BONE_OFFSETS[key];
    return Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z);
  }
  // 胴体長: spine + spine1 + spine2 + neck の合計
  const torsoLen = boneLength("spine") + boneLength("spine1") + boneLength("spine2") + boneLength("neck");
  const upperArmLen = boneLength("leftForeArm");  // arm → foreArm
  const foreArmLen = boneLength("leftHand");       // foreArm → hand
  const upperLegLen = boneLength("leftLeg");       // upLeg → leg
  const lowerLegLen = boneLength("leftFoot");      // leg → foot

  // Head
  addPoint("head_vis", B.head, { diameter: 0.2 }, skinMat, new Vector3(0, 0.1, 0));
  // Face（ボーンローカル空間のオフセット — updateVisualsでワールド変換される）
  addPoint("eye_L", B.head, { diameter: 0.03 }, eyeMat, new Vector3(-0.04, 0.13, 0.08));
  addPoint("eye_R", B.head, { diameter: 0.03 }, eyeMat, new Vector3(0.04, 0.13, 0.08));
  addPoint("nose", B.head, { width: 0.02, height: 0.03, depth: 0.03 }, skinMat, new Vector3(0, 0.1, 0.1));
  // Torso (Hips → Neck)
  addSegment("torso_vis", B.hips, B.neck, 0.28, torsoLen, 0.18, shirtMat);
  // Hip area
  addPoint("hips_vis", B.hips, { width: 0.26, height: 0.08, depth: 0.16 }, pantsMat, Vector3.Zero());
  // Arms
  addSegment("lUpperArm_vis", B.leftArm, B.leftForeArm, 0.08, upperArmLen, 0.08, shirtMat);
  addSegment("lForeArm_vis", B.leftForeArm, B.leftHand, 0.07, foreArmLen, 0.07, skinMat);
  addSegment("rUpperArm_vis", B.rightArm, B.rightForeArm, 0.08, upperArmLen, 0.08, shirtMat);
  addSegment("rForeArm_vis", B.rightForeArm, B.rightHand, 0.07, foreArmLen, 0.07, skinMat);
  // Legs
  addSegment("lUpperLeg_vis", B.leftUpLeg, B.leftLeg, 0.11, upperLegLen, 0.11, pantsMat);
  addSegment("lLowerLeg_vis", B.leftLeg, B.leftFoot, 0.09, lowerLegLen, 0.09, pantsMat);
  addSegment("rUpperLeg_vis", B.rightUpLeg, B.rightLeg, 0.11, upperLegLen, 0.11, pantsMat);
  addSegment("rLowerLeg_vis", B.rightLeg, B.rightFoot, 0.09, lowerLegLen, 0.09, pantsMat);
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
      // オフセットをボーンのワールド回転で変換（顔パーツがキャラクターの向きに追従）
      const boneAbsMat = bone.getAbsoluteTransform();
      const rootWorldMat = rootMesh.getWorldMatrix();
      const worldMat = boneAbsMat.multiply(rootWorldMat);
      const rotatedOffset = Vector3.TransformNormal(pt.offset, worldMat);
      pt.mesh.position.set(pos.x + rotatedOffset.x, pos.y + rotatedOffset.y, pos.z + rotatedOffset.z);
    }
  }

  function getAllVisualMeshes(): Mesh[] {
    return [...allMeshes];
  }

  function getSegmentMeshByName(name: string): Mesh | null {
    for (const seg of segments) {
      if (seg.mesh.name === name) return seg.mesh;
    }
    return null;
  }

  function getPointMeshByName(name: string): Mesh | null {
    for (const pt of points) {
      if (pt.mesh.name === name) return pt.mesh;
    }
    return null;
  }

  function dispose() {
    idleAnimation.dispose();
    walkAnimation.dispose();
    for (const m of allMeshes) m.dispose();
    for (const m of allMaterials) m.dispose();
    skeleton.dispose();
    rootMesh.dispose();
  }

  return {
    rootMesh, skeleton, idleAnimation, walkAnimation,
    boneMap, restQuatMap,
    updateVisuals, getAllVisualMeshes, getSegmentMeshByName, getPointMeshByName,
    dispose,
  };
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
