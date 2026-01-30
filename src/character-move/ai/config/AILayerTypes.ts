/**
 * AI多層構造の型定義
 * Layer 1: Situation（状況認識）
 * Layer 2: Field Analysis（フィールド分析）
 * Layer 3: Team Tactics（チーム戦術）
 * Layer 4: Individual Tactics（個人戦術）
 * Layer 5: Personal Ego（個人意思）
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";

// =============================================================================
// Layer 1: Situation Context（状況認識）
// =============================================================================

/**
 * ゲームフェーズ
 */
export type GamePhase = 'offense' | 'defense' | 'transition' | 'deadball';

/**
 * ボールとの関係
 */
export type BallRelation = 'on_ball' | 'off_ball' | 'loose_ball';

/**
 * コートゾーン
 */
export type CourtZone =
  | 'paint'           // ペイントエリア（ゴール下）
  | 'mid_range'       // ミッドレンジ
  | 'three_point'     // 3ポイント圏内（ライン付近）
  | 'beyond_arc'      // 3ポイントライン外
  | 'backcourt';      // バックコート

/**
 * Layer 1出力: 状況コンテキスト
 */
export interface SituationContext {
  // 基本状況
  phase: GamePhase;
  ballRelation: BallRelation;

  // コート上の位置
  courtZone: CourtZone;
  gridCell: { col: string; row: number } | null;
  position: Vector3;

  // 距離情報
  distanceToBall: number;
  distanceToAttackingGoal: number;
  distanceToDefendingGoal: number;

  // 状態フラグ
  isInPaint: boolean;
  isInThreePointRange: boolean;
  isNearBoundary: boolean;

  // 時間的状況
  shotClockRemaining: number;
  possessionTime: number;
  isTransition: boolean;
}

// =============================================================================
// Layer 2: Field Analysis（フィールド分析）
// =============================================================================

/**
 * 移動タイプ
 */
export type MovementType = 'idle' | 'walk' | 'dash' | 'jump';

/**
 * アクションフェーズ
 * ※ 'recovery'は削除 - 重心システムで物理的に管理
 */
export type ActionPhase = 'idle' | 'startup' | 'active';

/**
 * 選手のスナップショット
 */
export interface PlayerSnapshot {
  character: Character;
  position: Vector3;

  // 向き・移動
  facingDirection: Vector3;
  velocity: Vector3;
  isMoving: boolean;
  movementType: MovementType;

  // アクション状態
  currentAction: string | null;
  actionPhase: ActionPhase;
  isJumping: boolean;
  isGrounded: boolean;

  // ボール関連
  hasBall: boolean;
  distanceToBall: number;

  // コート位置
  courtZone: CourtZone;
  gridCell: { col: string; row: number } | null;

  // ポジション情報
  position_role: string | null;  // PG, SG, SF, PF, C
}

/**
 * オープンスペース情報
 */
export interface OpenSpace {
  center: Vector3;
  radius: number;
  zone: CourtZone;
  nearestDefender: {
    character: Character;
    distance: number;
  } | null;
  scoringValue: number;          // 0-1 得点価値
  accessibleBy: Character[];     // このスペースに到達しやすい味方
}

/**
 * パスコース情報
 */
export interface PassLane {
  from: Character;
  to: Character;
  isOpen: boolean;
  obstacleCount: number;
  obstacles: Character[];
  distance: number;
  angle: number;
  riskLevel: number;             // 0-1 インターセプトリスク
  receiverOpenness: number;      // 0-1 レシーバーのオープン度
}

/**
 * シュートレーン情報
 */
export interface ShootingLane {
  shooter: Character;
  targetGoal: 'goal1' | 'goal2';
  shootType: '3pt' | 'midrange' | 'layup' | 'out_of_range';
  isContested: boolean;
  contesters: ContesterInfo[];
  openness: number;              // 0-1 オープン度
  expectedSuccessRate: number;   // 0-1 予想成功率
}

/**
 * コンテスター情報
 */
