/**
 * スローインチェックコントローラー
 * 外枠マスからフィールド内へのスローインをテストする
 * シュートチェックモードと同様の構造で、スロワーが外枠を移動し、
 * 各位置からレシーバーが内側マスを1マスずつ移動してパスを受ける
 */

import { Vector3 } from "@babylonjs/core";
import { Character } from "../../entities/Character";
import { Ball } from "../../entities/Ball";
import { FieldGridUtils, GRID_CONFIG, OUTER_GRID_CONFIG } from "../../config/FieldGridConfig";

/**
 * 外側マスの情報
 */
export interface OuterCellInfo {
  col: string;
  row: number;
  worldX: number;
  worldZ: number;
  type: 'sideline_left' | 'sideline_right' | 'endline_top' | 'endline_bottom' | 'corner';
}

/**
 * 内側マスの情報
 */
export interface InnerCellInfo {
  col: string;
  row: number;
  worldX: number;
  worldZ: number;
}

/**
 * スローインテスト結果（1回のパス）
 */
export interface ThrowInTestResult {
  throwerCell: { col: string; row: number };
  receiverCell: { col: string; row: number };
  distance: number;
  success: boolean;
  catchTime?: number;
  error?: string;
}

/**
 * 外側マスごとの結果
 */
export interface OuterCellResult {
  outerCell: OuterCellInfo;
  tests: ThrowInTestResult[];
  successCount: number;
  failCount: number;
  successRate: number;
}

/**
 * スローインチェック進捗情報
 */
export interface ThrowInCheckProgress {
  currentOuterCellIndex: number;
  currentInnerCellIndex: number;
  totalOuterCells: number;
  totalInnerCells: number;
  completedTests: number;
  totalTests: number;
  successCount: number;
  failCount: number;
  currentOuterCell: string;
  currentInnerCell: string;
}

/**
 * スローインチェック設定
 */
export interface ThrowInCheckConfig {
  minDistance: number;
  maxDistance: number;
  timeoutSeconds: number;
}

export type ThrowInCheckState = 'idle' | 'moving_thrower' | 'moving_receiver' | 'throwing' | 'waiting_catch' | 'completed';

/**
 * スローインチェックコントローラー
 */
export class ThrowInCheckController {
  private thrower: Character;
  private receiver: Character;
  private ball: Ball;
  private config: ThrowInCheckConfig;

  private state: ThrowInCheckState = 'idle';

  // 外側マスリスト
  private outerCells: OuterCellInfo[] = [];
  private currentOuterCellIndex: number = 0;

  // 内側マスリスト（現在の外側マスから有効な距離にあるもの）
  private innerCells: InnerCellInfo[] = [];
  private currentInnerCellIndex: number = 0;

  // 結果
  private results: OuterCellResult[] = [];
  private currentOuterCellTests: ThrowInTestResult[] = [];

  // タイミング
  private throwTime: number = 0;
  private moveDelay: number = 0;
  private static readonly MOVE_DELAY = 0.3; // マス移動後の待機時間

  // 統計
  private totalSuccessCount: number = 0;
  private totalFailCount: number = 0;

  // コールバック
  private onProgress?: (progress: ThrowInCheckProgress) => void;
  private onTestComplete?: (result: ThrowInTestResult) => void;
  private onOuterCellComplete?: (result: OuterCellResult) => void;
  private onAllComplete?: (results: OuterCellResult[]) => void;

  constructor(
    thrower: Character,
    receiver: Character,
    ball: Ball,
    config: ThrowInCheckConfig
  ) {
    this.thrower = thrower;
    this.receiver = receiver;
    this.ball = ball;
    this.config = config;
  }

  /**
   * コールバックを設定
   */
  public setOnProgressCallback(callback: (progress: ThrowInCheckProgress) => void): void {
    this.onProgress = callback;
  }

  public setOnTestCompleteCallback(callback: (result: ThrowInTestResult) => void): void {
    this.onTestComplete = callback;
  }

  public setOnOuterCellCompleteCallback(callback: (result: OuterCellResult) => void): void {
    this.onOuterCellComplete = callback;
  }

