import {Vector3} from "@babylonjs/core";
import {Player, HandPose} from "../entities/Player";
import {Ball} from "../entities/Ball";
import {COURT_CONFIG, BALL_CONFIG, PLAYER_CONFIG} from "../config/gameConfig";
import {calculateFumbleChance} from "../entities/PlayerStats";

/**
 * 衝突判定を管理するコントローラー
 */
export class CollisionHandler {
  private ball: Ball;
  private player1: Player;
  private player2: Player;
  private player2Enabled: boolean;

  // リム判定用
  private ballPreviousY: number = 0;

  // 接触クールダウン管理（連続接触を防ぐ）
  private lastContactTime: Map<number, number> = new Map(); // プレイヤーID -> 最後の接触時刻

  // コールバック関数
  private onGoalScored?: (goalOwner: number) => void;
  private onBallPickedUp?: (playerId: number) => void;

  constructor(
    ball: Ball,
    player1: Player,
    player2: Player,
    player2Enabled: boolean,
    onGoalScored?: (goalOwner: number) => void,
    onBallPickedUp?: (playerId: number) => void
  ) {
    this.ball = ball;
    this.player1 = player1;
    this.player2 = player2;
    this.player2Enabled = player2Enabled;
    this.onGoalScored = onGoalScored;
    this.onBallPickedUp = onBallPickedUp;
    this.ballPreviousY = ball.getPosition().y;

    // 接触時刻の初期化
    this.lastContactTime.set(player1.id, -1);
    this.lastContactTime.set(player2.id, -1);
  }

  /**
   * Player2有効/無効を設定
   */
  setPlayer2Enabled(enabled: boolean): void {
    this.player2Enabled = enabled;
  }

  /**
   * ボールの前フレームY座標を更新
   */
  updateBallPreviousY(): void {
    this.ballPreviousY = this.ball.getPosition().y;
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
   * プレイヤーがコートの境界内に収まるように位置を制限
   */
  constrainPlayerToBounds(player: Player): void {
    const position = player.getPosition();
    const radius = PLAYER_CONFIG.radius;
    const height = PLAYER_CONFIG.height;

    // 壁の境界
    const minX = -COURT_CONFIG.width / 2 + radius;
    const maxX = COURT_CONFIG.width / 2 - radius;
    const minZ = -COURT_CONFIG.length / 2 + radius;
    const maxZ = COURT_CONFIG.length / 2 - radius;

    // 地面の高さ（プレイヤーの中心Y座標）
    const groundY = height / 2;

    // 天井の高さ（将来のジャンプ機能用）
    const ceilingHeight = COURT_CONFIG.rimHeight + 10;
    const maxY = ceilingHeight - height / 2;

    // 位置を境界内に制限
    const clampedPosition = new Vector3(
      Math.max(minX, Math.min(maxX, position.x)),
      Math.max(groundY, Math.min(maxY, position.y)),
      Math.max(minZ, Math.min(maxZ, position.z)),
    );

    // 位置が変わった場合のみ更新
    if (!position.equals(clampedPosition)) {
      player.setPosition(clampedPosition);
    }
  }

  /**
   * ボールがコートの境界とバウンドする処理
   */
  constrainBallToBounds(): void {
    const position = this.ball.getPosition();
    const velocity = this.ball.getVelocity();
    const radius = BALL_CONFIG.radius;

    // 壁の境界
    const minX = -COURT_CONFIG.width / 2 + radius;
    const maxX = COURT_CONFIG.width / 2 - radius;
    const minZ = -COURT_CONFIG.length / 2 + radius;
    const maxZ = COURT_CONFIG.length / 2 - radius;

    // 天井の高さ（Court.tsと同じ値）
    const ceilingHeight = COURT_CONFIG.rimHeight + 10;
    const maxY = ceilingHeight - radius;

    const newVelocity = velocity.clone();
    let didBounce = false;

    // X軸の壁との衝突（左右の壁）
    if (position.x <= minX && velocity.x < 0) {
      newVelocity.x = -velocity.x * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(minX, position.y, position.z));
      didBounce = true;
    } else if (position.x >= maxX && velocity.x > 0) {
      newVelocity.x = -velocity.x * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(maxX, position.y, position.z));
      didBounce = true;
    }

