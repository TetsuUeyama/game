/**
 * PassAction - パスアクションのタイミング定義
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";

/** パスアクションのタイミング定義 */
export const PASS_TIMING: ActionTiming = {
  charge: 0,       // チャージなし
  startup: 0.15,   // パスモーション予備動作（腕を引く等）
  active: 0.2,     // パスモーション実行時間（投げ動作）
  recovery: 0.4,   // パス後の硬直（フォロースルー）
};
