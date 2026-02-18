/**
 * ボール自動リーチシステム
 * オンボール時以外のキャラクターが近くのボールに向かって自動的に手を伸ばす
 * AIの判定とは別に、毎フレーム自動で実行される
 *
 * BoneIKController ベースの IKSystem を使用し、
 * 現在のアニメーションポーズから自然にボールへ手を伸ばす
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { CharacterState } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";

/**
 * ボールリーチ設定
 */
export const BALL_REACH_CONFIG = {
  /** 手を伸ばし始める水平距離（m） */
  ACTIVATION_DISTANCE: 1.5,
  /** この高さ以上のボールには反応しない（キャラ位置からの相対高さ m） */
  MAX_REACH_HEIGHT: 2.5,
} as const;

/**
 * キャラクターごとのリーチ状態
 */
interface ReachState {
  /** 現在IKが有効な腕（null=無効） */
  activeArm: 'left' | 'right' | null;
}

/**
 * ボール自動リーチシステム
 */
export class BallReachSystem {
  private ball: Ball;
  private characters: Character[];
  /** キャラクターごとのリーチ状態 */
  private reachStates: Map<Character, ReachState> = new Map();

  constructor(ball: Ball, characters: Character[]) {
    this.ball = ball;
    this.characters = characters;
  }

  /**
   * 毎フレーム更新
   * 各キャラクターの現在の手位置からボールへの距離を計算し、
   * 近い方の腕のIKターゲットをボールに設定する
   */
  public update(): void {
    const ballPos = this.ball.getPosition();
    const ballMesh = this.ball.mesh;
    const activationDistSq = BALL_REACH_CONFIG.ACTIVATION_DISTANCE * BALL_REACH_CONFIG.ACTIVATION_DISTANCE;

    for (const character of this.characters) {
      const ikSystem = character.getIKSystem();

      // IKSystemが未初期化のキャラクターはスキップ
      if (!ikSystem) {
        continue;
      }

      // ON_BALL_PLAYERはスキップ（ボール保持者）
      if (character.getState() === CharacterState.ON_BALL_PLAYER) {
        this.clearReach(character, ikSystem);
        continue;
      }

      // アクション実行中はスキップ（他システムがIKを管理）
      if (character.getActionController().getCurrentAction() !== null) {
        // アクション側がIKを管理するので、このシステムの追跡からは除外
        this.reachStates.delete(character);
        continue;
      }

      // ボール位置との水平距離をチェック
      const charPos = character.getPosition();
      const dx = ballPos.x - charPos.x;
      const dz = ballPos.z - charPos.z;
      const distSq = dx * dx + dz * dz;

      // 高さチェック（キャラクター位置からの相対高さ）
      const relativeHeight = ballPos.y - charPos.y;
      const heightInRange = relativeHeight >= 0 && relativeHeight <= BALL_REACH_CONFIG.MAX_REACH_HEIGHT;

      if (distSq <= activationDistSq && heightInRange) {
        // 範囲内 → 現在の手位置からボールに近い方の腕を判定
        const rightHandPos = character.getRightHandPosition();
        const leftHandPos = character.getLeftHandPosition();
        const rightDistSq = Vector3.DistanceSquared(rightHandPos, ballPos);
        const leftDistSq = Vector3.DistanceSquared(leftHandPos, ballPos);
        const closerArm: 'left' | 'right' = rightDistSq <= leftDistSq ? 'right' : 'left';

        const state = this.reachStates.get(character);

        // 腕が変わった場合は前の腕を解除
        if (state && state.activeArm !== null && state.activeArm !== closerArm) {
          ikSystem.setArmTarget(state.activeArm, null);
        }

        // 近い方の腕にIKターゲットを設定
        ikSystem.setArmTarget(closerArm, ballMesh);
        this.reachStates.set(character, { activeArm: closerArm });
      } else {
        // 範囲外 → リーチ解除
        this.clearReach(character, ikSystem);
      }
    }
  }

  /**
   * リーチを解除
   */
  private clearReach(character: Character, ikSystem: NonNullable<ReturnType<Character['getIKSystem']>>): void {
    const state = this.reachStates.get(character);
    if (state && state.activeArm !== null) {
      ikSystem.setArmTarget(state.activeArm, null);
      this.reachStates.delete(character);
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    for (const [character, state] of this.reachStates) {
      if (state.activeArm !== null) {
        const ikSystem = character.getIKSystem();
        if (ikSystem) {
          ikSystem.setArmTarget(state.activeArm, null);
        }
      }
    }
    this.reachStates.clear();
  }
}
