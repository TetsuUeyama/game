/**
 * PassAction - パスアクションのタイミング定義
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";

/** パスアクションのタイミング定義（チャージなし固定） */
export const PASS_TIMING: ActionTiming = {
  charge: 0,       // チャージなし
  startup: 0.15,   // パスモーション予備動作（腕を引く等）
  active: 0.2,     // パスモーション実行時間（投げ動作）
  recovery: 0.4,   // パス後の硬直（フォロースルー）
};

/**
 * アラインメントチャージ付きパスタイミングを計算。
 * charge = alignCharge（体の回転に必要な時間）、他は PASS_TIMING と同じ。
 */
export function computePassTiming(alignCharge: number): ActionTiming {
  return {
    charge: alignCharge,
    startup: 0.15,
    active: 0.2,
    recovery: 0.4,
  };
}
