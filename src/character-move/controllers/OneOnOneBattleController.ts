import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { DRIBBLE_CONFIG, DribbleUtils } from "../config/DribbleConfig";
import { ONE_ON_ONE_BATTLE, DEFENSE_DISTANCE, DefenseUtils } from "../config/DefenseConfig";

/**
 * 1on1バトルの結果
 */
export interface OneOnOneResult {
  winner: 'offense' | 'defense';
  offenseDice: number;
  defenseDice: number;
}

/**
 * 1on1バトルを管理するコントローラー
 */
export class OneOnOneBattleController {
  // 1on1勝負の状態管理
  private was1on1: boolean = false;
  private in1on1Battle: boolean = false;
  private lastDiceRollTime: number = 0;
  // ONE_ON_ONE_BATTLE.DICE_ROLL_INTERVALを使用（DefenseConfigから）
  private oneononeResult: OneOnOneResult | null = null;
  private lastCollisionRedirectTime: number = 0;
  // ONE_ON_ONE_BATTLE.COLLISION_REDIRECT_INTERVALを使用（DefenseConfigから）

  // 外部参照
  private ball: Ball;
  private getAllCharacters: () => Character[];

  constructor(ball: Ball, getAllCharacters: () => Character[]) {
    this.ball = ball;
    this.getAllCharacters = getAllCharacters;
  }

  /**
   * 1on1バトルの状態をチェック（毎フレーム呼び出し）
   */
  public check1on1Battle(): void {
    const is1on1Now = this.is1on1State();

    // 1on1状態に突入した瞬間（false → true）
    if (!this.was1on1 && is1on1Now) {
            this.in1on1Battle = true;

      // 開始直後に即座にサイコロを振って移動開始
      this.perform1on1Battle();
      this.lastDiceRollTime = Date.now();
    }

    // 1on1状態から抜けた瞬間（true → false）
    if (this.was1on1 && !is1on1Now) {
            this.in1on1Battle = false;

      // AI移動をクリア
      const allCharacters = this.getAllCharacters();
      for (const char of allCharacters) {
        char.clearAIMovement();
      }
    }

    // 1on1バトル中は一定間隔でサイコロを振る
    if (this.in1on1Battle) {
      const currentTime = Date.now();
      if (currentTime - this.lastDiceRollTime >= ONE_ON_ONE_BATTLE.DICE_ROLL_INTERVAL) {
        this.perform1on1Battle();
        this.lastDiceRollTime = currentTime;
      }
    }

    this.was1on1 = is1on1Now;
  }

  /**
   * 1on1バトル中のAI移動を更新（毎フレーム呼び出し）
   * @param deltaTime フレーム時間（秒）
   */
  public update1on1Movement(deltaTime: number): void {
    if (!this.in1on1Battle) return;

    const allCharacters = this.getAllCharacters();

    // オンボールプレイヤーとディフェンダーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    // オフェンス側の移動を試行
    let offenseCollided = false;
    if (onBallPlayer) {
      offenseCollided = onBallPlayer.applyAIMovementWithCollision(deltaTime, allCharacters);
    }

    // ディフェンス側の移動を試行
    if (onBallDefender) {
      onBallDefender.applyAIMovementWithCollision(deltaTime, allCharacters);
    }

    // サークルが接触しているかチェック
    let circlesInContact = false;
    if (onBallPlayer && onBallDefender) {
      const distance = Vector3.Distance(
        new Vector3(onBallPlayer.getPosition().x, 0, onBallPlayer.getPosition().z),
        new Vector3(onBallDefender.getPosition().x, 0, onBallDefender.getPosition().z)
      );
      const contactDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();
      circlesInContact = distance <= contactDistance + 0.1; // 少し余裕を持たせる
    }

    // オフェンスが衝突した場合、またはサークルが接触している場合、動き直す
    if ((offenseCollided || circlesInContact) && onBallPlayer && onBallDefender) {
      const currentTime = Date.now();
      if (currentTime - this.lastCollisionRedirectTime >= ONE_ON_ONE_BATTLE.COLLISION_REDIRECT_INTERVAL) {
        // 新しいランダム方向を設定
        const newDirection = this.getRandomDirection8();

        // DribbleUtilsを使用してドリブル速度を計算
        const offenseData = onBallPlayer.playerData;
        const moveSpeed = DribbleUtils.calculateDribblingSpeed(offenseData?.stats.dribblingspeed);

        // フェイント判定
        const isFeint = this.checkFeint(onBallPlayer);

        if (isFeint) {
          // フェイント発動：オフェンスは動かないが、ディフェンスはフェイント方向に釣られる
          onBallPlayer.clearAIMovement(); // オフェンスは動かない

          // ディフェンスはフェイント方向に釣られて動く（動き直しなのでquicknessを使用）
          this.setDefenderFeintReaction(onBallDefender, newDirection, moveSpeed, true);
        } else {
          // DribbleUtilsを使用してオフェンス側の動き直し遅延時間を計算
          const offensePlayerData = onBallPlayer.playerData;
          const offenseDelayMs = DribbleUtils.calculateQuicknessDelay(offensePlayerData?.stats.quickness);

          onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);

          // ディフェンスもオフェンスとゴールの間に位置取る（動き直しなのでquicknessを使用）
          this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
        }

        // 最後に方向転換した時刻を更新
        this.lastCollisionRedirectTime = currentTime;
      }
    }