export interface ContesterInfo {
  character: Character;
  distance: number;
  canBlock: boolean;
  isJumping: boolean;
  threatLevel: number;           // 0-1 脅威度
}

/**
 * マッチアップ情報
 */
export interface MatchupInfo {
  offensePlayer: Character;
  defensePlayer: Character | null;
  distance: number;
  mismatch: 'offense_advantage' | 'defense_advantage' | 'even' | null;
  mismatchReason: string | null;
  mismatchScore: number;         // -1〜1 (負:ディフェンス有利, 正:オフェンス有利)
}

/**
 * リバウンドポジション情報
 */
export interface ReboundPosition {
  position: Vector3;
  priority: number;              // 優先度
  assignedTo: Character | null;
}

/**
 * Layer 2出力: フィールド分析
 */
export interface FieldAnalysis {
  // タイムスタンプ
  timestamp: number;

  // 全選手の状態
  teammates: PlayerSnapshot[];
  opponents: PlayerSnapshot[];
  self: PlayerSnapshot;
  ballHolder: PlayerSnapshot | null;

  // スペース分析
  openSpaces: OpenSpace[];
  bestOpenSpace: OpenSpace | null;

  // パス分析
  passLanes: PassLane[];
  openPassLanes: PassLane[];
  bestPassOption: PassLane | null;

  // シュート分析
  myShootingLane: ShootingLane | null;
  teammateShootingLanes: ShootingLane[];

  // マッチアップ分析
  matchups: MatchupInfo[];
  myMatchup: MatchupInfo | null;
  mismatches: MatchupInfo[];

  // コート支配
  teamSpacing: number;           // 0-1 味方の広がり具合
  defenseCompactness: number;    // 0-1 敵ディフェンスの密集度
  paintCongestion: number;       // 0-1 ペイントの混雑度

  // 特殊状況
  fastBreakOpportunity: boolean;
  turnoverRisk: number;          // 0-1
  reboundPositions: ReboundPosition[];
}

// =============================================================================
// Layer 3: Team Tactics（チーム戦術）- 外部から設定される
// =============================================================================

/**
 * オフェンスフォーメーション
 */
export type OffenseFormation =
  | 'motion'          // モーションオフェンス（フリーフロー）
  | 'isolation'       // アイソレーション
  | 'pick_and_roll'   // ピック＆ロール
  | 'post_up'         // ポストアップ
  | 'fast_break'      // ファストブレイク
  | 'horns'           // ホーンズ
  | 'triangle';       // トライアングル

/**
 * ディフェンススキーム
 */
export type DefenseScheme =
  | 'man_to_man'      // マンツーマン
  | 'zone_2_3'        // 2-3ゾーン
  | 'zone_3_2'        // 3-2ゾーン
  | 'zone_1_3_1'      // 1-3-1ゾーン
  | 'press_full'      // フルコートプレス
  | 'press_half';     // ハーフコートプレス

/**
 * オフェンスペース
 */
export type OffensePace = 'fast_break' | 'push' | 'half_court' | 'slow_down';

/**
 * Layer 3出力: チーム指示（外部から設定される）
 */
export interface TeamDirective {
  // オフェンス設定
  offenseFormation: OffenseFormation;
  pace: OffensePace;
  primaryOption: string | null;       // メインオプションのポジション
  secondaryOption: string | null;     // セカンドオプション
  playName: string | null;            // 実行中のプレイ名

  // ディフェンス設定
  defenseScheme: DefenseScheme;
  helpDefenseLevel: number;           // 0-1 ヘルプディフェンスの積極性
  pressureLevel: number;              // 0-1 プレッシャーの強さ

  // 戦術指示
  targetMismatch: Character | null;   // 狙うべきミスマッチ
  avoidPlayer: Character | null;      // 避けるべき相手

  // 状況別指示
  shotClockStrategy: 'normal' | 'attack' | 'hold';
  transitionStrategy: 'push' | 'setup' | 'careful';
}