  public setOnAllCompleteCallback(callback: (results: OuterCellResult[]) => void): void {
    this.onAllComplete = callback;
  }

  /**
   * 全ての外側マスを取得
   */
  private getAllOuterCells(): OuterCellInfo[] {
    const outerCells: OuterCellInfo[] = [];

    // 左サイドライン（@列、行1〜30）
    for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
      const world = FieldGridUtils.outerCellToWorld(OUTER_GRID_CONFIG.outerColumnLeft, row);
      if (world) {
        outerCells.push({
          col: OUTER_GRID_CONFIG.outerColumnLeft,
          row,
          worldX: world.x,
          worldZ: world.z,
          type: 'sideline_left',
        });
      }
    }

    // 右サイドライン（P列、行1〜30）
    for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
      const world = FieldGridUtils.outerCellToWorld(OUTER_GRID_CONFIG.outerColumnRight, row);
      if (world) {
        outerCells.push({
          col: OUTER_GRID_CONFIG.outerColumnRight,
          row,
          worldX: world.x,
          worldZ: world.z,
          type: 'sideline_right',
        });
      }
    }

    // 上エンドライン（0行、列A〜O）
    for (const col of GRID_CONFIG.cell.colLabels) {
      const world = FieldGridUtils.outerCellToWorld(col, OUTER_GRID_CONFIG.outerRowTop);
      if (world) {
        outerCells.push({
          col,
          row: OUTER_GRID_CONFIG.outerRowTop,
          worldX: world.x,
          worldZ: world.z,
          type: 'endline_top',
        });
      }
    }

    // 下エンドライン（31行、列A〜O）
    for (const col of GRID_CONFIG.cell.colLabels) {
      const world = FieldGridUtils.outerCellToWorld(col, OUTER_GRID_CONFIG.outerRowBottom);
      if (world) {
        outerCells.push({
          col,
          row: OUTER_GRID_CONFIG.outerRowBottom,
          worldX: world.x,
          worldZ: world.z,
          type: 'endline_bottom',
        });
      }
    }

    return outerCells;
  }

  /**
   * 指定された外側マスから有効な距離にある内側マスを取得
   */
  private getValidInnerCells(outerCell: OuterCellInfo): InnerCellInfo[] {
    const innerCells: InnerCellInfo[] = [];

    for (let row = 1; row <= GRID_CONFIG.cell.rowCount; row++) {
      for (const col of GRID_CONFIG.cell.colLabels) {
        const world = FieldGridUtils.cellToWorld(col, row);
        if (!world) continue;

        const dx = world.x - outerCell.worldX;
        const dz = world.z - outerCell.worldZ;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance >= this.config.minDistance && distance <= this.config.maxDistance) {
          innerCells.push({
            col,
            row,
            worldX: world.x,
            worldZ: world.z,
          });
        }
      }
    }

    // 距離でソート
    innerCells.sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.worldX - outerCell.worldX, 2) +
        Math.pow(a.worldZ - outerCell.worldZ, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.worldX - outerCell.worldX, 2) +
        Math.pow(b.worldZ - outerCell.worldZ, 2)
      );
      return distA - distB;
    });

    return innerCells;
  }

  /**
   * テストを開始
   */
  public start(): void {
    console.log('[ThrowInCheck] スローインチェックを開始');

    // 全ての外側マスを取得
    this.outerCells = this.getAllOuterCells();
    this.currentOuterCellIndex = 0;
    this.results = [];
    this.totalSuccessCount = 0;
    this.totalFailCount = 0;

    console.log(`[ThrowInCheck] 外側マス数: ${this.outerCells.length}`);

    // 最初の外側マスへ移動
    this.moveToNextOuterCell();
  }

  /**
   * 次の外側マスへ移動
   */
  private moveToNextOuterCell(): void {
    if (this.currentOuterCellIndex >= this.outerCells.length) {
      this.completeAllTests();
      return;
    }

    const outerCell = this.outerCells[this.currentOuterCellIndex];

    // 有効な内側マスを取得
    this.innerCells = this.getValidInnerCells(outerCell);
    this.currentInnerCellIndex = 0;
    this.currentOuterCellTests = [];

    if (this.innerCells.length === 0) {
      console.log(`[ThrowInCheck] 外側マス ${outerCell.col}${outerCell.row}: 有効な内側マスなし、スキップ`);
      this.currentOuterCellIndex++;
      this.moveToNextOuterCell();
      return;
    }

    console.log(`[ThrowInCheck] 外側マス ${outerCell.col}${outerCell.row} (${outerCell.type}): 有効内側マス ${this.innerCells.length}個`);

    // スロワーを移動
    this.thrower.setPosition(new Vector3(outerCell.worldX, 0, outerCell.worldZ), true);
    this.thrower.stopMovement();

    this.state = 'moving_thrower';
    this.moveDelay = ThrowInCheckController.MOVE_DELAY;
  }

  /**
   * 次の内側マスへ移動
   */
  private moveToNextInnerCell(): void {
    if (this.currentInnerCellIndex >= this.innerCells.length) {
      // この外側マスのテスト完了
      this.completeOuterCell();
      return;
    }

    const outerCell = this.outerCells[this.currentOuterCellIndex];
    const innerCell = this.innerCells[this.currentInnerCellIndex];

    // レシーバーを移動
    this.receiver.setPosition(new Vector3(innerCell.worldX, 0, innerCell.worldZ));
    this.receiver.stopMovement();

    // 向きを設定
    this.thrower.lookAt(this.receiver.getPosition());
    this.receiver.lookAt(this.thrower.getPosition());

    // ボールをスロワーに持たせる
    this.ball.setHolder(this.thrower);

    this.state = 'moving_receiver';
    this.moveDelay = ThrowInCheckController.MOVE_DELAY;

    // 進捗を報告
    this.reportProgress();
  }

  /**
   * スローインを実行
   */
  private executeThrowIn(): void {
    const outerCell = this.outerCells[this.currentOuterCellIndex];
    const innerCell = this.innerCells[this.currentInnerCellIndex];

    // 距離を計算
    const dx = innerCell.worldX - outerCell.worldX;
    const dz = innerCell.worldZ - outerCell.worldZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    console.log(`[ThrowInCheck] パス実行: ${outerCell.col}${outerCell.row} -> ${innerCell.col}${innerCell.row} (${distance.toFixed(1)}m)`);

    // レシーバーの胸の高さを目標に
    const receiverHeight = this.receiver.config.physical.height;
    const targetPosition = new Vector3(
      innerCell.worldX,
      receiverHeight * 0.65,
      innerCell.worldZ
    );

    // パスを実行
    const success = this.ball.passWithArc(targetPosition, this.receiver, 'chest');

    if (!success) {
      console.error('[ThrowInCheck] パス実行失敗');
      this.recordResult(false, 'パス実行失敗');
      return;
    }

    this.state = 'waiting_catch';
    this.throwTime = 0;
  }

  /**
   * 更新処理
   */
  public update(deltaTime: number): void {
    if (this.state === 'idle' || this.state === 'completed') {
      return;
    }

    switch (this.state) {
      case 'moving_thrower':
        this.moveDelay -= deltaTime;
        if (this.moveDelay <= 0) {
          this.moveToNextInnerCell();
        }
        break;

      case 'moving_receiver':
        this.moveDelay -= deltaTime;
        if (this.moveDelay <= 0) {
          this.executeThrowIn();
        }
        break;

      case 'waiting_catch':
        this.throwTime += deltaTime;

        // レシーバーがボールをキャッチしたかチェック
        if (this.ball.getHolder() === this.receiver) {
          console.log(`[ThrowInCheck] キャッチ成功 (${this.throwTime.toFixed(2)}秒)`);
          this.recordResult(true, undefined, this.throwTime);
          return;
        }

        // ボールが地面で停止したかチェック（キャッチ失敗）
        if (!this.ball.isInFlight() && !this.ball.isHeld()) {
          console.log('[ThrowInCheck] キャッチ失敗（ボール停止）');
          this.recordResult(false, 'ボール停止');
          return;
        }

        // タイムアウトチェック
        if (this.throwTime >= this.config.timeoutSeconds) {
          console.log('[ThrowInCheck] タイムアウト');
          this.recordResult(false, 'タイムアウト');
          return;
        }
        break;
    }
  }

  /**
   * テスト結果を記録
   */
  private recordResult(success: boolean, error?: string, catchTime?: number): void {
    const outerCell = this.outerCells[this.currentOuterCellIndex];
    const innerCell = this.innerCells[this.currentInnerCellIndex];

    const dx = innerCell.worldX - outerCell.worldX;
    const dz = innerCell.worldZ - outerCell.worldZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const result: ThrowInTestResult = {
      throwerCell: { col: outerCell.col, row: outerCell.row },
      receiverCell: { col: innerCell.col, row: innerCell.row },
      distance,
      success,
      catchTime,
      error,
    };

    this.currentOuterCellTests.push(result);

    if (success) {
      this.totalSuccessCount++;
    } else {
      this.totalFailCount++;
    }

    // コールバック
    if (this.onTestComplete) {
      this.onTestComplete(result);
    }

    // 次の内側マスへ
    this.currentInnerCellIndex++;
    this.moveToNextInnerCell();
  }

  /**
   * 外側マスのテスト完了
   */
  private completeOuterCell(): void {
    const outerCell = this.outerCells[this.currentOuterCellIndex];
    const successCount = this.currentOuterCellTests.filter(t => t.success).length;
    const failCount = this.currentOuterCellTests.filter(t => !t.success).length;

    const result: OuterCellResult = {
      outerCell,
      tests: this.currentOuterCellTests,
      successCount,
      failCount,
      successRate: this.currentOuterCellTests.length > 0
        ? (successCount / this.currentOuterCellTests.length) * 100
        : 0,
    };

    this.results.push(result);

    console.log(`[ThrowInCheck] 外側マス ${outerCell.col}${outerCell.row} 完了: ${successCount}/${this.currentOuterCellTests.length} (${result.successRate.toFixed(1)}%)`);

    // コールバック
    if (this.onOuterCellComplete) {
      this.onOuterCellComplete(result);
    }

    // 次の外側マスへ
    this.currentOuterCellIndex++;
    this.moveToNextOuterCell();
  }

  /**
   * 全テスト完了
   */
  private completeAllTests(): void {
    this.state = 'completed';

    const totalTests = this.totalSuccessCount + this.totalFailCount;
    console.log(`[ThrowInCheck] 全テスト完了: 成功 ${this.totalSuccessCount}, 失敗 ${this.totalFailCount}, 合計 ${totalTests}`);

    if (this.onAllComplete) {
      this.onAllComplete(this.results);
    }
  }

  /**
   * 進捗を報告
   */
  private reportProgress(): void {
    if (!this.onProgress) return;

    // 完了したテスト数を計算
    let completedTests = 0;
    for (let i = 0; i < this.currentOuterCellIndex; i++) {
      if (this.results[i]) {
        completedTests += this.results[i].tests.length;
      }
    }
    completedTests += this.currentInnerCellIndex;

    // 総テスト数を計算
    let totalTests = 0;
    for (const outerCell of this.outerCells) {
      totalTests += this.getValidInnerCells(outerCell).length;
    }

    const outerCell = this.outerCells[this.currentOuterCellIndex];
    const innerCell = this.innerCells[this.currentInnerCellIndex];

    const progress: ThrowInCheckProgress = {
      currentOuterCellIndex: this.currentOuterCellIndex,
      currentInnerCellIndex: this.currentInnerCellIndex,
      totalOuterCells: this.outerCells.length,
      totalInnerCells: this.innerCells.length,
      completedTests,
      totalTests,
      successCount: this.totalSuccessCount,
      failCount: this.totalFailCount,
      currentOuterCell: outerCell ? `${outerCell.col}${outerCell.row}` : '',
      currentInnerCell: innerCell ? `${innerCell.col}${innerCell.row}` : '',
    };

    this.onProgress(progress);
  }

  /**
   * 現在の状態を取得
   */
  public getState(): ThrowInCheckState {
    return this.state;
  }

  /**
   * 結果を取得
   */
  public getResults(): OuterCellResult[] {
    return this.results;
  }

  /**
   * テストを停止
   */
  public stop(): void {
    this.state = 'idle';
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.stop();
    this.results = [];
  }
}
