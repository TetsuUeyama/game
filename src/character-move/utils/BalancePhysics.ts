/**
 * 重心システムの物理計算ユーティリティ
 *
 * ビー玉のような物理挙動を計算する関数群。
 * - 運動方程式（バネ-ダンパー系）
 * - 衝突計算（運動量保存）
 * - 選手パラメータの計算
 */

import { Vector3 } from "@babylonjs/core";
import {
  BALANCE_PHYSICS,
  BALANCE_SPHERE,
  BALANCE_SPRING,
  BALANCE_DAMPING,
  BALANCE_COLLISION,
  BALANCE_LIMITS,
  BALANCE_THRESHOLD,
} from "../config/BalanceConfig";

// ============================================================================
// 型定義
// ============================================================================

/**
 * 重心球の状態
 */
export interface BalanceSphereState {
  /** 重心球の位置（キャラクター中心からの相対位置） */
  position: Vector3;
  /** 重心球の速度 */
  velocity: Vector3;
  /** 重心球の質量（kg） */
  mass: number;
  /** 重心球の半径 */
  radius: number;
  /** 基準位置（股関節の高さ） */
  restPosition: Vector3;
  /** ロック中か（空中など） */
  isLocked: boolean;
  /** 接地しているか */
  isGrounded: boolean;
}

/**
 * 選手の物理パラメータ
 */
export interface PlayerPhysicsParams {
  /** バネ定数 */
  springConstant: number;
  /** 減衰係数 */
  damping: number;
  /** 質量 */
  mass: number;
  /** 重心球の半径 */
  radius: number;
  /** 基準位置（股関節の高さ） */
  restHeight: number;
}

/**
 * 衝突結果
 */
export interface CollisionResult {
  /** 衝突が発生したか */
  occurred: boolean;
  /** 自分の速度変化 */
  velocityChangeA: Vector3;
  /** 相手の速度変化 */
  velocityChangeB: Vector3;
  /** 衝撃の大きさ */
  impulseMagnitude: number;
  /** バランスを崩したか（自分） */
  destabilizedA: boolean;
  /** バランスを崩したか（相手） */
  destabilizedB: boolean;
  /** 吹き飛ばされたか（自分） */
  knockedBackA: boolean;
  /** 吹き飛ばされたか（相手） */
  knockedBackB: boolean;
}

// ============================================================================
// 選手パラメータ計算
// ============================================================================

/**
 * 選手の物理パラメータを計算
 */
export function calculatePlayerPhysics(weight: number, height: number): PlayerPhysicsParams {
  // 値を範囲内にクランプ
  const clampedWeight = clamp(weight, BALANCE_LIMITS.MIN_WEIGHT, BALANCE_LIMITS.MAX_WEIGHT);
  const clampedHeight = clamp(height, BALANCE_LIMITS.MIN_HEIGHT, BALANCE_LIMITS.MAX_HEIGHT);

  const weightRatio = clampedWeight / BALANCE_PHYSICS.BASE_WEIGHT;
  const heightRatio = clampedHeight / BALANCE_PHYSICS.BASE_HEIGHT;

  // バネ定数: 軽い選手ほど強い、背が高いほど弱い（不安定）
  const springConstant = BALANCE_SPRING.BASE_CONSTANT *
    (1 - (weightRatio - 1) * BALANCE_SPRING.WEIGHT_REDUCTION) *
    (1 - (heightRatio - 1) * BALANCE_SPRING.HEIGHT_INSTABILITY);

  // 減衰: 重い選手ほど小さい（止まりにくい）
  const damping = BALANCE_DAMPING.BASE_VALUE *
    (1 - (weightRatio - 1) * BALANCE_DAMPING.WEIGHT_REDUCTION);

  // 重心球の半径
  const radius = BALANCE_SPHERE.BASE_RADIUS +
    (clampedWeight - BALANCE_PHYSICS.BASE_WEIGHT) * BALANCE_SPHERE.WEIGHT_RADIUS_SCALE;

  // 股関節の高さ（重心の基準位置）
  const restHeight = clampedHeight * BALANCE_SPHERE.HIP_HEIGHT_RATIO;

  return {
    springConstant: Math.max(10, springConstant), // 最小値を保証
    damping: Math.max(2, damping),
    mass: clampedWeight,
    radius,
    restHeight,
  };
}

/**
 * 切り返しの素早さ係数を計算（0-1、1が最速）
 */
