import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { PlayerStateManager } from "../../state";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { Formation, PlayerPosition } from "../../config/FormationConfig";
import { OffenseRole } from "../../state/PlayerStateTypes";
import { PassTrajectoryCalculator, Vec3 } from "../../physics/PassTrajectoryCalculator";
import { RiskAssessmentSystem } from "../../systems/RiskAssessmentSystem";
import { PassType, PASS_TYPE_CONFIGS } from "../../config/PassTrajectoryConfig";
import { getTeammates } from "../../utils/TeamUtils";
import { getDistance2DSimple } from "../../utils/CollisionUtils";
import { SAFE_BOUNDARY_CONFIG } from "../../config/gameConfig";
import {
  TacticalZoneType,
  getZonePosition,
  isZonePairOccupied,
  getZonesWithPriority,
} from "../../config/TacticalZoneConfig";

/**
 * オフボールオフェンス時のAI
 * ボールを持っていないオフェンスプレイヤーの動きを制御
 *
 * 戦術ゾーンベースのポジショニング:
 * - PG, SG, SF: トップ、左右ウィング、左右コーナー、左右ショートコーナー
 * - PF, C: ハイポスト、左右エルボー、左右ローポスト、ミッドポスト
 */
export class OffBallOffenseAI extends BaseStateAI {
  // 戦術ゾーンベースのポジショニング用
  private currentTargetPosition: { x: number; z: number } | null = null;
  private currentZoneType: TacticalZoneType | null = null; // 現在のゾーンタイプ
  private zoneCenter: { x: number; z: number } | null = null; // ゾーンの中心座標
  private positionReevaluateTimer: number = 0;
  private readonly zoneMovementRadius: number = 2.0; // ゾーン内移動の半径（m）

  // パスレーン分析用
  private trajectoryCalculator: PassTrajectoryCalculator;
  private riskAssessment: RiskAssessmentSystem | null = null;
  private readonly maxPassLaneRisk: number = 0.4; // この確率以下なら安全とみなす

