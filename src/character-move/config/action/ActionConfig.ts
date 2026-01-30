import { Vector3 } from "@babylonjs/core";
import { MotionData } from "../../types/MotionTypes";
import { SHOOT_MOTIONS } from "../../motion/ShootMotion";
import { PASS_MOTIONS } from "../../motion/PassMotion";
import { DEFENSE_MOTIONS } from "../../motion/DefenseMotion";
import { DRIBBLE_MOTIONS } from "../../motion/DribbleMotion";

/**
 * アクションカテゴリ
 */
export type ActionCategory =
  | 'offense'    // オフェンスアクション
  | 'defense'    // ディフェンスアクション
  | 'movement';  // 移動アクション

/**
 * アクションタイプ
 */
export type ActionType =
  // オフェンス
  | 'shoot_3pt'
  | 'shoot_midrange'
  | 'shoot_layup'
  | 'pass_chest'
  | 'pass_bounce'
  | 'pass_overhead'
  | 'dribble_breakthrough'
  // フェイント
  | 'shoot_feint'     // シュートフェイント
  // ディフェンス
  | 'block_shot'      // シュートブロック（手を上げる）
  | 'steal_attempt'   // スティール試行
  | 'pass_intercept'  // パスカット姿勢
  // 移動
  | 'defense_stance'; // ディフェンス構え（移動速度低下、反応速度UP）

/**
 * アクションフェーズ
 *
 * ※ recovery と cooldown は削除 - 重心システムで物理的に管理
 *   activeが終了したらidleに戻り、重心が安定するまで次のアクション不可
 */
export type ActionPhase =
  | 'idle'       // アクション未実行（重心が安定していれば次のアクション可能）
  | 'startup'    // 発動前（キャンセル可能区間）
  | 'active';    // アクティブ（判定が有効な区間、終了後はidleへ）

/**
 * ヒットボックス設定
 */
export interface HitboxConfig {
  type: 'sphere' | 'cylinder';
  radius: number;
  height?: number;        // cylinderの場合のみ
  offset: Vector3;        // キャラクター位置からのオフセット
}

/**
 * アクション定義
 */
export interface ActionDefinition {
  type: ActionType;
  category: ActionCategory;
  motion: string;           // モーション名

  // タイミング設定（ミリ秒）
  startupTime: number;      // 発動までの時間（この間はキャンセル可能）
  activeTime: number;       // アクティブ時間（判定が有効な時間）

  // 優先度と中断
  priority: number;         // 優先度（高いほど優先）
  interruptible: boolean;   // startup中にキャンセル可能か

  // 物理判定設定（ディフェンス用）
  hitbox?: HitboxConfig;

  // ※ recoveryTime と cooldownTime は削除
  // 重心システム（BalanceController）により、アクション後の硬直と
  // 次のアクションへの遷移可否が物理的に決定される
}

/**
 * アクション状態
 *
 * ※ cooldowns は削除済み - 重心システムで管理
 */
export interface ActionState {
  currentAction: ActionType | null;
  phase: ActionPhase;
  phaseStartTime: number;      // 現在フェーズの開始時刻（ミリ秒）
}

/**
 * アクション定義一覧
 *
 * ※ recoveryTime と cooldownTime は重心システムに置き換え済み
 *   - アクション実行時にBalanceControllerに力が加わる
 *   - 重心が安定位置に戻るまで次のアクションは実行不可
 *   - 選手の体重・身長により回復時間が変わる
 */