export function calculateAgility(weight: number, height: number): number {
  const clampedWeight = clamp(weight, BALANCE_LIMITS.MIN_WEIGHT, BALANCE_LIMITS.MAX_WEIGHT);
  const clampedHeight = clamp(height, BALANCE_LIMITS.MIN_HEIGHT, BALANCE_LIMITS.MAX_HEIGHT);

  // 軽くて背が低いほど素早い
  const weightFactor = 1 - (clampedWeight - BALANCE_LIMITS.MIN_WEIGHT) /
    (BALANCE_LIMITS.MAX_WEIGHT - BALANCE_LIMITS.MIN_WEIGHT);
  const heightFactor = 1 - (clampedHeight - BALANCE_LIMITS.MIN_HEIGHT) /
    (BALANCE_LIMITS.MAX_HEIGHT - BALANCE_LIMITS.MIN_HEIGHT);

  return clamp(weightFactor * 0.6 + heightFactor * 0.4, 0.2, 1);
}

/**
 * 安定性係数を計算（0-1、1が最も安定）
 */
export function calculateStability(
  height: number,
  horizontalOffset: number,
  speed: number,
  isGrounded: boolean
): number {
  if (!isGrounded) return 0;

  // 重心がずれているほど不安定
  const positionStability = 1 - Math.min(1, horizontalOffset / BALANCE_LIMITS.MAX_HORIZONTAL);
  // 動いているほど不安定
  const velocityStability = 1 - Math.min(1, speed / 3);
  // 背が低いほど安定
  const heightStability = 1 - (height - BALANCE_LIMITS.MIN_HEIGHT) /
    (BALANCE_LIMITS.MAX_HEIGHT - BALANCE_LIMITS.MIN_HEIGHT) * 0.3;

  return positionStability * velocityStability * heightStability;
}

/**
 * 押し込み力を計算
 */
export function calculatePushPower(mass: number, velocity: Vector3): number {
  const momentum = velocity.length() * mass;
  return momentum + mass * 0.5;
}

// ============================================================================
// 運動方程式
// ============================================================================

/**
 * バネ-ダンパー系の力を計算
 *
 * F = -k * x - c * v
 * k: バネ定数, x: 変位, c: 減衰係数, v: 速度
 */
export function calculateSpringDamperForce(
  position: Vector3,
  velocity: Vector3,
  restPosition: Vector3,
  springConstant: number,
  damping: number
): Vector3 {
  // 変位（基準位置からのずれ）
  const displacement = position.subtract(restPosition);

  // バネ力（復元力）
  const springForce = displacement.scale(-springConstant);

  // 減衰力（速度に比例した抵抗）
  const dampingForce = velocity.scale(-damping);

  return springForce.add(dampingForce);
}

/**
 * 加速度から速度と位置を更新（オイラー法）
 */
export function integrateMotion(
  position: Vector3,
  velocity: Vector3,
  force: Vector3,
  mass: number,
  deltaTime: number
): { position: Vector3; velocity: Vector3 } {
  // a = F / m
  const acceleration = force.scale(1 / mass);

  // v = v + a * dt
  const newVelocity = velocity.add(acceleration.scale(deltaTime));

  // x = x + v * dt
  const newPosition = position.add(newVelocity.scale(deltaTime));

  return { position: newPosition, velocity: newVelocity };
}

/**
 * 位置を制限範囲内にクランプ
 */
export function clampPosition(position: Vector3, restPosition: Vector3): Vector3 {
  const offset = position.subtract(restPosition);

  // 水平方向の制限
  const horizontalDist = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
  if (horizontalDist > BALANCE_LIMITS.MAX_HORIZONTAL) {
    const scale = BALANCE_LIMITS.MAX_HORIZONTAL / horizontalDist;
    offset.x *= scale;
    offset.z *= scale;
  }

  // 垂直方向の制限
  offset.y = clamp(offset.y, -BALANCE_LIMITS.MAX_VERTICAL, BALANCE_LIMITS.MAX_VERTICAL);

  return restPosition.add(offset);
}

// ============================================================================
// 衝突計算
// ============================================================================

/**
 * 2つの重心球の衝突を計算（運動量保存則）
 */
