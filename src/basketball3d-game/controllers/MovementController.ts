import {Vector3} from "@babylonjs/core";
import {Player} from "../entities/Player";
import {COURT_CONFIG, PLAYER_CONFIG} from "../config/gameConfig";

/**
 * 揺さぶり（クロスオーバー）の状態
 */
interface CrossoverState {
  isActive: boolean; // クロスオーバー実行中か
  direction: "left" | "right"; // 移動方向
  timeRemaining: number; // 残り時間（秒）
  cooldown: number; // クールダウン（秒）
}

/**
 * プレイヤーの移動を管理するコントローラー
 */
export class MovementController {
  private player1: Player;
  private player2: Player;
  private player2Enabled: boolean;

  // 揺さぶり（クロスオーバー）の状態管理
  private crossoverState: Map<number, CrossoverState> = new Map();

  // クロスオーバーのパラメータ
  private readonly crossoverDuration: number = 0.4; // クロスオーバーの持続時間（秒）
  private readonly crossoverCooldown: number = 1.5; // クロスオーバーのクールダウン（秒）
  private readonly crossoverChancePerSecond: number = 0.5; // クロスオーバーの発動確率（毎秒）
  private readonly crossoverMinDistance: number = 2.0; // クロスオーバーを使う最小距離（m）
  private readonly crossoverMaxDistance: number = 5.0; // クロスオーバーを使う最大距離（m）

  constructor(player1: Player, player2: Player, player2Enabled: boolean) {
    this.player1 = player1;
    this.player2 = player2;
    this.player2Enabled = player2Enabled;

    // 各プレイヤーのクロスオーバー状態を初期化
    this.crossoverState.set(player1.id, {
      isActive: false,
      direction: "left",
      timeRemaining: 0,
      cooldown: 0,
    });
    this.crossoverState.set(player2.id, {
      isActive: false,
      direction: "left",
      timeRemaining: 0,
      cooldown: 0,
    });
  }

  /**
   * Player2有効/無効を設定
   */
  setPlayer2Enabled(enabled: boolean): void {
    this.player2Enabled = enabled;
  }

  /**
   * リムの中心位置（XZ平面）を取得
   */
  getRimCenterZ(side: "player1" | "player2"): number {
    const backboardZ = side === "player1" ? -COURT_CONFIG.length / 2 + COURT_CONFIG.backboardDistance : COURT_CONFIG.length / 2 - COURT_CONFIG.backboardDistance;
    const rimCenterZ = side === "player1" ? backboardZ + COURT_CONFIG.rimOffset : backboardZ - COURT_CONFIG.rimOffset;
    return rimCenterZ;
  }

  /**
   * ディフェンスの最適な位置を計算
   */
  calculateDefensePosition(offensePosition: Vector3, goalZ: number): Vector3 {
    // ゴールの位置（リムリング中心）
    const goalPosition = new Vector3(0, 0.95, goalZ);

    // オフェンスからゴールへの方向ベクトル
    const offenseToGoal = goalPosition.subtract(offensePosition);
    const horizontalDistance = Math.sqrt(offenseToGoal.x * offenseToGoal.x + offenseToGoal.z * offenseToGoal.z);

    // オフェンスとゴールの間に位置取る
    const defenseDistance = horizontalDistance * PLAYER_CONFIG.defenseBias;

    // 距離の制限を適用
    const clampedDistance = Math.max(PLAYER_CONFIG.defenseMinDistance, Math.min(PLAYER_CONFIG.defenseMaxDistance, defenseDistance));

    // オフェンスからゴールへの方向を正規化
    const directionX = offenseToGoal.x / horizontalDistance;
    const directionZ = offenseToGoal.z / horizontalDistance;

    // ディフェンスの位置を計算
    const defensePosition = new Vector3(
      offensePosition.x + directionX * clampedDistance,
      0.95,
      offensePosition.z + directionZ * clampedDistance,
    );

    return defensePosition;
  }

  /**
   * クロスオーバーの状態を更新
   */
  private updateCrossoverState(playerId: number, deltaTime: number): void {
    const state = this.crossoverState.get(playerId);
    if (!state) return;

    // クールダウンを減らす
    if (state.cooldown > 0) {
      state.cooldown -= deltaTime;
    }

    // クロスオーバー実行中の時間を減らす
    if (state.isActive) {
      state.timeRemaining -= deltaTime;
      if (state.timeRemaining <= 0) {
        state.isActive = false;
      }
    }
  }

