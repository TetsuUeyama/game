/**
 * AI統合エクスポート
 * - 状態別AI（state/）
 * - 多層AIシステム（layers/, AIBlender, AIDecisionMaker）
 * - 型定義（config/）
 */

// =============================================================================
// 状態別AIクラス
// =============================================================================
export { BaseStateAI } from './state/BaseStateAI';
export { LooseBallAI } from './state/LooseBallAI';
export { OnBallOffenseAI } from './state/OnBallOffenseAI';
export { OnBallDefenseAI } from './state/OnBallDefenseAI';
export { OffBallOffenseAI } from './state/OffBallOffenseAI';
export { OffBallDefenseAI } from './state/OffBallDefenseAI';

// =============================================================================
// 多層AIシステム
// =============================================================================

// メインエントリーポイント
export { AIDecisionMaker, getTeamTacticsManager, resetAllTeamTactics } from "./AIDecisionMaker";
export type { AIDecisionResult, AIDecisionMakerConfig } from "./AIDecisionMaker";

// ブレンダー
export { AIBlender, BLEND_CONFIG } from "./AIBlender";

// Layer 1: 状況認識
export { SituationAnalyzer, SITUATION_CONFIG } from "./layers/SituationAnalyzer";

// Layer 2: フィールド分析
export { FieldAnalyzer, FIELD_ANALYSIS_CONFIG } from "./layers/FieldAnalyzer";

// Layer 3: チーム戦術
export {
  TeamTacticsManager,
  TeamTacticsRegistry,
} from "./layers/TeamTacticsManager";

// Layer 4: 個人戦術
export { IndividualTactician, INDIVIDUAL_TACTICS_CONFIG } from "./layers/IndividualTactician";

// Layer 5: 個人意思
export { PersonalEgoEngine, EGO_CONFIG } from "./layers/PersonalEgoEngine";

// =============================================================================
// 型定義
// =============================================================================
export type {
  // Layer 1
  SituationContext,
  GamePhase,
  BallRelation,
  CourtZone,
  // Layer 2
  FieldAnalysis,
  PlayerSnapshot,
  OpenSpace,
  PassLane,
  ShootingLane,
  MatchupInfo,
  ReboundPosition,
  MovementType,
  ActionPhase,
  ContesterInfo,
  // Layer 3
  TeamDirective,
  OffenseFormation,
  DefenseScheme,
  OffensePace,
  // Layer 4
  TacticalAction,
  TacticalActionType,
  // Layer 5
  ActionDesire,
  DesiredActionType,
  // 最終出力
  FinalDecision,
  // 設定
  PlayerPersonality,
} from "./config/AILayerTypes";

export { DEFAULT_TEAM_DIRECTIVE, DEFAULT_PERSONALITY } from "./config/AILayerTypes";
