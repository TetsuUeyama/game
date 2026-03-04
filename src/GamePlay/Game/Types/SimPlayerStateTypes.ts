import type { SimOffenseRole } from "../Decision/OffenseRoleAssignment";
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
  INTERCEPTING = "INTERCEPTING", // ボール反応・インターセプト中
  SEARCHING = "SEARCHING",       // 見失い中（スキャンサーチ）
}

// =========================================================================
// SimDefenseRole — 守備ロール
// =========================================================================

/** 守備ロール */
export enum SimDefenseRole {
  MAN_MARKER = "MAN_MARKER",     // 特定ターゲットをマンマーク（全5障害物）
}

// =========================================================================
// SimEntitySnapshot — エンティティスナップショット
// =========================================================================

/** エンティティスナップショット */
export interface SimEntitySnapshot {
  entityIdx: number;          // 0=launcher, 1-4=targets, 5-9=obstacles
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
  markTargetIdx: number | null;         // entityIdx（0=launcher, 1-4=targets）

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
