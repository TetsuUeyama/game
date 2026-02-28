import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Quaternion,
  Mesh,
  TransformNode,
} from "@babylonjs/core";

import {
  ENTITY_HEIGHT,
  OBSTACLE_SIZE,
} from "../Config/FieldConfig";
import { ARM_LERP_SPEED, NECK_MAX_ANGLE } from "../Config/BodyDynamicsConfig";
import type { SimMover, PushObstructionInfo } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";

// =========================================================================
// Arm constants
// =========================================================================

const VISUAL_SIZE = OBSTACLE_SIZE;

export const ARM_BODY_RADIUS = VISUAL_SIZE / 2;
export const ARM_LENGTH = VISUAL_SIZE * 1.1;
const ARM_DIAMETER = VISUAL_SIZE * 0.24;
const HAND_DIAMETER = VISUAL_SIZE * 0.26;
const UPPER_ARM_LENGTH = ARM_LENGTH * 0.4;
const FOREARM_LENGTH = ARM_LENGTH * 0.4;
/** 実際の腕の総長（上腕＋前腕）: ボール保持位置・IK計算に使用 */
const TOTAL_ARM_LENGTH = UPPER_ARM_LENGTH + FOREARM_LENGTH;
const ELBOW_DIAMETER = VISUAL_SIZE * 0.18;
/** 腕前面ストライプの幅（腕直径に対する比率） */
const ARM_STRIPE_WIDTH_RATIO = 0.25;
/** 肌色 */
const SKIN_COLOR = new Color3(0.96, 0.80, 0.64);
const MIN_BEND_ANGLE = 5 * Math.PI / 180;
/** 前腕の最大曲げ角度: 伸展(0°)から内側に90°まで */
const MAX_FOREARM_BEND_ANGLE = 90 * Math.PI / 180;
/** 上腕の後方可動域制限: 真上(+Y)から後方(-Z)へ最大10° */
const UPPER_ARM_MAX_BACK_ANGLE = 10 * Math.PI / 180;
export const SHOULDER_Y = ENTITY_HEIGHT * 0.35;
const DEFAULT_ARM_ANGLE = (60 * Math.PI) / 180;
/** ボールがこの距離以内なら両手をボール方向へ向ける */
const BALL_REACT_RADIUS = 2.0;

/** デフォルト腕方向ベクトル（ローカル座標: 60度下向き前方） */
const DEF_ARM_DIR = new Vector3(0, -Math.sin(DEFAULT_ARM_ANGLE), Math.cos(DEFAULT_ARM_ANGLE)).normalize();

/** ドリブル姿勢の腕方向ベクトル（50度下向き前方: 腰〜太もも付近） */
const DRIBBLE_ARM_ANGLE = (50 * Math.PI) / 180;
const DRIBBLE_ARM_DIR = new Vector3(0, -Math.sin(DRIBBLE_ARM_ANGLE), Math.cos(DRIBBLE_ARM_ANGLE)).normalize();
/** ドリブル時の腕リーチ（腕の60%まで縮め、肘を曲げる） */
const DRIBBLE_ARM_REACH = 0.6;

/** ドリブル保護姿勢: DF近接時は体寄りにボールを保持（65度下向き） */
const DRIBBLE_PROTECT_ARM_ANGLE = (65 * Math.PI) / 180;
const DRIBBLE_PROTECT_ARM_DIR = new Vector3(0, -Math.sin(DRIBBLE_PROTECT_ARM_ANGLE), Math.cos(DRIBBLE_PROTECT_ARM_ANGLE)).normalize();
/** 保護姿勢時の腕リーチ（腕の50%: さらに体に近づける） */
const DRIBBLE_PROTECT_ARM_REACH = 0.5;

/** DF近接判定の半径（メートル） */
const DRIBBLE_DEFENDER_RADIUS = 2.0;

/** デフォルト肘ヒント: 外側+やや下 */
const DEF_LEFT_ELBOW_HINT = new Vector3(-1, -0.3, 0).normalize();
const DEF_RIGHT_ELBOW_HINT = new Vector3(1, -0.3, 0).normalize();

/** ドリブル保護姿勢用肘ヒント: 内寄り */
const DRIBBLE_PROTECT_LEFT_ELBOW_HINT = new Vector3(-0.3, -1, 0).normalize();
const DRIBBLE_PROTECT_RIGHT_ELBOW_HINT = new Vector3(0.3, -1, 0).normalize();