  /**
   * クロスオーバーを開始できるか判定
   */
  private canStartCrossover(
    offensePlayer: Player,
    defensePlayer: Player,
    distanceToDefender: number,
    deltaTime: number
  ): boolean {
    const state = this.crossoverState.get(offensePlayer.id);
    if (!state) return false;

    // クロスオーバー実行中またはクールダウン中は開始できない
    if (state.isActive || state.cooldown > 0) {
      return false;
    }

    // ディフェンダーが適切な距離範囲にいる場合のみ
    if (distanceToDefender < this.crossoverMinDistance || distanceToDefender > this.crossoverMaxDistance) {
      return false;
    }

    // 確率判定（フレームレートに依存しないように調整）
    const chanceThisFrame = this.crossoverChancePerSecond * deltaTime;
    return Math.random() < chanceThisFrame;
  }

  /**
   * クロスオーバーの方向を決定
   */
  private decideCrossoverDirection(offensePlayer: Player, defensePlayer: Player): "left" | "right" {
    const offensePos = offensePlayer.getPosition();
    const defensePos = defensePlayer.getPosition();

    // オフェンスの向きに対するディフェンスの位置を計算
    const toDefender = defensePos.subtract(offensePos);
    const playerDirection = offensePlayer.direction;

    // プレイヤーの左方向ベクトル
    const leftX = -Math.cos(playerDirection);
    const leftZ = Math.sin(playerDirection);

    // ディフェンダーがプレイヤーの左右どちら側にいるか
    const sideValue = toDefender.x * leftX + toDefender.z * leftZ;

    // ディフェンダーと逆方向にフェイクを仕掛ける（たまにランダム）
    if (Math.random() < 0.2) {
      // 20%の確率でランダム
      return Math.random() < 0.5 ? "left" : "right";
    } else {
      // 80%の確率でディフェンダーと逆方向
      return sideValue > 0 ? "right" : "left";
    }
  }

  /**
   * オフェンスプレイヤーの移動を更新
   */
  updateOffenseMovement(
    offensePlayer: Player,
    defensePlayer: Player | null,
    goalZ: number,
    deltaTime: number,
    isLayupInProgress: boolean
  ): void {
    if (isLayupInProgress) {
      // レイアップジャンプ中は移動しない
      return;
    }

    // クロスオーバー状態を更新
    this.updateCrossoverState(offensePlayer.id, deltaTime);

    const state = this.crossoverState.get(offensePlayer.id);

    // クロスオーバー実行中は左右移動を優先
    if (state?.isActive) {
      offensePlayer.moveSideways(state.direction, deltaTime);
      return;
    }

    // ディフェンダーとの距離を確認
    let shouldMoveToGoal = true;
    const canSeeOpponent = defensePlayer && offensePlayer.canSeePlayer(defensePlayer);

    if (canSeeOpponent && defensePlayer) {
      const offensePos = offensePlayer.getPosition();
      const defensePos = defensePlayer.getPosition();
      const distanceToDefender = Vector3.Distance(offensePos, defensePos);

      // クロスオーバーを開始できるか判定
      if (this.canStartCrossover(offensePlayer, defensePlayer, distanceToDefender, deltaTime) && state) {
        state.isActive = true;
        state.direction = this.decideCrossoverDirection(offensePlayer, defensePlayer);
        state.timeRemaining = this.crossoverDuration;
        state.cooldown = this.crossoverCooldown;
        console.log(
          `[Crossover] Player ${offensePlayer.id} starts crossover to ${state.direction} (distance: ${distanceToDefender.toFixed(2)}m)`
        );
        // クロスオーバー開始（次のフレームで実行される）
        return;
      }

      // ディフェンダーが近すぎる場合は動きを制限
      if (distanceToDefender < PLAYER_CONFIG.offenseStopDistanceToDefender) {
        // 最小距離以上は保つ
        if (distanceToDefender < PLAYER_CONFIG.offenseMinDistanceToDefender) {
          // 最小距離より近い場合は、ディフェンダーから離れる
          const awayDirection = offensePos.subtract(defensePos);
          awayDirection.y = 0;
          awayDirection.normalize();
          const awayPosition = offensePos.add(awayDirection.scale(0.5));
          offensePlayer.moveTowards(awayPosition, deltaTime);
          shouldMoveToGoal = false;
        } else {
          // 最小距離以上、停止距離以下の場合は移動を止める
          shouldMoveToGoal = false;
        }
      }
    }

    // ゴールへの移動（ディフェンダーが遠い、または視野外の場合）
    if (shouldMoveToGoal) {
      // ゴールから0.5m手前を目標にする
      const goalOffsetZ = offensePlayer.id === 1 ? -0.5 : 0.5;
      const goalPosition = new Vector3(0, 0.95, goalZ + goalOffsetZ);
      offensePlayer.moveTowards(goalPosition, deltaTime);
    }
  }

