import { S } from "./FieldConfig";

// --- Defense behavior ---

// --- Deflection ---
export const DEFLECT_IMPULSE = 1.2;    // 弾きインパルス強度 (kg·m/s)
export const DEFLECT_COOLDOWN = 0.3;   // 同一障害物の連続弾き防止 (秒)

// --- On-ball movement ---
export const ON_BALL_SPEED_MULT = 0.75;  // ボール保持時の移動速度倍率
export const ONBALL_BLOCK_RADIUS = 1.2;  // ディフェンダーが進路を塞ぐ距離 (m)

// --- Defense engage threshold ---
export const DEFENSE_ENGAGE_Z = 6.0;  // 3Pアーク頂点付近（マーク対象がこのZ以上で追跡開始）

// --- Defense positioning ---
export const DEFENSE_GOAL_OFFSET = 0.8;   // ゴールライン・ポジション: マーク対象からゴール方向へのオフセット (m)
export const FREE_PLAYER_DIST = 5.0;      // フリー判定: 最寄りDFがこの距離以上ならフリーとみなす (m)
export const SPRINT_TRIGGER_DIST = 1.5;   // スプリント発動: DF位置からこの距離以上離れていたら全速力 (m)（OF同様、常時フルスピード追跡）
export const BEATEN_GOAL_DIST_MARGIN = 1.5; // 抜かれ判定: オンボールDFがOFよりゴールからこの距離以上遠い → 抜かれた (m)

// --- On-ball defense (goal-line positioning with distance-based aggression) ---
// ゴールからの距離に応じてマーク距離・ホバー半径・速度を線形補間する。
// 遠い(FAR): 程よい距離を保ち簡単に抜かれないようにする。
// 近い(CLOSE): 密着してスティールを狙う。
export const ONBALL_GOAL_DIST_FAR = 8.0;       // この距離以上ではFAR値を使用 (m)
export const ONBALL_GOAL_DIST_CLOSE = 2.5;     // この距離以下ではCLOSE値を使用 (m)
export const ONBALL_MARK_DIST_FAR = 2.0;       // 遠距離時: ゴール方向へのマーク距離 (m)
export const ONBALL_MARK_DIST_CLOSE = 0.7;     // 近距離時: ゴール方向へのマーク距離 (m)
export const ONBALL_HOVER_FAR = 0.30;          // 遠距離時: ホバー半径 (m) — 程よく揺さぶられない
export const ONBALL_HOVER_CLOSE = 0.10;        // 近距離時: ホバー半径 (m) — 密着して奪う
export const ONBALL_RECOVERY_DIST = 1.0;       // 理想位置からこの距離以上ズレたらダッシュで復帰 (m)
export const ONBALL_PASS_CONTEST_DIST = 3.5;   // パス飛行中: レシーバーがこの距離以内なら追跡して争う (m)

// --- Off-ball pass lane denial ---
export const OFFBALL_DENY_OFFSET = 1.0;        // オフボール: マーク対象からパッサー方向へのディナイ位置オフセット (m)

// --- Hand Push Obstruction ---
export const PUSH_ACTIVATION_DIST = 1.2;   // プッシュ発動距離 — ディナイモード切替 (m)
export const PUSH_SPEED_MULT = 0.55;       // 被プッシュ時の速度倍率
export const PUSH_HAND_REACH = 0.6;        // 手が届く距離（速度減衰が発生する距離）
export const PUSH_DENY_OFFSET = 0.4;       // ターゲットからパッサー方向へのディナイ位置オフセット (m)
export const PUSH_DENY_HOVER = 0.1;        // ディナイ時のホバー半径 (m)（密着に近い）

// --- Obstacle speed ---
export const OBSTACLE_IDLE_SPEED = 80 * S;         // 1.20 m/s
export const OBSTACLE_INTERCEPT_SPEED = 180 * S;   // 2.70 m/s