export const ACTION_DEFINITIONS: Record<ActionType, ActionDefinition> = {
  // ==============================
  // オフェンスアクション
  // ==============================

  // 3ポイントシュート
  shoot_3pt: {
    type: 'shoot_3pt',
    category: 'offense',
    motion: 'shoot_3pt',
    startupTime: 400,      // 0.4秒（この間にブロック可能）
    activeTime: 300,       // 0.3秒
    priority: 10,
    interruptible: true,   // startup中はブロックでキャンセル
    // 重心: 大きなジャンプ → 長い回復時間
  },

  // ミドルレンジシュート
  shoot_midrange: {
    type: 'shoot_midrange',
    category: 'offense',
    motion: 'shoot_midrange',
    startupTime: 350,      // 0.35秒
    activeTime: 250,       // 0.25秒
    priority: 10,
    interruptible: true,
    // 重心: 中程度のジャンプ → 中程度の回復時間
  },

  // レイアップ
  shoot_layup: {
    type: 'shoot_layup',
    category: 'offense',
    motion: 'shoot_layup',
    startupTime: 250,      // 0.25秒（素早い）
    activeTime: 300,       // 0.3秒
    priority: 10,
    interruptible: true,
    // 重心: 前への勢い + ジャンプ
  },

  // チェストパス
  pass_chest: {
    type: 'pass_chest',
    category: 'offense',
    motion: 'pass_chest',
    startupTime: 200,      // 0.2秒
    activeTime: 100,       // 0.1秒
    priority: 8,
    interruptible: true,
    // 重心: 軽いアクション → 素早く次へ
  },

  // バウンスパス
  pass_bounce: {
    type: 'pass_bounce',
    category: 'offense',
    motion: 'pass_bounce',
    startupTime: 250,      // 0.25秒
    activeTime: 100,       // 0.1秒
    priority: 8,
    interruptible: true,
    // 重心: 少し下への動き
  },

  // オーバーヘッドパス
  pass_overhead: {
    type: 'pass_overhead',
    category: 'offense',
    motion: 'pass_overhead',
    startupTime: 300,      // 0.3秒
    activeTime: 150,       // 0.15秒
    priority: 8,
    interruptible: true,
    // 重心: 上への動き
  },

  // ドリブル突破
  dribble_breakthrough: {
    type: 'dribble_breakthrough',
    category: 'offense',
    motion: 'dribble_breakthrough',
    startupTime: 100,      // 0.1秒（素早い開始）
    activeTime: 1500,      // 1.5秒（突破時間）
    priority: 9,
    interruptible: false,  // 一度始まるとキャンセル不可
    // 重心: 強い前方加速 → 長い回復
  },

  // ==============================
  // フェイントアクション
  // ==============================

  // シュートフェイント
  shoot_feint: {
    type: 'shoot_feint',
    category: 'offense',
    motion: 'shoot_feint',
    startupTime: 100,      // 0.1秒（飛ぶ振りの開始）
    activeTime: 150,       // 0.15秒（フェイク動作中）
    priority: 8,
    interruptible: true,   // キャンセル可能（ドリブルに移行するため）
    // 重心: 軽い動き → 素早く次のアクションへ
  },

  // ==============================
  // ディフェンスアクション
  // ==============================

  // シュートブロック
  block_shot: {
    type: 'block_shot',
    category: 'defense',
    motion: 'block_shot',
    startupTime: 100,      // 0.1秒で手を上げる
    activeTime: 500,       // 0.5秒間判定継続
    priority: 15,          // シュートより高優先度
    interruptible: false,
    hitbox: {
      type: 'sphere',
      radius: 0.15,        // 手の判定半径
      offset: new Vector3(0, 2.2, 0.3), // 頭上前方
    },
    // 重心: 大きなジャンプ → 着地後に大きな隙
  },

  // スティール試行
  steal_attempt: {
    type: 'steal_attempt',
    category: 'defense',
    motion: 'steal_attempt',
    startupTime: 150,      // 0.15秒
    activeTime: 200,       // 0.2秒間判定
    priority: 12,
    interruptible: false,
    hitbox: {
      type: 'sphere',
      radius: 0.2,         // 手を伸ばした範囲
      offset: new Vector3(0, 0.8, 0.5), // 胸の高さ、前方
    },
    // 重心: 前への突進 → 失敗時に大きな隙
  },

  // パスカット姿勢
  pass_intercept: {
    type: 'pass_intercept',
    category: 'defense',
    motion: 'pass_intercept',
    startupTime: 100,      // 0.1秒
    activeTime: 800,       // 0.8秒間カット可能
    priority: 11,
    interruptible: true,   // パス前にキャンセル可
    hitbox: {
      type: 'cylinder',
      radius: 0.3,         // 手を広げた範囲
      height: 1.5,         // 上半身の範囲
      offset: new Vector3(0, 1.0, 0.2), // 胴体前方
    },
    // 重心: 軽い構え → 素早く動ける
  },

  // ==============================
  // 移動アクション
  // ==============================

  // ディフェンス構え
  defense_stance: {
    type: 'defense_stance',
    category: 'movement',
    motion: 'defense_stance',
    startupTime: 100,      // 0.1秒で構える
    activeTime: -1,        // 継続（-1 = 無限）
    priority: 5,
    interruptible: true,   // いつでも解除可能
    // 重心: 低い姿勢 → 安定、すぐ動ける
  },
};