  // ディフェンスアクションの状態管理
  private player1DefenseAction: 'retreat' | 'stay' | 'steal' = 'retreat';
  private player2DefenseAction: 'retreat' | 'stay' | 'steal' = 'retreat';
  private player1ActionTimer: number = 0;
  private player2ActionTimer: number = 0;
  private readonly ACTION_DURATION = 1.5; // アクションを維持する時間（秒）

  /**
   * ディフェンダーが相手とゴールの間にいるかチェック
   * @returns true: 間にいる、false: 間にいない
   */
  private isDefenderBetweenOffenseAndGoal(defensePosition: Vector3, offensePosition: Vector3, goalZ: number): boolean {
    // ゴールの位置（XZ平面）
    const goalPosition = new Vector3(0, 0, goalZ);

    // オフェンスからゴールへの方向ベクトル（正規化）
    const offenseToGoal = goalPosition.subtract(offensePosition);
    offenseToGoal.y = 0; // Y軸無視
    const distanceOffenseToGoal = Math.sqrt(offenseToGoal.x * offenseToGoal.x + offenseToGoal.z * offenseToGoal.z);

    if (distanceOffenseToGoal < 0.1) {
      // オフェンスがすでにゴール上にいる場合
      return true;
    }

    const directionToGoal = offenseToGoal.normalize();

    // オフェンスからディフェンスへのベクトル
    const offenseToDefense = defensePosition.subtract(offensePosition);
    offenseToDefense.y = 0;

    // オフェンスからディフェンスへのベクトルを、ゴール方向に射影
    const projectionLength = Vector3.Dot(offenseToDefense, directionToGoal);

    // 射影の長さが0以上かつオフェンス-ゴール距離以下なら「間にいる」
    // さらに、横方向のずれが小さいかチェック（±1.5m以内）
    const lateralDistance = Math.sqrt(
      offenseToDefense.lengthSquared() - projectionLength * projectionLength
    );

    return projectionLength > 0 && projectionLength < distanceOffenseToGoal && lateralDistance < 1.5;
  }

  /**
   * ディフェンスプレイヤーの移動を更新
   */
  updateDefenseMovement(defensePlayer: Player, offensePlayer: Player, goalZ: number, deltaTime: number): void {
    const offensePosition = offensePlayer.getPosition();
    const defensePosition = defensePlayer.getPosition();
    const distanceToOffense = Vector3.Distance(defensePosition, offensePosition);

    // アクションタイマーを更新
    if (defensePlayer.id === 1) {
      this.player1ActionTimer += deltaTime;
    } else {
      this.player2ActionTimer += deltaTime;
    }

    // 視野内に相手がいるかチェック
    const canSeeOpponent = defensePlayer.canSeePlayer(offensePlayer);

    // ディフェンダーが相手とゴールの間にいるかチェック
    const isBetween = this.isDefenderBetweenOffenseAndGoal(defensePosition, offensePosition, goalZ);

    // 間にいない場合は、ダッシュを使って全力で間に入る
    if (!isBetween) {
      const optimalDefensePosition = this.calculateDefensePosition(offensePosition, goalZ);

      // ダッシュを開始（クールダウン中でなければ）
      if (!defensePlayer.isDashing()) {
        const dashStarted = defensePlayer.startDash();
        if (dashStarted) {
          console.log(`[DEFENSE] Player ${defensePlayer.id} DASHING to get between offense and goal!`);
        }
      }

      // 最適なディフェンス位置に向かって移動
      defensePlayer.moveTowards(optimalDefensePosition, deltaTime);

      // 視野に相手がいない場合は、相手の方向を向く
      if (!canSeeOpponent) {
        const directionToOpponent = Math.atan2(
          offensePosition.x - defensePosition.x,
          offensePosition.z - defensePosition.z
        );
        defensePlayer.setDirection(directionToOpponent);
      }
      return;
    }

    // 間にいる場合は、距離に応じて通常のディフェンス動作
    // 3m以上離れている場合
    if (distanceToOffense >= 3.0) {
      const optimalDefensePosition = this.calculateDefensePosition(offensePosition, goalZ);
      // 視野に相手がいなくても、相手の位置に向かって移動する
      defensePlayer.moveTowards(optimalDefensePosition, deltaTime);
      // 視野に相手がいない場合は、相手の方向を向く
      if (!canSeeOpponent) {
        const directionToOpponent = Math.atan2(
          offensePosition.x - defensePosition.x,
          offensePosition.z - defensePosition.z
        );
        defensePlayer.setDirection(directionToOpponent);
      }
      return;
    }

    // 3m以内：アクションを選択（一定時間ごと）
    const actionTimer = defensePlayer.id === 1 ? this.player1ActionTimer : this.player2ActionTimer;

    if (actionTimer >= this.ACTION_DURATION) {
      // 新しいアクションをランダムに選択
      const rand = Math.random();
      let newAction: 'retreat' | 'stay' | 'steal';

      if (rand < 0.33) {
        newAction = 'retreat'; // 下がる（33%）
      } else if (rand < 0.66) {
        newAction = 'stay'; // とどまる（33%）
      } else {
        newAction = 'steal'; // スティール（34%）
      }

      if (defensePlayer.id === 1) {
        this.player1DefenseAction = newAction;
        this.player1ActionTimer = 0;
      } else {
        this.player2DefenseAction = newAction;
        this.player2ActionTimer = 0;
      }
    }

    // 選択されたアクションを実行
    const currentAction = defensePlayer.id === 1 ? this.player1DefenseAction : this.player2DefenseAction;

    // 視野に相手がいない場合は、相手の方向を向いて近づく
    if (!canSeeOpponent) {
      const directionToOpponent = Math.atan2(
        offensePosition.x - defensePosition.x,
        offensePosition.z - defensePosition.z
      );
      defensePlayer.setDirection(directionToOpponent);
      // 相手の位置に向かって移動
      const optimalDefensePosition = this.calculateDefensePosition(offensePosition, goalZ);
      defensePlayer.moveTowards(optimalDefensePosition, deltaTime);
      return;
    }

    switch (currentAction) {
      case 'retreat':
        // 下がる：相手から離れる方向に移動
        const retreatDirection = defensePosition.subtract(offensePosition).normalize();
        const retreatTarget = new Vector3(
          defensePosition.x + retreatDirection.x * 1.0,
          defensePosition.y,
          defensePosition.z + retreatDirection.z * 1.0
        );
        defensePlayer.moveTowards(retreatTarget, deltaTime);
        break;

      case 'stay':
        // とどまる：移動しない（何もしない）
        break;

      case 'steal':
        // スティール：相手のドリブル位置を狙う
        if (offensePlayer.isDribbling) {
          const offenseDirection = offensePlayer.direction;
          const forwardX = Math.sin(offenseDirection);
          const forwardZ = Math.cos(offenseDirection);
          const stealTarget = new Vector3(
            offensePosition.x + forwardX * 0.5,
            offensePosition.y,
            offensePosition.z + forwardZ * 0.5
          );
          defensePlayer.moveTowards(stealTarget, deltaTime);
        } else {
          // ドリブル中でない場合は通常のディフェンス位置
          const optimalDefensePosition = this.calculateDefensePosition(offensePosition, goalZ);
          defensePlayer.moveTowards(optimalDefensePosition, deltaTime);
        }
        break;
    }
  }

