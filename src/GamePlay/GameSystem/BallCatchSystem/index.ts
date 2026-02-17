/**
 * BallCatchSystem モジュール
 *
 * ボールキャッチ処理を統一するシステム。
 * シナリオベースの設計で、パス、ルーズボール等の
 * 異なるキャッチ条件を明確に分離。
 */

// メインシステム
export { BallCatchSystem } from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchSystem";

// 型定義
export {
  CatchScenario,
  type CatchConfig,
  type CatchCandidate,
  type BallCatchEvent,
  type BallCatchCallbacks,
} from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchTypes";

// 設定
export {
  CATCH_SCENARIO_CONFIGS,
  BALL_CATCH_PHYSICS,
  BALL_RADIUS,
  PALM_CATCH,
} from "@/GamePlay/GameSystem/BallCatchSystem/BallCatchConfig";
