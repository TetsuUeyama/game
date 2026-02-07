import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import {
  getDistance3D,
  getCircleCollisionInfo,
  resolveCircleCollisionWithPower,
} from "../utils/CollisionUtils";
import { CHARACTER_COLLISION_CONFIG } from "../config/CollisionConfig";
import { BallCatchSystem } from "../systems/BallCatchSystem";
import { LooseBallScrambleSystem } from "../systems/LooseBallScrambleSystem";

/**
 * 衝突判定コントローラー
 * ボールとキャラクター、キャラクター同士の接触を検出し、重ならないように押し戻す
 */
export class CollisionHandler {
  private ball: Ball;
  private allCharacters: Character[];
  private ballCatchSystem: BallCatchSystem;
  private looseBallScrambleSystem: LooseBallScrambleSystem;

  constructor(ball: Ball, characters: Character[]) {
    this.ball = ball;
    this.allCharacters = characters;
    this.ballCatchSystem = new BallCatchSystem(ball, characters);
    this.looseBallScrambleSystem = new LooseBallScrambleSystem(ball, characters);
  }

  /**
   * BallCatchSystem を取得
   */
  public getBallCatchSystem(): BallCatchSystem {
    return this.ballCatchSystem;
  }

  /**
   * 衝突判定を更新
   *
   * 注意: ボールと選手の体パーツ（胴体・手）との衝突はHavok物理エンジンが自動処理
   * ここではキャッチ判定とキャラクター同士の衝突のみを処理
   */
  public update(deltaTime: number): void {
    // ルーズボール確保アクション判定（BallCatchSystemより先に実行）
    this.looseBallScrambleSystem.update(deltaTime);

    // ボールとキャラクターの衝突判定（キャッチ）- BallCatchSystem に委譲
    this.ballCatchSystem.update(deltaTime);

    // キャラクター同士の衝突判定（全ペアをチェック）
    for (let i = 0; i < this.allCharacters.length; i++) {
      for (let j = i + 1; j < this.allCharacters.length; j++) {
        this.resolveCharacterCharacterCollision(this.allCharacters[i], this.allCharacters[j]);
      }
    }

    // キャラクターの状態を更新
    this.updateCharacterStates();
  }

  /**
   * キャラクターの状態のみを更新（AI更新前に呼び出す）
   * ボール保持者の変化に応じて全キャラクターの状態を適切に設定
   */
  public updateStates(): void {
    this.updateCharacterStates();
  }

  /**
   * キャラクター同士の衝突を解決
   * power値が高い方が低い方を押し出す
   * 8方向ごとの半径を考慮した衝突判定
   *
   * IMPROVEMENT_PLAN.md: バグ1追加修正 - スローイン状態のキャラクターは衝突判定をスキップ
   */
  private resolveCharacterCharacterCollision(character1: Character, character2: Character): void {
    // スローインスロワーは衝突判定をスキップ
    // （外側マスにいるため、衝突解決でフィールド内にクランプされるのを防ぐ）
    // 新設計: THROW_IN_*状態ではなく、isThrowInThrowerフラグを使用
    if (character1.getIsThrowInThrower() || character2.getIsThrowInThrower()) {
      return;
    }

    const state1 = character1.getState();
    const state2 = character2.getState();

    // ジャンプボール状態のキャラクターも衝突判定をスキップ
    const isJumpBallState1 = state1 === CharacterState.JUMP_BALL_JUMPER ||
                              state1 === CharacterState.JUMP_BALL_OTHER;
    const isJumpBallState2 = state2 === CharacterState.JUMP_BALL_JUMPER ||
                              state2 === CharacterState.JUMP_BALL_OTHER;

    if (isJumpBallState1 || isJumpBallState2) {
      return;
    }

    const pos1 = character1.getPosition();
    const pos2 = character2.getPosition();

    // 各キャラクターから見た相手への方向を計算
    const dir1to2 = { x: pos2.x - pos1.x, z: pos2.z - pos1.z };
    const dir2to1 = { x: pos1.x - pos2.x, z: pos1.z - pos2.z };

    // 各キャラクターの相手方向での半径を取得（8方向を考慮）
    const radius1 = character1.getFootCircleRadiusInDirection(dir1to2);
    const radius2 = character2.getFootCircleRadiusInDirection(dir2to1);

    // 衝突情報を取得
    const collisionInfo = getCircleCollisionInfo(pos1, radius1, pos2, radius2);

    // 衝突していない場合はスキップ
    if (!collisionInfo.isColliding) {
      return;
    }

    // power値を取得（デフォルトは50）
    const power1 = character1.playerData?.stats.power ?? 50;
    const power2 = character2.playerData?.stats.power ?? 50;

    // パワー値に基づいて衝突を解決（方向ベースの半径を使用）
    const resolution = resolveCircleCollisionWithPower(
      pos1, radius1, power1,
      pos2, radius2, power2,
      CHARACTER_COLLISION_CONFIG.COLLISION_MARGIN
    );

    character1.setPosition(resolution.newPos1);
    character2.setPosition(resolution.newPos2);
  }

  /**
   * スローイン状態を全てクリア
   * IMPROVEMENT_PLAN.md: バグ2修正 - レシーバーがキャッチした後に状態をクリア
   */
  private clearThrowInStates(): void {
    // 新設計: THROW_IN_*状態ではなく、isThrowInThrowerフラグをクリア
    for (const character of this.allCharacters) {
      if (character.getIsThrowInThrower()) {
        character.setAsThrowInThrower(null);
      }
    }
  }

