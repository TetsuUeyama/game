import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";

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
  private diceRollInterval: number = 1000; // サイコロを振る間隔（ミリ秒）
  private oneononeResult: OneOnOneResult | null = null;
  private lastCollisionRedirectTime: number = 0;
  private collisionRedirectInterval: number = 300; // 方向転換の最小間隔（ミリ秒）

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
      console.log('[OneOnOneBattleController] 1on1バトル開始！');
      this.in1on1Battle = true;

      // 開始直後に即座にサイコロを振って移動開始
      this.perform1on1Battle();
      this.lastDiceRollTime = Date.now();
    }

    // 1on1状態から抜けた瞬間（true → false）
    if (this.was1on1 && !is1on1Now) {
      console.log('[OneOnOneBattleController] 1on1バトル終了');
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
      if (currentTime - this.lastDiceRollTime >= this.diceRollInterval) {
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
      if (currentTime - this.lastCollisionRedirectTime >= this.collisionRedirectInterval) {
        // 新しいランダム方向を設定
        const newDirection = this.getRandomDirection8();

        // オフェンス側の速度をdribblingspeedで調整
        const baseMoveSpeed = 3.0;
        let moveSpeed = baseMoveSpeed;
        const offenseData = onBallPlayer.playerData;
        if (offenseData && offenseData.stats.dribblingspeed !== undefined) {
          moveSpeed = baseMoveSpeed * (offenseData.stats.dribblingspeed / 100);
        }

        // フェイント判定
        const isFeint = this.checkFeint(onBallPlayer);

        if (isFeint) {
          // フェイント発動：オフェンスは動かないが、ディフェンスはフェイント方向に釣られる
          console.log(`[OneOnOneBattleController] 動き直しでフェイント発動！(衝突=${offenseCollided}, 接触=${circlesInContact})`);
          onBallPlayer.clearAIMovement(); // オフェンスは動かない

          // ディフェンスはフェイント方向に釣られて動く（動き直しなのでquicknessを使用）
          this.setDefenderFeintReaction(onBallDefender, newDirection, moveSpeed, true);
        } else {
          console.log(`[OneOnOneBattleController] 動き直し発生！(衝突=${offenseCollided}, 接触=${circlesInContact})`);

          // オフェンス側の動き直し遅延時間を計算（(100 - quickness) * 10 ミリ秒）
          const offensePlayerData = onBallPlayer.playerData;
          let offenseDelayMs = 1000; // デフォルト1秒

          if (offensePlayerData && offensePlayerData.stats.quickness !== undefined) {
            const quickness = offensePlayerData.stats.quickness;
            offenseDelayMs = Math.max(0, (100 - quickness) * 10);
            console.log(`[OneOnOneBattleController] オフェンス動き直し遅延: ${offenseDelayMs}ms (quickness=${quickness})`);
          } else {
            console.log(`[OneOnOneBattleController] オフェンスのquicknessデータなし、デフォルト遅延: ${offenseDelayMs}ms`);
          }

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

    // ボールが0番面の時、ランダムでドリブル突破を実行
    const currentFace = onBallPlayer.getCurrentBallFace();
    if (currentFace === 0) {
      const breakthroughChance = 0.3; // 30%の確率でドリブル突破
      if (Math.random() < breakthroughChance) {
        // 左右ランダムで突破方向を決定
        const direction = Math.random() < 0.5 ? 'left' : 'right';
        const success = onBallPlayer.startDribbleBreakthrough(direction);
        if (success) {
          onBallPlayer.clearAIMovement();
          console.log(`[OneOnOneBattleController] AIがドリブル突破を選択: ${direction}方向`);
          return; // 突破を開始したので通常処理をスキップ
        }
      }
    }

    // サイコロを振る（1〜6）
    const offenseDice = Math.floor(Math.random() * 6) + 1;
    const defenseDice = Math.floor(Math.random() * 6) + 1;

    // オフェンス側：ボール保持位置をランダムに変更
    onBallPlayer.randomizeBallPosition();

    // オフェンス側の行動をランダムに選択
    const offenseActionRoll = Math.random();
    const turnToGoalChance = 0.25; // 25%の確率でゴール方向を向く
    const shouldTurnToGoal = offenseActionRoll < turnToGoalChance;

    // オフェンス側：8方向のランダムな移動方向を取得
    const randomDirection = this.getRandomDirection8();
    const baseMoveSpeed = 3.0;

    // オフェンス側の速度をdribblingspeedで調整
    const offensePlayerData = onBallPlayer.playerData;
    let offenseMoveSpeed = baseMoveSpeed;
    if (offensePlayerData && offensePlayerData.stats.dribblingspeed !== undefined) {
      const dribblingSpeedMultiplier = offensePlayerData.stats.dribblingspeed / 100;
      offenseMoveSpeed = baseMoveSpeed * dribblingSpeedMultiplier;
      console.log(`[OneOnOneBattleController] オフェンス速度: ${offenseMoveSpeed.toFixed(2)} (dribblingspeed=${offensePlayerData.stats.dribblingspeed})`);
    }
    const moveSpeed = offenseMoveSpeed;

    // フェイント判定
    const isFeint = this.checkFeint(onBallPlayer);

    if (shouldTurnToGoal) {
      // ゴール方向を向く
      console.log('[OneOnOneBattleController] オフェンスがゴール方向を向く行動を選択');
      this.turnTowardsGoal(onBallPlayer);
      onBallPlayer.clearAIMovement();
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    } else if (isFeint) {
      // フェイント発動
      console.log('[OneOnOneBattleController] フェイント発動！オフェンスは動かずにディフェンスを釣る');
      onBallPlayer.clearAIMovement();
      this.setDefenderFeintReaction(onBallDefender, randomDirection, moveSpeed);
    } else {
      // 通常移動
      onBallPlayer.setAIMovement(randomDirection, moveSpeed, 0);
      this.setDefenderReaction(onBallPlayer, onBallDefender, randomDirection, moveSpeed);
    }

    console.log(`[OneOnOneBattleController] サイコロ結果: オフェンス=${offenseDice}, ディフェンス=${defenseDice}, フェイント=${isFeint}`);

    if (offenseDice > defenseDice) {
      console.log('[OneOnOneBattleController] オフェンス勝利！');
      this.oneononeResult = { winner: 'offense', offenseDice, defenseDice };
    } else if (defenseDice > offenseDice) {
      console.log('[OneOnOneBattleController] ディフェンス勝利！');
      this.oneononeResult = { winner: 'defense', offenseDice, defenseDice };
    } else {
      console.log('[OneOnOneBattleController] 引き分け！');
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

    // ディフェンダーの遅延時間を計算
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs = 1000;

    if (isRedirect) {
      if (defenderPlayerData && defenderPlayerData.stats.quickness !== undefined) {
        const quickness = defenderPlayerData.stats.quickness;
        reactionDelayMs = Math.max(0, (100 - quickness) * 10);
        console.log(`[OneOnOneBattleController] ディフェンダー動き直し遅延: ${reactionDelayMs}ms (quickness=${quickness})`);
      } else {
        console.log(`[OneOnOneBattleController] ディフェンダーのquicknessデータなし、デフォルト遅延: ${reactionDelayMs}ms`);
      }
    } else {
      if (defenderPlayerData && defenderPlayerData.stats.reflexes !== undefined) {
        const reflexes = defenderPlayerData.stats.reflexes;
        reactionDelayMs = Math.max(0, 1000 - reflexes);
        console.log(`[OneOnOneBattleController] ディフェンダー反応遅延: ${reactionDelayMs}ms (reflexes=${reflexes})`);
      } else {
        console.log(`[OneOnOneBattleController] ディフェンダーのreflexesデータなし、デフォルト遅延: ${reactionDelayMs}ms`);
      }
    }

    defender.setAIMovement(normalizedDirection, speed, reactionDelayMs);

    console.log(`[OneOnOneBattleController] ディフェンダー目標位置: (${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)}), 距離=${distanceToTarget.toFixed(2)}m`);
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
    const defenderPlayerData = defender.playerData;
    let reactionDelayMs = 1000;

    if (isRedirect) {
      if (defenderPlayerData && defenderPlayerData.stats.quickness !== undefined) {
        const quickness = defenderPlayerData.stats.quickness;
        reactionDelayMs = Math.max(0, (100 - quickness) * 10);
        console.log(`[OneOnOneBattleController] フェイント釣られ遅延: ${reactionDelayMs}ms (quickness=${quickness})`);
      }
    } else {
      if (defenderPlayerData && defenderPlayerData.stats.reflexes !== undefined) {
        const reflexes = defenderPlayerData.stats.reflexes;
        reactionDelayMs = Math.max(0, 1000 - reflexes);
        console.log(`[OneOnOneBattleController] フェイント釣られ遅延: ${reactionDelayMs}ms (reflexes=${reflexes})`);
      }
    }

    const moveDirection = feintDirection.clone().normalize();
    defender.setAIMovement(moveDirection, speed * 1.2, reactionDelayMs);

    console.log(`[OneOnOneBattleController] ディフェンダーがフェイントに釣られる！方向=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}), 速度=${speed * 1.2}`);
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
    console.log(`[OneOnOneBattleController] オフェンスがゴール方向（Z=${goalPosition.z}）を向いた`);
  }

  /**
   * フェイント判定
   */
  public checkFeint(offensePlayer: Character): boolean {
    const playerData = offensePlayer.playerData;
    let feintChance = 0.2;

    if (playerData && playerData.stats.technique !== undefined) {
      const technique = playerData.stats.technique;
      feintChance = technique / 200;
      console.log(`[OneOnOneBattleController] フェイント確率: ${(feintChance * 100).toFixed(1)}% (technique=${technique})`);
    }

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

      const offenseRadius = 1.0;
      const defenderRadius = onBallDefender.getFootCircleRadius();
      const minDistance = offenseRadius + defenderRadius;

      const is1on1 = distance <= minDistance;

      if (Date.now() % 1000 < 100) {
        console.log(`[OneOnOneBattleController] 1on1チェック: 距離=${distance.toFixed(2)}m, 最小距離=${minDistance.toFixed(2)}m, 1on1=${is1on1}`);
      }

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
   * ドリブル突破を実行
   */
  public performDribbleBreakthrough(direction: 'left' | 'right'): boolean {
    const onBallPlayer = this.findOnBallPlayer();

    if (!onBallPlayer) {
      console.log('[OneOnOneBattleController] ドリブル突破不可：オンボールプレイヤーがいません');
      return false;
    }

    const success = onBallPlayer.startDribbleBreakthrough(direction);

    if (success) {
      onBallPlayer.clearAIMovement();
      console.log(`[OneOnOneBattleController] ドリブル突破開始: ${direction}方向`);
    }

    return success;
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
            console.log('[OneOnOneBattleController] ドリブル突破後の衝突発生！押し返し計算を実行');

            const { selfPush, otherPush } = onBallPlayer.calculatePushback(onBallDefender);

            const newOffensePos = offensePos.add(selfPush);
            const newDefenderPos = defenderPos.add(otherPush);

            onBallPlayer.setPosition(newOffensePos);
            onBallDefender.setPosition(newDefenderPos);

            console.log(`[OneOnOneBattleController] 押し返し適用: オフェンス移動(${selfPush.x.toFixed(2)}, ${selfPush.z.toFixed(2)}), ディフェンス移動(${otherPush.x.toFixed(2)}, ${otherPush.z.toFixed(2)})`);
          } else {
            console.log('[OneOnOneBattleController] ドリブル突破成功！衝突なし');
          }
        }

        // 通常の1on1バトルを再開
        if (this.in1on1Battle && onBallPlayer && onBallDefender) {
          const newDirection = this.getRandomDirection8();

          const baseMoveSpeed = 3.0;
          let moveSpeed = baseMoveSpeed;
          const offenseData = onBallPlayer.playerData;
          if (offenseData && offenseData.stats.dribblingspeed !== undefined) {
            moveSpeed = baseMoveSpeed * (offenseData.stats.dribblingspeed / 100);
          }

          let offenseDelayMs = 1000;
          if (offenseData && offenseData.stats.quickness !== undefined) {
            offenseDelayMs = Math.max(0, (100 - offenseData.stats.quickness) * 10);
          }

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