// =========================================================================
// Interfaces
// =========================================================================

/** 腕ポーズ補間用: 肩→手方向ベクトル（ローカル座標、正規化済み） */
export interface ArmLerpState {
  leftDir: Vector3;
  rightDir: Vector3;
  leftElbowHint: Vector3;
  rightElbowHint: Vector3;
  /** 左腕リーチ倍率（0–1, 1=フル伸展） */
  leftReach: number;
  /** 右腕リーチ倍率（0–1, 1=フル伸展） */
  rightReach: number;
}

interface EntityArmSet {
  parent: Mesh;
  pivot: TransformNode;
  leftUpperArm: Mesh; leftElbow: Mesh; leftForearm: Mesh; leftHand: Mesh;
  rightUpperArm: Mesh; rightElbow: Mesh; rightForearm: Mesh; rightHand: Mesh;
}

// =========================================================================
// ArmRenderer
// =========================================================================

export class ArmRenderer {
  private scene: Scene;
  private entityArmSets: EntityArmSet[] = [];
  private armLerpStates: ArmLerpState[] = [];
  private _dribbleHand: 'left' | 'right' = 'right';

  get dribbleHand(): 'left' | 'right' {
    return this._dribbleHand;
  }

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * エンティティの両サイドに腕（棒）と拳（球）を付ける。
   * デフォルトは60度下向きのポーズ。
   *
   * @param upperColor 上半身チームカラー（腕・拳に適用。省略時は color）
   */
  createArms(parent: Mesh, pivot: TransformNode, color: Color3, upperColor?: Color3): void {
    const uc = upperColor ?? color;
    const createArmMeshes = (side: -1 | 1): { upperArm: Mesh; elbow: Mesh; forearm: Mesh; hand: Mesh } => {
      const armColor = new Color3(uc.r * 0.7, uc.g * 0.7, uc.b * 0.7);

      const stripeMat = new StandardMaterial(`${parent.name}_stripeMat${side}`, this.scene);
      stripeMat.diffuseColor = SKIN_COLOR;
      stripeMat.specularColor = Color3.Black();

      const upperArm = MeshBuilder.CreateCylinder(`${parent.name}_upperArm${side}`, {
        height: UPPER_ARM_LENGTH,
        diameter: ARM_DIAMETER,
        tessellation: 6,
      }, this.scene);
      const upperArmMat = new StandardMaterial(`${parent.name}_upperArmMat${side}`, this.scene);
      upperArmMat.diffuseColor = armColor;
      upperArmMat.specularColor = Color3.Black();
      upperArm.material = upperArmMat;
      upperArm.parent = pivot;
      upperArm.isPickable = false;

      const upperStripe = MeshBuilder.CreateBox(`${parent.name}_upperStripe${side}`, {
        width: ARM_DIAMETER * ARM_STRIPE_WIDTH_RATIO,
        height: UPPER_ARM_LENGTH * 0.9,
        depth: 0.001,
      }, this.scene);
      upperStripe.position.z = -(ARM_DIAMETER / 2 + 0.0005);
      upperStripe.material = stripeMat;
      upperStripe.parent = upperArm;
      upperStripe.isPickable = false;

      const elbow = MeshBuilder.CreateSphere(`${parent.name}_elbow${side}`, {
        diameter: ELBOW_DIAMETER,
        segments: 8,
      }, this.scene);
      const elbowMat = new StandardMaterial(`${parent.name}_elbowMat${side}`, this.scene);
      elbowMat.diffuseColor = armColor;
      elbowMat.specularColor = Color3.Black();
      elbow.material = elbowMat;
      elbow.parent = pivot;
      elbow.isPickable = false;

      const forearm = MeshBuilder.CreateCylinder(`${parent.name}_forearm${side}`, {
        height: FOREARM_LENGTH,
        diameter: ARM_DIAMETER,
        tessellation: 6,
      }, this.scene);
      const forearmMat = new StandardMaterial(`${parent.name}_forearmMat${side}`, this.scene);
      forearmMat.diffuseColor = armColor;
      forearmMat.specularColor = Color3.Black();
      forearm.material = forearmMat;
      forearm.parent = pivot;
      forearm.isPickable = false;

      const foreStripe = MeshBuilder.CreateBox(`${parent.name}_foreStripe${side}`, {
        width: ARM_DIAMETER * ARM_STRIPE_WIDTH_RATIO,
        height: FOREARM_LENGTH * 0.9,
        depth: 0.001,
      }, this.scene);
      foreStripe.position.z = -(ARM_DIAMETER / 2 + 0.0005);
      foreStripe.material = stripeMat;
      foreStripe.parent = forearm;
      foreStripe.isPickable = false;

      const hand = MeshBuilder.CreateSphere(`${parent.name}_hand${side}`, {
        diameter: HAND_DIAMETER,
        segments: 8,
      }, this.scene);
      const handMat = new StandardMaterial(`${parent.name}_handMat${side}`, this.scene);
      handMat.diffuseColor = uc;
      handMat.specularColor = Color3.Black();
      hand.material = handMat;
      hand.parent = pivot;
      hand.isPickable = false;

      return { upperArm, elbow, forearm, hand };
    };

    const left = createArmMeshes(-1);
    const right = createArmMeshes(1);

    const armSet: EntityArmSet = {
      parent,
      pivot,
      leftUpperArm: left.upperArm, leftElbow: left.elbow, leftForearm: left.forearm, leftHand: left.hand,
      rightUpperArm: right.upperArm, rightElbow: right.elbow, rightForearm: right.forearm, rightHand: right.hand,
    };
    this.entityArmSets.push(armSet);

    const lerpState: ArmLerpState = {
      leftDir: DEF_ARM_DIR.clone(),
      rightDir: DEF_ARM_DIR.clone(),
      leftElbowHint: DEF_LEFT_ELBOW_HINT.clone(),
      rightElbowHint: DEF_RIGHT_ELBOW_HINT.clone(),
      leftReach: 1.0,
      rightReach: 1.0,
    };
    this.armLerpStates.push(lerpState);

    this.applyArmWithElbow(armSet.leftUpperArm, armSet.leftElbow, armSet.leftForearm, armSet.leftHand, -1, lerpState.leftDir, lerpState.leftElbowHint, lerpState.leftReach);
    this.applyArmWithElbow(armSet.rightUpperArm, armSet.rightElbow, armSet.rightForearm, armSet.rightHand, 1, lerpState.rightDir, lerpState.rightElbowHint, lerpState.rightReach);
  }

