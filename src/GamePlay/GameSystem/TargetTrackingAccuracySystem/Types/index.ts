// ============================================================
// Vec3: Babylon.js非依存の3Dベクトル型 + ユーティリティ
// ============================================================

import type { Vec3 } from '@/GamePlay/Object/Physics/Trajectory/TrajectoryTypes';
export type { Vec3 };

// --- 定数 ---

export const VEC3_ZERO: Vec3 = { x: 0, y: 0, z: 0 };
export const VEC3_GRAVITY: Vec3 = { x: 0, y: -9.81, z: 0 };

// --- ユーティリティ関数 ---

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3LengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(vec3LengthSq(v));
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-12) return VEC3_ZERO;
  return vec3Scale(v, 1 / len);
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(a, b));
}

// ============================================================
// ドメイン型
// ============================================================

/** 移動するターゲット */
export interface MovingTarget {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly acceleration?: Vec3;
}

/** 発射パラメータ */
export interface LaunchParams {
  readonly launchPos: Vec3;
  readonly target: MovingTarget;
  readonly maxSpeed: number;
  readonly gravity: number;
  readonly damping: number;
}

/** 迎撃解（1つの飛行時間に対応） */
export interface InterceptSolution {
  readonly launchVelocity: Vec3;
  readonly interceptPos: Vec3;
  readonly flightTime: number;
  readonly speed: number;
  readonly valid: boolean;
}

/** ソルバー結果 */
export interface SolverResult {
  readonly solutions: readonly InterceptSolution[];
  readonly bestSolution: InterceptSolution | null;
}

/** ソルバー設定 */
export interface SolverConfig {
  /** 粗探索ステップ幅 (秒) */
  readonly coarseStep: number;
  /** 密探索ステップ幅 (秒) */
  readonly fineStep: number;
  /** 探索開始時間 (秒) */
  readonly minTime: number;
  /** 探索終了時間 (秒) */
  readonly maxTime: number;
  /** 二分法の反復回数 */
  readonly bisectIterations: number;
}

/** アーク発射設定 */
export interface ArcLaunchConfig {
  /** アーク高さ (m) */
  readonly arcHeight: number;
}

/** 命中精度評価結果 */
export interface AccuracyResult {
  /** 精度スコア (0〜1、1が完全命中) */
  readonly score: number;
  /** 最接近距離 (m) */
  readonly closestDistance: number;
  /** 最接近時刻 (秒) */
  readonly closestTime: number;
  /** 意図した迎撃時刻での偏差ベクトル */
  readonly deviationAtIntercept: Vec3;
}

/** ボール飛行状態（事後評価用） */
export interface BallFlightState {
  readonly startPos: Vec3;
  readonly launchVelocity: Vec3;
  readonly gravity: number;
  readonly damping: number;
}
