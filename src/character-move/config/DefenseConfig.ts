/**
 * ディフェンス関連の設定を一元管理するファイル
 * 1on1バトル、ディフェンス位置取り、反応時間に関する定数とユーティリティメソッドを提供
 */

/**
 * ディフェンス距離設定（メートル）
 */
export const DEFENSE_DISTANCE = {
  // オフェンス側の固定半径
  OFFENSE_CIRCLE_RADIUS: 1.0,        // オフェンス側のサークル半径（固定）

  // ディフェンス距離
  GOALKEEPER_MAX_RADIUS: 5.0,        // ゴールキーパーの行動制限半径
  OFF_BALL_DEFENDER_DISTANCE: 1.0,   // オフボールディフェンダーとプレイヤーの距離
  APPROACH_MARGIN: 1.0,              // ディフェンダーが近づく際の余裕距離

  // 射線・検出
  LINE_THRESHOLD: 1.0,               // 射線上の敵検出閾値
  PASS_LINE_TOLERANCE: 0.5,          // パスライン検出許容誤差
} as const;

/**
 * 1on1バトル設定
 */
export const ONE_ON_ONE_BATTLE = {
  // タイミング設定（ミリ秒）
  DICE_ROLL_INTERVAL: 1000,          // サイコロを振る間隔
  COLLISION_REDIRECT_INTERVAL: 300,  // 衝突時の方向転換最小間隔

  // ゴール方向行動
  TURN_TO_GOAL_CHANCE: 0.25,         // ゴール方向を向く確率（25%）

  // AI移動
  RANDOM_DIRECTION_COUNT: 8,         // ランダム移動の方向数（8方向）
} as const;

/**
 * ディフェンス反応時間設定（ミリ秒）
 */
export const DEFENSE_REACTION = {
  DEFAULT_DELAY: 1000,               // デフォルトの反応遅延

  // reflexesベースの計算用（初回反応）
  REFLEXES_BASE: 1000,               // 基準値（1000 - reflexes で計算）

  // quicknessベースの計算用（動き直し）
  QUICKNESS_MULTIPLIER: 10,          // 係数（(100 - quickness) * 10 で計算）
} as const;

/**
 * ディフェンス移動設定
 */
export const DEFENSE_MOVEMENT = {
  // 追従距離
  STOP_DISTANCE: 0.3,                // 目標位置での停止距離
  TARGET_APPROACH_THRESHOLD: 0.05,   // 目標接近閾値

  // オフボールプレイヤー設定
  OFF_BALL_MIN_DISTANCE: 5.0,        // オンボールプレイヤーからの最低距離

  // ボール追跡
  BALL_APPROACH_DISTANCE: 2.0,       // ボールに近づく距離
  BALL_WALK_SPEED_FACTOR: 0.5,       // ボール近くでの歩き速度係数
} as const;

/**
 * ディフェンスフォーメーション設定
 */
export const DEFENSE_FORMATION = {
  // 角度オフセット（度）- ゴール方向を中心とした前方180度
  ANGLE_OFFSETS: [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90],

  // 衝突回避角度（度）
  AVOIDANCE_ANGLES: [30, -30, 60, -60, 90, -90],
} as const;

/**
 * ディフェンス関連のユーティリティメソッド
 */
export class DefenseUtils {
  /**
   * reflexesに基づいた反応遅延時間を計算（初回動き出し時）
   * @param reflexes 選手のreflexesステータス値
   * @returns 遅延時間（ミリ秒）
   */
  public static calculateReflexesDelay(reflexes: number | undefined): number {
    if (reflexes === undefined) {
      return DEFENSE_REACTION.DEFAULT_DELAY;
    }
    // 1000 - reflexes ミリ秒
    return Math.max(0, DEFENSE_REACTION.REFLEXES_BASE - reflexes);
  }

