import type { SimOffenseRole } from "../Config/RoleConfig";
import type { ActionType, ActionPhase } from "./TrackingSimTypes";

// =========================================================================
// SimEntityState — 戦術的な行動状態
// =========================================================================

/** 戦術的な行動状態（ActionState のアニメーション硬直とは別概念） */
export enum SimEntityState {
  // 攻撃側
  ON_BALL = "ON_BALL",           // ボール保持（launcher のデフォルト）
  OFF_BALL = "OFF_BALL",         // オフボール移動（targets のデフォルト）
  PASSING = "PASSING",           // パス動作中
  CATCHING = "CATCHING",         // キャッチ中
  // 守備側
  MARKING = "MARKING",           // マンマーク / マーク移動中
  HELP = "HELP",                 // ヘルプポジション（中間地点等）
  INTERCEPTING = "INTERCEPTING", // ボール反応・インターセプト中
  SEARCHING = "SEARCHING",       // 見失い中（スキャンサーチ）
}

// =========================================================================
// SimDefenseRole — 守備ロール
// =========================================================================

/** 守備ロール */
export enum SimDefenseRole {
  BALL_MARKER = "BALL_MARKER",   // ボール保持者を直接マーク（現OB B）
  HELP_DEFENDER = "HELP_DEFENDER", // パスレーン中間のヘルプ（現OB A）
  MAN_MARKER = "MAN_MARKER",     // 特定ターゲットをマンマーク（現OB C/D/E）
}

// =========================================================================
// SimEntitySnapshot — エンティティスナップショット
// =========================================================================

/** エンティティスナップショット */
export interface SimEntitySnapshot {
  entityIdx: number;          // 0=launcher, 1-5=targets, 6-10=obstacles
  team: "offense" | "defense";

  // 物理（SimMover から転写）
  x: number; z: number;
  vx: number; vz: number;
  facing: number;

  // 戦術状態
  entityState: SimEntityState;

  // ロール
  offenseRole: SimOffenseRole | null;   // 攻撃側のみ（RoleConfig から）
  defenseRole: SimDefenseRole | null;   // 守備側のみ

  // マーク対象（守備側）
  markTargetIdx: number | null;         // entityIdx（0=launcher, 1-5=targets）

  // アクション参照
  actionType: ActionType;
  actionPhase: ActionPhase;

  // ボール関連
  hasBall: boolean;

  // スキャン情報（守備側のみ、攻撃側はデフォルト値）
  searching: boolean;
  lastSeenTarget: { x: number; z: number } | null;
  scanFocusDist: number;
}
