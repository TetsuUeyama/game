/**
 * パス軌道計算クラス
 * 各パスタイプの軌道を計算する
 */

import { Vector3 } from "@babylonjs/core";
import {
  PassType,
  PassTypeConfig,
  PASS_TYPE_CONFIGS,
  INTERCEPTION_CONFIG,
} from "@/GamePlay/GameSystem/TargetTrackingAccuracySystem/PassTrajectoryConfig";
import { PhysicsConstants } from "@/GamePlay/Object/Physics/PhysicsConfig";

import type { Vec3 } from './TrajectoryTypes';
export type { Vec3 };

/**
 * 軌道上の点
 */
export interface TrajectoryPoint {
  position: Vec3;
  time: number;
}

/**
 * 軌道計算結果
 */
export interface TrajectoryResult {
  /** 軌道上の点の配列 */
  points: TrajectoryPoint[];
  /** 飛行時間（秒） */
  flightTime: number;
  /** 初速度 */
  initialVelocity: Vec3;
  /** パスタイプ */
  passType: PassType;
  /** バウンス地点（バウンスパス用） */
  bouncePoint?: Vec3;
}

/**
 * 有効なパスタイプと軌道
 */
export interface ValidPassOption {
  passType: PassType;
  trajectory: TrajectoryResult;
  config: PassTypeConfig;
}

/**
 * パス軌道計算クラス
 */
export class PassTrajectoryCalculator {
  private gravity: number;
  private damping: number;

  constructor() {
    this.gravity = PhysicsConstants.GRAVITY_MAGNITUDE;
    this.damping = PhysicsConstants.BALL.LINEAR_DAMPING;
  }

  /**
   * 単一パスタイプの軌道を計算
   */
  public calculateTrajectory(
    start: Vec3,
    target: Vec3,
    passType: PassType,
    segments: number = 30
  ): TrajectoryResult | null {
    const config = PASS_TYPE_CONFIGS[passType];
    const distance = this.calculateHorizontalDistance(start, target);

    // 距離チェック
    if (distance < config.minDistance || distance > config.maxDistance) {
      return null;
    }

    // バウンスパスは別処理
    if (passType === PassType.BOUNCE) {
      return this.calculateBounceTrajectory(start, target, config, segments);
    }

    // 通常の放物線軌道
    return this.calculateParabolicTrajectory(start, target, config, passType, segments);
  }

  /**
   * バウンスパス用の軌道計算（2セグメント）
   */
  public calculateBounceTrajectory(
    start: Vec3,
    target: Vec3,
    config: PassTypeConfig,
    segments: number = 30
  ): TrajectoryResult {
    const bounceRatio = config.bouncePoint ?? 0.5;

    // バウンス地点を計算（水平距離の中間点で地面）
    const bounceX = start.x + (target.x - start.x) * bounceRatio;
    const bounceZ = start.z + (target.z - start.z) * bounceRatio;
    const bouncePoint: Vec3 = { x: bounceX, y: 0.12, z: bounceZ }; // ボール半径分上

    // 第1セグメント: start → bouncePoint
    const segment1 = this.calculateParabolicTrajectory(
      start,
      bouncePoint,
      config,
      PassType.BOUNCE,
      Math.floor(segments / 2)
    );

    // 第2セグメント: bouncePoint → target
    const segment2 = this.calculateParabolicTrajectory(
      bouncePoint,
      target,
      config,
      PassType.BOUNCE,
      Math.ceil(segments / 2)
    );

    // 2つのセグメントを結合
    const allPoints: TrajectoryPoint[] = [...segment1.points];
    const segment1EndTime = segment1.flightTime;

    // segment2の点を追加（時間をオフセット）
    for (let i = 1; i < segment2.points.length; i++) {
      allPoints.push({
        position: segment2.points[i].position,
        time: segment1EndTime + segment2.points[i].time,
      });
    }

    return {
      points: allPoints,
      flightTime: segment1.flightTime + segment2.flightTime,
      initialVelocity: segment1.initialVelocity,
      passType: PassType.BOUNCE,
      bouncePoint,
    };
  }