  /**
   * quicknessに基づいた遅延時間を計算（動き直し時）
   * @param quickness 選手のquicknessステータス値
   * @returns 遅延時間（ミリ秒）
   */
  public static calculateQuicknessDelay(quickness: number | undefined): number {
    if (quickness === undefined) {
      return DEFENSE_REACTION.DEFAULT_DELAY;
    }
    // (100 - quickness) * 10 ミリ秒
    return Math.max(0, (100 - quickness) * DEFENSE_REACTION.QUICKNESS_MULTIPLIER);
  }

  /**
   * 2つのサークルが接触する距離を計算
   * @param radius1 サークル1の半径
   * @param radius2 サークル2の半径
   * @returns 接触距離
   */
  public static calculateContactDistance(radius1: number, radius2: number): number {
    return radius1 + radius2;
  }

  /**
   * 1on1状態かどうかを判定
   * @param distance オフェンスとディフェンダーの距離
   * @param offenseRadius オフェンスのサークル半径
   * @param defenderRadius ディフェンダーのサークル半径
   * @returns 1on1状態の場合true
   */
  public static is1on1State(
    distance: number,
    offenseRadius: number = DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS,
    defenderRadius: number
  ): boolean {
    const minDistance = this.calculateContactDistance(offenseRadius, defenderRadius);
    return distance <= minDistance;
  }

  /**
   * ディフェンダーがオフェンスに近づきすぎているかを判定
   * @param distance 現在の距離
   * @param offenseRadius オフェンスのサークル半径
   * @param defenderRadius ディフェンダーのサークル半径
   * @returns 近づきすぎている場合true
   */
  public static isTooCloseToOffense(
    distance: number,
    offenseRadius: number = DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS,
    defenderRadius: number
  ): boolean {
    const minDistance = this.calculateContactDistance(offenseRadius, defenderRadius);
    return distance < minDistance + DEFENSE_DISTANCE.APPROACH_MARGIN;
  }

  /**
   * ゴールキーパーが制限半径内にいるかを判定
   * @param distance ゴールからの距離
   * @returns 制限半径内の場合true
   */
  public static isWithinGoalkeeperRadius(distance: number): boolean {
    return distance <= DEFENSE_DISTANCE.GOALKEEPER_MAX_RADIUS;
  }

  /**
   * 点が射線上にあるかを判定
   * @param distanceFromLine 射線からの距離
   * @returns 射線上にある場合true
   */
  public static isOnLineOfFire(distanceFromLine: number): boolean {
    return distanceFromLine < DEFENSE_DISTANCE.LINE_THRESHOLD;
  }

  /**
   * AIがゴール方向を向くかどうかを判定
   * @returns ゴール方向を向く場合true
   */
  public static shouldTurnToGoal(): boolean {
    return Math.random() < ONE_ON_ONE_BATTLE.TURN_TO_GOAL_CHANCE;
  }

  /**
   * 8方向のランダムな方向インデックスを取得
   * @returns 方向インデックス（0-7）
   */
  public static getRandomDirectionIndex(): number {
    return Math.floor(Math.random() * ONE_ON_ONE_BATTLE.RANDOM_DIRECTION_COUNT);
  }

  /**
   * 方向インデックスから角度を計算
   * @param directionIndex 方向インデックス（0-7）
   * @returns 角度（ラジアン）
   */
  public static getAngleFromDirectionIndex(directionIndex: number): number {
    return (directionIndex * Math.PI) / 4;
  }

  /**
   * 回避角度の配列を取得（度からラジアンに変換）
   * @returns 回避角度の配列（ラジアン）
   */
  public static getAvoidanceAnglesInRadians(): number[] {
    return DEFENSE_FORMATION.AVOIDANCE_ANGLES.map(deg => (deg * Math.PI) / 180);
  }

  /**
   * フォーメーション角度オフセットの配列を取得（度からラジアンに変換）
   * @returns 角度オフセットの配列（ラジアン）
   */
  public static getFormationAngleOffsetsInRadians(): number[] {
    return DEFENSE_FORMATION.ANGLE_OFFSETS.map(deg => (deg * Math.PI) / 180);
  }
}
