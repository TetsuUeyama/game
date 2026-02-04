import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { Field } from "../../entities/Field";
import { ShootingController, ShootType } from "../action/ShootingController";
import { GRID_CONFIG, FieldGridUtils, CellCoord } from "../../config/FieldGridConfig";
import { DEFAULT_CHARACTER_CONFIG } from "../../types/CharacterStats";
import {
  SHOOT_CHECK_TIMING,
  SHOOT_CHECK_DETECTION,
  SHOOT_CHECK_GOAL_POSITION,
  CellShootResult,
  ShootCheckState,
  ShotTypeFilter,
  ShootCheckConfig,
  ShootCheckProgress,
} from "../../config/check/ShootCheckConfig";

// 型をre-export
export type { CellShootResult, ShootCheckState, ShotTypeFilter, ShootCheckConfig, ShootCheckProgress };

/**
 * シュートチェックコントローラー
 * 各升目から100本シュートを打ち、成功率を計測する
 */
export class ShootCheckController {
  private character: Character;
  private ball: Ball;
  private shootingController: ShootingController;

  // 設定
  private config: ShootCheckConfig;

  // 状態
  private state: ShootCheckState = 'idle';
  private currentCellIndex: number = 0;
  private currentShotCount: number = 0;
  private currentCellSuccessCount: number = 0;

  // 単一セルモード
  private singleCellMode: boolean = false;
  private singleCell: CellCoord | null = null;

  // 全升目リスト
  private allCells: CellCoord[] = [];

  // 結果
  private results: Map<string, CellShootResult> = new Map();

  // コールバック
  private onProgressCallback: ((progress: ShootCheckProgress) => void) | null = null;
  private onCellCompleteCallback: ((result: CellShootResult) => void) | null = null;
  private onCompleteCallback: ((results: CellShootResult[]) => void) | null = null;

  // シュート判定用
  private waitingForShot: boolean = false;
  private waitingForBallRelease: boolean = false; // ボール発射待ち（アニメーション中）
  private shotStartTime: number = 0;

  // バウンド検知用
  private ballReachedPeak: boolean = false; // ボールが最高点を通過したか
  private lastBallY: number = 0;

  // ゴール判定用
  private goalScored: boolean = false;

  constructor(
    character: Character,
    ball: Ball,
    _field: Field,
    shootingController: ShootingController,
    config: ShootCheckConfig
  ) {
    this.character = character;
    this.ball = ball;
    this.shootingController = shootingController;
    // デフォルト値を設定
    this.config = {
      ...config,
      shotTypeFilter: config.shotTypeFilter ?? 'all',
    };

    // 全升目リストを生成
    this.generateAllCells();
  }

  /**
   * シュートタイプがフィルターに一致するかチェック
   */
  private matchesShotTypeFilter(shootType: ShootType | 'out_of_range'): boolean {
    const filter = this.config.shotTypeFilter ?? 'all';
    if (filter === 'all') {
      return true;
    }
    return shootType === filter;
  }