  // チームメイト重複回避用
  private readonly minTeammateDistance: number = 2.5; // チームメイトからの最小距離

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
    this.trajectoryCalculator = new PassTrajectoryCalculator();
  }

  /**
   * RiskAssessmentSystemを設定
   */
  public setRiskAssessmentSystem(system: RiskAssessmentSystem): void {
    this.riskAssessment = system;
  }

  /**
   * フォーメーションを設定（戦術ゾーンベースに移行したためリセットのみ）
   */
  public setFormation(_formation: Formation): void {
    // フォーメーション変更時は目標位置をリセット
    this.resetTargetPosition();
  }

  /**
   * フォーメーション名でフォーメーションを設定（戦術ゾーンベースに移行）
   */
  public setFormationByName(_name: string): boolean {
    // フォーメーション変更時は目標位置をリセット
    this.resetTargetPosition();
    return true;
  }

  /**
   * 目標位置をリセット（次のupdateで再選択される）
   */
  public resetTargetPosition(): void {
    this.currentTargetPosition = null;
    this.currentZoneType = null;
    this.zoneCenter = null;
    this.positionReevaluateTimer = this.getDecisionInterval(); // 即座に再評価
  }

  /**
   * 現在の目標位置を取得（パス軌道可視化用）
   * @returns 現在の目標位置（設定されていない場合はnull）
   */
  public getCurrentTargetPosition(): { x: number; z: number } | null {
    return this.currentTargetPosition;
  }

  /**
   * 強制リセット（ゲーム再開時に全内部状態をクリア）
   */
  public forceReset(): void {
    this.resetTargetPosition();
    this.mainHandlerTargetPosition = null;
    this.mainHandlerReevaluateTimer = 0;
    this.secondHandlerTargetPosition = null;
    this.secondHandlerReevaluateTimer = 0;
  }

  /**
   * 状態遷移時のリセット処理
   * OFF_BALL_PLAYERになった時に呼ばれる
   */
  public onEnterState(): void {
    // 目標位置をリセット（新しい状況で再評価させる）
    this.resetTargetPosition();
    // メインハンドラー用の位置もリセット
    this.mainHandlerTargetPosition = null;
    this.mainHandlerReevaluateTimer = 0;
    // セカンドハンドラー用の位置もリセット
    this.secondHandlerTargetPosition = null;
    this.secondHandlerReevaluateTimer = 0;
  }

  /**
   * 状態から離れる時のリセット処理
   * OFF_BALL_PLAYERから別の状態になる時に呼ばれる
   */
  public onExitState(): void {
    // 目標位置をリセット
    this.currentTargetPosition = null;
    this.currentZoneType = null;
    this.zoneCenter = null;
    this.positionReevaluateTimer = 0;
    // メインハンドラー用の位置もリセット
    this.mainHandlerTargetPosition = null;
    this.mainHandlerReevaluateTimer = 0;
    // セカンドハンドラー用の位置もリセット
    this.secondHandlerTargetPosition = null;
    this.secondHandlerReevaluateTimer = 0;
  }

  /**
   * AIの更新処理
   * フォーメーションに従って指定位置に移動
   * シュート時はリバウンドポジションへ移動
   * スローイン時はパスを受けられる位置へ移動
   * パスターゲットの場合はその場に留まってパスを待つ
   */
  public update(deltaTime: number): void {
    // パスターゲットの場合、パスを受ける準備をする
    const passTarget = this.ball.getPassTarget();
    if (passTarget === this.character) {
      this.handlePassReceive(deltaTime);
      return;
    }

    // ボールが飛行中（シュート中）の場合
    if (this.ball.isInFlight()) {
      // インサイドプレイヤー（PF, C）はリバウンドに備える
      const playerPos = this.character.playerPosition;
      if (playerPos === 'PF' || playerPos === 'C') {
        this.handleReboundPosition(deltaTime);
      } else {
        // ペリメータープレイヤーはその場でボールを見守る
        this.handleWatchShot();
      }
      return;
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();

    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        // シュートモーション中：インサイドはリバウンド、ペリメーターは見守る
        const playerPos = this.character.playerPosition;
        if (playerPos === 'PF' || playerPos === 'C') {
          this.handleReboundPosition(deltaTime);
        } else {
          this.handleWatchShot();
        }
        return;
      }
    }

    // 【ロール別行動】メインハンドラーはオンボールプレイヤーに近づきパスコールを確保
    if (this.character.offenseRole === OffenseRole.MAIN_HANDLER && onBallPlayer) {
      this.handleMainHandlerPosition(deltaTime, onBallPlayer);
      return;
    }

    // 【ロール別行動】セカンドハンドラーはオンボールがメインハンドラーの時、近くでパスを受ける
    if (this.character.offenseRole === OffenseRole.SECOND_HANDLER && onBallPlayer &&
        onBallPlayer.offenseRole === OffenseRole.MAIN_HANDLER) {
      this.handleSecondHandlerPosition(deltaTime, onBallPlayer);
      return;
    }

    // フォーメーションに従って移動
    this.handleFormationPosition(deltaTime, onBallPlayer);
  }

  /**
   * パスを受け取るための処理
   * パスターゲットになった場合、ボールの方向を向いて積極的にボールに向かう
   * - 3.0m以上: ダッシュ
   * - 1.0m以上: 歩き
   * - 0.3m以上: ゆっくり歩き
   * - 0.3m以内: 停止してキャッチ待ち
   */
  private handlePassReceive(deltaTime: number): void {
    const myPosition = this.character.getPosition();
    const ballPosition = this.ball.getPosition();

    // ボールの方向を向く
    const toBall = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );
    const distanceToBall = toBall.length();

    if (distanceToBall > 0.01) {
      const ballAngle = Math.atan2(toBall.x, toBall.z);
      this.character.setRotation(ballAngle);
    }

    // 距離に応じてボールに向かって移動
    if (distanceToBall > 0.3) {
      toBall.normalize();

      // 衝突回避を考慮した移動方向
      const adjustedDirection = this.adjustDirectionForCollision(toBall, deltaTime);

      if (adjustedDirection) {
        this.character.move(adjustedDirection, deltaTime);

        if (distanceToBall > 3.0) {
          // ダッシュ
          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else if (distanceToBall > 1.0) {
          // 歩き
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        } else {
          // ゆっくり歩き（1.0m以内）
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        }
      } else {
        // 衝突回避で移動できない場合はアイドル
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      }
    } else {
      // 0.3m以内: 停止してキャッチ待ち
      this.character.velocity = Vector3.Zero();

      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  // ============================================
  // メインハンドラー専用ポジショニング
  // ============================================

  /** メインハンドラーの理想的な距離（オンボールプレイヤーからの距離） */
  private readonly MAIN_HANDLER_IDEAL_DISTANCE: number = 4.0;
  /** メインハンドラーの最小距離（近すぎるとスペースがなくなる） */
  private readonly MAIN_HANDLER_MIN_DISTANCE: number = 2.5;
  /** メインハンドラーの最大距離（遠すぎるとパスが通りにくい） */
  private readonly MAIN_HANDLER_MAX_DISTANCE: number = 6.0;
  /** メインハンドラーの位置再評価タイマー */
  private mainHandlerReevaluateTimer: number = 0;
  /** メインハンドラーの目標位置 */
  private mainHandlerTargetPosition: Vector3 | null = null;

  /**
   * メインハンドラーのオフボール行動
   * オンボールプレイヤーに近づき、パスコール（パスを受けやすい位置）を確保する
   * - ボール保持者から4m前後の距離を維持
   * - パスレーンリスクが低い位置を選択
   * - チームメイトと重ならない
   */
  private handleMainHandlerPosition(deltaTime: number, onBallPlayer: Character): void {
    this.mainHandlerReevaluateTimer += deltaTime;

    const myPosition = this.character.getPosition();
    const onBallPos = onBallPlayer.getPosition();
    const distanceToOnBall = Vector3.Distance(myPosition, onBallPos);

    // 目標位置が未設定、または定期的に再評価
    if (!this.mainHandlerTargetPosition || this.mainHandlerReevaluateTimer >= this.getDecisionInterval()) {
      this.mainHandlerReevaluateTimer = 0;
      this.calculateMainHandlerTargetPosition(onBallPlayer);
    }

    // 目標位置がない場合はオンボールプレイヤーを見て待機
    if (!this.mainHandlerTargetPosition) {
      this.faceTowards(onBallPlayer, deltaTime);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 理想距離範囲内で、パスレーンが良好なら待機して呼び込む
    if (distanceToOnBall >= this.MAIN_HANDLER_MIN_DISTANCE &&
        distanceToOnBall <= this.MAIN_HANDLER_MAX_DISTANCE) {
      const currentRisk = this.calculatePassLaneRisk(
        { x: myPosition.x, z: myPosition.z },
        onBallPlayer
      );
      // パスレーンが安全なら、その場でオンボールプレイヤーの方を向いて待機
      if (currentRisk <= this.maxPassLaneRisk) {
        this.faceTowards(onBallPlayer, deltaTime);
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        return;
      }
    }

    // 目標位置に向かって移動
    this.moveTowardsPosition(this.mainHandlerTargetPosition, onBallPlayer, deltaTime);
  }

  /**
   * メインハンドラーの目標位置を計算
   * オンボールプレイヤーの周囲でパスレーンリスクが最も低い位置を選択
   */
  private calculateMainHandlerTargetPosition(onBallPlayer: Character): void {
    const myPosition = this.character.getPosition();
    const onBallPos = onBallPlayer.getPosition();

    // ゴール方向（攻める側）
    const goalPos = this.field.getAttackingGoalRim(this.character.team);

    // オンボールプレイヤーからゴールへの方向
    const toGoal = new Vector3(goalPos.x - onBallPos.x, 0, goalPos.z - onBallPos.z);
    if (toGoal.length() > 0.01) {
      toGoal.normalize();
    }

    // 候補位置を生成: オンボールプレイヤー周囲を12方向で探索
    const candidates: { pos: Vector3; risk: number; score: number }[] = [];
    const angleSteps = 12;

    for (let i = 0; i < angleSteps; i++) {
      const angle = (i / angleSteps) * Math.PI * 2;
      const candidateX = onBallPos.x + Math.cos(angle) * this.MAIN_HANDLER_IDEAL_DISTANCE;
      const candidateZ = onBallPos.z + Math.sin(angle) * this.MAIN_HANDLER_IDEAL_DISTANCE;

      // 安全な境界内かチェック
      if (candidateX < SAFE_BOUNDARY_CONFIG.minX || candidateX > SAFE_BOUNDARY_CONFIG.maxX ||
          candidateZ < SAFE_BOUNDARY_CONFIG.minZ || candidateZ > SAFE_BOUNDARY_CONFIG.maxZ) {
        continue;
      }

      const candidate = { x: candidateX, z: candidateZ };

      // チームメイトに近すぎないかチェック
      if (this.isTooCloseToTeammates(candidate)) {
        continue;
      }

      // パスレーンリスクを計算
      const risk = this.calculatePassLaneRisk(candidate, onBallPlayer);

      // ゴールの反対側（後方）を優先するスコア
      // メインハンドラーはボール保持者の後方に位置してパスを受ける
      const candidateDir = new Vector3(candidateX - onBallPos.x, 0, candidateZ - onBallPos.z).normalize();
      const behindScore = -Vector3.Dot(candidateDir, toGoal); // ゴール反対方向ほど高スコア

      // 自分からの移動距離も考慮（近い方が良い）
      const moveDistance = Math.sqrt(
        Math.pow(candidateX - myPosition.x, 2) + Math.pow(candidateZ - myPosition.z, 2)
      );
      const distancePenalty = moveDistance * 0.05; // 移動距離が長いほどペナルティ

      // 総合スコア: リスクが低い＋後方＋近い ほど良い
      const score = risk * 2.0 - behindScore * 0.5 + distancePenalty;

      candidates.push({
        pos: new Vector3(candidateX, myPosition.y, candidateZ),
        risk,
        score,
      });
    }

    if (candidates.length === 0) {
      // 候補がない場合はオンボールプレイヤーの後方に移動
      const fallbackX = onBallPos.x - toGoal.x * this.MAIN_HANDLER_IDEAL_DISTANCE;
      const fallbackZ = onBallPos.z - toGoal.z * this.MAIN_HANDLER_IDEAL_DISTANCE;
      this.mainHandlerTargetPosition = new Vector3(
        Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, fallbackX)),
        myPosition.y,
        Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, fallbackZ))
      );
      return;
    }

    // スコアが低い順にソート（低い = 良い）
    candidates.sort((a, b) => a.score - b.score);
    this.mainHandlerTargetPosition = candidates[0].pos;
  }

  // ============================================
  // セカンドハンドラー専用ポジショニング
  // ============================================

  /** セカンドハンドラーの理想的な距離 */
  private readonly SECOND_HANDLER_IDEAL_DISTANCE: number = 5.0;
  /** セカンドハンドラーの最小距離 */
  private readonly SECOND_HANDLER_MIN_DISTANCE: number = 3.0;
  /** セカンドハンドラーの最大距離 */
  private readonly SECOND_HANDLER_MAX_DISTANCE: number = 7.0;
  /** セカンドハンドラーの位置再評価タイマー */
  private secondHandlerReevaluateTimer: number = 0;
  /** セカンドハンドラーの目標位置 */
  private secondHandlerTargetPosition: Vector3 | null = null;

  /**
   * セカンドハンドラーのオフボール行動
   * オンボールがメインハンドラーの時、メインハンドラーとは反対側のウィング寄りで
   * パスを受けられる位置を確保する
   * - ボール保持者から5m前後の距離を維持
   * - メインハンドラーの後方ではなく横〜斜め前に位置
   * - パスレーンリスクが低い位置を選択
   */
  private handleSecondHandlerPosition(deltaTime: number, onBallPlayer: Character): void {
    this.secondHandlerReevaluateTimer += deltaTime;

    const myPosition = this.character.getPosition();
    const onBallPos = onBallPlayer.getPosition();
    const distanceToOnBall = Vector3.Distance(myPosition, onBallPos);

    // 目標位置が未設定、または定期的に再評価
    if (!this.secondHandlerTargetPosition || this.secondHandlerReevaluateTimer >= this.getDecisionInterval()) {
      this.secondHandlerReevaluateTimer = 0;
      this.calculateSecondHandlerTargetPosition(onBallPlayer);
    }

    if (!this.secondHandlerTargetPosition) {
      this.faceTowards(onBallPlayer, deltaTime);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 理想距離範囲内で、パスレーンが良好なら待機
    if (distanceToOnBall >= this.SECOND_HANDLER_MIN_DISTANCE &&
        distanceToOnBall <= this.SECOND_HANDLER_MAX_DISTANCE) {
      const currentRisk = this.calculatePassLaneRisk(
        { x: myPosition.x, z: myPosition.z },
        onBallPlayer
      );
      if (currentRisk <= this.maxPassLaneRisk) {
        this.faceTowards(onBallPlayer, deltaTime);
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        return;
      }
    }

    // 目標位置に向かって移動
    this.moveTowardsPosition(this.secondHandlerTargetPosition, onBallPlayer, deltaTime);
  }

  /**
   * セカンドハンドラーの目標位置を計算
   * メインハンドラー（オンボール）の横〜斜め前のウィング側に位置取り
   * メインハンドラーの後方とは被らないよう、横方向を優先する
   */
  private calculateSecondHandlerTargetPosition(onBallPlayer: Character): void {
    const myPosition = this.character.getPosition();
    const onBallPos = onBallPlayer.getPosition();

    // ゴール方向
    const goalPos = this.field.getAttackingGoalRim(this.character.team);
    const toGoal = new Vector3(goalPos.x - onBallPos.x, 0, goalPos.z - onBallPos.z);
    if (toGoal.length() > 0.01) {
      toGoal.normalize();
    }

    // メインハンドラーのターゲット位置を取得して避ける
    const mainHandlerPos = this.mainHandlerTargetPosition;

    // 候補位置を生成: オンボールプレイヤー周囲を12方向で探索
    const candidates: { pos: Vector3; risk: number; score: number }[] = [];
    const angleSteps = 12;

    for (let i = 0; i < angleSteps; i++) {
      const angle = (i / angleSteps) * Math.PI * 2;
      const candidateX = onBallPos.x + Math.cos(angle) * this.SECOND_HANDLER_IDEAL_DISTANCE;
      const candidateZ = onBallPos.z + Math.sin(angle) * this.SECOND_HANDLER_IDEAL_DISTANCE;

      // 安全な境界内かチェック
      if (candidateX < SAFE_BOUNDARY_CONFIG.minX || candidateX > SAFE_BOUNDARY_CONFIG.maxX ||
          candidateZ < SAFE_BOUNDARY_CONFIG.minZ || candidateZ > SAFE_BOUNDARY_CONFIG.maxZ) {
        continue;
      }

      const candidate = { x: candidateX, z: candidateZ };

      // チームメイトに近すぎないかチェック
      if (this.isTooCloseToTeammates(candidate)) {
        continue;
      }

      // パスレーンリスクを計算
      const risk = this.calculatePassLaneRisk(candidate, onBallPlayer);

      // 横方向を優先するスコア（ゴール方向に対する横方向成分）
      const candidateDir = new Vector3(candidateX - onBallPos.x, 0, candidateZ - onBallPos.z).normalize();
      const lateralScore = Math.abs(candidateDir.x * (-toGoal.z) + candidateDir.z * toGoal.x);

      // メインハンドラーの位置と被らないよう距離ペナルティ
      let mainHandlerPenalty = 0;
      if (mainHandlerPos) {
        const distToMainHandler = Math.sqrt(
          Math.pow(candidateX - mainHandlerPos.x, 2) + Math.pow(candidateZ - mainHandlerPos.z, 2)
        );
        if (distToMainHandler < 3.0) {
          mainHandlerPenalty = (3.0 - distToMainHandler) * 0.5;
        }
      }

      // 自分からの移動距離も考慮
      const moveDistance = Math.sqrt(
        Math.pow(candidateX - myPosition.x, 2) + Math.pow(candidateZ - myPosition.z, 2)
      );
      const distancePenalty = moveDistance * 0.05;

      // 総合スコア: リスクが低い＋横方向＋メインハンドラーと被らない＋近い ほど良い
      const score = risk * 2.0 - lateralScore * 0.6 + mainHandlerPenalty + distancePenalty;

      candidates.push({
        pos: new Vector3(candidateX, myPosition.y, candidateZ),
        risk,
        score,
      });
    }

    if (candidates.length === 0) {
      // 候補がない場合は横方向にフォールバック
      const sideDir = new Vector3(-toGoal.z, 0, toGoal.x);
      // 自分が現在いる側の横方向を選ぶ
      const myDir = new Vector3(myPosition.x - onBallPos.x, 0, myPosition.z - onBallPos.z);
      const sideSign = Vector3.Dot(myDir, sideDir) >= 0 ? 1 : -1;

      const fallbackX = onBallPos.x + sideDir.x * sideSign * this.SECOND_HANDLER_IDEAL_DISTANCE;
      const fallbackZ = onBallPos.z + sideDir.z * sideSign * this.SECOND_HANDLER_IDEAL_DISTANCE;
      this.secondHandlerTargetPosition = new Vector3(
        Math.max(SAFE_BOUNDARY_CONFIG.minX, Math.min(SAFE_BOUNDARY_CONFIG.maxX, fallbackX)),
        myPosition.y,
        Math.max(SAFE_BOUNDARY_CONFIG.minZ, Math.min(SAFE_BOUNDARY_CONFIG.maxZ, fallbackZ))
      );
      return;
    }

    candidates.sort((a, b) => a.score - b.score);
    this.secondHandlerTargetPosition = candidates[0].pos;
  }

  // ============================================
  // フォーメーションベースのポジショニング
  // ============================================

  /**
   * フォーメーション位置への移動処理（ポジション別）
   *
   * 戦術ゾーンに基づく配置:
   * - PG, SG, SF: トップ、左右ウィング、左右コーナー、左右ショートコーナー
   * - PF, C: ハイポスト、左右エルボー、左右ローポスト、ミッドポスト
   */
  private handleFormationPosition(deltaTime: number, onBallPlayer: Character | null): void {
    const playerPosition = this.character.playerPosition as PlayerPosition;
    if (!playerPosition) {
      // ポジションが設定されていない場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 戦術ゾーンベースの配置
    this.handleTacticalZonePosition(deltaTime, onBallPlayer, playerPosition);
  }

  /**
   * 戦術ゾーンベースのポジショニング
   * ポジションに応じたゾーンリストから空いているゾーンを選択
   * 一度ゾーンを取ったら、そのゾーン内で動き回ってパスコースを作る
   */
  private handleTacticalZonePosition(
    deltaTime: number,
    onBallPlayer: Character | null,
    playerPosition: PlayerPosition
  ): void {
    // 位置の再評価タイマーを更新
    this.positionReevaluateTimer += deltaTime;

    const isAllyTeam = this.character.team === 'ally';

    // まだゾーンが選択されていない場合のみ、新しいゾーンを選択
    if (!this.currentZoneType || !this.zoneCenter) {
      this.selectTacticalZonePosition(playerPosition, isAllyTeam, onBallPlayer);
      this.positionReevaluateTimer = 0;
    }
    // ゾーンが選択済みの場合は、ゾーン内で動き回ってパスコースを作る
    else if (this.positionReevaluateTimer >= this.getDecisionInterval()) {
      this.adjustPositionWithinZone(onBallPlayer);
      this.positionReevaluateTimer = 0;
    }

    if (!this.currentTargetPosition) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const targetPosition = new Vector3(
      this.currentTargetPosition.x,
      this.character.getPosition().y,
      this.currentTargetPosition.z
    );

    if (onBallPlayer) {
      this.moveTowardsPosition(targetPosition, onBallPlayer, deltaTime);
    } else {
      this.moveTowardsPositionWithoutLookAt(targetPosition, deltaTime);
    }
  }

  /**
   * 戦術ゾーンから目標位置を選択
   *
   * PG/SG/SF: ペリメーターゾーン（トップ、ウィング、コーナー、ショートコーナー）
   * PF/C: インサイドゾーン（ハイポスト、エルボー、ローポスト、ミッドポスト）
   *
   * 選択ルール:
   * - ポジションごとに優先ゾーンが決まっている（PG→トップ優先、SG→左ウィング優先等）
   * - 左右ペアのゾーン（wing_left/right等）は片方が占有されていたら両方とも選択不可
   * - コーナー/ショートコーナーは全て相互排他（1人のみ）
   */
  private selectTacticalZonePosition(
    playerPosition: PlayerPosition,
    isAllyTeam: boolean,
    _onBallPlayer: Character | null
  ): void {
    // ポジションに応じた優先順位付きゾーンリストを取得
    const prioritizedZones = getZonesWithPriority(playerPosition);

    // 同じチームのプレイヤーを取得
    const teammates = getTeammates(this.allCharacters, this.character);

    // 優先順位に従って、空いている最初のゾーンを選択
    for (const zoneType of prioritizedZones) {
      // 左右ペアの排他チェック：片方に選手がいたら両方とも選択不可
      if (isZonePairOccupied(zoneType, isAllyTeam, teammates, this.character, 2.5)) {
        continue;
      }

      // このゾーンを選択
      const zonePos = getZonePosition(zoneType, isAllyTeam);
      this.currentTargetPosition = zonePos;
      this.currentZoneType = zoneType;
      this.zoneCenter = { x: zonePos.x, z: zonePos.z };
      return;
    }

    // すべて占有されている場合は、優先リストの最初を選択（仕方なく）
    const fallbackZone = prioritizedZones[0];
    const zonePos = getZonePosition(fallbackZone, isAllyTeam);
    this.currentTargetPosition = zonePos;
    this.currentZoneType = fallbackZone;
    this.zoneCenter = { x: zonePos.x, z: zonePos.z };
  }

  /**
   * ゾーン内で位置を調整してパスコースを作る
   * ゾーン中心を基点に、パスレーンリスクが低い位置を探す
   */
  private adjustPositionWithinZone(onBallPlayer: Character | null): void {
    if (!this.zoneCenter || !onBallPlayer) {
      return;
    }

    const myPosition = this.character.getPosition();
    const teammates = getTeammates(this.allCharacters, this.character);

    // ゾーン内の候補位置を生成（8方向 + 中心）
    const candidates: { x: number; z: number; risk: number }[] = [];
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];

    // 中心位置も候補に
    candidates.push({
      x: this.zoneCenter.x,
      z: this.zoneCenter.z,
      risk: this.calculatePassLaneRisk(this.zoneCenter, onBallPlayer),
    });

    // 8方向の位置を候補に
    for (const angleDeg of angles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const candidateX = this.zoneCenter.x + Math.cos(angleRad) * this.zoneMovementRadius;
      const candidateZ = this.zoneCenter.z + Math.sin(angleRad) * this.zoneMovementRadius;

      const candidate = { x: candidateX, z: candidateZ };

      // チームメイトに近すぎないかチェック
      let tooClose = false;
      for (const teammate of teammates) {
        const teammatePos = teammate.getPosition();
        if (getDistance2DSimple(candidate, teammatePos) < 1.5) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      const risk = this.calculatePassLaneRisk(candidate, onBallPlayer);
      candidates.push({ x: candidateX, z: candidateZ, risk });
    }

    if (candidates.length === 0) {
      return;
    }

    // リスクが低い順にソート
    candidates.sort((a, b) => a.risk - b.risk);

    // 現在位置のリスク
    const currentRisk = this.calculatePassLaneRisk(
      { x: myPosition.x, z: myPosition.z },
      onBallPlayer
    );

    // 現在より明らかにリスクが低い位置があれば移動
    // 小さな差では動かない（0.1以上の改善がある場合のみ）
    if (candidates[0].risk < currentRisk - 0.1) {
      this.currentTargetPosition = { x: candidates[0].x, z: candidates[0].z };
    }
    // リスクがほぼ同じなら、たまにランダムに動く（30%）
    else if (Math.random() < 0.3 && candidates.length > 1) {
      const randomIndex = Math.floor(Math.random() * Math.min(3, candidates.length));
      this.currentTargetPosition = { x: candidates[randomIndex].x, z: candidates[randomIndex].z };
    }
  }

  /**
   * 指定位置からオンボールプレイヤーへのパスレーンリスクを計算
   * @returns インターセプト確率（0-1）、計算できない場合は0
   */
  private calculatePassLaneRisk(
    position: { x: number; z: number },
    onBallPlayer: Character
  ): number {
    const onBallPos = onBallPlayer.getPosition();
    const onBallHeight = onBallPlayer.config.physical.height;
    const receiverHeight = this.character.config.physical.height;

    // パサー（オンボール）の胸の高さ
    const passerVec: Vec3 = {
      x: onBallPos.x,
      y: onBallPos.y + onBallHeight * 0.15,
      z: onBallPos.z
    };

    // レシーバー（自分）の胸の高さ
    const receiverVec: Vec3 = {
      x: position.x,
      y: this.character.getPosition().y + receiverHeight * 0.15,
      z: position.z
    };

    // 水平距離を計算
    const distance = getDistance2DSimple(receiverVec, passerVec);

    // 距離が短すぎる、または長すぎる場合
    const chestConfig = PASS_TYPE_CONFIGS[PassType.CHEST];
    const bounceConfig = PASS_TYPE_CONFIGS[PassType.BOUNCE];

    if (distance < chestConfig.minDistance || distance > chestConfig.maxDistance) {
      // チェストパスの範囲外の場合、バウンスパスをチェック
      if (distance < bounceConfig.minDistance || distance > bounceConfig.maxDistance) {
        return 1.0; // パス不可能
      }
    }

    // チェストパスの軌道を計算
    const chestTrajectory = this.trajectoryCalculator.calculateTrajectory(
      passerVec,
      receiverVec,
      PassType.CHEST,
      20
    );

    // バウンスパスの軌道を計算
    const bounceTrajectory = this.trajectoryCalculator.calculateTrajectory(
      passerVec,
      receiverVec,
      PassType.BOUNCE,
      20
    );

    // 両方のパスタイプでリスクを分析し、より安全な方を採用
    let minRisk = 1.0;

    if (chestTrajectory && this.riskAssessment) {
      const chestRiskAnalysis = this.riskAssessment.assessTrajectoryRisk(
        chestTrajectory,
        this.character.team
      );
      const chestRisk = chestRiskAnalysis.maxRisk?.probability ?? 0;
      minRisk = Math.min(minRisk, chestRisk);
    }

    if (bounceTrajectory && this.riskAssessment) {
      const bounceRiskAnalysis = this.riskAssessment.assessTrajectoryRisk(
        bounceTrajectory,
        this.character.team
      );
      const bounceRisk = bounceRiskAnalysis.maxRisk?.probability ?? 0;
      minRisk = Math.min(minRisk, bounceRisk);
    }

    return minRisk;
  }

  /**
   * 目標位置に向かって移動（見る対象なし）
   */
  private moveTowardsPositionWithoutLookAt(targetPosition: Vector3, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    // 目標に近い場合は待機
    if (distanceToTarget < 0.5) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    direction.normalize();

    const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
    if (!boundaryAdjusted) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

    if (adjustedDirection) {
      // 移動方向を向く
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

      this.character.move(adjustedDirection, deltaTime);

      if (distanceToTarget > 3.0) {
        if (this.character.getCurrentMotionName() !== 'dash_forward') {
          this.character.playMotion(DASH_FORWARD_MOTION);
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'walk_forward') {
          this.character.playMotion(WALK_FORWARD_MOTION);
        }
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 目標位置に向かって移動（オンボールプレイヤーを見ながら）
   */
  private moveTowardsPosition(targetPosition: Vector3, lookAtTarget: Character, deltaTime: number): void {
    const currentPosition = this.character.getPosition();
    const direction = new Vector3(
      targetPosition.x - currentPosition.x,
      0,
      targetPosition.z - currentPosition.z
    );
    const distanceToTarget = direction.length();

    if (distanceToTarget > 0.3) {
      direction.normalize();

      const boundaryAdjusted = this.adjustDirectionForBoundary(direction, deltaTime);
      if (!boundaryAdjusted) {
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        return;
      }

      const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);

      if (adjustedDirection) {
        this.faceTowards(lookAtTarget, deltaTime);
        this.character.move(adjustedDirection, deltaTime);

        if (distanceToTarget > 3.0) {
          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else {
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        }
      } else {
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      }
    } else {
      this.faceTowards(lookAtTarget, deltaTime);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * リバウンドポジションへ移動（シュート時、PF/C用）
   */
  private handleReboundPosition(deltaTime: number): void {
    // ボールの速度からシュートが打たれたゴールを判定
    const ballVelocity = this.ball.getVelocity();
    const isGoal1 = ballVelocity.z > 0; // +Z方向ならgoal1

    // シュートが打たれたゴールに向かう
    const targetGoal = isGoal1 ? this.field.getGoal1Rim() : this.field.getGoal2Rim();

    const goalPosition = targetGoal.position;
    const myPosition = this.character.getPosition();

    // リバウンドポジション（ゴール下、少しオフセット）
    const zOffset = isGoal1 ? -1.5 : 1.5;
    // ポジションに応じて左右にずらす（PFは左、Cは右）
    const xOffset = this.character.playerPosition === 'PF' ? -1.5 : 1.5;

    const reboundPosition = new Vector3(
      goalPosition.x + xOffset,
      myPosition.y,
      goalPosition.z + zOffset
    );

    const distanceToRebound = Vector3.Distance(myPosition, reboundPosition);

    // リバウンドポジションに近い場合はボールを見て待機
    if (distanceToRebound < 1.0) {
      // ボールの方を向く
      const ballPosition = this.ball.getPosition();
      const toBall = new Vector3(
        ballPosition.x - myPosition.x,
        0,
        ballPosition.z - myPosition.z
      );
      if (toBall.length() > 0.01) {
        const angle = Math.atan2(toBall.x, toBall.z);
        this.character.setRotation(angle);
      }

      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // リバウンドポジションに向かってダッシュ
    const direction = new Vector3(
      reboundPosition.x - myPosition.x,
      0,
      reboundPosition.z - myPosition.z
    );
    direction.normalize();

    // 移動方向を向く
    const angle = Math.atan2(direction.x, direction.z);
    this.character.setRotation(angle);

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      this.character.move(adjustedDirection, deltaTime);

      // ダッシュで移動
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * 指定位置が他のチームメイトに近すぎるかチェック
   * 同じマスまたは隣接マスを避ける
   * @returns 近すぎる場合true
   */
  private isTooCloseToTeammates(position: { x: number; z: number }): boolean {
    const teammates = getTeammates(this.allCharacters, this.character);

    for (const teammate of teammates) {
      const teammatePos = teammate.getPosition();
      const distance = getDistance2DSimple(position, teammatePos);

      if (distance < this.minTeammateDistance) {
        return true;
      }
    }
    return false;
  }
}
