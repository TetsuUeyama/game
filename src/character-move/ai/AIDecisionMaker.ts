/**
 * AIDecisionMaker
 * 5層AIシステムの統合モジュール
 *
 * Layer 1: SituationAnalyzer - 自分の状況認識
 * Layer 2: FieldAnalyzer - コート全体の分析
 * Layer 3: TeamTacticsManager - チーム戦術（外部から設定）
 * Layer 4: IndividualTactician - 個人戦術
 * Layer 5: PersonalEgoEngine - 個人意思
 * + AIBlender - Layer 4とLayer 5のブレンド
 */

import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { Field } from "../entities/Field";
import {
  SituationContext,
  FieldAnalysis,
  TeamDirective,
  TacticalAction,
  ActionDesire,
  FinalDecision,
  PlayerPersonality,
} from "./config/AILayerTypes";
import { SituationAnalyzer } from "./layers/SituationAnalyzer";
import { FieldAnalyzer } from "./layers/FieldAnalyzer";
import { TeamTacticsManager, TeamTacticsRegistry } from "./layers/TeamTacticsManager";
import { IndividualTactician } from "./layers/IndividualTactician";
import { PersonalEgoEngine } from "./layers/PersonalEgoEngine";
import { AIBlender } from "./AIBlender";

/**
 * AI決定結果（デバッグ情報含む）
 */
export interface AIDecisionResult {
  // 最終決定
  finalDecision: FinalDecision;

  // 各レイヤーの出力（デバッグ用）
  layers: {
    situation: SituationContext;
    fieldAnalysis: FieldAnalysis;
    teamDirective: TeamDirective;
    tacticalAction: TacticalAction;
    ego: ActionDesire;
  };

  // 処理時間（ミリ秒）
  processingTimeMs: number;
}

/**
 * AI決定メーカーの設定
 */
export interface AIDecisionMakerConfig {
  // 選手の性格（オプション、未設定時はスタッツから推測）
  personality?: PlayerPersonality;

  // ショットクロック（外部から更新）
  shotClock?: number;

  // ポゼッション開始時間
  possessionStartTime?: number;

  // デバッグモード
  debug?: boolean;
}

/**
 * AI決定メーカー
 * キャラクターごとに1インスタンス作成
 */
export class AIDecisionMaker {
  private character: Character;
  private ball: Ball;
  private allCharacters: () => Character[];

  // レイヤーインスタンス
  private situationAnalyzer: SituationAnalyzer;
  private fieldAnalyzer: FieldAnalyzer;
  private individualTactician: IndividualTactician;
  private egoEngine: PersonalEgoEngine;
  private blender: AIBlender;

  // 設定
  private config: AIDecisionMakerConfig;

  // キャッシュ（同一フレーム内での重複計算を避ける）
  private cachedResult: AIDecisionResult | null = null;
  private lastUpdateTime: number = 0;
  private cacheValidityMs: number = 16; // 約1フレーム

  constructor(
    character: Character,
    ball: Ball,
    field: Field,
    getAllCharacters: () => Character[],
    config: AIDecisionMakerConfig = {}
  ) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = getAllCharacters;
    this.config = config;

    // レイヤー初期化
    this.situationAnalyzer = new SituationAnalyzer();
    this.fieldAnalyzer = new FieldAnalyzer(field);
    this.individualTactician = new IndividualTactician();
    this.egoEngine = new PersonalEgoEngine();
    this.blender = new AIBlender();
  }

  /**
   * AI決定を実行
   */
  decide(): AIDecisionResult {
    const startTime = performance.now();

    // キャッシュチェック
    const now = Date.now();
    if (this.cachedResult && (now - this.lastUpdateTime) < this.cacheValidityMs) {
      return this.cachedResult;
    }

    const allChars = this.allCharacters();

    // Layer 1: 状況認識
    const situation = this.situationAnalyzer.analyze(
      this.character,
      this.ball,
      allChars,
      this.config.shotClock ?? 24,
      this.config.possessionStartTime ?? 0
    );

    // Layer 2: フィールド分析
    const fieldAnalysis = this.fieldAnalyzer.analyze(
      this.character,
      this.ball,
      allChars
    );

    // Layer 3: チーム戦術取得
    const teamTacticsManager = TeamTacticsRegistry.getInstance().getManager(
      this.character.team ?? 'ally'
    );
    const teamDirective = teamTacticsManager.getDirective();

    // Layer 4: 個人戦術
    const tacticalAction = this.individualTactician.decide(
      this.character,
      situation,
      fieldAnalysis,
      teamDirective
    );

    // Layer 5: 個人意思
    const ego = this.egoEngine.calculate(
      this.character,
      situation,
      fieldAnalysis,
      this.config.personality
    );

    // ブレンド
    const finalDecision = this.blender.blend(
      tacticalAction,
      ego,
      this.character,
      situation,
      this.config.personality
    );

    const processingTimeMs = performance.now() - startTime;

    const result: AIDecisionResult = {
      finalDecision,
      layers: {
        situation,
        fieldAnalysis,
        teamDirective,
        tacticalAction,
        ego,
      },
      processingTimeMs,
    };

    // キャッシュ更新
    this.cachedResult = result;
    this.lastUpdateTime = now;

    // デバッグ出力
    if (this.config.debug) {
      this.logDebugInfo(result);
    }

    return result;
  }

  /**
   * 最終決定のみ取得（軽量版）
   */
  getFinalDecision(): FinalDecision {
    return this.decide().finalDecision;
  }

  /**
   * 状況コンテキストのみ取得
   */
  getSituation(): SituationContext {
    return this.decide().layers.situation;
  }

  /**
   * フィールド分析のみ取得
   */
  getFieldAnalysis(): FieldAnalysis {
    return this.decide().layers.fieldAnalysis;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<AIDecisionMakerConfig>): void {
    this.config = { ...this.config, ...config };
    this.invalidateCache();
  }

  /**
   * ショットクロックを更新
   */
  setShotClock(seconds: number): void {
    this.config.shotClock = seconds;
  }

  /**
   * ポゼッション開始時間を設定
   */
  setPossessionStartTime(time: number): void {
    this.config.possessionStartTime = time;
  }

  /**
   * シュート結果を記録（ホットハンド用）
   */
  recordShotResult(success: boolean): void {
    if (success) {
      this.egoEngine.recordShotSuccess(this.character);
    } else {
      this.egoEngine.recordShotFailure(this.character);
    }
  }

  /**
   * キャッシュを無効化
   */
  invalidateCache(): void {
    this.cachedResult = null;
  }

  /**
   * デバッグ情報をログ出力（本番では無効化）
   */
  private logDebugInfo(_result: AIDecisionResult): void {
    // デバッグ用：本番では出力しない
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.cachedResult = null;
    this.egoEngine.reset();
  }
}

/**
 * チーム戦術マネージャーへのアクセサ
 */
export function getTeamTacticsManager(team: 'ally' | 'enemy'): TeamTacticsManager {
  return TeamTacticsRegistry.getInstance().getManager(team);
}

/**
 * 全チームの戦術をリセット
 */
export function resetAllTeamTactics(): void {
  TeamTacticsRegistry.getInstance().reset();
}
