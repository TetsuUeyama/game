/**
 * ObstacleDefenseConfig — 障害物（守備側）のロール設定テーブル
 *
 * 各障害物の行動パターン（チェイス先、スキャン有無、リアクション可否等）を
 * 一元管理する。各モジュールはインデックスベースのハードコードではなく、
 * このテーブルを参照して振る舞いを決定する。
 */

import { SimDefenseRole } from "../Types/SimPlayerStateTypes";
import { S } from "./FieldConfig";

/** 障害物（守備側）の行動設定 */
export interface ObstacleRoleConfig {
  /** 守備ロール */
  role: SimDefenseRole;
  /** チェイスタイプ: 'midpoint'=launcher-target中間, 'mark'=launcher直接マーク, number=targets[n]を追跡 */
  chaseTarget: 'midpoint' | 'mark' | number;
  /** マーク対象 entityIdx (0=launcher, 1-5=targets), null=なし */
  markTargetEntityIdx: number | null;
  /** スキャン有効 (false = 常にマーク対象を注視、スキャンスキップ) */
  scanEnabled: boolean;
  /** スキャン監視ターゲット targets[n] (scanEnabled=trueの場合のみ使用) */
  scanWatchTargetIdx: number;
  /** ボールリアクション可能 (false = パスに対してインターセプトしない) */
  reactive: boolean;
  /** アイドル速度 (m/s) */
  idleSpeed: number;
  /** インターセプト速度 (m/s) */
  interceptSpeed: number;
  /** ホバー半径 (m) */
  hoverRadius: number;
  /** リセット時にランダムウォーク復帰するか */
  restoreRandomOnReset: boolean;
  /** マーク距離 (m) — chaseTarget='mark' の場合のみ使用 */
  markDistance: number;
  /** マークホバー半径 (m) — chaseTarget='mark' の場合のみ使用 */
  markHover: number;
  /** スキャン初期値 */
  scanInitial: {
    atLauncher: boolean;
    timer: number;
    focusDist: number;
  };
}

const OB_CONFIGS: readonly ObstacleRoleConfig[] = [
  // OB A: ヘルプディフェンダー — launcher⇔selectedTarget の中間点
  {
    role: SimDefenseRole.HELP_DEFENDER,
    chaseTarget: 'midpoint',
    markTargetEntityIdx: null,
    scanEnabled: true,
    scanWatchTargetIdx: 0,
    reactive: true,
    idleSpeed: 70 * S,         // 1.05
    interceptSpeed: 160 * S,   // 2.40
    hoverRadius: 60 * S,       // 0.90
    restoreRandomOnReset: true,
    markDistance: 0,
    markHover: 0,
    scanInitial: { atLauncher: true, timer: 2.0, focusDist: 4.5 },
  },
  // OB B: ボールマーカー — launcher を直接マーク
  {
    role: SimDefenseRole.BALL_MARKER,
    chaseTarget: 'mark',
    markTargetEntityIdx: 0,
    scanEnabled: false,
    scanWatchTargetIdx: 0,  // unused
    reactive: false,
    idleSpeed: 65 * S,        // 0.975
    interceptSpeed: 65 * S,   // 0.975
    hoverRadius: 50 * S,      // 0.75
    restoreRandomOnReset: false,
    markDistance: 1.3,
    markHover: 0.15,
    scanInitial: { atLauncher: true, timer: 1.5, focusDist: 2.25 },
  },
  // OB C: マンマーカー — targets[0]
  {
    role: SimDefenseRole.MAN_MARKER,
    chaseTarget: 0,
    markTargetEntityIdx: 1,
    scanEnabled: true,
    scanWatchTargetIdx: 0,
    reactive: true,
    idleSpeed: 70 * S,        // 1.05
    interceptSpeed: 150 * S,  // 2.25
    hoverRadius: 50 * S,      // 0.75
    restoreRandomOnReset: true,
    markDistance: 0,
    markHover: 0,
    scanInitial: { atLauncher: false, timer: 1.0, focusDist: 3.0 },
  },
  // OB D: マンマーカー — targets[3]
  {
    role: SimDefenseRole.MAN_MARKER,
    chaseTarget: 3,
    markTargetEntityIdx: 4,
    scanEnabled: true,
    scanWatchTargetIdx: 3,
    reactive: true,
    idleSpeed: 65 * S,        // 0.975
    interceptSpeed: 155 * S,  // 2.325
    hoverRadius: 55 * S,      // 0.825
    restoreRandomOnReset: true,
    markDistance: 0,
    markHover: 0,
    scanInitial: { atLauncher: false, timer: 1.8, focusDist: 3.75 },
  },
  // OB E: マンマーカー — targets[4]
  {
    role: SimDefenseRole.MAN_MARKER,
    chaseTarget: 4,
    markTargetEntityIdx: 5,
    scanEnabled: true,
    scanWatchTargetIdx: 4,
    reactive: true,
    idleSpeed: 75 * S,        // 1.125
    interceptSpeed: 145 * S,  // 2.175
    hoverRadius: 60 * S,      // 0.90
    restoreRandomOnReset: true,
    markDistance: 0,
    markHover: 0,
    scanInitial: { atLauncher: true, timer: 1.2, focusDist: 3.0 },
  },
];

/** 障害物の総数 */
export const OBSTACLE_COUNT = OB_CONFIGS.length;

export { OB_CONFIGS };
