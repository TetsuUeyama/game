import { Vector3 } from "@babylonjs/core";
import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { Field } from "../entities/Field";
import { IDLE_MOTION } from "../data/IdleMotion";
import { WALK_FORWARD_MOTION } from "../data/WalkMotion";
import { DASH_FORWARD_MOTION } from "../data/DashMotion";

/**
 * キャラクターAIコントローラー
 * キャラクターの状態に応じて行動を決定する
 */
export class CharacterAI {
  private character: Character;
  private ball: Ball;
  private allCharacters: Character[];
  private field: Field;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = allCharacters;
    this.field = field;
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // ゴールキーパーの場合、ゴール前半径5m以内に位置を制限
    if (this.character.playerPosition === 'GK') {
      this.constrainGoalkeeperPosition();
    }

    const state = this.character.getState();

    switch (state) {
      case CharacterState.BALL_LOST:
        // ボールが誰にも保持されていない場合は、全員がボールを取りに行く
        this.handleBallLostState(deltaTime);
        break;
      case CharacterState.ON_BALL_PLAYER:
        // ボール保持者は動く
        this.handleOnBallPlayerState(deltaTime);
        break;
      case CharacterState.ON_BALL_DEFENDER:
        // ボール保持者に最も近いディフェンダーは動く
        this.handleOnBallDefenderState(deltaTime);
        break;
      case CharacterState.OFF_BALL_PLAYER:
      case CharacterState.OFF_BALL_DEFENDER:
        // その他のキャラクターは停止（待機モーション）
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        break;
    }
  }

  /**
   * ボールロスト状態の処理
   */
  private handleBallLostState(deltaTime: number): void {
    // ボールの位置を取得
    const ballPosition = this.ball.getPosition();
    const myPosition = this.character.getPosition();

    // ボールへの方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      ballPosition.x - myPosition.x,
      0,
      ballPosition.z - myPosition.z
    );

    const distance = direction.length();

    // 方向ベクトルが0でない場合
    if (distance > 0.01) {
      direction.normalize();

      // Y軸周りの回転角度を計算
      const angle = Math.atan2(direction.x, direction.z);

      // キャラクターの回転を設定（ボールの方向を向く）
      this.character.setRotation(angle);

      // ボールに近づく（距離が2m以上の場合）
      if (distance > 2.0) {
        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          // ボールに向かって移動
          this.character.move(adjustedDirection, deltaTime);

          // 走りモーションを再生
          if (this.character.getCurrentMotionName() !== 'dash_forward') {
            this.character.playMotion(DASH_FORWARD_MOTION);
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      } else {
        // 近くにいる場合は歩く
        const slowDirection = direction.scale(0.5);
        const adjustedDirection = this.adjustDirectionForCollision(slowDirection, deltaTime);

        if (adjustedDirection) {
          this.character.move(adjustedDirection, deltaTime);

          // 歩きモーションを再生
          if (this.character.getCurrentMotionName() !== 'walk_forward') {
            this.character.playMotion(WALK_FORWARD_MOTION);
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      }
    } else {
      // ボールの真上にいる場合は待機
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }
  }

  /**
   * オンボールプレイヤー状態の処理
   */
  private handleOnBallPlayerState(deltaTime: number): void {
    // 目の前にディフェンダーがいるかチェック
    const onBallDefender = this.findOnBallDefender();

    if (onBallDefender) {
      const myPosition = this.character.getPosition();
      const defenderPosition = onBallDefender.getPosition();

      // ディフェンダーとの距離をチェック
      const distance = Vector3.Distance(myPosition, defenderPosition);

      // ディフェンダーが2m以内にいる場合は停止
      if (distance < 2.0) {
        // 停止時は待機モーションを再生
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
        return;
      }
    }

    // 攻めるべきゴールを決定（敵チームのゴールに向かう）
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1() : this.field.getGoal2();
    const goalPosition = attackingGoal.position;

    // ゴールに向かって移動
    this.moveTowards(goalPosition, deltaTime, 2.0); // ゴール2m手前で停止
  }

  /**
   * オフボールプレイヤー状態の処理
   */
  private handleOffBallPlayerState(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    const onBallPosition = onBallPlayer.getPosition();
    const minDistance = 5.0; // オンボールプレイヤーからの最低距離（5m維持）
    const currentPosition = this.character.getPosition();

    // 現在のオンボールプレイヤーからの距離をチェック
    const currentDistance = Vector3.Distance(currentPosition, onBallPosition);

    // 5m以内にいる場合は、まず遠ざかる（オンボールプレイヤーを向きながら）
    if (currentDistance < minDistance) {
      // オンボールプレイヤーから離れる方向を計算
      const awayDirection = new Vector3(
        currentPosition.x - onBallPosition.x,
        0,
        currentPosition.z - onBallPosition.z
      );

      if (awayDirection.length() > 0.01) {
        awayDirection.normalize();

        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(awayDirection, deltaTime);

        if (adjustedDirection) {
          // オンボールプレイヤーの方を向く
          this.faceTowards(onBallPlayer);

          // 離れる方向に移動（向きは変えない）
          this.character.move(adjustedDirection, deltaTime);
        }
        return; // 距離が確保されるまでは他の処理をスキップ
      }
    }

    // 攻めるべきゴールを決定（敵チームのゴールに向かう）
    const attackingGoal = this.character.team === "ally" ? this.field.getGoal1() : this.field.getGoal2();
    const goalPosition = attackingGoal.position;

    // 敵キャラクターをリストアップ
    const enemies = this.allCharacters.filter(
      (char) => char !== this.character && char.team !== this.character.team
    );

    // オンボールプレイヤーからゴールへの方向を計算
    const toGoalDirection = new Vector3(
      goalPosition.x - onBallPosition.x,
      0,
      goalPosition.z - onBallPosition.z
    );
    toGoalDirection.normalize();

    // ゴール方向の角度を計算
    const goalAngle = Math.atan2(toGoalDirection.x, toGoalDirection.z);

    // 複数の候補位置を生成（ゴール方向を中心に前方180度の範囲、8方向）
    // これによりゴールに近づく方向のみから候補位置を生成
    const candidatePositions: Vector3[] = [];
    const angleOffsets = [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90]; // ゴール方向から±90度

    for (const offsetDeg of angleOffsets) {
      const offsetRad = (offsetDeg * Math.PI) / 180;
      const finalAngle = goalAngle + offsetRad;
      // オンボールプレイヤーから5m離れた位置を計算
      const x = onBallPosition.x + Math.sin(finalAngle) * minDistance;
      const z = onBallPosition.z + Math.cos(finalAngle) * minDistance;
      candidatePositions.push(new Vector3(x, onBallPosition.y, z));
    }

    // 各候補位置について視野チェック、射線チェックを行い、スコアを計算
    let bestPosition: Vector3 | null = null;
    let bestScore = -Infinity;

    for (const candidatePos of candidatePositions) {
      // 射線上に敵がいるかチェック
      const hasEnemyInLine = this.hasEnemyInLine(onBallPosition, candidatePos, enemies);

      if (!hasEnemyInLine) {
        // 射線上に敵がいない場合、ゴールまでの距離でスコア計算（近いほど良い）
        const distanceToGoal = Vector3.Distance(candidatePos, goalPosition);
        const score = -distanceToGoal; // ゴールに近いほど高スコア

        if (score > bestScore) {
          bestScore = score;
          bestPosition = candidatePos;
        }
      }
    }

    // 射線上に敵がいない位置が見つからない場合、ゴールに最も近い位置を選択
    if (!bestPosition) {
      let minDistanceToGoal = Infinity;

      for (const candidatePos of candidatePositions) {
        const distanceToGoal = Vector3.Distance(candidatePos, goalPosition);
        if (distanceToGoal < minDistanceToGoal) {
          minDistanceToGoal = distanceToGoal;
          bestPosition = candidatePos;
        }
      }
    }

    // 目標位置に向かって移動（移動中も常にオンボールプレイヤーを向く）
    if (bestPosition) {
      const currentPosition = this.character.getPosition();

      // 目標位置への方向ベクトルを計算（XZ平面上）
      const direction = new Vector3(
        bestPosition.x - currentPosition.x,
        0,
        bestPosition.z - currentPosition.z
      );

      const distance = direction.length();

      // 距離が十分近い場合は移動せず、オンボールプレイヤーの方を向く
      if (distance < 0.3) {
        this.faceTowards(onBallPlayer);

        // 待機モーションを再生
        if (this.character.getCurrentMotionName() !== 'idle') {
          this.character.playMotion(IDLE_MOTION);
        }
      } else {
        // 移動方向を正規化
        direction.normalize();

        // 衝突を考慮して移動方向を調整
        const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

        if (adjustedDirection) {
          // オンボールプレイヤーの方を向く
          this.faceTowards(onBallPlayer);

          // 移動（向きは変えずに移動）
          this.character.move(adjustedDirection, deltaTime);

          // 距離に応じたモーション再生
          if (distance > 5.0) {
            // 遠い場合は走る
            if (this.character.getCurrentMotionName() !== 'dash_forward') {
              this.character.playMotion(DASH_FORWARD_MOTION);
            }
          } else {
            // 近い場合は歩く
            if (this.character.getCurrentMotionName() !== 'walk_forward') {
              this.character.playMotion(WALK_FORWARD_MOTION);
            }
          }
        } else {
          // 移動できない場合は待機
          if (this.character.getCurrentMotionName() !== 'idle') {
            this.character.playMotion(IDLE_MOTION);
          }
        }
      }
    }
  }

  /**
   * オンボールディフェンダー状態の処理
   */
  private handleOnBallDefenderState(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    const myPosition = this.character.getPosition();
    const onBallPosition = onBallPlayer.getPosition();

    // 守るべきゴールを決定（自チームのゴールを守る）
    const defendingGoal = this.character.team === "ally" ? this.field.getGoal2() : this.field.getGoal1();
    const goalPosition = defendingGoal.position;

    // オンボールプレイヤーからゴールへの方向ベクトルを計算
    const toGoal = new Vector3(
      goalPosition.x - onBallPosition.x,
      0,
      goalPosition.z - onBallPosition.z
    );

    // 方向を正規化
    const direction = toGoal.normalize();

    // 維持したい距離（1.5m）
    const targetDistance = 1.5;

    // オンボールプレイヤーから1.5m離れた位置（ゴール方向）
    const targetPosition = new Vector3(
      onBallPosition.x + direction.x * targetDistance,
      onBallPosition.y,
      onBallPosition.z + direction.z * targetDistance
    );

    // 現在の距離をチェック
    const currentDistance = Vector3.Distance(myPosition, onBallPosition);

    // 距離が近すぎる場合（1m以内）は離れる
    if (currentDistance < 1.0) {
      // ゴール方向に離れる
      this.moveTowards(targetPosition, deltaTime, 0.2);
    }
    // 距離が遠すぎる場合（2m以上）は近づく
    else if (currentDistance > 2.0) {
      this.moveTowards(targetPosition, deltaTime, 0.2);
    }
    // 適切な距離（1m～2m）にいる場合は停止
    else {
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
    }

    // 常にオンボールプレイヤーの方を向く
    this.faceTowards(onBallPlayer);
  }

  /**
   * オフボールディフェンダー状態の処理
   */
  private handleOffBallDefenderState(deltaTime: number): void {
    // オンボールプレイヤーを探す
    const onBallPlayer = this.findOnBallPlayer();
    if (!onBallPlayer) {
      return;
    }

    // オフボールプレイヤーを探す
    const offBallPlayer = this.findOffBallPlayer();
    if (!offBallPlayer) {
      return;
    }

    const onBallPosition = onBallPlayer.getPosition();
    const offBallPosition = offBallPlayer.getPosition();

    // オフボールプレイヤーからオンボールプレイヤーへの方向ベクトルを計算
    const direction = new Vector3(
      onBallPosition.x - offBallPosition.x,
      0,
      onBallPosition.z - offBallPosition.z
    );

    // 方向を正規化
    if (direction.length() > 0.01) {
      direction.normalize();

      // オフボールプレイヤーから1m離れた位置（オンボールプレイヤー方向）
      const targetDistance = 1.0; // 1m
      const targetPosition = new Vector3(
        offBallPosition.x + direction.x * targetDistance,
        offBallPosition.y,
        offBallPosition.z + direction.z * targetDistance
      );

      // 目標位置に向かって移動
      this.moveTowards(targetPosition, deltaTime, 0.2); // 停止距離を0.2mに設定

      // オフボールプレイヤーの方を向く
      this.faceTowards(offBallPlayer);
    }
  }

  /**
   * オンボールプレイヤーを見つける
   */
  private findOnBallPlayer(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.ON_BALL_PLAYER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オンボールディフェンダーを見つける
   */
  private findOnBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.ON_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールディフェンダーを見つける
   */
  private findOffBallDefender(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_DEFENDER) {
        return char;
      }
    }
    return null;
  }

  /**
   * オフボールプレイヤーを見つける
   */
  private findOffBallPlayer(): Character | null {
    for (const char of this.allCharacters) {
      if (char.getState() === CharacterState.OFF_BALL_PLAYER) {
        return char;
      }
    }
    return null;
  }

  /**
   * 目標位置に向かって移動
   */
  private moveTowards(targetPosition: Vector3, deltaTime: number, stopDistance: number = 0.3): void {
    const myPosition = this.character.getPosition();

    // 目標位置への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 距離が十分近い場合は移動しない
    const distance = direction.length();
    if (distance < stopDistance) {
      // 停止時は待機モーションを再生
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 方向ベクトルを正規化
    direction.normalize();

    // 衝突を考慮して移動方向を調整
    const adjustedDirection = this.adjustDirectionForCollision(direction, deltaTime);

    // 移動できない場合は停止
    if (!adjustedDirection) {
      // 停止時は待機モーションを再生
      if (this.character.getCurrentMotionName() !== 'idle') {
        this.character.playMotion(IDLE_MOTION);
      }
      return;
    }

    // 移動方向を向く
    const angle = Math.atan2(adjustedDirection.x, adjustedDirection.z);
    this.character.setRotation(angle);

    // 移動
    this.character.move(adjustedDirection, deltaTime);

    // 距離に応じたモーション再生
    if (distance > 5.0) {
      // 遠い場合は走る
      if (this.character.getCurrentMotionName() !== 'dash_forward') {
        this.character.playMotion(DASH_FORWARD_MOTION);
      }
    } else {
      // 近い場合は歩く
      if (this.character.getCurrentMotionName() !== 'walk_forward') {
        this.character.playMotion(WALK_FORWARD_MOTION);
      }
    }
  }

  /**
   * 射線上に敵がいるかチェック
   */
  private hasEnemyInLine(start: Vector3, end: Vector3, enemies: Character[]): boolean {
    const lineThreshold = 1.0; // 射線からの距離の閾値（1m）

    for (const enemy of enemies) {
      const enemyPos = enemy.getPosition();

      // 線分と点の距離を計算
      const distance = this.pointToLineDistance(start, end, enemyPos);

      // 敵が射線上にいるかチェック（距離が閾値以下）
      if (distance < lineThreshold) {
        // さらに、敵が線分の範囲内にいるかチェック
        if (this.isPointBetweenLineSegment(start, end, enemyPos)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 点から線分への最短距離を計算
   */
  private pointToLineDistance(lineStart: Vector3, lineEnd: Vector3, point: Vector3): number {
    // XZ平面上で計算
    const x0 = point.x;
    const z0 = point.z;
    const x1 = lineStart.x;
    const z1 = lineStart.z;
    const x2 = lineEnd.x;
    const z2 = lineEnd.z;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const lengthSquared = dx * dx + dz * dz;

    if (lengthSquared === 0) {
      // 線分の始点と終点が同じ場合
      return Math.sqrt((x0 - x1) * (x0 - x1) + (z0 - z1) * (z0 - z1));
    }

    // 線分上の最近点のパラメータt（0から1の範囲）
    let t = ((x0 - x1) * dx + (z0 - z1) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    // 線分上の最近点
    const nearestX = x1 + t * dx;
    const nearestZ = z1 + t * dz;

    // 点から最近点までの距離
    return Math.sqrt((x0 - nearestX) * (x0 - nearestX) + (z0 - nearestZ) * (z0 - nearestZ));
  }

  /**
   * 点が線分の範囲内にあるかチェック
   */
  private isPointBetweenLineSegment(lineStart: Vector3, lineEnd: Vector3, point: Vector3): boolean {
    // 線分の長さ
    const lineLength = Vector3.Distance(lineStart, lineEnd);

    // 始点から点までの距離
    const distStart = Vector3.Distance(lineStart, point);

    // 終点から点までの距離
    const distEnd = Vector3.Distance(lineEnd, point);

    // 点が線分の範囲内にある場合、distStart + distEnd ≈ lineLength
    const tolerance = 0.5; // 許容誤差
    return Math.abs(distStart + distEnd - lineLength) < tolerance;
  }

  /**
   * 指定したキャラクターの方向を向く
   */
  private faceTowards(target: Character): void {
    const myPosition = this.character.getPosition();
    const targetPosition = target.getPosition();

    // ターゲットへの方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    // 方向ベクトルが0でない場合のみ回転
    if (direction.length() > 0.01) {
      // Y軸周りの回転角度を計算
      const angle = Math.atan2(direction.x, direction.z);

      // キャラクターの回転を設定（setRotationメソッドを使用してメッシュにも反映）
      this.character.setRotation(angle);
    }
  }

  /**
   * ゴールキーパーの位置をゴール前半径5m以内に制限
   */
  private constrainGoalkeeperPosition(): void {
    const myPosition = this.character.getPosition();

    // 自チームのゴール位置を取得
    const goal = this.character.team === "ally" ? this.field.getGoal2() : this.field.getGoal1();
    const goalPosition = goal.position;

    // ゴールからの距離を計算（XZ平面上）
    const dx = myPosition.x - goalPosition.x;
    const dz = myPosition.z - goalPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 半径5mを超えた場合、位置を制限
    const maxRadius = 5.0;
    if (distance > maxRadius) {
      // ゴール方向への単位ベクトル
      const dirX = dx / distance;
      const dirZ = dz / distance;

      // 半径5m以内の位置に修正
      const newX = goalPosition.x + dirX * maxRadius;
      const newZ = goalPosition.z + dirZ * maxRadius;

      // キャラクターの位置を更新
      this.character.setPosition(new Vector3(newX, myPosition.y, newZ));
    }
  }

  /**
   * 衝突チェック - 他のキャラクターと衝突するかチェック
   * @param newPosition 移動先の位置
   * @returns 衝突する場合true
   */
  private checkCollision(newPosition: Vector3): boolean {
    const myRadius = this.character.collisionRadius;

    for (const other of this.allCharacters) {
      // 自分自身はスキップ
      if (other === this.character) continue;

      const otherPosition = other.getPosition();
      const otherRadius = other.collisionRadius;

      // XZ平面上での距離を計算
      const dx = newPosition.x - otherPosition.x;
      const dz = newPosition.z - otherPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // 衝突半径の合計より近い場合は衝突
      const minDistance = myRadius + otherRadius;
      if (distance < minDistance) {
        return true;
      }
    }

    return false;
  }

  /**
   * 衝突を考慮した移動方向の調整
   * @param direction 元の移動方向
   * @param deltaTime デルタタイム
   * @returns 調整後の移動方向（移動不可の場合はnull）
   */
  private adjustDirectionForCollision(direction: Vector3, deltaTime: number): Vector3 | null {
    const currentPosition = this.character.getPosition();
    const speed = this.character.config.physical.speed;
    const moveDistance = speed * deltaTime;

    // 元の方向での移動先をチェック
    const newPosition = new Vector3(
      currentPosition.x + direction.x * moveDistance,
      currentPosition.y,
      currentPosition.z + direction.z * moveDistance
    );

    if (!this.checkCollision(newPosition)) {
      // 衝突しない場合はそのまま移動
      return direction;
    }

    // 衝突する場合、左右に回避を試みる
    const avoidanceAngles = [30, -30, 60, -60, 90, -90]; // 度数
    for (const angleDeg of avoidanceAngles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      // 回転後の方向ベクトル
      const rotatedDirection = new Vector3(
        direction.x * cos - direction.z * sin,
        0,
        direction.x * sin + direction.z * cos
      );

      const avoidPosition = new Vector3(
        currentPosition.x + rotatedDirection.x * moveDistance,
        currentPosition.y,
        currentPosition.z + rotatedDirection.z * moveDistance
      );

      if (!this.checkCollision(avoidPosition)) {
        // 衝突しない方向が見つかった
        return rotatedDirection;
      }
    }

    // どの方向にも移動できない場合はnull
    return null;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ処理を追加
  }
}
