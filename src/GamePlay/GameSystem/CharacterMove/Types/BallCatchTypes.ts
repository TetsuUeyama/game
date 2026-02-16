/**
 * ボールキャッチシステムの型定義
 *
 * キャッチ処理を統一するための型を定義。
 * シナリオベースの設計で、パス、ルーズボール等の
 * 異なるキャッチ条件を明確に分離。
 */

import type { Vector3 } from "@babylonjs/core";
import type { Character } from "@/GamePlay/Object/Entities/Character";

/**
 * キャッチシナリオ種別
 * ボールを受け取る状況に応じて異なる判定ロジックを適用
 */
export enum CatchScenario {
  /** ルーズボール - 誰も保持していないボールを拾う */
  LOOSE_BALL = "LOOSE_BALL",
  /** パスターゲット - パスの受け手として指定されている */
  PASS_TARGET = "PASS_TARGET",
  /** インターセプター - 視野内でパスをキャッチ */
  INTERCEPTOR = "INTERCEPTOR",
  /** ジャンプボール - ジャンプボール後のキャッチ */
  JUMP_BALL = "JUMP_BALL",
  /** リバウンド - シュート失敗後のボール獲得 */
  REBOUND = "REBOUND",
}

/**
 * キャッチ設定（レシーバー側に持たせる）
 * シナリオごとに異なる判定閾値と優先度を定義
 */
export interface CatchConfig {
  /** シナリオ種別 */
  scenario: CatchScenario;
  /** 体距離閾値（m）- この距離以内なら体でキャッチ可能 */
  bodyDistanceThreshold: number;
  /** 手距離閾値（m）- この距離以内なら手でキャッチ可能 */
  handDistanceThreshold: number;
  /** 速度チェックをスキップするか（パスターゲット等は高速でもキャッチ可能） */
  skipVelocityCheck: boolean;
  /** 高さチェックをスキップするか */
  skipHeightCheck: boolean;
  /** 優先度（高いほど優先的にキャッチ判定） */
  priority: number;
}

/**
 * キャッチ候補者情報
 * キャッチ判定の中間データ
 */
export interface CatchCandidate {
  /** キャッチ候補のキャラクター */
  character: Character;
  /** 適用されるキャッチ設定 */
  config: CatchConfig;
  /** ボールと体の距離（XZ平面） */
  distanceToBody: number;
  /** ボールと手の距離（3D） */
  distanceToHand: number;
  /** ボールの相対速度 */
  relativeSpeed: number;
}

/**
 * キャッチイベント
 * キャッチ成功時に発行されるイベント情報
 */
export interface BallCatchEvent {
  /** キャッチしたキャラクター */
  catcher: Character;
  /** キャッチシナリオ */
  scenario: CatchScenario;
  /** キャッチ位置 */
  position: Vector3;
}

/**
 * BallCatchSystem のコールバック定義
 */
export interface BallCatchCallbacks {
  /** キャッチ成功時のコールバック */
  onCatch?: (event: BallCatchEvent) => void;
  /** ファンブル時のコールバック */
  onFumble?: (character: Character) => void;
}