  /**
   * プレイヤーの向き（視線）を更新
   */
  updatePlayerOrientation(player: Player, goalZ: number, canSeeOpponent: boolean): void {
    // 相手が視野内にいない場合はゴール方向を向く（上下も含めて）
    if (!canSeeOpponent) {
      // リムリング中心の位置
      const rimPosition = new Vector3(0, COURT_CONFIG.rimHeight, goalZ);

      // プレイヤーの目の位置（顔の高さ）を計算
      const playerPos = player.getPosition();
      const eyeHeightOffset = PLAYER_CONFIG.height / 2 - 0.2;
      const eyePosition = new Vector3(playerPos.x, playerPos.y + eyeHeightOffset, playerPos.z);

      // 目の位置からリムリング中心への方向ベクトル
      const toRim = rimPosition.subtract(eyePosition);

      // 水平方向の角度（Y軸周り）
      const angleToRimY = Math.atan2(toRim.x, toRim.z);
      player.setDirection(angleToRimY);

      // 上下方向の角度（X軸周り、ピッチ）- 首だけを傾ける
      const horizontalDistance = Math.sqrt(toRim.x * toRim.x + toRim.z * toRim.z);
      const angleToRimX = Math.atan2(toRim.y, horizontalDistance);
      player.neckMesh.rotation.x = -angleToRimX;
    } else {
      // 相手が視野内にいる場合は首を水平に戻す
      player.neckMesh.rotation.x = 0;
    }
  }

  /**
   * フリーボールへの移動を更新
   */
  updateMoveToFreeBall(player: Player, ballPosition: Vector3, shootCooldown: number, deltaTime: number): void {
    // シュートクールダウン中は移動しない
    if (shootCooldown > 0) {
      return;
    }

    // ボールの方向を向く
    const playerPosition = player.getPosition();
    const toBall = ballPosition.subtract(playerPosition);
    const angleToBALL = Math.atan2(toBall.x, toBall.z);
    player.setDirection(angleToBALL);

    // ボールの位置は常に把握しているため、視野判定なしで移動
    player.moveTowards(ballPosition, deltaTime);
  }
}