  /**
   * ジャンプボール状態を全てクリア
   */
  private clearJumpBallStates(): void {
    for (const character of this.allCharacters) {
      const state = character.getState();
      if (state === CharacterState.JUMP_BALL_JUMPER ||
          state === CharacterState.JUMP_BALL_OTHER) {
        // BALL_LOST状態に戻す（後でupdateCharacterStates()が適切な状態に更新）
        character.setState(CharacterState.BALL_LOST);
      }
    }
  }

  /**
   * キャラクターの状態を更新
   * 新設計: THROW_IN_*状態ではなく、isThrowInThrowerフラグを使用
   */
  private updateCharacterStates(): void {
    const holder = this.ball.getHolder();

    // スローインスロワーがいるかチェック（新設計: フラグベース）
    const throwInThrower = this.allCharacters.find(char => char.getIsThrowInThrower());

    if (throwInThrower) {
      // スロワーがボールを持っている間のみ状態更新をスキップ
      // ボールが飛行中（パス後）の場合は状態更新を続行（スロワーをOFF_BALL_PLAYERに）
      if (holder === throwInThrower) {
        return;
      }
      // 誰かがボールをキャッチした場合、スローイン状態をクリア
      if (holder && holder !== throwInThrower) {
        this.clearThrowInStates();
      }
      // スローイン中でもボール飛行中は状態更新を続行
    }

    // ジャンプボール状態のキャラクターがいるかチェック
    const hasJumpBallState = this.allCharacters.some(char => {
      const state = char.getState();
      return state === CharacterState.JUMP_BALL_JUMPER ||
             state === CharacterState.JUMP_BALL_OTHER;
    });

    if (hasJumpBallState) {
      // ジャンプボール中は状態を更新しない（GameSceneが管理）
      // ただし、ボールがキャッチされた場合は状態をクリア
      if (holder) {
        this.clearJumpBallStates();
        // 状態クリア後、通常の状態更新を続行
      } else {
        return;
      }
    }

    // ボールが誰も保持していない場合
    if (!holder) {
      // ボールが飛行中（パス中・シュート中）の場合
      if (this.ball.isInFlight()) {
        // パスターゲットがいる場合（パス中）は、パスターゲットに向かう準備をする
        // - パサー（lastToucher）はOFF_BALL_PLAYERに
        // - パスターゲットは一時的にまだOFF_BALL_PLAYERのまま（キャッチ後にON_BALL_PLAYERに）
        // - シュート中の場合はlastToucherもnullまたはシューターなので状態維持
        const passTarget = this.ball.getPassTarget();
        if (passTarget) {
          // パス中: パサーの状態を更新
          const lastToucher = this.ball.getLastToucher();
          if (lastToucher && lastToucher.getState() === CharacterState.ON_BALL_PLAYER) {
            lastToucher.setState(CharacterState.OFF_BALL_PLAYER);
          }
        }
        // シュート中の場合は状態を維持（シュートが外れるまで）
        return;
      }

      // ルーズボール時（飛行中でない、保持者もいない）
      // 全員BALL_LOSTに設定（ただしスロワーは除く）
      for (const character of this.allCharacters) {
        // スロワーはBALL_LOSTにしない（ボールに向かって移動するのを防ぐ）
        if (character.getIsThrowInThrower()) {
          character.setState(CharacterState.OFF_BALL_PLAYER);
          continue;
        }
        character.setState(CharacterState.BALL_LOST);
      }
      return;
    }

    // ボール保持者をON_BALL_PLAYERに設定
    holder.setState(CharacterState.ON_BALL_PLAYER);

    // ボール保持者のチームを判定
    const holderTeam = holder.team;

    // 味方と敵を分類
    const teammates: Character[] = [];
    const opponents: Character[] = [];

    this.allCharacters.forEach((char) => {
      if (char === holder) {
        return; // 保持者自身はスキップ
      }

      // 無力化されたキャラクターはスキップ（状態を変更しない）
      if (char.isDefeated()) {
        return;
      }

      if (char.team === holderTeam) {
        teammates.push(char);
      } else {
        opponents.push(char);
      }
    });

    // 味方は全員OFF_BALL_PLAYER
    teammates.forEach((teammate) => {
      teammate.setState(CharacterState.OFF_BALL_PLAYER);
    });

    // 敵の状態を設定（同じポジションの敵がON_BALL_DEFENDER、それ以外がOFF_BALL_DEFENDER）
    if (opponents.length > 0) {
      const holderPosition = holder.playerPosition;

      // ボール保持者と同じポジションの敵を探す
      let onBallDefender: Character | null = null;

      if (holderPosition) {
        onBallDefender = opponents.find(opp => opp.playerPosition === holderPosition) || null;
      }

      // 同じポジションの敵がいない場合は、最も近い敵をON_BALL_DEFENDERにする（フォールバック）
      if (!onBallDefender) {
        const holderPos = holder.getPosition();
        const sortedOpponents = [...opponents].sort((a, b) => {
          const distA = getDistance3D(holderPos, a.getPosition());
          const distB = getDistance3D(holderPos, b.getPosition());
          return distA - distB;
        });
        onBallDefender = sortedOpponents[0];
      }

      // ON_BALL_DEFENDERを設定
      onBallDefender.setState(CharacterState.ON_BALL_DEFENDER);

      // 残りの敵をOFF_BALL_DEFENDER
      for (const opponent of opponents) {
        if (opponent !== onBallDefender) {
          opponent.setState(CharacterState.OFF_BALL_DEFENDER);
        }
      }
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.ballCatchSystem.dispose();
    this.looseBallScrambleSystem.dispose();
  }
}
