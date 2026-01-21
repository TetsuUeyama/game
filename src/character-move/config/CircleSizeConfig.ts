/**
 * キャラクターの足元サークルサイズ設定
 * 状況に応じたサークルサイズを定義
 */

/**
 * サークルサイズの状況タイプ
 */
export type CircleSituation =
  | 'default'           // デフォルト
  | 'offense_with_ball' // ボール保持中（オフェンス）
  | 'offense_no_ball'   // ボール非保持（オフェンス側チーム）
  | 'defense_marking'   // マーキング中（ディフェンス）
  | 'defense_help'      // ヘルプディフェンス
  | 'dribbling'         // ドリブル中
  | 'shooting'          // シュート中
  | 'shoot_recovery'    // シュート後硬直中（サークル非表示）
  | 'passing'           // パス中
  | 'blocking';         // ブロック中

/**
 * 基本サークルサイズ設定
 */
export const BASE_CIRCLE_SIZE: Record<CircleSituation, number> = {
  default: 1.0,           // デフォルト: 1.0m
  offense_with_ball: 1.0, // ボール保持: 1.0m（変更なし）
  offense_no_ball: 1.0,   // オフボール: 1.0m（変更なし）
  defense_marking: 1.0,   // マーキング: 1.0m（変更なし）
  defense_help: 1.0,      // ヘルプ: 1.0m（変更なし）
  dribbling: 1.0,         // ドリブル中: 1.0m（変更なし）
  shooting: 1.0,          // シュート中: 1.0m（変更なし）
  shoot_recovery: 0,      // シュート後硬直中: 0（サークル非表示）
  passing: 1.0,           // パス中: 1.0m（変更なし）
  blocking: 0.3,          // ブロック中: 0.3m（ジャンプ中で動けない、小さく）
};

/**
 * ステータスによるサークルサイズ補正係数
 * 各状況でどのステータスがサークルサイズに影響するか
 */
export const STAT_INFLUENCE: Record<CircleSituation, {
  stat: 'offense' | 'defense' | 'speed' | 'power' | 'none';
  multiplier: number; // ステータス100で何倍になるか（0.5 = 50%増加）
}> = {
  default: { stat: 'none', multiplier: 0 },
  offense_with_ball: { stat: 'none', multiplier: 0 },  // 変更なし
  offense_no_ball: { stat: 'none', multiplier: 0 },    // 変更なし
  defense_marking: { stat: 'none', multiplier: 0 },    // 変更なし
  defense_help: { stat: 'none', multiplier: 0 },       // 変更なし
  dribbling: { stat: 'none', multiplier: 0 },          // 変更なし
  shooting: { stat: 'none', multiplier: 0 },           // 変更なし
  shoot_recovery: { stat: 'none', multiplier: 0 },     // シュート後硬直中は固定（非表示）
  passing: { stat: 'none', multiplier: 0 },            // 変更なし
  blocking: { stat: 'none', multiplier: 0 },           // ブロック中は固定サイズ
};

/**
 * サークルサイズの最小・最大値
 */
export const CIRCLE_SIZE_LIMITS = {
  MIN: 0.3,  // 最小0.3m
  MAX: 2.0,  // 最大2.0m
} as const;

/**
 * サークルサイズ変更のアニメーション設定
 */
export const CIRCLE_ANIMATION = {
  TRANSITION_SPEED: 3.0, // 1秒あたりの変化速度（m/s）
  SMOOTH_FACTOR: 0.1,    // スムージング係数（0-1）
} as const;

/**
 * サークルサイズ計算ユーティリティ
 */
export class CircleSizeUtils {
  /**
   * 状況とステータスに基づいたサークルサイズを計算
   * @param situation 現在の状況
   * @param stats プレイヤーのステータス
   * @returns 計算されたサークルサイズ（メートル）
   */
  public static calculateCircleSize(
    situation: CircleSituation,
    stats?: {
      offense?: number;
      defense?: number;
      speed?: number;
      power?: number;
    }
  ): number {
    const baseSize = BASE_CIRCLE_SIZE[situation];
    const influence = STAT_INFLUENCE[situation];

    if (influence.stat === 'none' || !stats) {
      return baseSize;
    }

    // ステータス値を取得（デフォルト50）
    let statValue = 50;
    switch (influence.stat) {
      case 'offense':
        statValue = stats.offense ?? 50;
        break;
      case 'defense':
        statValue = stats.defense ?? 50;
        break;
      case 'speed':
        statValue = stats.speed ?? 50;
        break;
      case 'power':
        statValue = stats.power ?? 50;
        break;
    }

    // ステータスによる補正（50を基準に、100で最大補正）
    const statBonus = ((statValue - 50) / 50) * influence.multiplier;
    const calculatedSize = baseSize * (1 + statBonus);

    // 最小・最大値でクランプ
    return Math.max(
      CIRCLE_SIZE_LIMITS.MIN,
      Math.min(CIRCLE_SIZE_LIMITS.MAX, calculatedSize)
    );
  }

  /**
   * サークルサイズをスムーズに補間
   * @param current 現在のサイズ
   * @param target 目標サイズ
   * @param deltaTime 経過時間（秒）
   * @returns 補間されたサイズ
   */
  public static interpolateSize(
    current: number,
    target: number,
    deltaTime: number
  ): number {
    const maxChange = CIRCLE_ANIMATION.TRANSITION_SPEED * deltaTime;
    const diff = target - current;

    if (Math.abs(diff) <= maxChange) {
      return target;
    }

    return current + Math.sign(diff) * maxChange;
  }

  /**
   * 状況の日本語名を取得
   */
  public static getSituationName(situation: CircleSituation): string {
    const names: Record<CircleSituation, string> = {
      default: 'デフォルト',
      offense_with_ball: 'ボール保持',
      offense_no_ball: 'オフボール',
      defense_marking: 'マーキング',
      defense_help: 'ヘルプ',
      dribbling: 'ドリブル',
      shooting: 'シュート',
      shoot_recovery: 'シュート硬直',
      passing: 'パス',
      blocking: 'ブロック',
    };
    return names[situation];
  }
}