/**
 * アクション設定のユーティリティ
 */
export class ActionConfigUtils {
  /**
   * アクション定義を取得
   */
  public static getDefinition(type: ActionType): ActionDefinition {
    return ACTION_DEFINITIONS[type];
  }

  /**
   * カテゴリ別のアクションタイプを取得
   */
  public static getActionsByCategory(category: ActionCategory): ActionType[] {
    return Object.values(ACTION_DEFINITIONS)
      .filter(def => def.category === category)
      .map(def => def.type);
  }

  /**
   * オフェンスアクションかどうか
   */
  public static isOffenseAction(type: ActionType): boolean {
    return ACTION_DEFINITIONS[type].category === 'offense';
  }

  /**
   * ディフェンスアクションかどうか
   */
  public static isDefenseAction(type: ActionType): boolean {
    return ACTION_DEFINITIONS[type].category === 'defense';
  }

  /**
   * シュートアクションかどうか
   */
  public static isShootAction(type: ActionType): boolean {
    return type.startsWith('shoot_');
  }

  /**
   * パスアクションかどうか
   */
  public static isPassAction(type: ActionType): boolean {
    return type.startsWith('pass_') && type !== 'pass_intercept';
  }

  /**
   * ヒットボックスを持つアクションかどうか
   */
  public static hasHitbox(type: ActionType): boolean {
    return ACTION_DEFINITIONS[type].hitbox !== undefined;
  }

  /**
   * アニメーション時間を計算（ミリ秒）
   * startup + active の時間
   * ※ 実際の次のアクションまでの時間は重心システムが決定する
   */
  public static getAnimationDuration(type: ActionType): number {
    const def = ACTION_DEFINITIONS[type];
    const activeTime = def.activeTime === -1 ? 0 : def.activeTime;
    return def.startupTime + activeTime;
  }

  /**
   * モーションの再生時間を計算（秒）
   */
  public static getMotionDuration(type: ActionType): number {
    return this.getAnimationDuration(type) / 1000;
  }

  /**
   * 優先度を比較
   * @returns action1の優先度が高い場合は正の値、低い場合は負の値
   */
  public static comparePriority(action1: ActionType, action2: ActionType): number {
    return ACTION_DEFINITIONS[action1].priority - ACTION_DEFINITIONS[action2].priority;
  }

  /**
   * アクションタイプからモーションデータを取得
   */
  public static getMotionData(type: ActionType): MotionData | null {
    return ACTION_MOTIONS[type] ?? null;
  }
}

/**
 * アクションタイプとモーションデータのマッピング
 */
export const ACTION_MOTIONS: Partial<Record<ActionType, MotionData>> = {
  // シュートモーション
  shoot_3pt: SHOOT_MOTIONS.shoot_3pt,
  shoot_midrange: SHOOT_MOTIONS.shoot_midrange,
  shoot_layup: SHOOT_MOTIONS.shoot_layup,

  // パスモーション
  pass_chest: PASS_MOTIONS.pass_chest,
  pass_bounce: PASS_MOTIONS.pass_bounce,
  pass_overhead: PASS_MOTIONS.pass_overhead,

  // フェイントモーション（ジャンプしない専用モーション）
  shoot_feint: SHOOT_MOTIONS.shoot_feint,

  // ディフェンスモーション
  block_shot: DEFENSE_MOTIONS.block_shot,
  steal_attempt: DEFENSE_MOTIONS.steal_attempt,
  pass_intercept: DEFENSE_MOTIONS.pass_intercept,
  defense_stance: DEFENSE_MOTIONS.defense_stance,

  // ドリブル突破モーション
  dribble_breakthrough: DRIBBLE_MOTIONS.dribble_breakthrough,
};
