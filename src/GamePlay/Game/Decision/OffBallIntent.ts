/**
 * OffBallIntent - オフボールプレイヤーが受け取り後の行動を事前計画する Intent Manager
 *
 * オフボールプレイヤーは 0.5s 周期で仮想的に「自分がボールを持ったら何をするか」を評価し、
 * キャッチ完了時に有効な intent があれば cooldown をバイパスして即実行できる。
 */

import type { SimState } from "../Types/TrackingSimTypes";
import type { OffBallIntentEntry } from "../Types/ActionScorerTypes";
import { buildHypotheticalContext, evaluateActions } from "./ActionScorer";
import { dist2d } from "../Movement/MovementCore";

const EVAL_INTERVAL = 0.5;  // 再評価間隔 (秒)
const MAX_AGE = 2.0;        // intent 有効期限 (秒)
const MAX_DRIFT = 1.5;      // 評価位置からの最大移動距離 (m)
const MIN_SCORE = 3.0;      // 消費に必要な最低スコア
const OFFENSE_COUNT = 5;    // launcher + 4 targets

export class OffBallIntentManager {
  private intents: (OffBallIntentEntry | null)[] = new Array(OFFENSE_COUNT).fill(null);
  private evalTimers: number[] = [0, 0.1, 0.2, 0.3, 0.4]; // スタガー

  /** 毎フレーム呼び出し。オフボールのみ 0.5s 周期で再評価 */
  update(state: SimState, dt: number): void {
    const allOffense = [state.launcher, ...state.targets];

    for (let i = 0; i < OFFENSE_COUNT; i++) {
      // Age existing intents
      if (this.intents[i]) {
        this.intents[i]!.age += dt;
      }

      // Skip on-ball entity
      if (i === state.onBallEntityIdx) {
        this.intents[i] = null;
        continue;
      }

      // Timer-based evaluation
      this.evalTimers[i] -= dt;
      if (this.evalTimers[i] > 0) continue;
      this.evalTimers[i] = EVAL_INTERVAL;

      // Build hypothetical context and evaluate
      const ctx = buildHypotheticalContext(state, i);
      const result = evaluateActions(ctx);

      const mover = allOffense[i];
      this.intents[i] = {
        entityIdx: i,
        intendedAction: result.bestAction,
        score: result.scores[0].totalScore,
        passTargetEntityIdx: result.bestAction === 'pass' ? result.bestPassReceiverEntityIdx : null,
        age: 0,
        evalX: mover.x,
        evalZ: mover.z,
      };
    }
  }

  /**
   * キャッチ完了時に消費。有効なら intent を返し、内部をクリア。
   * 検証: age < 2.0s, drift < 1.5m, score >= 3.0, hold は除外
   */
  consumeIntent(state: SimState, entityIdx: number): OffBallIntentEntry | null {
    if (entityIdx < 0 || entityIdx >= OFFENSE_COUNT) return null;
    const intent = this.intents[entityIdx];
    if (!intent) return null;

    // Clear regardless of validity
    this.intents[entityIdx] = null;

    // Validate
    if (intent.intendedAction === 'hold') return null;
    if (intent.age >= MAX_AGE) return null;
    if (intent.score < MIN_SCORE) return null;

    const allOffense = [state.launcher, ...state.targets];
    const mover = allOffense[entityIdx];
    const drift = dist2d(mover.x, mover.z, intent.evalX, intent.evalZ);
    if (drift >= MAX_DRIFT) return null;

    return intent;
  }

  /** 読み取り用（UI/デバッグ） */
  getIntent(entityIdx: number): OffBallIntentEntry | null {
    if (entityIdx < 0 || entityIdx >= OFFENSE_COUNT) return null;
    return this.intents[entityIdx];
  }

  /** 所有権変更時にリセット */
  reset(): void {
    for (let i = 0; i < OFFENSE_COUNT; i++) {
      this.intents[i] = null;
    }
    this.evalTimers = [0, 0.1, 0.2, 0.3, 0.4];
  }
}
