import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { BaseStateAI } from "./BaseStateAI";
import { IDLE_MOTION } from "../../motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "../../motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "../../motion/DashMotion";
import { Formation, FormationUtils, PlayerPosition } from "../../config/FormationConfig";
import { PassTrajectoryCalculator, Vec3 } from "../../physics/PassTrajectoryCalculator";
import { InterceptionAnalyzer } from "../analysis/InterceptionAnalyzer";
import { PassType, PASS_TYPE_CONFIGS } from "../../config/PassTrajectoryConfig";
import { getTeammates } from "../../utils/TeamUtils";
import { getDistance2DSimple } from "../../utils/CollisionUtils";

/**
 * オフボールオフェンス時のAI
 * ボールを持っていないオフェンスプレイヤーの動きを制御
 * フォーメーションに従って指定位置に移動する（ヒートマップ方式）
 */
export class OffBallOffenseAI extends BaseStateAI {
  private currentFormation: Formation;

  // ヒートマップ式ポジショニング用
  private currentTargetPosition: { x: number; z: number } | null = null;
  private positionReevaluateTimer: number = 0;
  private readonly positionReevaluateInterval: number = 1.0; // 1秒ごとに再評価
  private readonly centerWeight: number = 0.55; // 中心セルに55%の確率

  // パスレーン分析用
  private trajectoryCalculator: PassTrajectoryCalculator;
  private interceptionAnalyzer: InterceptionAnalyzer;
  private readonly maxPassLaneRisk: number = 0.4; // この確率以下なら安全とみなす

  // スローイン時のパス受け位置用
  private throwInTargetPosition: Vector3 | null = null;
  private throwInPassType: 'short' | 'long' = 'short'; // short = chest/bounce, long = long pass

