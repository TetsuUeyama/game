/**
 * チェックモードマネージャー
 * ドリブルチェック、シュートチェック、パスチェックを管理
 */

import { Scene, Vector3, LinesMesh, MeshBuilder, Color3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { CharacterState } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { PlayerData } from "@/GamePlay/GameSystem/CharacterMove/Types/PlayerData";
import { DEFAULT_CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterStats";
import { DribblePathVisualizer } from "@/GamePlay/GameSystem/CharacterMove/Visualization/DribblePathVisualizer";
import { ShootTrajectoryVisualizer } from "@/GamePlay/GameSystem/ShootingSystem/ShootTrajectoryVisualizer";
import { PassTrajectoryVisualizer } from "@/GamePlay/GameSystem/CharacterMove/Visualization/PassTrajectoryVisualizer";
import { ShootingController } from "@/GamePlay/GameSystem/ShootingSystem/ShootingController";
import { PassCheckController, DefenderPlacement } from "@/GamePlay/MatchEngine/CheckControllers/PassCheckController";
import { FeintController } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/FeintController";

/**
 * ゲームモード
 */
export type GameMode = 'game' | 'dribble_check' | 'shoot_check' | 'pass_check' | 'motion_check';

/**
 * チェックモード用コンテキスト
 * GameSceneから必要な依存関係を受け取る
 */
export interface CheckModeContext {
  scene: Scene;
  ball: Ball;
  field: Field;
  savedPlayerData: Record<string, PlayerData> | null;
  shootingController?: ShootingController;
  feintController?: FeintController;
  dribblePathVisualizer?: DribblePathVisualizer;
  shootTrajectoryVisualizer?: ShootTrajectoryVisualizer;
  passTrajectoryVisualizer?: PassTrajectoryVisualizer;

  // コールバック
  getAllCharacters: () => Character[];
  getAllyCharacters: () => Character[];
  getEnemyCharacters: () => Character[];
  isCirclesInContact: () => boolean;

  // キャラクター管理用コールバック
  addAllyCharacter: (character: Character) => void;
  addEnemyCharacter: (character: Character) => void;
  clearCharacters: () => void;
  updateCollisionHandler: (characters: Character[]) => void;
  recreateDribblePathVisualizer: (characters: Character[]) => void;
  recreateShootTrajectoryVisualizer: (characters: Character[]) => void;
  recreatePassTrajectoryVisualizer: (characters: Character[]) => void;
  updatePassTrajectoryVisualizer: () => void;
  clearPassTrajectoryVisualizations: () => void;
}

/**
 * チェックモードマネージャー
 */
export class CheckModeManager {
  private context: CheckModeContext;
  private gameMode: GameMode = 'game';

  // パスチェック用
  private passCheckDistanceLine?: LinesMesh;
  private passCheckPasser?: Character;
  private passCheckReceiver?: Character;

  constructor(context: CheckModeContext) {
    this.context = context;
  }

  // =============================================================================
  // ゲームモード管理
  // =============================================================================

  public getGameMode(): GameMode {
    return this.gameMode;
  }

  public setGameMode(mode: GameMode): void {
    this.gameMode = mode;
  }

  // =============================================================================
  // 共通ヘルパー
  // =============================================================================

  /**
   * チェックモード用のキャラクターを作成
   */
  private createCheckModeCharacter(
    team: 'ally' | 'enemy',
    position: { x: number; z: number },
    playerData: PlayerData,
    playerPosition: 'PG' | 'SG' | 'SF' | 'PF' | 'C'
  ): Character {
    const height = playerData.basic?.height
      ? playerData.basic.height / 100
      : DEFAULT_CHARACTER_CONFIG.physical.height;
    const worldPosition = new Vector3(position.x, height / 2, position.z);

    const character = new Character(this.context.scene, worldPosition, DEFAULT_CHARACTER_CONFIG);
    character.team = team;

    if (playerData && playerPosition) {
      character.setPlayerData(playerData, playerPosition);
      character.setHeight(height);
    }

    // チームカラーを設定
    if (team === 'ally') {
      character.setBodyColor(0.0, 0.4, 1.0); // 青
    } else {
      character.setBodyColor(1.0, 0.0, 0.0); // 赤
    }

    // 物理ボディを初期化（ボールとの衝突判定用）
    character.initializePhysics();

    return character;
  }

  /**
   * チェックモード用にリセット
   */
  private resetForCheckMode(): void {
    // ボールをリリース
    this.context.ball.setHolder(null);

    // 全キャラクターをクリア
    this.context.clearCharacters();

    // パスチェック用ラインをクリア
    this.clearPassCheckDistanceLine();
  }

  // =============================================================================
  // ドリブルチェックモード
  // =============================================================================

  /**
   * ドリブルチェックモード用のセットアップ
   */
  public setupDribbleCheckMode(
    dribblerPlayerId: string,
    defenderPlayerId: string,
    dribblerPosition: { x: number; z: number },
    defenderPosition: { x: number; z: number },
    targetPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): { dribbler: Character; defender: Character } | null {
    this.resetForCheckMode();
    this.setGameMode('dribble_check');

    const data = playerData || this.context.savedPlayerData;
    if (!data) {
      console.error('[CheckModeManager] 選手データがありません');
      return null;
    }

    const dribblerData = data[dribblerPlayerId];
    const defenderData = data[defenderPlayerId];

    if (!dribblerData || !defenderData) {
      console.error('[CheckModeManager] 指定された選手IDのデータが見つかりません');
      return null;
    }

    // ドリブラーを作成
    const dribbler = this.createCheckModeCharacter('ally', dribblerPosition, dribblerData, 'PG');
    this.context.addAllyCharacter(dribbler);

    // ディフェンダーを作成
    const defender = this.createCheckModeCharacter('enemy', defenderPosition, defenderData, 'PG');
    this.context.addEnemyCharacter(defender);

    // 衝突判定を更新
    this.context.updateCollisionHandler([dribbler, defender]);

    // ボールをドリブラーに持たせる
    this.context.ball.setHolder(dribbler);

    // ドリブラーは目標方向を向く
    dribbler.lookAt(new Vector3(targetPosition.x, 0, targetPosition.z));

    // ディフェンダーはドリブラー方向を向く
    defender.lookAt(dribbler.getPosition());

    // 状態を設定
    dribbler.setState(CharacterState.ON_BALL_PLAYER);
    defender.setState(CharacterState.ON_BALL_DEFENDER);

    // ドリブル導線可視化を更新
    this.context.recreateDribblePathVisualizer([dribbler, defender]);

    return { dribbler, defender };
  }

  // =============================================================================
  // シュートチェックモード
  // =============================================================================

  /**
   * シュートチェックモード用のセットアップ
   */
  public setupShootCheckMode(
    shooterPlayerId: string,
    shooterPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    this.resetForCheckMode();
    this.setGameMode('shoot_check');

    const data = playerData || this.context.savedPlayerData;
    if (!data) {
      console.error('[CheckModeManager] 選手データがありません');
      return null;
    }

    const shooterData = data[shooterPlayerId];
    if (!shooterData) {
      console.error('[CheckModeManager] 指定された選手IDのデータが見つかりません:', shooterPlayerId);
      return null;
    }

    // シューターを作成
    const shooter = this.createCheckModeCharacter('ally', shooterPosition, shooterData, 'PG');
    this.context.addAllyCharacter(shooter);

    // 衝突判定を更新
    this.context.updateCollisionHandler([shooter]);

    // 状態を設定
    shooter.setState(CharacterState.ON_BALL_PLAYER);

    // ボールをシューターに持たせる
    this.context.ball.setHolder(shooter);

    // シュート軌道可視化を有効化
    this.context.recreateShootTrajectoryVisualizer([shooter]);

    // ドリブル導線可視化を有効化
    this.context.recreateDribblePathVisualizer([shooter]);

    return shooter;
  }

  /**
   * シュートチェックモードにディフェンダーを追加
   */
  public addShootCheckDefender(
    defenderPlayerId: string,
    defenderPosition: { x: number; z: number },
    playerData?: Record<string, PlayerData>
  ): Character | null {
    if (this.gameMode !== 'shoot_check') {
      console.error('[CheckModeManager] シュートチェックモードでのみ使用可能です');
      return null;
    }

    const data = playerData || this.context.savedPlayerData;
    if (!data) {
      console.error('[CheckModeManager] 選手データがありません');
      return null;
    }

    const defenderData = data[defenderPlayerId];
    if (!defenderData) {
      console.error('[CheckModeManager] 指定された選手IDのデータが見つかりません:', defenderPlayerId);
      return null;
    }

    // ディフェンダーを作成
    const defender = this.createCheckModeCharacter('enemy', defenderPosition, defenderData, 'PG');
    this.context.addEnemyCharacter(defender);

    // シューターの方を向く
    const allyChars = this.context.getAllyCharacters();
    const shooter = allyChars[0];
    if (shooter) {
      defender.lookAt(shooter.getPosition());
    }

    // 状態を設定
    defender.setState(CharacterState.ON_BALL_DEFENDER);

    // 衝突判定を更新
    const allCharacters = this.context.getAllCharacters();
    this.context.updateCollisionHandler(allCharacters);

    // シュート軌道可視化を更新
    this.context.recreateShootTrajectoryVisualizer(allCharacters);

    return defender;
  }

  // =============================================================================
  // パスチェックモード
  // =============================================================================

  /**
   * パスチェックモード用のセットアップ
   * @param passerPlayerId パサーの選手ID
   * @param receiverPlayerId レシーバーの選手ID
   * @param passerPosition パサーの配置位置
   * @param receiverPosition レシーバーの配置位置
   * @param defenderPlacements ディフェンダーの配置（任意）
   * @param playerData 選手データ（外部から渡す場合）
   */
  public setupPassCheckMode(
    passerPlayerId: string,
    receiverPlayerId: string,
    passerPosition: { x: number; z: number },
    receiverPosition: { x: number; z: number },
    defenderPlacements?: Array<{
      defenderPlayerId: string;
      position: { x: number; z: number };
      type: 'on_ball' | 'off_ball';
    }>,
    playerData?: Record<string, PlayerData>
  ): { passer: Character; receiver: Character; defenders: Character[] } | null {
    this.resetForCheckMode();
    this.setGameMode('pass_check');

    const data = playerData || this.context.savedPlayerData;
    if (!data) {
      console.error('[CheckModeManager] 選手データがありません');
      return null;
    }

    const passerData = data[passerPlayerId];
    const receiverData = data[receiverPlayerId];

    if (!passerData) {
      console.error('[CheckModeManager] パサーの選手IDのデータが見つかりません:', passerPlayerId);
      return null;
    }

    if (!receiverData) {
      console.error('[CheckModeManager] レシーバーの選手IDのデータが見つかりません:', receiverPlayerId);
      return null;
    }

    if (passerPlayerId === receiverPlayerId) {
      console.error('[CheckModeManager] パサーとレシーバーは異なる選手を指定してください');
      return null;
    }

    // パサーを作成
    const passer = this.createCheckModeCharacter('ally', passerPosition, passerData, 'PG');
    this.context.addAllyCharacter(passer);

    // レシーバーを作成
    const receiver = this.createCheckModeCharacter('ally', receiverPosition, receiverData, 'SG');
    this.context.addAllyCharacter(receiver);

    const defenders: Character[] = [];
    const checkModeCharacters: Character[] = [passer, receiver];

    // ディフェンダーを作成
    if (defenderPlacements && defenderPlacements.length > 0) {
      for (const placement of defenderPlacements) {
        const defenderData = data[placement.defenderPlayerId];
        if (defenderData) {
          const defender = this.createCheckModeCharacter('enemy', placement.position, defenderData, 'PG');
          this.context.addEnemyCharacter(defender);
          defenders.push(defender);
          checkModeCharacters.push(defender);

          // ディフェンダーのタイプに応じて向きを設定
          if (placement.type === 'on_ball') {
            defender.lookAt(passer.getPosition());
            defender.setState(CharacterState.ON_BALL_DEFENDER);
          } else {
            // パスレーンの中間点を向く
            const midPoint = passer.getPosition().add(receiver.getPosition()).scale(0.5);
            defender.lookAt(midPoint);
            defender.setState(CharacterState.OFF_BALL_DEFENDER);
          }
        }
      }
    }

    // 衝突判定を更新
    this.context.updateCollisionHandler(checkModeCharacters);

    // パサーはレシーバー方向を向く
    passer.lookAt(receiver.getPosition());

    // レシーバーはパサー方向を向く
    receiver.lookAt(passer.getPosition());

    // ボールをパサーに持たせる
    this.context.ball.setHolder(passer);

    // 状態を設定
    passer.setState(CharacterState.ON_BALL_PLAYER);
    receiver.setState(CharacterState.OFF_BALL_PLAYER);

    // パス軌道可視化を有効化
    this.context.recreatePassTrajectoryVisualizer(checkModeCharacters);

    // パスチェック用の参照を保存
    this.passCheckPasser = passer;
    this.passCheckReceiver = receiver;

    // 距離表示ラインを作成
    this.createPassCheckDistanceLine(passer, receiver);

    return { passer, receiver, defenders };
  }

  /**
   * パスチェックコントローラーを作成
   * @param passer パサー
   * @param receiver レシーバー
   * @param config パスチェック設定
   * @returns PassCheckController
   */
  public createPassCheckController(
    passer: Character,
    receiver: Character,
    config: {
      passerCell: { col: string; row: number };
      receiverCell: { col: string; row: number };
      defenders?: DefenderPlacement[];
      trialsPerConfig?: number;
      timeoutSeconds?: number;
      targetGoal: 'goal1' | 'goal2';
    }
  ): PassCheckController {
    return new PassCheckController(
      passer,
      receiver,
      this.context.ball,
      this.context.field,
      {
        ...config,
        trialsPerConfig: config.trialsPerConfig ?? 10,
        timeoutSeconds: config.timeoutSeconds ?? 10,
      }
    );
  }

  /**
   * パスチェック用の距離表示ラインを作成
   */
  private createPassCheckDistanceLine(passer: Character, receiver: Character): void {
    this.clearPassCheckDistanceLine();

    const passerPos = passer.getPosition();
    const receiverPos = receiver.getPosition();

    const points = [
      new Vector3(passerPos.x, 0.1, passerPos.z),
      new Vector3(receiverPos.x, 0.1, receiverPos.z),
    ];

    this.passCheckDistanceLine = MeshBuilder.CreateLines(
      "passCheckDistanceLine",
      { points },
      this.context.scene
    );
    this.passCheckDistanceLine.color = new Color3(0, 1, 0);
  }

  /**
   * パスチェック用の距離表示ラインをクリア
   */
  private clearPassCheckDistanceLine(): void {
    if (this.passCheckDistanceLine) {
      this.passCheckDistanceLine.dispose();
      this.passCheckDistanceLine = undefined;
    }
  }

  /**
   * パスチェックモードの可視化を更新
   * PassCheckModePanelの更新ループから呼び出す
   */
  public updatePassCheckVisualization(): void {
    // パス軌道可視化を更新
    this.context.updatePassTrajectoryVisualizer();

    // 距離表示ラインを更新（選手が移動しても追従する）
    if (this.passCheckPasser && this.passCheckReceiver) {
      this.createPassCheckDistanceLine(this.passCheckPasser, this.passCheckReceiver);
    }
  }

  /**
   * パスチェックモードの可視化をクリア
   */
  public clearPassCheckVisualization(): void {
    this.clearPassCheckDistanceLine();
    this.passCheckPasser = undefined;
    this.passCheckReceiver = undefined;
    this.context.clearPassTrajectoryVisualizations();
  }

  /**
   * パスチェックの距離を取得
   */
  public getPassCheckDistance(): number | null {
    if (!this.passCheckPasser || !this.passCheckReceiver) {
      return null;
    }

    const passerPos = this.passCheckPasser.getPosition();
    const receiverPos = this.passCheckReceiver.getPosition();

    return Vector3.Distance(
      new Vector3(passerPos.x, 0, passerPos.z),
      new Vector3(receiverPos.x, 0, receiverPos.z)
    );
  }

  // =============================================================================
  // モーションチェックモード
  // =============================================================================

  /**
   * モーションチェックモード用のセットアップ
   */
  public setupMotionCheckMode(
    playerId: string,
    playerData?: Record<string, PlayerData>
  ): Character | null {
    this.resetForCheckMode();
    this.setGameMode('motion_check');

    const data = playerData || this.context.savedPlayerData;
    if (!data) return null;

    const pd = data[playerId];
    if (!pd) return null;

    // キャラクターをフィールド中央に作成
    const character = this.createCheckModeCharacter('ally', { x: 0, z: 0 }, pd, 'PG');

    this.context.addAllyCharacter(character);
    this.context.updateCollisionHandler([character]);

    return character;
  }

  // =============================================================================
  // チェックモード終了
  // =============================================================================

  /**
   * チェックモードを終了してゲームモードに戻る
   */
  public exitCheckMode(): void {
    this.clearPassCheckVisualization();
    this.setGameMode('game');
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.clearPassCheckDistanceLine();
    this.passCheckPasser = undefined;
    this.passCheckReceiver = undefined;
  }
}