    // Z軸の壁との衝突（前後の壁）
    if (position.z <= minZ && velocity.z < 0) {
      newVelocity.z = -velocity.z * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, position.y, minZ));
      didBounce = true;
    } else if (position.z >= maxZ && velocity.z > 0) {
      newVelocity.z = -velocity.z * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, position.y, maxZ));
      didBounce = true;
    }

    // 天井との衝突
    if (position.y >= maxY && velocity.y > 0) {
      newVelocity.y = -velocity.y * BALL_CONFIG.bounciness;
      this.ball.setPosition(new Vector3(position.x, maxY, position.z));
      didBounce = true;
    }

    // バウンドした場合は速度を更新
    if (didBounce) {
      this.ball.setVelocity(newVelocity);
      console.log(`[BOUNCE] Ball bounced! New velocity: (${newVelocity.x.toFixed(2)}, ${newVelocity.y.toFixed(2)}, ${newVelocity.z.toFixed(2)})`);
    }
  }

  /**
   * ゴールリム（両方）との衝突判定とゴール判定
   */
  handleRimCollisions(): void {
    // Player1のゴール（-Z側）
    const player1RimZ = this.getRimCenterZ("player1");
    this.handleRimCollision(player1RimZ, 1);

    // Player2のゴール（+Z側）
    const player2RimZ = this.getRimCenterZ("player2");
    this.handleRimCollision(player2RimZ, 2);
  }

  /**
   * 1つのゴールリムとの衝突判定とゴール判定
   */
  private handleRimCollision(rimZ: number, goalOwner: number): void {
    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();
    const ballRadius = BALL_CONFIG.radius;

    // リムの位置と半径
    const rimPosition = new Vector3(0, COURT_CONFIG.rimHeight, rimZ);
    const rimRadius = COURT_CONFIG.rimDiameter / 2;
    const rimThickness = 0.02;

    // ボールがリムの高さ付近にいるかチェック
    const heightDiff = Math.abs(ballPosition.y - rimPosition.y);
    if (heightDiff > ballRadius + rimThickness) {
      return;
    }

    // ボールからリムの中心（XZ平面）への水平距離
    const dx = ballPosition.x - rimPosition.x;
    const dz = ballPosition.z - rimPosition.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // リムの円周上の最も近い点までの距離
    const distanceFromRimCircle = Math.abs(horizontalDistance - rimRadius);

    // ゴール判定：ボールがリムを通過した（上から下へ）
    if (
      horizontalDistance < rimRadius - ballRadius &&
      ballPosition.y < COURT_CONFIG.rimHeight &&
      this.ballPreviousY >= COURT_CONFIG.rimHeight &&
      ballVelocity.y < 0
    ) {
      console.log(`[GOAL!] ★★★ Ball passed through rim ${goalOwner}! ★★★`);

      // ゴール後の処理：コールバック呼び出し
      if (this.onGoalScored) {
        this.onGoalScored(goalOwner);
      }
      return;
    }

    // リムとの衝突判定
    if (distanceFromRimCircle <= ballRadius + rimThickness) {
      console.log(`[RIM HIT] Ball hit the rim ${goalOwner}!`);

      // リムの円周上の最も近い点を計算
      const angle = Math.atan2(dz, dx);
      const rimPointX = rimPosition.x + rimRadius * Math.cos(angle);
      const rimPointZ = rimPosition.z + rimRadius * Math.sin(angle);

      // ボールからリム接触点への方向
      const toRimPoint = new Vector3(
        rimPointX - ballPosition.x,
        0,
        rimPointZ - ballPosition.z,
      );
      toRimPoint.normalize();

      // 速度を反射（水平方向のみ、垂直方向はそのまま）
      const horizontalVelocity = new Vector3(ballVelocity.x, 0, ballVelocity.z);
      const velocityAlongNormal = Vector3.Dot(horizontalVelocity, toRimPoint);

      // 反射ベクトルを計算
      const reflection = toRimPoint.scale(velocityAlongNormal * 2);
      const newHorizontalVelocity = horizontalVelocity.subtract(reflection);

      // 新しい速度（垂直成分はそのまま、水平成分は反射）
      const newVelocity = new Vector3(
        newHorizontalVelocity.x * BALL_CONFIG.bounciness,
        ballVelocity.y * BALL_CONFIG.bounciness,
        newHorizontalVelocity.z * BALL_CONFIG.bounciness,
      );

      this.ball.setVelocity(newVelocity);

      // ボールをリムから離す
      const separation = toRimPoint.scale(-(ballRadius + rimThickness - distanceFromRimCircle));
      const newPosition = ballPosition.add(separation);
      this.ball.setPosition(newPosition);
    }
  }

  /**
   * プレイヤー同士の衝突を処理
   */
  handlePlayerCollision(): void {
    const player1Pos = this.player1.getPosition();
    const player2Pos = this.player2.getPosition();

    // プレイヤー同士の距離を計算
    const dx = player2Pos.x - player1Pos.x;
    const dz = player2Pos.z - player1Pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定（プレイヤー1の半径 + プレイヤー2の半径）
    const collisionDistance = PLAYER_CONFIG.radius * 2;

    if (distance < collisionDistance && distance > 0) {
      // プレイヤー1からプレイヤー2への方向ベクトル
      const directionX = dx / distance;
      const directionZ = dz / distance;

      // 重なりの深さ
      const overlap = collisionDistance - distance;

      // 両プレイヤーを半分ずつ押し離す
      const pushDistance = overlap / 2;

      // プレイヤー1を後ろに押す
      const newPlayer1Pos = new Vector3(player1Pos.x - directionX * pushDistance, player1Pos.y, player1Pos.z - directionZ * pushDistance);
      this.player1.setPosition(newPlayer1Pos);

      // プレイヤー2を前に押す
      const newPlayer2Pos = new Vector3(player2Pos.x + directionX * pushDistance, player2Pos.y, player2Pos.z + directionZ * pushDistance);
      this.player2.setPosition(newPlayer2Pos);
    }
  }

  /**
   * プレイヤーとボールの衝突を処理
   */
  handleBallCollision(player: Player, pickupCooldown: number): void {
    // ボールが拾える状態でない場合は何もしない
    if (!this.ball.isPickupable()) {
      return;
    }

    // プレイヤーのボール拾得クールダウン中は拾えない
    if (pickupCooldown > 0) {
      return;
    }

    // プレイヤーの体・腕とボールのメッシュ衝突判定
    const isBodyContact = player.mesh.intersectsMesh(this.ball.mesh, false);
    const isArmContact =
      player.leftArm.mesh.intersectsMesh(this.ball.mesh, false) ||
      player.rightArm.mesh.intersectsMesh(this.ball.mesh, false);

    if (isBodyContact || isArmContact) {
      // 衝突した！ボールを保持する
      player.grabBall();
      this.ball.pickUp(player.id);
      console.log(`[PICKUP] Player ${player.id} picked up the ball! Contact: ${isArmContact ? 'ARM' : 'BODY'}`);

      // コールバック呼び出し
      if (this.onBallPickedUp) {
        this.onBallPickedUp(player.id);
      }
    }
  }

  /**
   * ボールスティール判定（手・体のメッシュとボールの衝突判定）
   */
  handleBallSteal(): void {
    // Player1がボール保持中、Player2がディフェンダー
    if (this.player1.hasBall && !this.player2.hasBall) {
      this.attemptSteal(this.player1, this.player2);
    }

    // Player2がボール保持中、Player1がディフェンダー
    if (this.player2.hasBall && !this.player1.hasBall) {
      this.attemptSteal(this.player2, this.player1);
    }
  }

  /**
   * スティールを試みる（ドリブル中のボールにも対応）
   */
  private attemptSteal(offense: Player, defense: Player): void {
    // ディフェンドポーズの場合のみスティール可能
    if (defense.getHandPose() !== HandPose.DEFEND) {
      return;
    }

    // ディフェンダーの腕・体とボールの衝突判定
    const isArmContact = defense.leftArm.mesh.intersectsMesh(this.ball.mesh, false) || defense.rightArm.mesh.intersectsMesh(this.ball.mesh, false);
    const isBodyContact = defense.mesh.intersectsMesh(this.ball.mesh, false);

    if (isArmContact || isBodyContact) {
      // ドリブル中のボールに接触した場合は即座にスティール成功
      if (this.ball.isDribbling) {
        console.log(`[STEAL] Player ${defense.id} stole the dribbling ball from Player ${offense.id}!`);
        this.causeFumble(offense, defense);
        return;
      }

      // 通常保持中の場合はファンブル判定
      const fumbleChance = calculateFumbleChance(offense.stats.ballHandling, defense.stats.steal);

      // 確率判定
      if (Math.random() < fumbleChance) {
        console.log(`[STEAL] Player ${defense.id} caused a fumble! Chance: ${(fumbleChance * 100).toFixed(1)}%`);
        this.causeFumble(offense, defense);
      } else {
        console.log(`[STEAL] Player ${defense.id} attempted steal but failed. Chance: ${(fumbleChance * 100).toFixed(1)}%`);
      }
    }
  }

  /**
   * ファンブルを発生させる（ボールを手放して転がす）
   */
  private causeFumble(offense: Player, defense: Player): void {
    console.log(`[GameScene] Player ${offense.id} fumbled! Player ${defense.id} caused the fumble!`);

    // ボールを手放す
    offense.releaseBall();
    this.ball.release();

    // オフェンスの進行方向を取得
    const offenseDirection = offense.direction;
    const forwardX = Math.sin(offenseDirection);
    const forwardZ = Math.cos(offenseDirection);

    // ボールの速度を設定（進行方向の逆 + ランダムな横方向）
    const backwardSpeed = 3.0;
    const sidewaysSpeed = (Math.random() - 0.5) * 2.0;

    // 横方向のベクトル（進行方向に対して垂直）
    const sidewaysX = -forwardZ;
    const sidewaysZ = forwardX;

    // 最終的な速度ベクトル
    const velocityX = -forwardX * backwardSpeed + sidewaysX * sidewaysSpeed;
    const velocityZ = -forwardZ * backwardSpeed + sidewaysZ * sidewaysSpeed;

    const fumbleVelocity = new Vector3(velocityX, 0, velocityZ);
    this.ball.setVelocity(fumbleVelocity);

    console.log(`[GameScene] Ball velocity: (${velocityX.toFixed(2)}, 0, ${velocityZ.toFixed(2)})`);
  }

  /**
   * 空中のボールとプレイヤーの物理的接触判定
   * ボールが飛んでいる時に、プレイヤーの体や手に当たったら軌道を変える
   */
  handleBallPhysicalContact(): void {
    // ボールがアクティブなシュート中のみブロック判定
    if (!this.ball.isActiveShot()) {
      return;
    }

    const ballPosition = this.ball.getPosition();
    const ballVelocity = this.ball.getVelocity();

    // 両プレイヤーで接触判定
    this.checkPhysicalContact(this.player1, ballPosition, ballVelocity);

    if (this.player2Enabled) {
      this.checkPhysicalContact(this.player2, ballPosition, ballVelocity);
    }
  }

  /**
   * 個別プレイヤーとボールの物理的接触を判定
   */
  private checkPhysicalContact(player: Player, ballPosition: Vector3, ballVelocity: Vector3): void {
    // シュート直後の猶予期間（0.2秒）はシューター本人との接触を無視
    const GRACE_PERIOD = 0.2; // 秒
    if (this.ball.timeSinceRelease < GRACE_PERIOD && this.ball.lastShooter === player.id) {
      return; // シューター本人との接触は無視
    }

    // 接触クールダウン期間中は無視（連続接触を防ぐ）
    const CONTACT_COOLDOWN = 0.3; // 秒
    const lastContact = this.lastContactTime.get(player.id) || -1;
    const timeSinceLastContact = this.ball.timeSinceRelease - lastContact;
    if (lastContact >= 0 && timeSinceLastContact < CONTACT_COOLDOWN) {
      return; // クールダウン中
    }

    // 腕との接触判定
    const isLeftArmContact = player.leftArm.mesh.intersectsMesh(this.ball.mesh, false);
    const isRightArmContact = player.rightArm.mesh.intersectsMesh(this.ball.mesh, false);

    // 体（メッシュ）との接触判定
    const isBodyContact = player.mesh.intersectsMesh(this.ball.mesh, false);

    // いずれかが接触している場合
    if (isLeftArmContact || isRightArmContact || isBodyContact) {
      // 接触時刻を記録
      this.lastContactTime.set(player.id, this.ball.timeSinceRelease);

      let contactPoint: Vector3;
      let contactType: string;

      // 接触点を特定
      if (isLeftArmContact) {
        contactPoint = player.leftArm.mesh.getAbsolutePosition();
        contactType = "LEFT_ARM";
      } else if (isRightArmContact) {
        contactPoint = player.rightArm.mesh.getAbsolutePosition();
        contactType = "RIGHT_ARM";
      } else {
        contactPoint = player.mesh.getAbsolutePosition();
        contactType = "BODY";
      }

      console.log(`[CONTACT] Player ${player.id} ${contactType} touched the ball!`);

      // 接触点からボールへの方向ベクトル（反射方向）
      const reflectDirection = ballPosition.subtract(contactPoint);
      reflectDirection.normalize();

      // ボールの現在の速さ
      const currentSpeed = ballVelocity.length();

      // 接触後の速度を計算
      // 速度の80%を保持（より自然な反射）
      const speedRetention = 0.8;
      const newSpeed = currentSpeed * speedRetention;

      // 新しい速度ベクトル（反射方向）
      const newVelocity = reflectDirection.scale(newSpeed);

      this.ball.setVelocity(newVelocity);

      console.log(
        `[CONTACT] Ball trajectory changed! Old: (${ballVelocity.x.toFixed(2)}, ${ballVelocity.y.toFixed(2)}, ${ballVelocity.z.toFixed(2)})`
      );
      console.log(
        `[CONTACT] New: (${newVelocity.x.toFixed(2)}, ${newVelocity.y.toFixed(2)}, ${newVelocity.z.toFixed(2)})`
      );
    }
  }
}
