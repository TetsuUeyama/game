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
  | 'loose_ball'        // ルーズボール時
  | 'dribbling'         // ドリブル中
  | 'shooting'          // シュート中
  | 'shoot_recovery'    // シュート後硬直中（サークル非表示）
  | 'passing'           // パス中
  | 'blocking'          // ブロック中
  | 'no_circle';        // サークルなし（ON_BALL_PLAYER以外）

/**
 * 基本サークルサイズ設定
 */
export const BASE_CIRCLE_SIZE: Record<CircleSituation, number> = {
  default: 1.0,           // デフォルト: 1.0m
  offense_with_ball: 0.5, // ボール保持: 0.5m（方向比率で前方のみ延長）
  offense_no_ball: 0.5,   // オフボールオフェンス: 0.5m
  defense_marking: 0.5,   // マーキング: 0.5m
  defense_help: 0.5,      // オフボールディフェンス: 0.5m
  loose_ball: 0.5,        // ルーズボール時: 0.5m
  dribbling: 0.5,         // ドリブル中: 0.5m（方向比率で前方のみ延長）
  shooting: 0.5,          // シュート中: 0.5m（方向比率で前方のみ延長）
  shoot_recovery: 0.5,    // シュート後硬直中: 0.5m（方向比率で前方のみ延長）
  passing: 0.5,           // パス中: 0.5m（方向比率で前方のみ延長）
  blocking: 0.3,          // ブロック中: 0.3m（ジャンプ中で動けない、小さく）
  no_circle: 0,           // サークルなし: 0（ON_BALL_PLAYER以外）
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
  loose_ball: { stat: 'none', multiplier: 0 },         // ルーズボール時
  dribbling: { stat: 'none', multiplier: 0 },          // 変更なし
  shooting: { stat: 'none', multiplier: 0 },           // 変更なし
  shoot_recovery: { stat: 'none', multiplier: 0 },     // シュート後硬直中は固定（非表示）
  passing: { stat: 'none', multiplier: 0 },            // 変更なし
  blocking: { stat: 'none', multiplier: 0 },           // ブロック中は固定サイズ
  no_circle: { stat: 'none', multiplier: 0 },          // サークルなし
};

/**
 * オンボール状況別の8方向比率（扇形排除ゾーン）
 * scale（BASE_CIRCLE_SIZE=0.5）と掛け合わせて実効半径になる
 * 前方扇形（正面+斜め前）のみ延長、側面・背面は0.5mのまま
 *
 * 方向: 0=正面, 1=右前, 2=右, 3=右後, 4=背面, 5=左後, 6=左, 7=左前
 */
export const ON_BALL_SITUATION_RADII: Partial<Record<CircleSituation, number[]>> = {
  // ボール保持: 正面・斜め前 0.5×6.0=3.0m / 他 0.5m
  offense_with_ball: [6.0, 6.0, 1.0, 1.0, 1.0, 1.0, 1.0, 6.0],
  // パス中: ボール保持と同等
  passing:           [6.0, 6.0, 1.0, 1.0, 1.0, 1.0, 1.0, 6.0],
  // shooting, dribbling, shoot_recovery: 排除ゾーンなし（均一0.5m）
};

/** 均一サークル（非オンボール用） */
export const UNIFORM_DIRECTION_RADII: number[] = [
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
];

/**
 * サークルサイズの最小・最大値
 */
export const CIRCLE_SIZE_LIMITS = {
  MIN: 0,    // 最小0（no_circle用）
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
      loose_ball: 'ルーズボール',
      dribbling: 'ドリブル',
      shooting: 'シュート',
      shoot_recovery: 'シュート硬直',
      passing: 'パス',
      blocking: 'ブロック',
      no_circle: 'サークルなし',
    };
    return names[situation];
  }
}