  /**
   * 全エンティティの腕を更新。
   * ボールが視野内(neckFacing ±90°)かつ2m以内なら両手をボール方向へ向ける。
   */
  syncArms(
    allMovers: SimMover[],
    upperBodyPivots: TransformNode[],
    torsoVisualAngles: number[],
    ballPosition: Vector3 | null,
    ballActive: boolean,
    ballHeldPosition: Vector3 | null,
    ballMarkerEntityIdx: number | null,
    ballMarkerLeftArmTarget: Vector3 | null,
    ballMarkerRightArmTarget: Vector3 | null,
    onBallEntityIdx: number,
    targets: SimMover[],
    pushObstructions: PushObstructionInfo[],
    dt: number,
  ): void {
    const ballPos = ballPosition;
    const alpha = 1 - Math.exp(-ARM_LERP_SPEED * dt);

    for (let idx = 0; idx < this.entityArmSets.length; idx++) {
      const armSet = this.entityArmSets[idx];
      const lerpState = this.armLerpStates[idx];
      if (!lerpState) continue;

      const parent = armSet.parent;
      const ex = parent.position.x;
      const ey = parent.position.y;
      const ez = parent.position.z;

      const refY = ey + SHOULDER_Y;

      let targetLeftDir = DEF_ARM_DIR;
      let targetRightDir = DEF_ARM_DIR;
      let targetLeftReach = 1.0;
      let targetRightReach = 1.0;

      if (idx === ballMarkerEntityIdx && ballMarkerLeftArmTarget && ballMarkerRightArmTarget) {
        parent.computeWorldMatrix(true);
        const invMatrix = parent.getWorldMatrix().clone().invert();
        const pivotAngle = torsoVisualAngles[idx] || 0;
        const cosA = Math.cos(pivotAngle);
        const sinA = Math.sin(pivotAngle);

        const localLeft = Vector3.TransformCoordinates(ballMarkerLeftArmTarget, invMatrix);
        const rootLeft = this.computeArmDir(-1, localLeft);
        targetLeftDir = new Vector3(
          rootLeft.x * cosA - rootLeft.z * sinA,
          rootLeft.y,
          rootLeft.x * sinA + rootLeft.z * cosA,
        ).normalize();

        const localRight = Vector3.TransformCoordinates(ballMarkerRightArmTarget, invMatrix);
        const rootRight = this.computeArmDir(1, localRight);
        targetRightDir = new Vector3(
          rootRight.x * cosA - rootRight.z * sinA,
          rootRight.y,
          rootRight.x * sinA + rootRight.z * cosA,
        ).normalize();
      } else {
        const trackBallPos = (ballActive && ballPos) ? ballPos : ballHeldPosition;
        if (trackBallPos) {
          const dx = trackBallPos.x - ex;
          const dy = trackBallPos.y - refY;
          const dz = trackBallPos.z - ez;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < BALL_REACT_RADIUS && dist > 0.01) {
            const mover = allMovers[idx];
            const angleToBall = Math.atan2(trackBallPos.z - ez, trackBallPos.x - ex);
            const angleDiff = normAngleDiff(mover.neckFacing, angleToBall);

            if (Math.abs(angleDiff) <= NECK_MAX_ANGLE) {
              parent.computeWorldMatrix(true);
              const localBall = Vector3.TransformCoordinates(
                trackBallPos, parent.getWorldMatrix().clone().invert(),
              );

              const rootLeftDir = this.computeArmDir(-1, localBall);
              const rootRightDir = this.computeArmDir(1, localBall);

              const pivotAngle = torsoVisualAngles[idx] || 0;
              const cosA = Math.cos(pivotAngle);
              const sinA = Math.sin(pivotAngle);

              targetLeftDir = new Vector3(
                rootLeftDir.x * cosA - rootLeftDir.z * sinA,
                rootLeftDir.y,
                rootLeftDir.x * sinA + rootLeftDir.z * cosA,
              ).normalize();

              targetRightDir = new Vector3(
                rootRightDir.x * cosA - rootRightDir.z * sinA,
                rootRightDir.y,
                rootRightDir.x * sinA + rootRightDir.z * cosA,
              ).normalize();
            }
          }
        }

        const obEntityStart = 1 + targets.length;
        const pushInfo = (idx >= obEntityStart) ? pushObstructions.find(p => p.obstacleIdx === idx - obEntityStart) : undefined;
        if (pushInfo) {
          const pushTarget = new Vector3(pushInfo.armTargetX, ENTITY_HEIGHT * 0.9, pushInfo.armTargetZ);
          parent.computeWorldMatrix(true);
          const invMatrix = parent.getWorldMatrix().clone().invert();
          const pivotAngle = torsoVisualAngles[idx] || 0;
          const cosA = Math.cos(pivotAngle);
          const sinA = Math.sin(pivotAngle);

          const localPush = Vector3.TransformCoordinates(pushTarget, invMatrix);
          if (pushInfo.pushArm === 'left') {
            const rootDir = this.computeArmDir(-1, localPush);
            targetLeftDir = new Vector3(
              rootDir.x * cosA - rootDir.z * sinA,
              rootDir.y,
              rootDir.x * sinA + rootDir.z * cosA,
            ).normalize();
          } else {
            const rootDir = this.computeArmDir(1, localPush);
            targetRightDir = new Vector3(
              rootDir.x * cosA - rootDir.z * sinA,
              rootDir.y,
              rootDir.x * sinA + rootDir.z * cosA,
            ).normalize();
          }
        }
      }

      if (idx === onBallEntityIdx && !ballActive) {
        const mover = allMovers[idx];
        const vel = Math.sqrt(mover.vx * mover.vx + mover.vz * mover.vz);

        // 最も近いDFを検索してドリブルハンドを決定
        let closestDefDist = Infinity;
        let defenderSide: 'left' | 'right' | null = null;
        const obStart = 1 + targets.length;
        for (let oi = 0; oi < allMovers.length - obStart; oi++) {
          const def = allMovers[obStart + oi];
          const ddx = def.x - mover.x;
          const ddz = def.z - mover.z;
          const defDist = Math.sqrt(ddx * ddx + ddz * ddz);
          if (defDist < DRIBBLE_DEFENDER_RADIUS && defDist < closestDefDist) {
            closestDefDist = defDist;
            // torsoFacing に対してDFが右側か左側かを外積で判定
            const faceCos = Math.cos(mover.torsoFacing);
            const faceSin = Math.sin(mover.torsoFacing);
            const cross = faceCos * ddz - faceSin * ddx;
            defenderSide = cross >= 0 ? 'right' : 'left';
          }
        }

        // DFが右側 → 左手ドリブル、DFが左側 → 右手ドリブル、遠い → 右手
        const isProtecting = defenderSide !== null;
        this._dribbleHand = defenderSide === 'right' ? 'left' : 'right';

        if (vel > 0.01) {
          const dribbleDir = isProtecting ? DRIBBLE_PROTECT_ARM_DIR : DRIBBLE_ARM_DIR;
          const dribbleReach = isProtecting ? DRIBBLE_PROTECT_ARM_REACH : DRIBBLE_ARM_REACH;
          if (this._dribbleHand === 'right') {
            targetRightDir = dribbleDir;
            targetRightReach = dribbleReach;
          } else {
            targetLeftDir = dribbleDir;
            targetLeftReach = dribbleReach;
          }
        }
      }

      let targetLeftHint = DEF_LEFT_ELBOW_HINT;
      let targetRightHint = DEF_RIGHT_ELBOW_HINT;

      if (idx === ballMarkerEntityIdx && ballMarkerLeftArmTarget) {
        targetLeftHint = new Vector3(-1, -0.2, -0.5).normalize();
        targetRightHint = new Vector3(1, -0.2, -0.5).normalize();
      }

      if (idx === onBallEntityIdx && !ballActive) {
        if (this._dribbleHand === 'right') {
          targetRightHint = DRIBBLE_PROTECT_RIGHT_ELBOW_HINT;
        } else {
          targetLeftHint = DRIBBLE_PROTECT_LEFT_ELBOW_HINT;
        }
      }

      Vector3.LerpToRef(lerpState.leftDir, targetLeftDir, alpha, lerpState.leftDir);
      lerpState.leftDir.normalize();
      Vector3.LerpToRef(lerpState.rightDir, targetRightDir, alpha, lerpState.rightDir);
      lerpState.rightDir.normalize();

      Vector3.LerpToRef(lerpState.leftElbowHint, targetLeftHint, alpha, lerpState.leftElbowHint);
      lerpState.leftElbowHint.normalize();
      Vector3.LerpToRef(lerpState.rightElbowHint, targetRightHint, alpha, lerpState.rightElbowHint);
      lerpState.rightElbowHint.normalize();

      lerpState.leftReach += (targetLeftReach - lerpState.leftReach) * alpha;
      lerpState.rightReach += (targetRightReach - lerpState.rightReach) * alpha;

      this.applyArmWithElbow(armSet.leftUpperArm, armSet.leftElbow, armSet.leftForearm, armSet.leftHand, -1, lerpState.leftDir, lerpState.leftElbowHint, lerpState.leftReach);
      this.applyArmWithElbow(armSet.rightUpperArm, armSet.rightElbow, armSet.rightForearm, armSet.rightHand, 1, lerpState.rightDir, lerpState.rightElbowHint, lerpState.rightReach);
    }
  }

  /**
   * 全エンティティの左右手のワールド座標を返す。
   */
  getHandWorldPositions(allMovers: SimMover[]): { left: Vector3; right: Vector3 }[] {
    const result: { left: Vector3; right: Vector3 }[] = [];

    for (let idx = 0; idx < allMovers.length; idx++) {
      const lerpState = this.armLerpStates[idx];
      if (!lerpState) {
        const m = allMovers[idx];
        const pos = new Vector3(m.x, ENTITY_HEIGHT / 2 + SHOULDER_Y, m.z);
        result.push({ left: pos.clone(), right: pos.clone() });
        continue;
      }

      const mover = allMovers[idx];
      const theta = Math.PI / 2 - mover.torsoFacing;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const computeHand = (side: -1 | 1, dir: Vector3, reach: number): Vector3 => {
        const effectiveLen = TOTAL_ARM_LENGTH * reach;
        const lx = side * ARM_BODY_RADIUS + dir.x * effectiveLen;
        const ly = SHOULDER_Y + dir.y * effectiveLen;
        const lz = dir.z * effectiveLen;

        return new Vector3(
          mover.x + lx * cosT + lz * sinT,
          ENTITY_HEIGHT / 2 + ly,
          mover.z - lx * sinT + lz * cosT,
        );
      };

      result.push({
        left: computeHand(-1, lerpState.leftDir, lerpState.leftReach),
        right: computeHand(1, lerpState.rightDir, lerpState.rightReach),
      });
    }

    return result;
  }

  dispose(): void {
    for (const set of this.entityArmSets) {
      for (const m of [
        set.leftUpperArm, set.leftElbow, set.leftForearm, set.leftHand,
        set.rightUpperArm, set.rightElbow, set.rightForearm, set.rightHand,
      ]) {
        m.material?.dispose();
        m.dispose();
      }
    }
    this.entityArmSets = [];
    this.armLerpStates = [];
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /** 肩位置からターゲットへの正規化方向ベクトルを計算（ローカル座標系） */
  private computeArmDir(side: -1 | 1, localTarget: Vector3): Vector3 {
    const shoulderX = side * ARM_BODY_RADIUS;
    const dx = localTarget.x - shoulderX;
    const dy = localTarget.y - SHOULDER_Y;
    const dz = localTarget.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return DEF_ARM_DIR;
    return new Vector3(dx / len, dy / len, dz / len);
  }

  /**
   * 2ボーンIKソルバー: 肩と手の位置から肘の位置を余弦定理で逆算する。
   */
  private solve2BoneIK(
    shoulder: Vector3,
    handTarget: Vector3,
    L1: number,
    L2: number,
    hint: Vector3,
  ): Vector3 {
    const shoulderToHand = handTarget.subtract(shoulder);
    let dist = shoulderToHand.length();

    if (dist < 0.001) {
      return shoulder.add(hint.scale(L1));
    }

    const maxDist = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(Math.PI - MIN_BEND_ANGLE));
    if (dist > maxDist) {
      dist = maxDist;
    }
    const minDist = Math.abs(L1 - L2) + 0.001;
    if (dist < minDist) {
      dist = minDist;
    }

    const cosAngle = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));
    const angle = Math.acos(clampedCos);

    const dirToHand = shoulderToHand.normalize();

    const hintDotDir = Vector3.Dot(hint, dirToHand);
    const hintPerp = hint.subtract(dirToHand.scale(hintDotDir));
    const hintPerpLen = hintPerp.length();

    let elbowDir: Vector3;
    if (hintPerpLen < 0.001) {
      const fallback = Math.abs(dirToHand.y) < 0.9
        ? Vector3.Up()
        : Vector3.Right();
      elbowDir = Vector3.Cross(dirToHand, fallback).normalize();
    } else {
      elbowDir = hintPerp.normalize();
    }

    const elbow = shoulder.add(
      dirToHand.scale(L1 * Math.cos(angle)).add(
        elbowDir.scale(L1 * Math.sin(angle)),
      ),
    );

    return elbow;
  }

  /**
   * シリンダーメッシュを始点→終点方向に配置する。
   */
  private alignCylinder(mesh: Mesh, from: Vector3, to: Vector3): void {
    const mid = from.add(to).scale(0.5);
    mesh.position.copyFrom(mid);

    const dir = to.subtract(from).normalize();
    const yAxis = Vector3.Up();
    const dot = Vector3.Dot(yAxis, dir);

    if (Math.abs(dot) > 0.9999) {
      mesh.rotationQuaternion = dot > 0
        ? Quaternion.Identity()
        : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
    } else {
      const cross = Vector3.Cross(yAxis, dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      mesh.rotationQuaternion = Quaternion.RotationAxis(cross.normalize(), angle);
    }
  }

  /**
   * 上腕の後方可動域制限。
   */
  private clampUpperArmBackward(shoulder: Vector3, elbowPos: Vector3): Vector3 {
    const dir = elbowPos.subtract(shoulder);
    const len = dir.length();
    if (len < 0.001) return elbowPos;

    if (dir.y <= 0 || dir.z >= 0) return elbowPos;

    const backAngle = Math.atan2(-dir.z, dir.y);
    if (backAngle <= UPPER_ARM_MAX_BACK_ANGLE) return elbowPos;

    const yzLen = Math.sqrt(dir.y * dir.y + dir.z * dir.z);
    const newY = yzLen * Math.cos(UPPER_ARM_MAX_BACK_ANGLE);
    const newZ = -yzLen * Math.sin(UPPER_ARM_MAX_BACK_ANGLE);

    return shoulder.add(new Vector3(dir.x, newY, newZ));
  }

  /**
   * 前腕の方向制限（前面基準）。
   */
  private clampForearmDirection(
    elbowPos: Vector3,
    handTarget: Vector3,
    upperDir: Vector3,
    hint: Vector3,
  ): Vector3 {
    const forearmVec = handTarget.subtract(elbowPos);
    if (forearmVec.length() < 0.001) {
      return elbowPos.add(upperDir.scale(FOREARM_LENGTH));
    }
    const forearmDir = forearmVec.normalize();

    const dotWithUpper = Vector3.Dot(forearmDir, upperDir);
    const bendAngle = Math.acos(Math.max(-1, Math.min(1, dotWithUpper)));

    const hintDotUpper = Vector3.Dot(hint, upperDir);
    const hintPerp = hint.subtract(upperDir.scale(hintDotUpper));
    const hintPerpLen = hintPerp.length();

    if (hintPerpLen < 0.001) {
      if (bendAngle > MAX_FOREARM_BEND_ANGLE) {
        const perpComp = forearmDir.subtract(upperDir.scale(dotWithUpper));
        const perpLen = perpComp.length();
        if (perpLen < 0.001) return elbowPos.add(upperDir.scale(FOREARM_LENGTH));
        const clamped = upperDir.scale(Math.cos(MAX_FOREARM_BEND_ANGLE))
          .add(perpComp.normalize().scale(Math.sin(MAX_FOREARM_BEND_ANGLE)));
        return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
      }
      return elbowPos.add(forearmDir.scale(FOREARM_LENGTH));
    }

    const frontDir = hintPerp.normalize().scale(-1);

    const forearmFront = Vector3.Dot(forearmDir, frontDir);
    if (forearmFront < 0 && bendAngle > MIN_BEND_ANGLE) {
      const clamped = upperDir.scale(Math.cos(MIN_BEND_ANGLE))
        .add(frontDir.scale(Math.sin(MIN_BEND_ANGLE)));
      return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
    }

    if (bendAngle > MAX_FOREARM_BEND_ANGLE) {
      const perpComp = forearmDir.subtract(upperDir.scale(dotWithUpper));
      const perpLen = perpComp.length();
      const bendDir = perpLen > 0.001 ? perpComp.normalize() : frontDir;
      const clamped = upperDir.scale(Math.cos(MAX_FOREARM_BEND_ANGLE))
        .add(bendDir.scale(Math.sin(MAX_FOREARM_BEND_ANGLE)));
      return elbowPos.add(clamped.normalize().scale(FOREARM_LENGTH));
    }

    return elbowPos.add(forearmDir.scale(FOREARM_LENGTH));
  }

  /** 方向ベクトル+肘ヒント+リーチ倍率から上腕・肘球・前腕・手球の4メッシュを配置 */
  private applyArmWithElbow(
    upperArm: Mesh, elbowMesh: Mesh, forearm: Mesh, hand: Mesh,
    side: -1 | 1, dir: Vector3, hint: Vector3, reach: number = 1.0,
  ): void {
    const shoulder = new Vector3(side * ARM_BODY_RADIUS, SHOULDER_Y, 0);
    const effectiveLen = TOTAL_ARM_LENGTH * reach;
    const handPos = new Vector3(
      shoulder.x + dir.x * effectiveLen,
      shoulder.y + dir.y * effectiveLen,
      dir.z * effectiveLen,
    );

    const elbowPos = this.clampUpperArmBackward(
      shoulder,
      this.solve2BoneIK(shoulder, handPos, UPPER_ARM_LENGTH, FOREARM_LENGTH, hint),
    );

    const upperDir = elbowPos.subtract(shoulder);
    const upperLen = upperDir.length();
    const upperDirN = upperLen > 0.001 ? upperDir.scale(1 / upperLen) : Vector3.Up();

    const visualHandPos = this.clampForearmDirection(elbowPos, handPos, upperDirN, hint);

    this.alignCylinder(upperArm, shoulder, elbowPos);

    elbowMesh.position.copyFrom(elbowPos);

    this.alignCylinder(forearm, elbowPos, visualHandPos);

    hand.position.copyFrom(visualHandPos);
  }
}