export function calculateCollision(
  stateA: BalanceSphereState,
  stateB: BalanceSphereState,
  heightA: number,
  heightB: number,
  contactNormal: Vector3
): CollisionResult {
  const result: CollisionResult = {
    occurred: false,
    velocityChangeA: Vector3.Zero(),
    velocityChangeB: Vector3.Zero(),
    impulseMagnitude: 0,
    destabilizedA: false,
    destabilizedB: false,
    knockedBackA: false,
    knockedBackB: false,
  };

  const m1 = stateA.mass;
  const m2 = stateB.mass;
  const v1 = stateA.velocity;
  const v2 = stateB.velocity;

  // 相対速度
  const relativeVelocity = v1.subtract(v2);
  const normalVelocity = Vector3.Dot(relativeVelocity, contactNormal);

  // 離れていく方向なら衝突処理不要
  if (normalVelocity > 0) {
    return result;
  }

  result.occurred = true;

  // 反発係数
  const e = BALANCE_COLLISION.RESTITUTION;

  // 衝撃量の計算（運動量保存）
  const j = -(1 + e) * normalVelocity / (1 / m1 + 1 / m2);
  result.impulseMagnitude = Math.abs(j);

  // 速度変化
  const impulse = contactNormal.scale(j);
  result.velocityChangeA = impulse.scale(1 / m1);
  result.velocityChangeB = impulse.scale(-1 / m2);

  // 高さアドバンテージ
  const heightDiff = heightA - heightB;
  if (Math.abs(heightDiff) > 0.05) {
    const advantage = Math.abs(heightDiff) * BALANCE_COLLISION.HEIGHT_ADVANTAGE;
    if (heightDiff > 0) {
      // Aの方が背が高い：Bを押さえ込む
      result.velocityChangeB = result.velocityChangeB.add(new Vector3(0, -advantage * m1 / m2, 0));
    } else {
      // Bの方が背が高い：Aを押さえ込む
      result.velocityChangeA = result.velocityChangeA.add(new Vector3(0, -advantage * m2 / m1, 0));
    }
  }

  // バランス崩し・吹き飛ばし判定
  const impactOnA = result.impulseMagnitude / m1;
  const impactOnB = result.impulseMagnitude / m2;

  if (impactOnA > BALANCE_COLLISION.KNOCKBACK_THRESHOLD) {
    result.knockedBackA = true;
    result.destabilizedA = true;
  } else if (impactOnA > BALANCE_COLLISION.DESTABILIZE_THRESHOLD) {
    result.destabilizedA = true;
  }

  if (impactOnB > BALANCE_COLLISION.KNOCKBACK_THRESHOLD) {
    result.knockedBackB = true;
    result.destabilizedB = true;
  } else if (impactOnB > BALANCE_COLLISION.DESTABILIZE_THRESHOLD) {
    result.destabilizedB = true;
  }

  return result;
}

// ============================================================================
// 状態判定
// ============================================================================

/**
 * 次のアクションに遷移可能か判定
 */
export function canTransition(state: BalanceSphereState): boolean {
  if (state.isLocked) return false;

  const offset = state.position.subtract(state.restPosition);
  const horizontalOffset = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
  const horizontalSpeed = Math.sqrt(
    state.velocity.x * state.velocity.x +
    state.velocity.z * state.velocity.z
  );

  return horizontalOffset <= BALANCE_THRESHOLD.TRANSITION &&
         horizontalSpeed <= BALANCE_THRESHOLD.VELOCITY;
}

/**
 * ニュートラル状態か判定
 */
export function isNeutral(state: BalanceSphereState): boolean {
  if (state.isLocked) return false;

  const offset = state.position.subtract(state.restPosition);
  return offset.length() <= BALANCE_THRESHOLD.NEUTRAL &&
         state.velocity.length() <= BALANCE_THRESHOLD.VELOCITY * 0.5;
}

/**
 * 遷移可能になるまでの推定時間を計算（秒）
 */
export function estimateRecoveryTime(
  state: BalanceSphereState,
  damping: number
): number {
  if (state.isLocked) return Infinity;

  const offset = state.position.subtract(state.restPosition);
  const horizontalOffset = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
  const speed = state.velocity.length();

  if (horizontalOffset <= BALANCE_THRESHOLD.TRANSITION &&
      speed <= BALANCE_THRESHOLD.VELOCITY) {
    return 0;
  }

  // 減衰振動の時定数から概算
  const tau = state.mass / damping;
  return tau * Math.log(Math.max(horizontalOffset, speed * tau) / BALANCE_THRESHOLD.TRANSITION);
}

/**
 * 水平方向のオフセット距離を計算
 */
export function getHorizontalOffset(position: Vector3, restPosition: Vector3): number {
  const offset = position.subtract(restPosition);
  return Math.sqrt(offset.x * offset.x + offset.z * offset.z);
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 値を範囲内にクランプ
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 体重による力の調整係数を計算
 */
export function getWeightForceFactor(weight: number): number {
  return BALANCE_PHYSICS.BASE_WEIGHT / weight;
}
