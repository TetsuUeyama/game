import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { BaseStateAI } from "@/GamePlay/GameSystem/DecisionMakingSystem/AI/State/BaseStateAI";
import { IDLE_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/IdleMotion";
import { WALK_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/WalkMotion";
import { DASH_FORWARD_MOTION } from "@/GamePlay/GameSystem/CharacterMove/Motion/DashMotion";
import { PlayerStateManager } from "@/GamePlay/GameSystem/StatusCheckSystem";
import { LooseBallDecisionSystem } from "@/GamePlay/GameSystem/LooseBallSystem/LooseBallDecisionSystem";
import { LooseBallController } from "@/GamePlay/GameSystem/LooseBallSystem/LooseBallController";

/**
 * ルーズボール時のAI
 * ボールが誰にも保持されていない状態での行動を制御
 *
 * 判断ロジック（ボール追跡判定、味方反発、守備位置）は
 * LooseBallDecisionSystemに委譲し、ここでは移動実行のみを担当する。
 */
/** アクション開始距離（m） */
const PICKUP_TRIGGER_DISTANCE = 1.5;

export class LooseBallAI extends BaseStateAI {
  private decisionSystem: LooseBallDecisionSystem | null = null;
  private looseBallController: LooseBallController | null = null;

  constructor(
    character: Character,
    ball: Ball,
    allCharacters: Character[],
    field: Field,
    playerState?: PlayerStateManager
  ) {
    super(character, ball, allCharacters, field, playerState);
  }

  /**
   * LooseBallDecisionSystemを設定
   */
  public setDecisionSystem(system: LooseBallDecisionSystem): void {
    this.decisionSystem = system;
  }

  /**
   * LooseBallControllerを設定
   */
  public setLooseBallController(controller: LooseBallController): void {
    this.looseBallController = controller;
  }

  /**
   * AIの更新処理
   * 1つのif/else ifチェーンで全分岐を処理
   * 判断はLooseBallDecisionSystemから取得し、移動実行のみを行う
   */
  public update(deltaTime: number): void {
    const ballPosition = this.ball.getPosition();
    const myPosition = this.character.getPosition();

    // LooseBallDecisionSystemから判断を取得
    const shouldChase = this.decisionSystem
      ? this.decisionSystem.shouldChase(this.character)
      : this.fallbackShouldChase();
    const isNearGoal = this.decisionSystem
      ? this.decisionSystem.isNearGoal()
      : false;

    // ボールへの方向と距離
    const toBall = new Vector3(ballPosition.x - myPosition.x, 0, ballPosition.z - myPosition.z);
    const distToBall = toBall.length();

    if (shouldChase && distToBall <= PICKUP_TRIGGER_DISTANCE && distToBall > 0.01) {
      // ── ボール追跡: 確保距離内 → コントローラーで確保アクション試行 ──
      toBall.normalize();
      this.character.setRotation(Math.atan2(toBall.x, toBall.z));

      if (this.looseBallController?.trySecureBall(this.character)) {
        return; // アクション開始成功
      }

      // 失敗時はゆっくり接近（下の近距離処理にフォールスルー）
      const adjusted = this.adjustDirectionForCollision(toBall.scale(0.5), deltaTime);
      if (adjusted) {
        this.character.move(adjusted, deltaTime);
        if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
          this.character.getMotionController().play(WALK_FORWARD_MOTION);
        }
      } else if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
      }

    } else if (shouldChase && distToBall <= 0.01) {
      // ── ボール追跡: 到着済み → 待機 ──
      if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
        this.character.getMotionController().play(IDLE_MOTION);
      }

    } else if (shouldChase && distToBall > 2.0) {
      // ── ボール追跡: 遠距離 → ダッシュ ──
      toBall.normalize();
      this.character.setRotation(Math.atan2(toBall.x, toBall.z));
      const adjusted = this.adjustDirectionForCollision(toBall, deltaTime);
      if (adjusted) {
        this.character.move(adjusted, deltaTime);
        if (this.character.getMotionController().getCurrentMotionName() !== 'dash_forward') {
          this.character.getMotionController().play(DASH_FORWARD_MOTION);
        }
      } else {
        const alt = this.tryAlternativeDirection(toBall, deltaTime);
        if (alt) {
          this.character.move(alt, deltaTime);
          if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
            this.character.getMotionController().play(WALK_FORWARD_MOTION);
          }
        } else if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
          this.character.getMotionController().play(IDLE_MOTION);
        }
      }

    } else if (shouldChase) {
      // ── ボール追跡: 近距離 → 歩行（スロー） ──
      toBall.normalize();
      this.character.setRotation(Math.atan2(toBall.x, toBall.z));
      const adjusted = this.adjustDirectionForCollision(toBall.scale(0.5), deltaTime);
      if (adjusted) {
        this.character.move(adjusted, deltaTime);
        if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
          this.character.getMotionController().play(WALK_FORWARD_MOTION);
        }
      } else {
        const alt = this.tryAlternativeDirection(toBall, deltaTime);
        if (alt) {
          this.character.move(alt, deltaTime);
          if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
            this.character.getMotionController().play(WALK_FORWARD_MOTION);
          }
        } else if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
          this.character.getMotionController().play(IDLE_MOTION);
        }
      }

    } else {
      // ── 非追跡: リバウンドポジション or 守備帰還 ──
      const repulsion = this.decisionSystem
        ? this.decisionSystem.getRepulsionDir(this.character)
        : null;
      const targetPos = this.decisionSystem
        ? this.decisionSystem.getDefensivePosition(this.character)
        : null;

      if (repulsion) {
        // 味方が3m以内 → 離れる方向に移動（最優先）
        this.character.setRotation(Math.atan2(repulsion.x, repulsion.z));
        const adjusted = this.adjustDirectionForCollision(repulsion, deltaTime);
        if (adjusted) {
          this.character.move(adjusted, deltaTime);
          if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
            this.character.getMotionController().play(WALK_FORWARD_MOTION);
          }
        } else if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
          this.character.getMotionController().play(IDLE_MOTION);
        }
      } else if (targetPos) {
        const distToTarget = Vector3.Distance(myPosition, targetPos);
        const arrivalThreshold = isNearGoal ? 1.0 : 1.5;

        if (distToTarget < arrivalThreshold) {
          // 目標位置に到着 → ボールを見て待機
          if (toBall.length() > 0.01) {
            this.character.setRotation(Math.atan2(toBall.x, toBall.z));
          }
          if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
            this.character.getMotionController().play(IDLE_MOTION);
          }
        } else {
          // 目標位置に移動
          const dir = new Vector3(targetPos.x - myPosition.x, 0, targetPos.z - myPosition.z).normalize();
          this.character.setRotation(Math.atan2(dir.x, dir.z));
          const adjusted = this.adjustDirectionForCollision(dir, deltaTime);
          if (adjusted) {
            this.character.move(adjusted, deltaTime);
            if (distToTarget > 5.0) {
              if (this.character.getMotionController().getCurrentMotionName() !== 'dash_forward') {
                this.character.getMotionController().play(DASH_FORWARD_MOTION);
              }
            } else if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
              this.character.getMotionController().play(WALK_FORWARD_MOTION);
            }
          } else {
            const alt = this.tryAlternativeDirection(dir, deltaTime);
            if (alt) {
              this.character.move(alt, deltaTime);
              if (this.character.getMotionController().getCurrentMotionName() !== 'walk_forward') {
                this.character.getMotionController().play(WALK_FORWARD_MOTION);
              }
            } else if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
              this.character.getMotionController().play(IDLE_MOTION);
            }
          }
        }
      } else {
        // targetPosが取得できない場合はボールを見て待機
        if (toBall.length() > 0.01) {
          this.character.setRotation(Math.atan2(toBall.x, toBall.z));
        }
        if (this.character.getMotionController().getCurrentMotionName() !== 'idle') {
          this.character.getMotionController().play(IDLE_MOTION);
        }
      }
    }
  }

  /**
   * DecisionSystemがない場合のフォールバック
   * （初期化タイミングのずれを考慮）
   */
  private fallbackShouldChase(): boolean {
    return true;
  }

  /**
   * 代替方向を試す（衝突時に複数の方向を試す）
   */
  private tryAlternativeDirection(originalDirection: Vector3, deltaTime: number): Vector3 | null {
    const angles = [45, -45, 90, -90, 135, -135];

    for (const angleDeg of angles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      const altDirection = new Vector3(
        originalDirection.x * cos - originalDirection.z * sin,
        0,
        originalDirection.x * sin + originalDirection.z * cos
      );

      const adjusted = this.adjustDirectionForCollision(altDirection, deltaTime);
      if (adjusted) {
        return adjusted;
      }
    }
    return null;
  }
}