  /**
   * 放物線軌道を計算
   */
  private calculateParabolicTrajectory(
    start: Vec3,
    target: Vec3,
    config: PassTypeConfig,
    passType: PassType,
    segments: number
  ): TrajectoryResult {
    const arcHeight = config.arcHeight;
    const speedMultiplier = config.speedMultiplier;

    // 水平距離と高度差
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const dz = target.z - start.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // 飛行時間を計算（簡易計算）
    const baseSpeed = INTERCEPTION_CONFIG.BASE_PASS_SPEED * speedMultiplier;
    const flightTime = horizontalDistance / baseSpeed;

    // 初速度を計算
    const vx = dx / flightTime;
    const vz = dz / flightTime;
    // 垂直方向: 最高点がarcHeightになるように
    // y = vy*t - 0.5*g*t^2 で最高点は t = vy/g 時点
    // arcHeight = vy^2 / (2g) → vy = sqrt(2*g*arcHeight)
    const vyForArc = Math.sqrt(2 * this.gravity * arcHeight);
    // 終端高度も考慮して調整
    const vy = (dy / flightTime) + (0.5 * this.gravity * flightTime) + vyForArc * 0.5;

    const initialVelocity: Vec3 = { x: vx, y: vy, z: vz };

    // 軌道点をサンプリング
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * flightTime;
      const dampingFactor = Math.exp(-this.damping * t);

      const pos: Vec3 = {
        x: start.x + vx * t * dampingFactor,
        y: start.y + vy * t - 0.5 * this.gravity * t * t,
        z: start.z + vz * t * dampingFactor,
      };

      // 地面より下にならないように
      if (pos.y < 0.12) {
        pos.y = 0.12;
      }

      points.push({ position: pos, time: t });
    }

    return {
      points,
      flightTime,
      initialVelocity,
      passType,
    };
  }

  /**
   * 全有効パスタイプを計算
   * 距離に基づいて使用可能なパスタイプをすべて返す
   */
  public calculateAllPassTypes(
    start: Vec3,
    target: Vec3,
    requiresDominantHand: boolean = true,
    segments: number = 30
  ): ValidPassOption[] {
    const validOptions: ValidPassOption[] = [];
    const distance = this.calculateHorizontalDistance(start, target);

    // すべてのパスタイプを列挙
    const allPassTypes: PassType[] = [
      PassType.CHEST,
      PassType.BOUNCE,
      PassType.LOB,
      PassType.LONG,
      PassType.ONE_HAND,
    ];

    for (const passType of allPassTypes) {
      const config = PASS_TYPE_CONFIGS[passType];

      // 利き腕チェック
      if (config.requiresDominantHand && !requiresDominantHand) {
        continue;
      }

      // 距離チェック
      if (distance < config.minDistance || distance > config.maxDistance) {
        continue;
      }

      // 軌道を計算
      const trajectory = this.calculateTrajectory(start, target, passType, segments);
      if (trajectory) {
        validOptions.push({
          passType,
          trajectory,
          config,
        });
      } else {
      }
    }

    return validOptions;
  }

  /**
   * 水平距離を計算
   */
  public calculateHorizontalDistance(start: Vec3, target: Vec3): number {
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * 軌道上の特定時刻の位置を取得
   */
  public getPositionAtTime(trajectory: TrajectoryResult, time: number): Vec3 {
    if (time <= 0) {
      return trajectory.points[0].position;
    }
    if (time >= trajectory.flightTime) {
      return trajectory.points[trajectory.points.length - 1].position;
    }

    // 最も近い2点を見つけて補間
    for (let i = 0; i < trajectory.points.length - 1; i++) {
      const p1 = trajectory.points[i];
      const p2 = trajectory.points[i + 1];

      if (time >= p1.time && time <= p2.time) {
        const t = (time - p1.time) / (p2.time - p1.time);
        return {
          x: p1.position.x + (p2.position.x - p1.position.x) * t,
          y: p1.position.y + (p2.position.y - p1.position.y) * t,
          z: p1.position.z + (p2.position.z - p1.position.z) * t,
        };
      }
    }

    return trajectory.points[trajectory.points.length - 1].position;
  }

  /**
   * Vec3をBabylon.jsのVector3に変換
   */
  public toVector3(vec: Vec3): Vector3 {
    return new Vector3(vec.x, vec.y, vec.z);
  }

  /**
   * Vector3をVec3に変換
   */
  public fromVector3(vec: Vector3): Vec3 {
    return { x: vec.x, y: vec.y, z: vec.z };
  }
}