  /**
   * 全升目リストを生成
   */
  private generateAllCells(): void {
    this.allCells = [];
    for (let col = 0; col < GRID_CONFIG.cell.colCount; col++) {
      for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
        this.allCells.push({
          col: GRID_CONFIG.cell.colLabels[col],
          row: row,
        });
      }
    }
  }

  /**
   * シュートチェックを開始（全マスモード）
   */
  public start(): void {
    if (this.state === 'running') return;

    this.state = 'running';
    this.currentCellIndex = 0;
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;
    this.results.clear();
    this.singleCellMode = false;
    this.singleCell = null;

    // キャラクターのチームを設定
    this.character.team = this.config.targetGoal === 'goal1' ? 'ally' : 'enemy';

    // 最初の升目に移動
    this.moveToCurrentCell();
  }

  /**
   * 指定セルでシュートチェックを開始（単一セルモード）
   * @param col 列（A-O）
   * @param row 行（1-30）
   */
  public startSingleCell(col: string, row: number): void {
    if (this.state === 'running') return;

    this.state = 'running';
    this.currentCellIndex = 0;
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;
    this.results.clear();
    this.singleCellMode = true;
    this.singleCell = { col, row };

    // キャラクターのチームを設定
    this.character.team = this.config.targetGoal === 'goal1' ? 'ally' : 'enemy';

    // 指定セルに移動
    this.moveToSingleCell();
  }

  /**
   * 単一セルに移動（単一セルモード用）
   */
  private moveToSingleCell(): void {
    if (!this.singleCell) {
      this.state = 'completed';
      return;
    }

    const worldPos = FieldGridUtils.cellToWorld(this.singleCell.col, this.singleCell.row);

    if (!worldPos) {
      // 無効なセル
      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback([]);
      }
      return;
    }

    // キャラクターを移動
    const characterHeight = this.character.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
    this.character.setPosition(new Vector3(worldPos.x, characterHeight / 2, worldPos.z));

    // ゴール方向を向く
    const goalZ = this.config.targetGoal === 'goal1'
      ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
      : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;
    const goalPosition = new Vector3(0, 0, goalZ);
    this.character.lookAt(goalPosition);

    // ボールをキャラクターに持たせる
    this.ball.setHolder(this.character);

    // シュートカウントをリセット
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;

    // シュートレンジをチェック
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);

    if (!rangeInfo || !rangeInfo.inRange || !rangeInfo.facingGoal) {
      // レンジ外の場合、即終了
      const cellName = `${this.singleCell.col}${this.singleCell.row}`;
      const result: CellShootResult = {
        cellName,
        col: this.singleCell.col,
        row: this.singleCell.row,
        worldX: worldPos.x,
        worldZ: worldPos.z,
        shootType: 'out_of_range',
        totalShots: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        completed: true,
      };
      this.results.set(cellName, result);

      if (this.onCellCompleteCallback) {
        this.onCellCompleteCallback(result);
      }

      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback([result]);
      }
      return;
    }

    // シュートタイプフィルターをチェック
    if (!this.matchesShotTypeFilter(rangeInfo.shootType)) {
      // フィルターに一致しない場合、テストせずに終了
      const cellName = `${this.singleCell.col}${this.singleCell.row}`;
      const result: CellShootResult = {
        cellName,
        col: this.singleCell.col,
        row: this.singleCell.row,
        worldX: worldPos.x,
        worldZ: worldPos.z,
        shootType: rangeInfo.shootType,
        totalShots: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        completed: false,  // フィルターでスキップ
      };
      this.results.set(cellName, result);

      if (this.onCellCompleteCallback) {
        this.onCellCompleteCallback(result);
      }

      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback([result]);
      }
      return;
    }

    // シュートを開始
    this.shootNextShot();
  }

  /**
   * シュートチェックを一時停止
   */
  public pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
    }
  }

  /**
   * シュートチェックを再開
   */
  public resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
    }
  }

  /**
   * シュートチェックを中断
   */
  public abort(): void {
    this.state = 'aborted';
    this.waitingForShot = false;
    this.waitingForBallRelease = false;

    // 完了コールバックを呼び出し（途中結果）
    if (this.onCompleteCallback) {
      this.onCompleteCallback(Array.from(this.results.values()));
    }
  }

  /**
   * 現在の升目に移動
   */
  private moveToCurrentCell(): void {
    if (this.currentCellIndex >= this.allCells.length) {
      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback(Array.from(this.results.values()));
      }
      return;
    }

    const cell = this.allCells[this.currentCellIndex];
    const worldPos = FieldGridUtils.cellToWorld(cell.col, cell.row);

    if (!worldPos) {
      // 無効な升目はスキップ
      this.currentCellIndex++;
      this.moveToCurrentCell();
      return;
    }

    // キャラクターを移動
    const characterHeight = this.character.config?.physical?.height ?? DEFAULT_CHARACTER_CONFIG.physical.height;
    this.character.setPosition(new Vector3(worldPos.x, characterHeight / 2, worldPos.z));

    // ゴール方向を向く
    const goalZ = this.config.targetGoal === 'goal1'
      ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
      : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;
    const goalPosition = new Vector3(0, 0, goalZ);
    this.character.lookAt(goalPosition);

    // ボールをキャラクターに持たせる
    this.ball.setHolder(this.character);

    // シュートカウントをリセット
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;

    // シュートレンジをチェック
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);

    if (!rangeInfo || !rangeInfo.inRange || !rangeInfo.facingGoal) {
      // レンジ外の場合、結果を記録して次の升目へ
      const cellName = `${cell.col}${cell.row}`;
      const result: CellShootResult = {
        cellName,
        col: cell.col,
        row: cell.row,
        worldX: worldPos.x,
        worldZ: worldPos.z,
        shootType: 'out_of_range',
        totalShots: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        completed: true,
      };
      this.results.set(cellName, result);

      if (this.onCellCompleteCallback) {
        this.onCellCompleteCallback(result);
      }

      this.reportProgress();

      // 次の升目へ
      this.currentCellIndex++;
      // 少し遅延を入れて次の升目へ
      setTimeout(() => this.moveToCurrentCell(), SHOOT_CHECK_TIMING.OUT_OF_RANGE_SKIP_DELAY_MS);
      return;
    }

    // シュートタイプフィルターをチェック
    if (!this.matchesShotTypeFilter(rangeInfo.shootType)) {
      // フィルターに一致しない場合、スキップして次の升目へ
      const cellName = `${cell.col}${cell.row}`;
      const result: CellShootResult = {
        cellName,
        col: cell.col,
        row: cell.row,
        worldX: worldPos.x,
        worldZ: worldPos.z,
        shootType: rangeInfo.shootType,
        totalShots: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        completed: false,  // スキップなので未完了
      };
      this.results.set(cellName, result);

      // 次の升目へ
      this.currentCellIndex++;
      setTimeout(() => this.moveToCurrentCell(), SHOOT_CHECK_TIMING.FILTER_SKIP_DELAY_MS);
      return;
    }

    // シュートを開始
    this.shootNextShot();
  }

  /**
   * 次のシュートを実行
   */
  private shootNextShot(): void {
    if (this.state !== 'running') return;

    if (this.currentShotCount >= this.config.shotsPerCell) {
      // この升目のシュートが完了
      this.completeCellResult();
      return;
    }

    // ゴール方向を向く（毎回確実に向ける）
    const goalZ = this.config.targetGoal === 'goal1'
      ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
      : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;
    const goalPosition = new Vector3(0, 0, goalZ);
    this.character.lookAt(goalPosition);

    // ボールをキャラクターに持たせる
    if (!this.ball.isHeld()) {
      this.ball.setHolder(this.character);
    }

    // シュートアクションを開始（アニメーション付き）
    const result = this.shootingController.startShootAction(this.character);

    if (result.success) {
      // アニメーション開始成功 → ボールが発射されるのを待つ
      this.waitingForShot = true;
      this.waitingForBallRelease = true;
      this.shotStartTime = Date.now();
    } else {
      // シュート開始失敗 → 少し待ってリトライ（アクション中の可能性）
      setTimeout(() => {
        if (this.state === 'running') {
          this.shootNextShot();
        }
      }, 100);
    }
  }

  /**
   * 現在の升目の結果を確定
   */
  private completeCellResult(): void {
    // 単一セルモードと全マスモードでセル情報の取得方法が異なる
    const cell = this.singleCellMode
      ? this.singleCell!
      : this.allCells[this.currentCellIndex];
    const worldPos = FieldGridUtils.cellToWorld(cell.col, cell.row);
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character);

    const cellName = `${cell.col}${cell.row}`;
    const result: CellShootResult = {
      cellName,
      col: cell.col,
      row: cell.row,
      worldX: worldPos?.x ?? 0,
      worldZ: worldPos?.z ?? 0,
      shootType: rangeInfo?.shootType ?? 'out_of_range',
      totalShots: this.currentShotCount,
      successCount: this.currentCellSuccessCount,
      failureCount: this.currentShotCount - this.currentCellSuccessCount,
      successRate: this.currentShotCount > 0
        ? (this.currentCellSuccessCount / this.currentShotCount) * 100
        : 0,
      completed: true,
    };

    this.results.set(cellName, result);

    if (this.onCellCompleteCallback) {
      this.onCellCompleteCallback(result);
    }

    this.reportProgress();

    // 単一セルモードでは完了、全マスモードでは次の升目へ
    if (this.singleCellMode) {
      this.state = 'completed';
      if (this.onCompleteCallback) {
        this.onCompleteCallback([result]);
      }
    } else {
      this.currentCellIndex++;
      setTimeout(() => this.moveToCurrentCell(), SHOOT_CHECK_TIMING.CELL_CHANGE_DELAY_MS);
    }
  }

  /**
   * 更新処理（毎フレーム呼び出し）
   */
  public update(_deltaTime: number): void {
    if (this.state !== 'running') return;

    if (this.waitingForShot) {
      // シュート結果を待機中
      this.checkShotResult();
    }
  }

  /**
   * シュート結果をチェック
   */
  private checkShotResult(): void {
    // タイムアウトチェック
    if (Date.now() - this.shotStartTime > SHOOT_CHECK_TIMING.SHOT_TIMEOUT_MS) {
      // タイムアウト→失敗として扱う
      this.waitingForBallRelease = false;
      this.ballReachedPeak = false;
      this.onShotComplete(false);
      return;
    }

    // ボール発射待ち中（アニメーション中）
    if (this.waitingForBallRelease) {
      // ボールが発射されたらフラグを解除
      if (this.ball.isInFlight()) {
        this.waitingForBallRelease = false;
        this.ballReachedPeak = false;
        const ballPos = this.ball.getPosition();
        this.lastBallY = ballPos.y;
      }
      return;
    }

    // ゴールが決まった場合
    if (this.goalScored) {
      this.goalScored = false;
      this.ballReachedPeak = false;
      this.onShotComplete(true);
      return;
    }

    // ボールの現在位置を取得
    const ballPos = this.ball.getPosition();
    const currentY = ballPos.y;

    // 最高点検知：ボールが下降し始めたら最高点を通過したとみなす
    if (!this.ballReachedPeak && currentY < this.lastBallY) {
      this.ballReachedPeak = true;
    }

    // 床バウンド検知：最高点を通過後、床付近に達したら失敗
    if (this.ballReachedPeak && currentY <= SHOOT_CHECK_DETECTION.FLOOR_BOUNCE_HEIGHT) {
      this.ballReachedPeak = false;
      this.onShotComplete(false);
      return;
    }

    // Y位置を更新
    this.lastBallY = currentY;

    // ボールが飛行中でなくなった場合も失敗（フォールバック）
    if (!this.ball.isInFlight()) {
      this.ballReachedPeak = false;
      this.onShotComplete(false);
    }
  }

  /**
   * ゴールが決まったことを通知
   * ShootingControllerのコールバックから呼び出される
   */
  public notifyGoalScored(): void {
    this.goalScored = true;
  }

  /**
   * シュート完了時の処理
   */
  private onShotComplete(success: boolean): void {
    this.waitingForShot = false;
    this.waitingForBallRelease = false;
    this.currentShotCount++;

    if (success) {
      this.currentCellSuccessCount++;
    }

    this.reportProgress();

    // ボールをリセットしてキャラクターに持たせる
    this.ball.endFlight();

    // キャラクターのバランスをリセット（ジャンプ後のロック状態を解除）
    // resetBalance() は内部で actionController.cancelAction() も呼び出す
    this.character.resetBalance();

    // 少し遅延を入れて次のシュートへ
    setTimeout(() => {
      if (this.state === 'running') {
        this.ball.setHolder(this.character);
        this.shootNextShot();
      }
    }, SHOOT_CHECK_TIMING.SHOT_INTERVAL_DELAY_MS);
  }

  /**
   * 進捗を報告
   */
  private reportProgress(): void {
    if (this.onProgressCallback) {
      // 単一セルモードと全マスモードでセル情報の取得方法が異なる
      const cell = this.singleCellMode
        ? this.singleCell
        : this.allCells[this.currentCellIndex];
      this.onProgressCallback({
        totalCells: this.singleCellMode ? 1 : this.allCells.length,
        completedCells: this.singleCellMode ? 0 : this.currentCellIndex,
        currentCell: cell ? `${cell.col}${cell.row}` : '',
        currentCellShots: this.currentShotCount,
        shotsPerCell: this.config.shotsPerCell,
        state: this.state,
        shotTypeFilter: this.config.shotTypeFilter ?? 'all',
      });
    }
  }

  /**
   * 進捗コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: ShootCheckProgress) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * 升目完了コールバックを設定
   */
  public setOnCellCompleteCallback(callback: (result: CellShootResult) => void): void {
    this.onCellCompleteCallback = callback;
  }

  /**
   * 完了コールバックを設定
   */
  public setOnCompleteCallback(callback: (results: CellShootResult[]) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * 現在の状態を取得
   */
  public getState(): ShootCheckState {
    return this.state;
  }

  /**
   * 結果を取得
   */
  public getResults(): CellShootResult[] {
    return Array.from(this.results.values());
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.state = 'idle';
    this.waitingForShot = false;
    this.results.clear();
  }
}
