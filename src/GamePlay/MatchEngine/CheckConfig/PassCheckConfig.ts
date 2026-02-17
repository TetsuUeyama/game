/**
 * パスチェック関連の設定を一元管理するファイル
 * PassCheckController用の定数と型定義を提供
 */

import { PassType } from "@/GamePlay/GameSystem/TargetTrackingAccuracySystem/PassTrajectoryConfig";

/**
 * パスチェックのタイミング設定
 */
export const PASS_CHECK_TIMING = {
  // デフォルトの試行回数
  DEFAULT_TRIALS_PER_CONFIG: 10,

  // デフォルトのタイムアウト秒数
  DEFAULT_TIMEOUT_SECONDS: 10,

  // 次の試行までの遅延（ミリ秒）
  TRIAL_INTERVAL_DELAY_MS: 1500,

  // パス開始までの遅延（ミリ秒）- セットアップ後にパスを出すまでの待機時間
  PASS_START_DELAY_MS: 500,
} as const;

/**
 * パスチェックの距離設定
 */
export const PASS_CHECK_DISTANCE = {
  // フィールド境界の半幅（m）
  FIELD_HALF_WIDTH: 7.5,

  // フィールド境界の半長（m）
  FIELD_HALF_LENGTH: 15,

  // 境界外判定の余裕（m）
  OUT_OF_BOUNDS_MARGIN: 0.5,

  // パスキャッチ成功とみなす距離（m）
  CATCH_SUCCESS_DISTANCE: 1.0,
} as const;

/**
 * ディフェンダーの配置設定
 */
export interface DefenderPlacement {
  /** 配置マス */
  cell: { col: string; row: number };
  /** ディフェンダーのタイプ（on-ball: パサーをマーク, off-ball: パスレーンをカバー） */
  type: 'on_ball' | 'off_ball';
}

/**
 * パスチェックの結果
 */
export interface PassCheckResult {
  trialNumber: number;
  success: boolean;                    // 成功したか（レシーバーがキャッチ）
  passType: PassType | null;           // 使用されたパスタイプ
  flightTime: number | null;           // パスの飛行時間（秒）、失敗時はnull
  intercepted: boolean;                // インターセプトされたか
  reason: 'caught' | 'intercepted' | 'timeout' | 'out_of_bounds' | 'missed';
  interceptedBy?: string;              // インターセプトしたディフェンダーのポジション
}

/**
 * パスチェックの設定
 */
export interface PassCheckConfig {
  /** パサー（オンボールオフェンス）の配置マス */
  passerCell: { col: string; row: number };
  /** レシーバー（オフボールオフェンス）の配置マス */
  receiverCell: { col: string; row: number };
  /** ディフェンダーの配置（任意、複数可能） */
  defenders?: DefenderPlacement[];
  /** 試行回数（デフォルト: 10） */
  trialsPerConfig: number;
  /** タイムアウト秒数（デフォルト: 10） */
  timeoutSeconds: number;
  /** 攻めるゴール */
  targetGoal: 'goal1' | 'goal2';
  /** 使用するパスタイプ（指定しない場合はAIが選択） */
  passType?: PassType;
}

/**
 * パスチェックの進行状態
 */
export type PassCheckState =
  | 'idle'           // 待機中
  | 'running'        // 実行中
  | 'paused'         // 一時停止
  | 'completed'      // 完了
  | 'aborted';       // 中断

/**
 * パスチェック進捗情報
 */
export interface PassCheckProgress {
  totalTrials: number;
  completedTrials: number;
  currentTrialNumber: number;
  elapsedTime: number;        // 現在の試行の経過時間
  state: PassCheckState;
  waitingForPass: boolean;    // パス待機中かどうか
}