    // その他のキャラクターも移動
    for (const character of allCharacters) {
      if (character !== onBallPlayer && character !== onBallDefender) {
        character.applyAIMovementWithCollision(deltaTime, allCharacters);
      }
    }
  }

  /**
   * 1on1の勝負を実行（サイコロを振る）
   */
  private perform1on1Battle(): void {
    const allCharacters = this.getAllCharacters();

    // オンボールプレイヤーとディフェンダーを探す
    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (!onBallPlayer || !onBallDefender) {
      return;
    }

    // ドリブル突破中は何もしない
    if (onBallPlayer.isInDribbleBreakthrough()) {
      return;
    }

    // ボールが0番面の時、ランダムでドリブル突破を実行（ActionController経由）
    const currentFace = onBallPlayer.getCurrentBallFace();
    if (currentFace === 0 && DribbleUtils.shouldAIAttemptBreakthrough()) {
      // 左右ランダムで突破方向を決定
      const direction = Math.random() < 0.5 ? 'left' : 'right';
      const success = this.performDribbleBreakthrough(direction);
      if (success) {
        return; // 突破を開始したので通常処理をスキップ
      }
    }

    // サイコロを振る（1〜6）
    const offenseDice = Math.floor(Math.random() * 6) + 1;
    const defenseDice = Math.floor(Math.random() * 6) + 1;

    // オフェンス側：ボール保持位置をランダムに変更
    onBallPlayer.randomizeBallPosition();

    // オフェンス側の行動をランダムに選択（DefenseUtilsを使用）
    const shouldTurnToGoal = DefenseUtils.shouldTurnToGoal();

    // オフェンス側：8方向のランダムな移動方向を取得
    const randomDirection = this.getRandomDirection8();

    // DribbleUtilsを使用してオフェンス速度を計算
    const offensePlayerData = onBallPlayer.playerData;
    const moveSpeed = DribbleUtils.calculateDribblingSpeed(offensePlayerData?.stats.dribblingspeed);

    // フェイント判定
    const isFeint = this.checkFeint(onBallPlayer);

    if (shouldTurnToGoal) {
      // ゴール方向を向く
      this.turnTowardsGoal(onBallPlayer);
      onBallPlayer.clearAIMovement();
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    } else if (isFeint) {
      // フェイント発動
      onBallPlayer.clearAIMovement();
      this.setDefenderFeintReaction(onBallDefender, randomDirection, moveSpeed);
    } else {
      // 通常移動
      onBallPlayer.setAIMovement(randomDirection, moveSpeed, 0);
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    }

    if (offenseDice > defenseDice) {
      this.oneononeResult = { winner: 'offense', offenseDice, defenseDice };
    } else if (defenseDice > offenseDice) {
      this.oneononeResult = { winner: 'defense', offenseDice, defenseDice };
    } else {
      this.oneononeResult = null;
    }
  }

  /**
   * ディフェンダーの対応動作を設定
   */
  private setDefenderReaction(
    offense: Character,
    defender: Character,
    _offenseDirection: Vector3,
    speed: number,
    isRedirect: boolean = false
  ): void {
    const offensePos = offense.getPosition();
    const defenderPos = defender.getPosition();

    // 守るゴールの位置を決定
    const goalZ = defender.team === "ally" ? -25 : 25;
    const goalPosition = new Vector3(0, 0, goalZ);

    // オフェンス→ゴールの方向ベクトルを計算
    const offenseToGoal = goalPosition.subtract(offensePos);
    offenseToGoal.y = 0;
    const distanceToGoal = offenseToGoal.length();

    if (distanceToGoal < 0.1) {
      return;
    }

    const directionToGoal = offenseToGoal.normalize();

    // 目標位置を計算：オフェンスからゴール方向に、サークルが接触する距離
    const offenseRadius = offense.getFootCircleRadius();
    const defenderRadius = defender.getFootCircleRadius();
    const contactDistance = offenseRadius + defenderRadius;

    const targetPosition = offensePos.add(directionToGoal.scale(contactDistance));

    // ディフェンダーの向きを設定
    const directionToOffense = offensePos.subtract(targetPosition);
    directionToOffense.y = 0;

    if (directionToOffense.length() > 0.01) {
      const targetRotation = Math.atan2(directionToOffense.x, directionToOffense.z);
      defender.setRotation(targetRotation);
    }

    // 現在位置から目標位置への移動方向を計算
    const moveDirection = targetPosition.subtract(defenderPos);
    moveDirection.y = 0;

    const distanceToTarget = moveDirection.length();

    if (distanceToTarget < 0.05) {
      defender.clearAIMovement();
      return;
    }

    const normalizedDirection = moveDirection.normalize();

    // DribbleUtilsを使用してディフェンダーの遅延時間を計算
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs: number;

    if (isRedirect) {
      reactionDelayMs = DribbleUtils.calculateQuicknessDelay(defenderPlayerData?.stats.quickness);
    } else {
      reactionDelayMs = DribbleUtils.calculateReflexesDelay(defenderPlayerData?.stats.reflexes);
    }

    defender.setAIMovement(normalizedDirection, speed, reactionDelayMs);
  }

  /**
   * フェイント時のディフェンダー反応
   */
  private setDefenderFeintReaction(
    defender: Character,
    feintDirection: Vector3,
    speed: number,
    isRedirect: boolean = false
  ): void {
    // DribbleUtilsを使用して遅延時間を計算
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs: number;

    if (isRedirect) {
      reactionDelayMs = DribbleUtils.calculateQuicknessDelay(defenderPlayerData?.stats.quickness);
    } else {
      reactionDelayMs = DribbleUtils.calculateReflexesDelay(defenderPlayerData?.stats.reflexes);
    }

    const moveDirection = feintDirection.clone().normalize();
    const feintSpeed = speed * DRIBBLE_CONFIG.FEINT_SPEED_MULTIPLIER;
    defender.setAIMovement(moveDirection, feintSpeed, reactionDelayMs);
  }

  /**
   * 8方向のランダムな方向ベクトルを取得
   */
  public getRandomDirection8(): Vector3 {
    const directionIndex = Math.floor(Math.random() * 8);
    const angle = (directionIndex * Math.PI) / 4;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    return new Vector3(x, 0, z).normalize();
  }

  /**
   * オフェンス側が攻めるゴールの位置を取得
   */
  public getTargetGoalPosition(offensePlayer: Character): Vector3 {
    const goalZ = offensePlayer.team === "ally" ? 25 : -25;
    return new Vector3(0, 0, goalZ);
  }

  /**
   * オフェンスプレイヤーをゴール方向に向かせる
   */
  private turnTowardsGoal(offensePlayer: Character): void {
    const goalPosition = this.getTargetGoalPosition(offensePlayer);
    offensePlayer.lookAt(goalPosition);
  }

  /**
   * フェイント判定
   */
  public checkFeint(offensePlayer: Character): boolean {
    const playerData = offensePlayer.playerData;
    // DribbleUtilsを使用してフェイント確率を計算
    const feintChance = DribbleUtils.calculateFeintChance(playerData?.stats.technique);
    const roll = Math.random();
    return roll < feintChance;
  }

  /**
   * 1on1状態かどうかを判定
   */
  public is1on1State(): boolean {
    const allCharacters = this.getAllCharacters();

    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (onBallPlayer && onBallDefender) {
      const distance = Vector3.Distance(
        onBallPlayer.getPosition(),
        onBallDefender.getPosition()
      );

      // DefenseUtilsを使用して1on1状態を判定
      const defenderRadius = onBallDefender.getFootCircleRadius();
      const is1on1 = DefenseUtils.is1on1State(distance, DEFENSE_DISTANCE.OFFENSE_CIRCLE_RADIUS, defenderRadius);

      return is1on1;
    }

    return false;
  }

  /**
   * 1on1勝負の結果を取得
   */
  public get1on1Result(): OneOnOneResult | null {
    return this.oneononeResult;
  }

  /**
   * 1on1勝負の結果をクリア
   */
  public clear1on1Result(): void {
    this.oneononeResult = null;
  }

  /**
   * 現在のディフェンダーのサークル半径を取得
   */
  public getDefenderCircleRadius(): number {
    const onBallDefender = this.findOnBallDefender();
    if (onBallDefender) {
      return onBallDefender.getFootCircleRadius();
    }
    return 1.0;
  }

  /**
   * 1on1バトル中かどうかを取得
   */
  public isIn1on1Battle(): boolean {
    return this.in1on1Battle;
  }

  /**
   * 無力化されたディフェンダーかチェック
   */
  public isDefeatedDefender(_character: Character): boolean {
    return false;
  }

  /**
   * オンボールディフェンダーを探す
   */
  public findOnBallDefender(): Character | null {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_DEFENDER") {
        return char;
      }
    }
    return null;
  }

  /**
   * オンボールプレイヤーを探す
   */
  public findOnBallPlayer(): Character | null {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        return char;
      }
    }
    return null;
  }

  /**
   * ドリブル突破を実行（ActionController経由）
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    const onBallPlayer = this.findOnBallPlayer();

    if (!onBallPlayer) {
      return false;
    }

    // ActionControllerでドリブル突破アクションを開始
    const actionController = onBallPlayer.getActionController();
    const actionResult = actionController.startAction('dribble_breakthrough');

    if (!actionResult.success) {
      return false;
    }

    // activeフェーズに入ったら実際のドリブル突破移動を開始するコールバックを設定
    actionController.setCallbacks({
      onActive: (action) => {
        if (action === 'dribble_breakthrough') {
          // 実際のドリブル突破移動を開始
          const success = onBallPlayer.startDribbleBreakthrough(direction);
          if (success) {
            onBallPlayer.clearAIMovement();
          }
        }
      },
      onComplete: (_action) => {
        // ドリブル突破完了
      },
    });

    return true;
  }

  /**
   * ドリブル突破中の更新処理
   */
  public updateDribbleBreakthrough(deltaTime: number): void {
    const allCharacters = this.getAllCharacters();

    let onBallPlayer: Character | null = null;
    let onBallDefender: Character | null = null;

    for (const char of allCharacters) {
      const state = char.getState();
      if (state === "ON_BALL_PLAYER") {
        onBallPlayer = char;
      } else if (state === "ON_BALL_DEFENDER") {
        onBallDefender = char;
      }
    }

    if (onBallPlayer && onBallPlayer.isInDribbleBreakthrough()) {
      const breakthroughEnded = onBallPlayer.applyBreakthroughMovement(deltaTime);

      if (breakthroughEnded) {
        onBallPlayer.endDribbleBreakthrough();

        // 衝突判定を行い、衝突している場合はpowerによる押し返しを計算
        if (onBallDefender) {
          const offensePos = onBallPlayer.getPosition();
          const defenderPos = onBallDefender.getPosition();
          const distance = Vector3.Distance(
            new Vector3(offensePos.x, 0, offensePos.z),
            new Vector3(defenderPos.x, 0, defenderPos.z)
          );

          const minDistance = onBallPlayer.getFootCircleRadius() + onBallDefender.getFootCircleRadius();

          if (distance < minDistance) {
            const { selfPush, otherPush } = onBallPlayer.calculatePushback(onBallDefender);

            const newOffensePos = offensePos.add(selfPush);
            const newDefenderPos = defenderPos.add(otherPush);

            onBallPlayer.setPosition(newOffensePos);
            onBallDefender.setPosition(newDefenderPos);
          }
        }

        // 通常の1on1バトルを再開
        if (this.in1on1Battle && onBallPlayer && onBallDefender) {
          const newDirection = this.getRandomDirection8();

          // DribbleUtilsを使用して速度と遅延を計算
          const offenseData = onBallPlayer.playerData;
          const moveSpeed = DribbleUtils.calculateDribblingSpeed(offenseData?.stats.dribblingspeed);
          const offenseDelayMs = DribbleUtils.calculateQuicknessDelay(offenseData?.stats.quickness);

          onBallPlayer.setAIMovement(newDirection, moveSpeed, offenseDelayMs);
          this.setDefenderReaction(onBallPlayer, onBallDefender, newDirection, moveSpeed, true);
        }
      }
    }
  }

  /**
   * ドリブル突破可能かどうかをチェック
   */
  public canPerformDribbleBreakthrough(): boolean {
    const allCharacters = this.getAllCharacters();
    for (const char of allCharacters) {
      if (char.getState() === "ON_BALL_PLAYER") {
        return char.getCurrentBallFace() === 0 && !char.isInDribbleBreakthrough();
      }
    }
    return false;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 特に破棄するリソースはない
  }
}
