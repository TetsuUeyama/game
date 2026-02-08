/**
 * ジャンプボール設定
 *
 * ゲーム開始時のジャンプボールに関する定数と設定
 */

/**
 * センターサークル設定
 */
export const CENTER_CIRCLE = {
  /** センターサークル中心座標 */
  CENTER_X: 0,
  CENTER_Y: 0,
  CENTER_Z: 0,
  /** センターサークル半径（m） */
  RADIUS: 1.8,
} as const;

/**
 * ジャンプボール座標設定
 */
export const JUMP_BALL_POSITIONS = {
  /** ジャンパー初期位置のZ軸オフセット（センターからの距離） */
  JUMPER_OFFSET_Z: 0.3, // より近くに配置してボールに届きやすくする
  /** ボール開始高さ（m）- 審判がボールを持つ位置 */
  BALL_START_HEIGHT: 3.0, // 300cmからスタート
  /** ボール投げ上げ高さ（m）- 開始位置からの上昇分 */
  BALL_TOSS_HEIGHT: 0.5, // 3.0m + 0.5m = 3.5mまで上昇
  /** 待機選手の最小距離（センターからの距離、m） */
  OTHER_PLAYER_MIN_DISTANCE: 3.0,
} as const;

/**
 * ジャンプボールタイミング設定
 */
export const JUMP_BALL_TIMING = {
  /** ボール投げ上げからジャンプ開始までの待機時間（秒） */
  TOSS_TO_JUMP_DELAY: 0.3,
  /** ジャンプボール開始までの準備時間（秒） */
  PREPARATION_TIME: 1.5,
  /** ボールがチップ可能になる高さ（ジャンパーのリーチ付近、落下中に競る） */
  TIP_ENABLED_MIN_HEIGHT: 2.8, // ジャンパーが手を伸ばして届く最低高さ
  /** ボールがチップ可能な最大高さ */
  TIP_ENABLED_MAX_HEIGHT: 4.5, // 最高到達点付近
  /** 手とボールの接触判定半径（m） */
  HAND_BALL_CONTACT_RADIUS: 0.25,
  /** トス開始からジャンプ発動までの遅延（秒） */
  JUMP_TRIGGER_DELAY: 0.3,
} as const;

/**
 * ジャンプボール物理設定
 */
export const JUMP_BALL_PHYSICS = {
  /** ボールを投げ上げる力（N） */
  BALL_TOSS_FORCE: 8.0,
  /** チップ時のボール速度（m/s） */
  TIP_BALL_SPEED: 6.0,
  /** チップの水平方向成分比率 */
  TIP_HORIZONTAL_RATIO: 0.8,
  /** チップの垂直方向成分比率（上向き） */
  TIP_VERTICAL_RATIO: 0.2,
} as const;

/**
 * ジャンプボール押し合い設定
 * preparingフェーズ中にジャンパー同士がpower値に基づいてセンターポジションを争う
 */
export const JUMP_BALL_CONTEST = {
  /** 押し合いの強さ（フレームあたりの最大移動距離 m） */
  PUSH_SPEED: 0.02,
  /** ジャンパーがボール真下に到達する目標距離（m） */
  TARGET_THRESHOLD: 0.05,
  /** powerステータスの最大差で到達する押し出し比率 */
  MAX_PUSH_RATIO: 0.85,
  MIN_PUSH_RATIO: 0.15,
} as const;

/**
 * ジャンプボール状態
 */
export type JumpBallPhase =
  | 'idle'           // 待機中（ジャンプボールなし）
  | 'preparing'      // 準備中（選手配置）
  | 'tossing'        // ボール投げ上げ中
  | 'jumping'        // ジャンプ中（チップ可能）
  | 'completed';     // 完了（通常の試合へ）

/**
 * ジャンプボール情報
 */
export interface JumpBallInfo {
  /** 現在のフェーズ */
  phase: JumpBallPhase;
  /** 味方チームのジャンパー */
  allyJumper: string | null;  // playerPosition
  /** 敵チームのジャンパー */
  enemyJumper: string | null; // playerPosition
  /** 経過時間（秒） */
  elapsedTime: number;
  /** ボールがチップされたか */
  ballTipped: boolean;
}

/**
 * デフォルトのジャンプボール情報
 */
export const DEFAULT_JUMP_BALL_INFO: JumpBallInfo = {
  phase: 'idle',
  allyJumper: null,
  enemyJumper: null,
  elapsedTime: 0,
  ballTipped: false,
};
