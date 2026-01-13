/**
 * ボール保持時に取れる行動の種類
 */
export enum ActionType {
  /** ドリブル突破 */
  DRIBBLE = "DRIBBLE",
  /** パス */
  PASS = "PASS",
  /** そのまま維持 */
  KEEP = "KEEP",
  /** ボールハンドリング（他のエリアへ移動） */
  BALL_HANDLING = "BALL_HANDLING",
}

/**
 * ボール保持時の行動
 */
export interface BallAction {
  /** 行動の種類 */
  type: ActionType;
  /** 行動の方向（8角形の面番号: 0-7） */
  direction: number;
  /** 行動の表示名 */
  displayName: string;
}

/**
 * 各面（0-7）で取れる行動のマッピング
 * キー: 8角形の面番号（0-7）
 * 値: その面にボールがあるときに取れる行動の配列
 */
export const FACE_ACTIONS: Record<number, BallAction[]> = {
  // 面0（赤・正面）: 0・1・7方向へのドリブル突破、0・1・7方向へのパス、維持、ボールハンドリング
  0: [
    { type: ActionType.DRIBBLE, direction: 0, displayName: "正面ドリブル突破" },
    { type: ActionType.DRIBBLE, direction: 1, displayName: "右前ドリブル突破" },
    { type: ActionType.DRIBBLE, direction: 7, displayName: "左前ドリブル突破" },
    { type: ActionType.PASS, direction: 0, displayName: "正面パス" },
    { type: ActionType.PASS, direction: 1, displayName: "右前パス" },
    { type: ActionType.PASS, direction: 7, displayName: "左前パス" },
    { type: ActionType.KEEP, direction: 0, displayName: "そのまま維持" },
    { type: ActionType.BALL_HANDLING, direction: 1, displayName: "面1へボールハンドリング" },
    { type: ActionType.BALL_HANDLING, direction: 7, displayName: "面7へボールハンドリング" },
    { type: ActionType.BALL_HANDLING, direction: 2, displayName: "面2へボールハンドリング" },
    { type: ActionType.BALL_HANDLING, direction: 6, displayName: "面6へボールハンドリング" },
  ],
  // 面1（オレンジ）: 未設定（後で追加可能）
  1: [],
  // 面2（黄色）: 未設定（後で追加可能）
  2: [],
  // 面3（緑）: 未設定（後で追加可能）
  3: [],
  // 面4（シアン）: 未設定（後で追加可能）
  4: [],
  // 面5（青）: 未設定（後で追加可能）
  5: [],
  // 面6（紫）: 未設定（後で追加可能）
  6: [],
  // 面7（マゼンタ）: 未設定（後で追加可能）
  7: [],
};