  // チームメイト重複回避用（セルサイズ1m）
  private readonly minTeammateDistance: number = 2.5; // チームメイトからの最小距離（隣接セルを避ける）

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field
  ) {
    super(character, ball, allCharacters, field);
    this.currentFormation = FormationUtils.getDefaultOffenseFormation();
    this.trajectoryCalculator = new PassTrajectoryCalculator();
    this.interceptionAnalyzer = new InterceptionAnalyzer();
  }

  /**
   * フォーメーションを設定
   */
  public setFormation(formation: Formation): void {
    this.currentFormation = formation;
    // フォーメーション変更時は目標位置をリセット
    this.resetTargetPosition();
  }

  /**
   * フォーメーション名でフォーメーションを設定
   */
  public setFormationByName(name: string): boolean {
    const formation = FormationUtils.getOffenseFormation(name);
    if (formation) {
      this.currentFormation = formation;
      // フォーメーション変更時は目標位置をリセット
      this.resetTargetPosition();
      return true;
    }
    return false;
  }

  /**
   * 目標位置をリセット（次のupdateで再選択される）
   */
  public resetTargetPosition(): void {
    this.currentTargetPosition = null;
    this.positionReevaluateTimer = this.positionReevaluateInterval; // 即座に再評価
  }

  /**
   * 現在の目標位置を取得（パス軌道可視化用）
   * @returns 現在の目標位置（設定されていない場合はnull）
   */
  public getCurrentTargetPosition(): { x: number; z: number } | null {
    return this.currentTargetPosition;
  }

  /**
   * 状態遷移時のリセット処理
   * OFF_BALL_PLAYERになった時に呼ばれる
   */
  public onEnterState(): void {
    // 目標位置をリセット（新しい状況で再評価させる）
    this.resetTargetPosition();
    // スローイン用の位置もリセット
    this.throwInTargetPosition = null;
  }

  /**
   * 状態から離れる時のリセット処理
   * OFF_BALL_PLAYERから別の状態になる時に呼ばれる
   */
  public onExitState(): void {
    // 目標位置をリセット
    this.currentTargetPosition = null;
    this.positionReevaluateTimer = 0;
    // スローイン用の位置もリセット
    this.throwInTargetPosition = null;
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

    // ボールが飛行中（シュート中）の場合はリバウンドポジションへ
    // パスターゲットではない選手のみ
    if (this.ball.isInFlight()) {
      this.handleReboundPosition(deltaTime, true); // true = オフェンス側
      return;
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();

    // スローイン中かチェック（オンボールプレイヤーがスローインスロワーの場合）
    const isThrowIn = onBallPlayer && onBallPlayer.getIsThrowInThrower();
    if (isThrowIn) {
      this.handleThrowInReceivePosition(deltaTime, onBallPlayer!);
      return;
    }

    // スローイン終了時にターゲット位置をクリア
    if (this.throwInTargetPosition && onBallPlayer && !onBallPlayer.getIsThrowInThrower()) {
      this.throwInTargetPosition = null;
    }

    if (onBallPlayer) {
      const actionController = onBallPlayer.getActionController();
      const currentAction = actionController.getCurrentAction();
      if (currentAction && currentAction.startsWith('shoot_')) {
        this.handleReboundPosition(deltaTime, true);
        return;
      }
    }

    // フォーメーションに従って移動
    this.handleFormationPosition(deltaTime, onBallPlayer);
  }

  /**
   * パスを受け取るための処理
   * パスターゲットになった場合、ボールの方向を向いて待機
   * ボールが近づいてきたら微調整して捕球しやすい位置に移動
   */
  private handlePassReceive(_deltaTime: number): void {
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

    // ボールが非常に近い場合（1.5m以内）、ボールに向かって少し移動
    if (distanceToBall < 1.5 && distanceToBall > 0.3) {
      toBall.normalize();
      const moveSpeed = 2.0; // ゆっくり近づく
      this.character.velocity = new Vector3(
        toBall.x * moveSpeed,
        0,
        toBall.z * moveSpeed
      );

      // 歩きモーション
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    } else {
      // 停止してボールを待つ
      this.character.velocity = Vector3.Zero();

      // アイドルモーション
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * スローイン時のパス受け位置への移動処理
   * 90%: チェストパス/バウンスパスを受けられる位置（2-8m）
   * 10%: ロングパスを受けられる位置（8-15m）
   * フィールドの最外周マスには入らない
   */
  private handleThrowInReceivePosition(deltaTime: number, thrower: Character): void {
    const myPosition = this.character.getPosition();
    const throwerPosition = thrower.getPosition();

    // スロワー方向への回転角度を計算（メソッドの最後で必ず適用する）
    const toThrower = new Vector3(
      throwerPosition.x - myPosition.x,
      0,
      throwerPosition.z - myPosition.z
    );
    const throwerAngle = toThrower.length() > 0.01
      ? Math.atan2(toThrower.x, toThrower.z)
      : this.character.getRotation();

    // 目標位置が設定されていない場合、新しい位置を計算
    if (!this.throwInTargetPosition) {
      this.calculateThrowInTargetPosition(thrower);
    }

    if (!this.throwInTargetPosition) {
      // 計算に失敗した場合はスロワーを向いてアイドル
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      // 最後に必ずスロワー方向を向く
      this.character.setRotation(throwerAngle);
      return;
    }

    // 目標位置への方向と距離
    const toTarget = new Vector3(
      this.throwInTargetPosition.x - myPosition.x,
      0,
      this.throwInTargetPosition.z - myPosition.z
    );
    const distanceToTarget = toTarget.length();

    // 目標位置に到達した場合
    if (distanceToTarget < 0.5) {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }

      // 定期的に位置を再評価（パスレーンが良くなったか）
      this.positionReevaluateTimer += deltaTime;
      if (this.positionReevaluateTimer >= this.positionReevaluateInterval) {
        this.positionReevaluateTimer = 0;
        // パスレーンリスクが高い場合は新しい位置を計算
        const risk = this.calculatePassLaneRisk(
          { x: myPosition.x, z: myPosition.z },
          thrower
        );
        if (risk > this.maxPassLaneRisk) {
          this.calculateThrowInTargetPosition(thrower);
        }
      }
      // 最後に必ずスロワー方向を向く
      this.character.setRotation(throwerAngle);
      return;
    }

    // 目標位置に向かって移動
    toTarget.normalize();
    const boundaryAdjusted = this.adjustDirectionForBoundary(toTarget, deltaTime);
    if (!boundaryAdjusted) {
      // 境界で停止した場合
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      // 最後に必ずスロワー方向を向く
      this.character.setRotation(throwerAngle);
      return;
    }

    const adjustedDirection = this.adjustDirectionForCollision(boundaryAdjusted, deltaTime);
    if (adjustedDirection) {
      // 移動処理
      this.character.move(adjustedDirection, deltaTime);

      // 距離に応じてダッシュまたは歩き
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

    // 最後に必ずスロワー方向を向く（全ての処理の後で回転を設定）
    this.character.setRotation(throwerAngle);
  }

  /**
   * スローイン時の目標位置を計算
   * 優先順位:
   * 1. スロワー周囲7m以内のフリースペース（前後左右2mに誰もいない場所）
   * 2. 90%: 短距離パス用（2-8m）、10%: 長距離パス用（8-15m）
   */
  private calculateThrowInTargetPosition(thrower: Character): void {
    const throwerPos = thrower.getPosition();
    const myPosition = this.character.getPosition();

    // フィールド内の安全な境界（最外周マスを避ける）
    const safeMinX = -6.0;  // -7.5 + 1.5
    const safeMaxX = 6.0;   // 7.5 - 1.5
    const safeMinZ = -13.5; // -15 + 1.5
    const safeMaxZ = 13.5;  // 15 - 1.5

    // 優先1: スロワー周囲7m以内のフリースペースを探す
    const freeSpacePosition = this.findFreeSpaceNearThrower(thrower, 7.0, 2.0, safeMinX, safeMaxX, safeMinZ, safeMaxZ);
    if (freeSpacePosition) {
      this.throwInTargetPosition = new Vector3(freeSpacePosition.x, myPosition.y, freeSpacePosition.z);
      this.throwInPassType = 'short';
      return;
    }

    // 優先2: 従来のパスタイプによる位置選択（フリースペースがない場合）
    // パスタイプを確率で決定（90%短距離、10%長距離）
    const random = Math.random();
    this.throwInPassType = random < 0.9 ? 'short' : 'long';

    // 距離範囲を決定
    let minDist: number;
    let maxDist: number;
    if (this.throwInPassType === 'short') {
      // チェストパス/バウンスパスの範囲（近すぎず、確実に受けられる距離）
      minDist = 3.0;  // 近すぎない
      maxDist = 8.0;  // バウンスパスの最大距離
    } else {
      // ロングパスの範囲
      minDist = 8.0;
      maxDist = 15.0;
    }

    // 最適な位置を探す（複数回試行）
    let bestPosition: Vector3 | null = null;
    let bestRisk = 1.0;
    const maxAttempts = 20;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // ランダムな角度で候補位置を生成
      const angle = Math.random() * Math.PI * 2;
      const distance = minDist + Math.random() * (maxDist - minDist);

      let candidateX = throwerPos.x + Math.cos(angle) * distance;
      let candidateZ = throwerPos.z + Math.sin(angle) * distance;

      // 安全な境界内にクランプ
      candidateX = Math.max(safeMinX, Math.min(safeMaxX, candidateX));
      candidateZ = Math.max(safeMinZ, Math.min(safeMaxZ, candidateZ));

      // スロワーからの実際の距離をチェック
      const actualDist = Math.sqrt(
        Math.pow(candidateX - throwerPos.x, 2) + Math.pow(candidateZ - throwerPos.z, 2)
      );

      // 距離が範囲外の場合はスキップ
      if (actualDist < minDist * 0.8 || actualDist > maxDist * 1.2) {
        continue;
      }

      const candidate = { x: candidateX, z: candidateZ };

      // チームメイトに近すぎる場合はスキップ
      if (this.isTooCloseToTeammates(candidate)) {
        continue;
      }

      // パスレーンリスクを計算
      const risk = this.calculatePassLaneRisk(candidate, thrower);

      // より良い位置が見つかった場合
      if (risk < bestRisk) {
        bestRisk = risk;
        bestPosition = new Vector3(candidateX, myPosition.y, candidateZ);

        // 十分に安全な位置が見つかったら終了
        if (risk <= this.maxPassLaneRisk) {
          break;
        }
      }
    }

    // 最良の位置を設定（見つからなかった場合は現在位置の近くにフォールバック）
    if (bestPosition) {
      this.throwInTargetPosition = bestPosition;
    } else {
      this.throwInTargetPosition = myPosition.clone();
    }
  }

  /**
   * スロワー周囲のフリースペースを探す
   * @param thrower スロワー
   * @param searchRadius 探索半径（m）
   * @param clearanceRadius クリアランス半径（前後左右に誰もいない距離、m）
   * @returns フリースペースの位置、見つからなければnull
   */
  private findFreeSpaceNearThrower(
    thrower: Character,
    searchRadius: number,
    clearanceRadius: number,
    safeMinX: number,
    safeMaxX: number,
    safeMinZ: number,
    safeMaxZ: number
  ): { x: number; z: number } | null {
    const throwerPos = thrower.getPosition();

    // 候補位置を生成（1mグリッドで探索）
    const candidates: { x: number; z: number; risk: number }[] = [];
    const step = 1.0; // 1mグリッド

    for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
      for (let dz = -searchRadius; dz <= searchRadius; dz += step) {
        const distance = Math.sqrt(dx * dx + dz * dz);
        // 最小距離（2m）と最大距離（searchRadius）のチェック
        if (distance < 2.0 || distance > searchRadius) {
          continue;
        }

        const candidateX = throwerPos.x + dx;
        const candidateZ = throwerPos.z + dz;

        // 安全な境界内かチェック
        if (candidateX < safeMinX || candidateX > safeMaxX ||
            candidateZ < safeMinZ || candidateZ > safeMaxZ) {
          continue;
        }

        const candidate = { x: candidateX, z: candidateZ };

        // 前後左右にクリアランス距離内に誰もいないかチェック
        if (!this.isFreeSpace(candidate, clearanceRadius)) {
          continue;
        }

        // チームメイトに近すぎないかチェック
        if (this.isTooCloseToTeammates(candidate)) {
          continue;
        }

        // パスレーンリスクを計算
        const risk = this.calculatePassLaneRisk(candidate, thrower);
        candidates.push({ x: candidateX, z: candidateZ, risk });
      }
    }

    // リスクが低い順にソート
    candidates.sort((a, b) => a.risk - b.risk);

    // 最もリスクが低い位置を返す
    if (candidates.length > 0) {
      return { x: candidates[0].x, z: candidates[0].z };
    }

    return null;
  }

  /**
   * 指定位置がフリースペースかどうかチェック
   * 前後左右のclearanceRadius以内に誰もいなければフリー
   */
  private isFreeSpace(position: { x: number; z: number }, clearanceRadius: number): boolean {
    for (const character of this.allCharacters) {
      if (character === this.character) continue;

      const charPos = character.getPosition();
      const dx = Math.abs(position.x - charPos.x);
      const dz = Math.abs(position.z - charPos.z);

      // 前後左右方向（X方向またはZ方向）で近すぎるかチェック
      // 斜め方向は許容（前後左右2マスのみチェック）
      if ((dx < clearanceRadius && dz < 1.0) || (dz < clearanceRadius && dx < 1.0)) {
        return false;
      }
    }
    return true;
  }

  /**
   * フォーメーション位置への移動処理（ヒートマップ方式）
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

    // 位置の再評価タイマーを更新
    this.positionReevaluateTimer += deltaTime;

    // 目標位置がないか、再評価間隔を超えた場合は新しい位置を選択
    const isAllyTeam = this.character.team === 'ally';
    if (!this.currentTargetPosition || this.positionReevaluateTimer >= this.positionReevaluateInterval) {
      this.selectNewTargetPosition(playerPosition, isAllyTeam);
      this.positionReevaluateTimer = 0;
    }

    if (!this.currentTargetPosition) {
      // 目標位置がない場合は待機
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

    // 目標位置に向かって移動
    if (onBallPlayer) {
      this.moveTowardsPosition(targetPosition, onBallPlayer, deltaTime);
    } else {
      this.moveTowardsPositionWithoutLookAt(targetPosition, deltaTime);
    }
  }

  /**
   * ヒートマップ方式で新しい目標位置を選択（パスレーンを考慮）
   */
  private selectNewTargetPosition(playerPosition: PlayerPosition, isAllyTeam: boolean): void {
    // まずヒートマップから基本位置を取得
    const heatmapResult = FormationUtils.getHeatmapTargetPosition(
      this.currentFormation,
      playerPosition,
      isAllyTeam,
      this.centerWeight
    );

    let basePosition: { x: number; z: number } | null = null;

    if (heatmapResult) {
      basePosition = { x: heatmapResult.x, z: heatmapResult.z };
    } else {
      // フォールバック: 通常の目標位置を使用
      const targetPos = FormationUtils.getTargetPosition(
        this.currentFormation,
        playerPosition,
        isAllyTeam
      );
      if (targetPos) {
        basePosition = targetPos;
      }
    }

    if (!basePosition) {
      this.currentTargetPosition = null;
      return;
    }

    // チームメイトに近すぎる場合は調整
    let adjustedBasePosition = basePosition;
    if (this.isTooCloseToTeammates(basePosition)) {
      const avoidedPosition = this.findPositionAvoidingTeammates(basePosition);
      if (avoidedPosition) {
        adjustedBasePosition = avoidedPosition;
      }
    }

    // オンボールプレイヤーを取得
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      // オンボールプレイヤーがいない場合は調整後の位置を使用
      this.currentTargetPosition = adjustedBasePosition;
      return;
    }

    // 基本位置でのパスレーンリスクを計算
    const baseRisk = this.calculatePassLaneRisk(adjustedBasePosition, onBallPlayer);

    // リスクが許容範囲内なら基本位置を使用
    if (baseRisk <= this.maxPassLaneRisk && !this.isTooCloseToTeammates(adjustedBasePosition)) {
      this.currentTargetPosition = adjustedBasePosition;
      return;
    }

    // リスクが高い場合は、周囲でより安全な位置を探す（チームメイトも避ける）
    const betterPosition = this.findSaferPositionAvoidingTeammates(adjustedBasePosition, onBallPlayer, baseRisk);
    this.currentTargetPosition = betterPosition || adjustedBasePosition;
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

    if (chestTrajectory) {
      const chestRiskAnalysis = this.interceptionAnalyzer.analyzeTrajectoryRisk(
        chestTrajectory,
        this.allCharacters,
        this.character.team
      );
      const chestRisk = chestRiskAnalysis.maxRisk?.probability ?? 0;
      minRisk = Math.min(minRisk, chestRisk);
    }

    if (bounceTrajectory) {
      const bounceRiskAnalysis = this.interceptionAnalyzer.analyzeTrajectoryRisk(
        bounceTrajectory,
        this.allCharacters,
        this.character.team
      );
      const bounceRisk = bounceRiskAnalysis.maxRisk?.probability ?? 0;
      minRisk = Math.min(minRisk, bounceRisk);
    }

    return minRisk;
  }

  /**
   * チームメイトを避けながら、より安全な位置を探す
   */
  private findSaferPositionAvoidingTeammates(
    basePosition: { x: number; z: number },
    onBallPlayer: Character,
    baseRisk: number
  ): { x: number; z: number } | null {
    const searchAngles = [0, 45, 90, 135, 180, 225, 270, 315]; // 8方向
    const searchDistances = [1.0, 1.5, 2.0, 2.5, 3.0]; // 探索距離（チームメイト回避のため範囲拡大）

    let bestPosition: { x: number; z: number } | null = null;
    let bestRisk = baseRisk;

    for (const distance of searchDistances) {
      for (const angleDeg of searchAngles) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const candidateX = basePosition.x + Math.cos(angleRad) * distance;
        const candidateZ = basePosition.z + Math.sin(angleRad) * distance;

        // コート境界チェック（外側マスを避ける）
        if (Math.abs(candidateX) > 6 || Math.abs(candidateZ) > 13.5) {
          continue;
        }

        const candidate = { x: candidateX, z: candidateZ };

        // チームメイトに近すぎる場合はスキップ
        if (this.isTooCloseToTeammates(candidate)) {
          continue;
        }

        const risk = this.calculatePassLaneRisk(candidate, onBallPlayer);

        // より安全で、許容範囲内ならその位置を採用
        if (risk < bestRisk && risk <= this.maxPassLaneRisk) {
          bestRisk = risk;
          bestPosition = candidate;
        }
      }

      // 許容範囲内で、チームメイトから離れた位置が見つかったら終了
      if (bestPosition && bestRisk <= this.maxPassLaneRisk && !this.isTooCloseToTeammates(bestPosition)) {
        break;
      }
    }

    return bestPosition;
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
        this.faceTowards(lookAtTarget);
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
      this.faceTowards(lookAtTarget);
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * リバウンドポジションへ移動（シュート時）
   * @param deltaTime 経過時間
   * @param isOffense オフェンス側かどうか
   */
  private handleReboundPosition(deltaTime: number, isOffense: boolean): void {
    // ボールの速度からシュートが打たれたゴールを判定
    const ballVelocity = this.ball.getVelocity();
    const isGoal1 = ballVelocity.z > 0; // +Z方向ならgoal1

    // シュートが打たれたゴールに向かう
    const targetGoal = isGoal1 ? this.field.getGoal1Rim() : this.field.getGoal2Rim();

    const goalPosition = targetGoal.position;
    const myPosition = this.character.getPosition();

    // リバウンドポジション（ゴールから2〜3m手前、少し左右にずらす）
    const zOffset = isGoal1 ? -2.5 : 2.5;
    // オフェンスとディフェンスで左右にずらす
    const xOffset = isOffense ? -1.0 : 1.0;

    const reboundPosition = new Vector3(
      goalPosition.x + xOffset,
      myPosition.y,
      goalPosition.z + zOffset
    );

    const distanceToRebound = Vector3.Distance(myPosition, reboundPosition);

    // リバウンドポジションに近い場合はボールを見て待機
    if (distanceToRebound < 0.5) {
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

    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    if (adjustedDirection) {
      // 移動方向を向く
      const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
      this.character.setRotation(angle);

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

  /**
   * チームメイトを避けた位置を見つける
   * @param basePosition 基本位置
   * @returns 調整後の位置、見つからなければnull
   */
  private findPositionAvoidingTeammates(basePosition: { x: number; z: number }): { x: number; z: number } | null {
    // まず基本位置が問題ないかチェック
    if (!this.isTooCloseToTeammates(basePosition)) {
      return basePosition;
    }

    // 8方向に探索
    const searchAngles = [0, 45, 90, 135, 180, 225, 270, 315];
    const searchDistances = [2.0, 3.0, 4.0]; // minTeammateDistance以上の距離で探索

    for (const distance of searchDistances) {
      for (const angleDeg of searchAngles) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const candidateX = basePosition.x + Math.cos(angleRad) * distance;
        const candidateZ = basePosition.z + Math.sin(angleRad) * distance;

        // コート境界チェック（外側マスを避ける）
        if (Math.abs(candidateX) > 6 || Math.abs(candidateZ) > 13.5) {
          continue;
        }

        const candidate = { x: candidateX, z: candidateZ };
        if (!this.isTooCloseToTeammates(candidate)) {
          return candidate;
        }
      }
    }

    return null; // 適切な位置が見つからない
  }
}
