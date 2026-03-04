/**
 * CatchAction - キャッチアクションのタイミング定義
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";

/** キャッチアクションのタイミング定義 */
export const CATCH_TIMING: ActionTiming = {
  charge: 0,       // チャージなし
  startup: 0.1,    // キャッチ準備（手を伸ばす等）
  active: 0.15,    // キャッチモーション
  recovery: 0.3,   // キャッチ後の硬直（ボール確保）
};
