/**
 * ドリブルチェック関連の設定を一元管理するファイル
 * DribbleCheckController用の定数と型定義を提供
 */

/**
 * ドリブルチェックの距離設定
 */
export const DRIBBLE_CHECK_DISTANCE = {
  // 目標に到達したとみなす距離（m）
  TARGET_REACH_DISTANCE: 1.0,

  // フィールド境界の半幅（m）
  FIELD_HALF_WIDTH: 7.5,

  // フィールド境界の半長（m）
  FIELD_HALF_LENGTH: 15,

  // 境界外判定の余裕（m）
  OUT_OF_BOUNDS_MARGIN: 0.5,
} as const;

/**
 * ドリブルチェックのタイミング設定
 */
export const DRIBBLE_CHECK_TIMING = {
  // デフォルトの試行回数
  DEFAULT_TRIALS_PER_CONFIG: 10,

  // デフォルトのタイムアウト秒数
  DEFAULT_TIMEOUT_SECONDS: 30,

  // 次の試行までの遅延（ミリ秒）
  TRIAL_INTERVAL_DELAY_MS: 1000,
} as const;

/**
 * ドリブルチェックの結果
 */
export interface DribbleCheckResult {
  trialNumber: number;
  success: boolean;           // 成功したか（目標到達）
  timeToReach: number | null; // 到達時間（秒）、失敗時はnull
  stealOccurred: boolean;     // スティールが発生したか
  reason: 'reached' | 'timeout' | 'steal' | 'out_of_bounds';
}

/**
 * ドリブルチェックの設定
 */
export interface DribbleCheckConfig {
  dribblerCell: { col: string; row: number };   // ドリブラーの配置マス
  defenderCell: { col: string; row: number };   // ディフェンダーの配置マス
  targetCell: { col: string; row: number };     // 目標マス
  trialsPerConfig: number;                       // 試行回数（デフォルト: 10）
  timeoutSeconds: number;                        // タイムアウト秒数（デフォルト: 30）
  targetGoal: 'goal1' | 'goal2';                 // 攻めるゴール
}

/**
 * ドリブルチェックの進行状態
 */
export type DribbleCheckState =
  | 'idle'           // 待機中
  | 'running'        // 実行中
  | 'paused'         // 一時停止
  | 'completed'      // 完了
  | 'aborted';       // 中断

/**
 * ドリブルチェック進捗情報
 */
export interface DribbleCheckProgress {
  totalTrials: number;
  completedTrials: number;
  currentTrialNumber: number;
  elapsedTime: number;        // 現在の試行の経過時間
  state: DribbleCheckState;
}
