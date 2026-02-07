/**
 * チェックモードマネージャー
 * ドリブルチェック、シュートチェック、パスチェック、スローインチェックを管理
 */

import { Scene, Vector3, LinesMesh, MeshBuilder, Color3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { CharacterState } from "../../types/CharacterState";
import { PlayerData } from "../../types/PlayerData";
import { DEFAULT_CHARACTER_CONFIG } from "../../types/CharacterStats";
import { DribblePathVisualizer } from "../../visualization/DribblePathVisualizer";
import { ShootTrajectoryVisualizer } from "../../visualization/ShootTrajectoryVisualizer";
import { PassTrajectoryVisualizer } from "../../visualization/PassTrajectoryVisualizer";
import { ShootingController } from "../../controllers/action/ShootingController";
import { PassCheckController, DefenderPlacement } from "../../controllers/check/PassCheckController";
import { ThrowInCheckController } from "../../controllers/check/ThrowInCheckController";
import { FeintController } from "../../controllers/action/FeintController";
import { FieldGridUtils } from "../../config/FieldGridConfig";
import { OuterCellInfo, getAllOuterCells, getValidReceiverCells, THROW_IN_CHECK_CONFIG } from "../../config/check/ThrowInCheckConfig";

/**
 * ゲームモード
 */
export type GameMode = 'game' | 'dribble_check' | 'shoot_check' | 'pass_check' | 'throw_in_check';

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
  // スローインチェックモード
  // =============================================================================

  /**
   * スローインチェックモード用のセットアップ
   * @param throwerPlayerId スロワーの選手ID
   * @param receiverPlayerId レシーバーの選手ID
   * @param throwerCell スロワーの配置セル（外側マス）
   * @param receiverCell レシーバーの配置セル（フィールド内）
   * @param playerData 選手データ
   */
  public setupThrowInCheckMode(
    throwerPlayerId: string,
    receiverPlayerId: string,
    throwerCell: { col: string; row: number },
    receiverCell: { col: string; row: number },
    playerData?: Record<string, PlayerData>
  ): { thrower: Character; receiver: Character } | null {
    this.resetForCheckMode();
    this.setGameMode('throw_in_check');

    const data = playerData || this.context.savedPlayerData;
    if (!data) {
      console.error('[CheckModeManager] 選手データがありません');
      return null;
    }

    const throwerData = data[throwerPlayerId];
    const receiverData = data[receiverPlayerId];

    if (!throwerData || !receiverData) {
      console.error('[CheckModeManager] 指定された選手IDのデータが見つかりません');
      return null;
    }

    // スロワーの位置を取得（外側マス）
    const throwerWorld = FieldGridUtils.outerCellToWorld(throwerCell.col, throwerCell.row);
    if (!throwerWorld) {
      console.error('[CheckModeManager] スロワーのセル位置が無効です:', throwerCell);
      return null;
    }

    // レシーバーの位置を取得（フィールド内）
    const receiverWorld = FieldGridUtils.cellToWorld(receiverCell.col, receiverCell.row);
    if (!receiverWorld) {
      console.error('[CheckModeManager] レシーバーのセル位置が無効です:', receiverCell);
      return null;
    }

    // スロワーを作成（外側マスに配置）
    const thrower = this.createCheckModeCharacter(
      'ally',
      { x: throwerWorld.x, z: throwerWorld.z },
      throwerData,
      'PG'
    );
    // クランプをスキップして外側マスに配置
    thrower.setPosition(new Vector3(throwerWorld.x, 0, throwerWorld.z), true);
    this.context.addAllyCharacter(thrower);

    // レシーバーを作成
    const receiver = this.createCheckModeCharacter(
      'ally',
      { x: receiverWorld.x, z: receiverWorld.z },
      receiverData,
      'SG'
    );
    this.context.addAllyCharacter(receiver);

    // 衝突判定を更新
    this.context.updateCollisionHandler([thrower, receiver]);

    // 向きを設定
    thrower.lookAt(receiver.getPosition());
    receiver.lookAt(thrower.getPosition());

    // ボールをスロワーに持たせる
    this.context.ball.setHolder(thrower);

    // 状態を設定
    thrower.setState(CharacterState.THROW_IN_THROWER);
    receiver.setState(CharacterState.THROW_IN_RECEIVER);

    return { thrower, receiver };
  }

  /**
   * スローインチェックコントローラーを作成
   */
  public createThrowInCheckController(
    thrower: Character,
    receiver: Character,
    config: {
      minDistance?: number;
      maxDistance?: number;
      timeoutSeconds?: number;
    } = {}
  ): ThrowInCheckController {
    // デフォルト値を適用
    const fullConfig = {
      minDistance: config.minDistance ?? 3,
      maxDistance: config.maxDistance ?? 10,
      timeoutSeconds: config.timeoutSeconds ?? 5,
    };

    return new ThrowInCheckController(
      thrower,
      receiver,
      this.context.ball,
      fullConfig
    );
  }

  /**
   * スローインテストを1回実行
   */
  public executeThrowInTest(): boolean {
    if (this.gameMode !== 'throw_in_check') {
      console.error('[CheckModeManager] スローインチェックモードでのみ使用可能です');
      return false;
    }

    const allyChars = this.context.getAllyCharacters();
    if (allyChars.length < 2) {
      console.error('[CheckModeManager] スロワーとレシーバーが必要です');
      return false;
    }

    const thrower = allyChars[0];
    const receiver = allyChars[1];

    if (this.context.ball.getHolder() !== thrower) {
      console.error('[CheckModeManager] スロワーがボールを持っていません');
      return false;
    }

    // レシーバーの胸の高さを目標に
    const receiverHeight = receiver.config.physical.height;
    const targetPosition = new Vector3(
      receiver.getPosition().x,
      receiverHeight * 0.65,
      receiver.getPosition().z
    );

    // パスを実行
    return this.context.ball.passWithArc(targetPosition, receiver, 'chest');
  }

  /**
   * スローインチェック用の外周セル一覧を取得
   */
  public getAllOuterCellsForThrowInCheck(): OuterCellInfo[] {
    return getAllOuterCells();
  }

  /**
   * 指定された外側マスからパス可能なレシーバーマスを取得
   */
  public getValidReceiverCellsForThrowInCheck(
    outerCell: OuterCellInfo,
    minDistance?: number,
    maxDistance?: number
  ): Array<{ col: string; row: number; worldX: number; worldZ: number; distance: number }> {
    return getValidReceiverCells(
      outerCell,
      minDistance ?? THROW_IN_CHECK_CONFIG.minPassDistance,
      maxDistance ?? THROW_IN_CHECK_CONFIG.maxPassDistance
    );
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
