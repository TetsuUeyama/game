/**
 * Layer 1: SituationAnalyzer（状況認識）
 * 自分自身の状況を分析する
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { FieldGridUtils } from "../../config/FieldGridConfig";
import { FIELD_CONFIG } from "../../config/gameConfig";
import {
  SituationContext,
  GamePhase,
  BallRelation,
  CourtZone,
} from "../config/AILayerTypes";

/**
 * 状況分析の設定
 */
export const SITUATION_CONFIG = {
  // ゴール位置
  GOAL1_Z: 13.4,
  GOAL2_Z: -13.4,

  // ゾーン判定距離
  PAINT_DISTANCE: 4.0,           // ペイント判定距離
  THREE_POINT_MIN: 6.25,         // 3ポイントライン（最小）
  THREE_POINT_MAX: 7.5,          // 3ポイントライン付近

  // 境界判定
  BOUNDARY_MARGIN: 1.0,          // 境界からの距離

  // トランジション判定
  TRANSITION_SPEED_THRESHOLD: 3.0, // トランジション判定速度
} as const;

/**
 * 状況認識レイヤー
 */
export class SituationAnalyzer {
  /**
   * 状況を分析
   */
  analyze(
    self: Character,
    ball: Ball,
    allCharacters: Character[],
    shotClock: number = 24,
    possessionStartTime: number = 0
  ): SituationContext {
    const position = self.getPosition();
    const ballPosition = ball.getPosition();
    const myTeam = self.team;

    // 攻撃方向の決定
    const attackingGoalZ = myTeam === 'ally' ? SITUATION_CONFIG.GOAL1_Z : SITUATION_CONFIG.GOAL2_Z;
    const defendingGoalZ = myTeam === 'ally' ? SITUATION_CONFIG.GOAL2_Z : SITUATION_CONFIG.GOAL1_Z;

    // 距離計算
    const distanceToBall = Vector3.Distance(position, ballPosition);
    const distanceToAttackingGoal = Math.abs(position.z - attackingGoalZ);
    const distanceToDefendingGoal = Math.abs(position.z - defendingGoalZ);

    // フェーズ判定
    const phase = this.determinePhase(self, ball, allCharacters);

    // ボール関係判定
    const ballRelation = this.determineBallRelation(self, ball);

    // コートゾーン判定
    const courtZone = this.determineCourtZone(position, attackingGoalZ);

    // グリッド位置
    const gridCell = FieldGridUtils.worldToCell(position.x, position.z);

    // トランジション判定
    const isTransition = this.checkTransition(allCharacters, ball);

    // 経過時間計算
    const possessionTime = possessionStartTime > 0
      ? (Date.now() - possessionStartTime) / 1000
      : 0;

    return {
      phase,
      ballRelation,
      courtZone,
      gridCell,
      position: position.clone(),

      distanceToBall,
      distanceToAttackingGoal,
      distanceToDefendingGoal,

      isInPaint: this.checkInPaint(position, attackingGoalZ),
      isInThreePointRange: this.checkInThreePointRange(position, attackingGoalZ),
      isNearBoundary: this.checkNearBoundary(position),

      shotClockRemaining: shotClock,
      possessionTime,
      isTransition,
    };
  }

  /**
   * ゲームフェーズを判定
   */
  private determinePhase(
    self: Character,
    ball: Ball,
    _allCharacters: Character[]
  ): GamePhase {
    const ballHolder = ball.getHolder();
    const myTeam = self.team;

    // ボールが飛行中 = デッドボール扱い
    if (ball.isInFlight()) {
      return 'transition';
    }

    // ボール保持者がいない = ルーズボール
    if (!ballHolder) {
      return 'transition';
    }

    // ボール保持者のチームを確認
    const holderTeam = ballHolder.team;

    if (holderTeam === myTeam) {
      return 'offense';
    } else {
      return 'defense';
    }
  }

  /**
   * ボールとの関係を判定
   */
  private determineBallRelation(self: Character, ball: Ball): BallRelation {
    const ballHolder = ball.getHolder();

    if (!ballHolder) {
      return 'loose_ball';
    }

    if (ballHolder === self) {
      return 'on_ball';
    }

    return 'off_ball';
  }

  /**
   * コートゾーンを判定
   */
  private determineCourtZone(position: Vector3, attackingGoalZ: number): CourtZone {
    const goalPos = new Vector3(0, 0, attackingGoalZ);
    const distanceToGoal = Vector3.Distance(
      new Vector3(position.x, 0, position.z),
      new Vector3(goalPos.x, 0, goalPos.z)
    );

    // バックコート判定（自陣側）
    const isInBackcourt = attackingGoalZ > 0
      ? position.z < 0
      : position.z > 0;

    if (isInBackcourt) {
      return 'backcourt';
    }

    // ペイントエリア
    if (distanceToGoal < SITUATION_CONFIG.PAINT_DISTANCE) {
      return 'paint';
    }

    // 3ポイント圏内（ライン付近）
    if (distanceToGoal >= SITUATION_CONFIG.THREE_POINT_MIN &&
        distanceToGoal <= SITUATION_CONFIG.THREE_POINT_MAX) {
      return 'three_point';
    }

    // 3ポイントライン外
    if (distanceToGoal > SITUATION_CONFIG.THREE_POINT_MAX) {
      return 'beyond_arc';
    }

    // ミッドレンジ
    return 'mid_range';
  }

  /**
   * ペイントエリア内か判定
   */
  private checkInPaint(position: Vector3, attackingGoalZ: number): boolean {
    const goalPos = new Vector3(0, 0, attackingGoalZ);
    const distance = Vector3.Distance(
      new Vector3(position.x, 0, position.z),
      new Vector3(goalPos.x, 0, goalPos.z)
    );
    return distance < SITUATION_CONFIG.PAINT_DISTANCE;
  }

  /**
   * 3ポイント圏内か判定
   */
  private checkInThreePointRange(position: Vector3, attackingGoalZ: number): boolean {
    const goalPos = new Vector3(0, 0, attackingGoalZ);
    const distance = Vector3.Distance(
      new Vector3(position.x, 0, position.z),
      new Vector3(goalPos.x, 0, goalPos.z)
    );
    return distance >= SITUATION_CONFIG.THREE_POINT_MIN &&
           distance <= SITUATION_CONFIG.THREE_POINT_MAX + 1.0; // 少し余裕を持たせる
  }

  /**
   * 境界付近か判定
   */
  private checkNearBoundary(position: Vector3): boolean {
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    const margin = SITUATION_CONFIG.BOUNDARY_MARGIN;

    return Math.abs(position.x) > halfWidth - margin ||
           Math.abs(position.z) > halfLength - margin;
  }

  /**
   * トランジション状況か判定
   */
  private checkTransition(allCharacters: Character[], ball: Ball): boolean {
    // ボールが高速で移動中
    const ballVelocity = ball.getVelocity?.() ?? Vector3.Zero();
    if (ballVelocity.length() > SITUATION_CONFIG.TRANSITION_SPEED_THRESHOLD) {
      return true;
    }

    // 複数のキャラクターが高速移動中
    let fastMovingCount = 0;
    for (const char of allCharacters) {
      const velocity = char.velocity ?? Vector3.Zero();
      if (velocity.length() > SITUATION_CONFIG.TRANSITION_SPEED_THRESHOLD) {
        fastMovingCount++;
      }
    }

    return fastMovingCount >= 3;
  }
}
