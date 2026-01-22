import { Character } from "../entities/Character";
import { Ball } from "../entities/Ball";
import { CharacterState } from "../types/CharacterState";
import { Field } from "../entities/Field";
import { ShootingController } from "./ShootingController";
import { FeintController } from "./FeintController";
import { FieldGridUtils } from "../config/FieldGridConfig";
import { DEFENSE_DISTANCE } from "../config/DefenseConfig";
import { Vector3 } from "@babylonjs/core";
import {
  LooseBallAI,
  OnBallOffenseAI,
  OnBallDefenseAI,
  OffBallOffenseAI,
  OffBallDefenseAI
} from "./ai";

/**
 * キャラクターAIコントローラー
 * キャラクターの状態に応じて適切なAIに処理を委譲する
 */
export class CharacterAI {
  private character: Character;
  private ball: Ball;
  private allCharacters: Character[];
  private field: Field;

  // 状態別AIインスタンス
  private looseBallAI: LooseBallAI;
  private onBallOffenseAI: OnBallOffenseAI;
  private onBallDefenseAI: OnBallDefenseAI;
  private offBallOffenseAI: OffBallOffenseAI;
  private offBallDefenseAI: OffBallDefenseAI;

  constructor(character: Character, ball: Ball, allCharacters: Character[], field: Field) {
    this.character = character;
    this.ball = ball;
    this.allCharacters = allCharacters;
    this.field = field;

    // 状態別AIを初期化
    this.looseBallAI = new LooseBallAI(character, ball, allCharacters, field);
    this.onBallOffenseAI = new OnBallOffenseAI(character, ball, allCharacters, field);
    this.onBallDefenseAI = new OnBallDefenseAI(character, ball, allCharacters, field);
    this.offBallOffenseAI = new OffBallOffenseAI(character, ball, allCharacters, field);
    this.offBallDefenseAI = new OffBallDefenseAI(character, ball, allCharacters, field);

    // オフェンス側のボール保持位置を設定
    // 緑(3)・シアン(4)・青(5)以外の5箇所を使用
    // つまり、赤(0)・オレンジ(1)・黄色(2)・紫(6)・マゼンタ(7)
    this.character.setBallHoldingFaces([0, 1, 2, 6, 7]);
  }

  /**
   * ShootingControllerを設定
   */
  public setShootingController(controller: ShootingController): void {
    this.onBallOffenseAI.setShootingController(controller);
  }

  /**
   * FeintControllerを設定
   */
  public setFeintController(controller: FeintController): void {
    this.onBallOffenseAI.setFeintController(controller);
  }

  /**
   * AIの更新処理
   */
  public update(deltaTime: number): void {
    // オンボールオフェンスAIのクールダウンを更新
    this.onBallOffenseAI.updateCooldowns(deltaTime);

    // アクション実行中（シュート等）は移動処理をスキップ
    const actionController = this.character.getActionController();
    const currentAction = actionController.getCurrentAction();
    const currentPhase = actionController.getCurrentPhase();
    if (currentAction !== null || currentPhase !== 'idle') {
      // アクション中は待機モーションも再生しない（アクションモーションが再生中）
      return;
    }

    // ゴールキーパーの場合、ゴール前半径5m以内に位置を制限
    if (this.character.playerPosition === 'GK') {
      this.constrainGoalkeeperPosition();
    }

    const state = this.character.getState();

    switch (state) {
      case CharacterState.BALL_LOST:
        // ボールが誰にも保持されていない場合は、全員がボールを取りに行く
        this.looseBallAI.update(deltaTime);
        break;
      case CharacterState.ON_BALL_PLAYER:
        // ボール保持者は動く
        this.onBallOffenseAI.update(deltaTime);
        break;
      case CharacterState.ON_BALL_DEFENDER:
        // ボール保持者に最も近いディフェンダーは動く
        this.onBallDefenseAI.update(deltaTime);
        break;
      case CharacterState.OFF_BALL_PLAYER:
        // オフボールオフェンス（センターはゴール下へ）
        this.offBallOffenseAI.update(deltaTime);
        break;
      case CharacterState.OFF_BALL_DEFENDER:
        // オフボールディフェンス（相手センターをマーク）
        this.offBallDefenseAI.update(deltaTime);
        break;
    }
  }

  /**
   * ゴールキーパーの位置をゴール前半径5m以内に制限
   */
  private constrainGoalkeeperPosition(): void {
    const myPosition = this.character.getPosition();

    // 自チームのゴール位置を取得
    const goal = this.character.team === "ally" ? this.field.getGoal2Backboard() : this.field.getGoal1Backboard();
    const goalPosition = goal.position;

    // ゴールからの距離を計算（XZ平面上）
    const dx = myPosition.x - goalPosition.x;
    const dz = myPosition.z - goalPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // DEFENSE_DISTANCE.GOALKEEPER_MAX_RADIUSを超えた場合、位置を制限
    const maxRadius = DEFENSE_DISTANCE.GOALKEEPER_MAX_RADIUS;
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
   * 現在位置の座標情報を取得（デバッグ用）
   */
  public getCurrentCellInfo(): { cell: string; block: string } | null {
    const pos = this.character.getPosition();
    const cell = FieldGridUtils.worldToCell(pos.x, pos.z);
    const block = FieldGridUtils.worldToBlock(pos.x, pos.z);

    if (cell && block) {
      return {
        cell: `${cell.col}${cell.row}`,
        block: `${block.col}${block.row}`,
      };
    }
    return null;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ処理を追加
  }
}
