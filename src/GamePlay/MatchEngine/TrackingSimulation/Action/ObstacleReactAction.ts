/**
 * ObstacleReactAction - 障害物リアクションのタイミング定義
 */

import type { ActionTiming } from "../Types/TrackingSimTypes";

/** 障害物リアクションのタイミング定義 */
export const OBSTACLE_REACT_TIMING: ActionTiming = {
  startup: 0.0,    // 即座にリアクション
  active: 10.0,    // イベント駆動（ボール結果まで）
  recovery: 0.3,   // リアクション後の硬直
};

/** ターゲット受け取りのタイミング定義 */
export const TARGET_RECEIVE_TIMING: ActionTiming = {
  startup: 0.0,    // 即座にキャッチ体勢
  active: 10.0,    // イベント駆動（ボール結果まで）
  recovery: 0.3,   // キャッチ後の硬直
};