// =============================================================================
// Layer 4: Individual Tactics（個人戦術）
// =============================================================================

/**
 * 戦術的行動タイプ
 */
export type TacticalActionType =
  // オフェンス
  | 'move_to_space'    // オープンスペースへ移動
  | 'shoot'            // シュート
  | 'pass'             // パス
  | 'drive'            // ドライブ
  | 'post_up'          // ポストアップ
  | 'screen'           // スクリーン
  | 'cut'              // カット
  | 'spot_up'          // スポットアップ（定位置で待機）
  // ディフェンス
  | 'guard'            // マーク
  | 'help'             // ヘルプディフェンス
  | 'contest'          // シュートコンテスト
  | 'block'            // ブロック
  | 'steal'            // スティール
  | 'box_out'          // ボックスアウト
  | 'close_out'        // クローズアウト
  // 共通
  | 'rebound'          // リバウンド
  | 'chase_ball'       // ボールを追う
  | 'wait';            // 待機

/**
 * Layer 4出力: 戦術的行動
 */
export interface TacticalAction {
  type: TacticalActionType;
  priority: number;              // 0-1 優先度
  targetPosition?: Vector3;
  targetPlayer?: Character;
  reason: string;                // デバッグ用理由
  expectedOutcome: string;       // 期待される結果
  alternativeActions: TacticalAction[];  // 代替行動
}

// =============================================================================
// Layer 5: Personal Ego（個人意思）
// =============================================================================

/**
 * 個人が望む行動タイプ
 */
export type DesiredActionType =
  | 'shoot_3pt'        // 3ポイントを打ちたい
  | 'shoot_mid'        // ミッドレンジを打ちたい
  | 'drive'            // ドライブしたい
  | 'post_up'          // ポストアップしたい
  | 'pass_first'       // パスファースト
  | 'steal'            // スティールしたい
  | 'block'            // ブロックしたい
  | 'rebound'          // リバウンドを取りたい
  | 'none';            // 特になし

/**
 * Layer 5出力: 個人意思
 */
export interface ActionDesire {
  action: DesiredActionType;
  intensity: number;             // 0-1 やりたい度
  confidence: number;            // 0-1 成功確信度
  reason: string;                // なぜやりたいか
}

// =============================================================================
// 最終出力
// =============================================================================

/**
 * 最終決定
 */
export interface FinalDecision {
  action: TacticalAction;
  egoInfluence: number;          // 0-1 エゴがどれだけ影響したか
  blendedFrom: {
    tactical: TacticalAction;
    ego: ActionDesire | null;
  };
  overrideReason: string | null; // エゴが戦術をオーバーライドした場合の理由
}

// =============================================================================
// 設定・パラメータ
// =============================================================================

/**
 * 選手の性格パラメータ（AIの振る舞いに影響）
 */
export interface PlayerPersonality {
  egoLevel: number;              // 0-1 エゴの強さ
  teamPlayer: number;            // 0-1 チームプレイ志向
  clutchMentality: number;       // 0-1 クラッチ時のメンタル
  aggression: number;            // 0-1 攻撃性
  riskTolerance: number;         // 0-1 リスク許容度
}

/**
 * デフォルトの性格パラメータ
 */
export const DEFAULT_PERSONALITY: PlayerPersonality = {
  egoLevel: 0.5,
  teamPlayer: 0.5,
  clutchMentality: 0.5,
  aggression: 0.5,
  riskTolerance: 0.5,
};

/**
 * デフォルトのチーム指示
 */
export const DEFAULT_TEAM_DIRECTIVE: TeamDirective = {
  offenseFormation: 'motion',
  pace: 'half_court',
  primaryOption: null,
  secondaryOption: null,
  playName: null,

  defenseScheme: 'man_to_man',
  helpDefenseLevel: 0.5,
  pressureLevel: 0.5,

  targetMismatch: null,
  avoidPlayer: null,

  shotClockStrategy: 'normal',
  transitionStrategy: 'setup',
};
