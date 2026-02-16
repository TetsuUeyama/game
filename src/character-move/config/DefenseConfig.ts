/**
 * ディフェンス関連の設定を一元管理するファイル
 * 1on1バトル、ディフェンス位置取り、反応時間に関する定数とユーティリティメソッドを提供
 */

import { getDistance2DSimple } from "@/physics/spatial/SpatialUtils";

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

  // オフェンス1on1行動設定
  OFFENSE_MOVE_DURING_CONTACT: true, // 接触中もオフェンスが動く
  OFFENSE_ACTION_CHANCE: 0.3,        // アクション実行確率（30%）
  OFFENSE_FEINT_CHANCE: 0.4,         // フェイント確率（アクション時の40%）
  OFFENSE_BREAKTHROUGH_CHANCE: 0.6,  // ドリブル突破確率（アクション時の60%）
} as const;

/**
 * ディフェンス反応時間設定（ミリ秒）
 */
export const DEFENSE_REACTION = {
  DEFAULT_DELAY: 2000,               // デフォルトの反応遅延

  // reflexesベースの計算用（初回反応）
  REFLEXES_BASE: 2000,               // 基準値（1000 - reflexes で計算）

  // quicknessベースの計算用（動き直し）
  QUICKNESS_MULTIPLIER: 1000,          // 係数（(100 - quickness) * 10 で計算）
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
 * ディフェンスプレッシャー設定（1on1時の押し返し）
 * オフェンスをゴールから遠ざけるための設定
 */
export const DEFENSE_PRESSURE = {
  // 押し返しの基本強度（0.0〜1.0）
  // この値が高いほど、ディフェンダーがオフェンスを押し返す力が強くなる
  BASE_PUSH_STRENGTH: 0.6,

  // defense値による強度ボーナス係数
  // (defense - 50) * この値 が基本強度に加算される
  // 例: defense=80 → (80-50) * 0.01 = +0.3 のボーナス
  STAT_MULTIPLIER: 0.01,

  // 最大押し返し強度（これ以上にはならない）
  MAX_PUSH_STRENGTH: 1.0,

  // 最小押し返し強度（これ以下にはならない）
  MIN_PUSH_STRENGTH: 0.2,

  // 横移動ミラーリングの強度（0.0〜1.0）
  // オフェンスの横移動に対してどれだけ追従するか
  LATERAL_MIRROR_STRENGTH: 0.8,

  // スティール試行確率（毎フレーム）
  STEAL_ATTEMPT_CHANCE: 0.02,        // 2%

  // ディフェンス構え確率（スティールを選ばなかった場合のアクション）
  DEFENSE_STANCE_CHANCE: 0.4,        // 40%
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
 * 視野設定（1on1判定用）
 */
export const FIELD_OF_VIEW = {
  // 1on1判定用の視野角（度）- 正面からの片側角度
  // 例: 90度 → 正面180度の扇形が視野
  ONE_ON_ONE_FOV_HALF_ANGLE: 90,

  // 視野内かつこの距離以内の場合に1on1とみなす（メートル）
  ONE_ON_ONE_MAX_DISTANCE: 5.0,
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

  /**
   * ディフェンダーの押し返し強度を計算
   * defense値が高いほど強く押し返せる
   * @param defenseValue 選手のdefenseステータス値
   * @returns 押し返し強度（0.0〜1.0）
   */
  public static calculatePushStrength(defenseValue: number | undefined): number {
    const defense = defenseValue ?? 50;
    const baseStrength = DEFENSE_PRESSURE.BASE_PUSH_STRENGTH;
    const bonus = (defense - 50) * DEFENSE_PRESSURE.STAT_MULTIPLIER;
    const strength = baseStrength + bonus;
    return Math.max(
      DEFENSE_PRESSURE.MIN_PUSH_STRENGTH,
      Math.min(DEFENSE_PRESSURE.MAX_PUSH_STRENGTH, strength)
    );
  }

  /**
   * スティールを試みるかどうかを判定
   * @returns スティールを試みる場合true
   */
  public static shouldAttemptSteal(): boolean {
    return Math.random() < DEFENSE_PRESSURE.STEAL_ATTEMPT_CHANCE;
  }

  /**
   * ディフェンスアクション（スティールorディフェンス構え）を選択
   * @returns 'steal' または 'stance'
   */
  public static selectDefensiveAction(): 'steal' | 'stance' {
    // スティール試行するかどうかの判定後に呼ばれる
    // ここではスティールとディフェンス構えの比率を決定
    return Math.random() < (1 - DEFENSE_PRESSURE.DEFENSE_STANCE_CHANCE) ? 'steal' : 'stance';
  }

  /**
   * ターゲットがオブザーバーの視野内にいるかを判定
   * @param observerPos オブザーバー（見る側）の位置
   * @param observerRotation オブザーバーの回転（Y軸、ラジアン）
   * @param targetPos ターゲット（見られる側）の位置
   * @param fovHalfAngleDeg 視野角の半分（度）、デフォルトはFIELD_OF_VIEW.ONE_ON_ONE_FOV_HALF_ANGLE
   * @param maxDistance 最大距離（メートル）、デフォルトはFIELD_OF_VIEW.ONE_ON_ONE_MAX_DISTANCE
   * @returns 視野内かつ距離内の場合true
   */
  public static isInFieldOfView(
    observerPos: { x: number; z: number },
    observerRotation: number,
    targetPos: { x: number; z: number },
    fovHalfAngleDeg: number = FIELD_OF_VIEW.ONE_ON_ONE_FOV_HALF_ANGLE,
    maxDistance: number = FIELD_OF_VIEW.ONE_ON_ONE_MAX_DISTANCE
  ): boolean {
    // ターゲットへの方向ベクトルを計算
    const dx = targetPos.x - observerPos.x;
    const dz = targetPos.z - observerPos.z;

    // 距離チェック
    const distance = getDistance2DSimple(observerPos, targetPos);
    if (distance > maxDistance) {
      return false;
    }

    // 距離がほぼ0の場合は視野内とみなす
    if (distance < 0.01) {
      return true;
    }

    // オブザーバーの正面方向（回転から計算）
    const forwardX = Math.sin(observerRotation);
    const forwardZ = Math.cos(observerRotation);

    // ターゲットへの正規化方向
    const toTargetX = dx / distance;
    const toTargetZ = dz / distance;

    // 内積で角度を計算
    const dot = forwardX * toTargetX + forwardZ * toTargetZ;

    // acos の範囲を制限（-1 から 1）
    const clampedDot = Math.max(-1, Math.min(1, dot));
    const angleRad = Math.acos(clampedDot);
    const angleDeg = angleRad * (180 / Math.PI);

    // 視野角の半分以内かどうか
    return angleDeg <= fovHalfAngleDeg;
  }

  /**
   * 1on1状態かどうかを視野ベースで判定
   * オンボールオフェンスプレイヤーの視野内にディフェンダーがいるかどうか
   * @param offensePos オフェンスの位置
   * @param offenseRotation オフェンスの回転（Y軸、ラジアン）
   * @param defenderPos ディフェンダーの位置
   * @returns 1on1状態（視野内）の場合true
   */
  public static is1on1StateByFieldOfView(
    offensePos: { x: number; z: number },
    offenseRotation: number,
    defenderPos: { x: number; z: number }
  ): boolean {
    return this.isInFieldOfView(offensePos, offenseRotation, defenderPos);
  }
}
