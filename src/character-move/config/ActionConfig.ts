import { Vector3 } from "@babylonjs/core";
import { MotionData } from "../types/MotionTypes";
import { SHOOT_MOTIONS } from "../data/ShootMotion";
import { PASS_MOTIONS } from "../data/PassMotion";
import { DEFENSE_MOTIONS } from "../data/DefenseMotion";
import { DRIBBLE_MOTIONS } from "../data/DribbleMotion";

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
 */
export type ActionPhase =
  | 'idle'       // アクション未実行
  | 'startup'    // 発動前（キャンセル可能区間）
  | 'active'     // アクティブ（判定が有効な区間）
  | 'recovery'   // 硬直中
  | 'cooldown';  // クールダウン中

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
  recoveryTime: number;     // 硬直時間（次のアクションまで待機）
  cooldownTime: number;     // クールタイム（同じアクション再使用まで）

  // 優先度と中断
  priority: number;         // 優先度（高いほど優先）
  interruptible: boolean;   // startup中にキャンセル可能か

  // 物理判定設定（ディフェンス用）
  hitbox?: HitboxConfig;
}

/**
 * アクション状態
 */
export interface ActionState {
  currentAction: ActionType | null;
  phase: ActionPhase;
  phaseStartTime: number;      // 現在フェーズの開始時刻（ミリ秒）
  cooldowns: Map<ActionType, number>; // 各アクションのクールダウン終了時刻
}

/**
 * アクション定義一覧
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
    recoveryTime: 2000,    // 2秒（硬直時間）
    cooldownTime: 2000,    // 2秒（再使用禁止時間）


    priority: 10,
    interruptible: true,   // startup中はブロックでキャンセル
  },

  // ミドルレンジシュート
  shoot_midrange: {
    type: 'shoot_midrange',
    category: 'offense',
    motion: 'shoot_midrange',
    startupTime: 350,      // 0.35秒
    activeTime: 250,       // 0.25秒
    recoveryTime: 1000,     // 0.2秒
    cooldownTime: 2000,    // 2秒
    priority: 10,
    interruptible: true,
  },

  // レイアップ
  shoot_layup: {
    type: 'shoot_layup',
    category: 'offense',
    motion: 'shoot_layup',
    startupTime: 250,      // 0.25秒（素早い）
    activeTime: 300,       // 0.3秒
    recoveryTime: 300,     // 0.3秒
    cooldownTime: 1500,    // 1.5秒
    priority: 10,
    interruptible: true,
  },

  // チェストパス
  pass_chest: {
    type: 'pass_chest',
    category: 'offense',
    motion: 'pass_chest',
    startupTime: 200,      // 0.2秒
    activeTime: 100,       // 0.1秒
    recoveryTime: 200,     // 0.2秒
    cooldownTime: 500,     // 0.5秒
    priority: 8,
    interruptible: true,
  },

  // バウンスパス
  pass_bounce: {
    type: 'pass_bounce',
    category: 'offense',
    motion: 'pass_bounce',
    startupTime: 250,      // 0.25秒
    activeTime: 100,       // 0.1秒
    recoveryTime: 200,     // 0.2秒
    cooldownTime: 500,     // 0.5秒
    priority: 8,
    interruptible: true,
  },

  // オーバーヘッドパス
  pass_overhead: {
    type: 'pass_overhead',
    category: 'offense',
    motion: 'pass_overhead',
    startupTime: 300,      // 0.3秒
    activeTime: 150,       // 0.15秒
    recoveryTime: 250,     // 0.25秒
    cooldownTime: 600,     // 0.6秒
    priority: 8,
    interruptible: true,
  },

  // ドリブル突破
  dribble_breakthrough: {
    type: 'dribble_breakthrough',
    category: 'offense',
    motion: 'dribble_breakthrough',
    startupTime: 100,      // 0.1秒（素早い開始）
    activeTime: 1500,      // 1.5秒（突破時間）
    recoveryTime: 200,     // 0.2秒
    cooldownTime: 1000,    // 1秒
    priority: 9,
    interruptible: false,  // 一度始まるとキャンセル不可
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
    activeTime: 150,       // 0.15秒（フェイク動作中、ディフェンスが反応する時間）
    recoveryTime: 200,     // 0.2秒（フェイントなので短い硬直）
    cooldownTime: 500,     // 0.5秒（素早く次のアクションへ）
    priority: 8,
    interruptible: true,   // キャンセル可能（ドリブルに移行するため）
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
    recoveryTime: 300,     // 0.3秒硬直
    cooldownTime: 500,     // 0.5秒後に再使用可
    priority: 15,          // シュートより高優先度
    interruptible: false,
    hitbox: {
      type: 'sphere',
      radius: 0.15,        // 手の判定半径
      offset: new Vector3(0, 2.2, 0.3), // 頭上前方
    },
  },

  // スティール試行
  steal_attempt: {
    type: 'steal_attempt',
    category: 'defense',
    motion: 'steal_attempt',
    startupTime: 150,      // 0.15秒
    activeTime: 200,       // 0.2秒間判定
    recoveryTime: 400,     // 0.4秒硬直（失敗リスク）
    cooldownTime: 800,     // 0.8秒
    priority: 12,
    interruptible: false,
    hitbox: {
      type: 'sphere',
      radius: 0.2,         // 手を伸ばした範囲
      offset: new Vector3(0, 0.8, 0.5), // 胸の高さ、前方
    },
  },

  // パスカット姿勢
  pass_intercept: {
    type: 'pass_intercept',
    category: 'defense',
    motion: 'pass_intercept',
    startupTime: 100,      // 0.1秒
    activeTime: 800,       // 0.8秒間カット可能
    recoveryTime: 200,     // 0.2秒
    cooldownTime: 300,     // 0.3秒
    priority: 11,
    interruptible: true,   // パス前にキャンセル可
    hitbox: {
      type: 'cylinder',
      radius: 0.3,         // 手を広げた範囲
      height: 1.5,         // 上半身の範囲
      offset: new Vector3(0, 1.0, 0.2), // 胴体前方
    },
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
    recoveryTime: 150,     // 0.15秒で解除
    cooldownTime: 0,       // クールダウンなし
    priority: 5,
    interruptible: true,   // いつでも解除可能
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
   * アクション全体の所要時間を計算（ミリ秒）
   * activeTimeが-1（無限）の場合はstartup + recoveryを返す
   */
  public static getTotalDuration(type: ActionType): number {
    const def = ACTION_DEFINITIONS[type];
    const activeTime = def.activeTime === -1 ? 0 : def.activeTime;
    return def.startupTime + activeTime + def.recoveryTime;
  }

  /**
   * モーションの再生時間を計算（秒）
   */
  public static getMotionDuration(type: ActionType): number {
    return this.getTotalDuration(type) / 1000;
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
