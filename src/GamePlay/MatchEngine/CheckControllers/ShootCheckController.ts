import { Vector3 } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { ShootingController, ShootType } from "@/GamePlay/GameSystem/CharacterMove/Controllers/Action/ShootingController";
import { GRID_CONFIG, FieldGridUtils, CellCoord } from "@/GamePlay/GameSystem/CharacterMove/Config/FieldGridConfig";
import { DEFAULT_CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterStats";
import {
  SHOOT_CHECK_TIMING,
  SHOOT_CHECK_DETECTION,
  SHOOT_CHECK_GOAL_POSITION,
  SHOOT_CHECK_DEFENDER,
  DUNK_BLOCK_COLLISION,
  CellShootResult,
  ShootCheckState,
  ShotTypeFilter,
  ShootCheckConfig,
  ShootCheckProgress,
  DefenderConfig,
} from "@/GamePlay/MatchEngine/CheckConfig/ShootCheckConfig";

// 型をre-export
export type { CellShootResult, ShootCheckState, ShotTypeFilter, ShootCheckConfig, ShootCheckProgress, DefenderConfig };

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

  // ダンク用: 踏切位置からゴールエリアへの移動
  private originalPosition: Vector3 | null = null;
  private dunkTargetPosition: Vector3 | null = null;
  private dunkStartTime: number = 0;
  private isDunking: boolean = false;
  private isReturningToStart: boolean = false;  // ダンク後に踏切位置へ歩いて戻る状態

  // ダンクモーションのタイミング設定（ShootMotion.tsと同期）
  private static readonly DUNK_DURATION = 0.85;        // モーション全体の長さ（秒）
  // 参照用: DUNK_PEAK_TIME = 0.35（ジャンプピーク到達時間）
  private static readonly DUNK_SLAM_TIME = 0.55;       // 叩きつけ完了時間（秒）
  private static readonly WALK_SPEED = 3.0;            // 歩いて戻る速度（m/s）
  private static readonly ARRIVAL_THRESHOLD = 0.1;     // 到着判定の閾値（m）

  // ディフェンダー関連
  private defender: Character | null = null;
  private defenderOriginalPosition: Vector3 | null = null;
  private isDefenderBlocking: boolean = false;

  // ダンクブロック衝突関連
  private dunkCollisionChecked: boolean = false;  // このダンクで衝突判定済みか
  private dunkBlocked: boolean = false;           // ダンクがブロックされたか

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
   * ディフェンダーを設定
   * @param defender ディフェンダーキャラクター（nullで解除）
   */
  public setDefender(defender: Character | null): void {
    this.defender = defender;
    if (defender) {
      // ディフェンダーのチームをシューターと逆に設定
      defender.team = this.character.team === 'ally' ? 'enemy' : 'ally';
    }
  }

  /**
   * ディフェンダーを配置
   */
  private positionDefender(): void {
    if (!this.defender || !this.config.defender?.enabled) return;

    const defenderConfig = this.config.defender;
    const shooterPos = this.character.getPosition();
    const goalZ = this.config.targetGoal === 'goal1'
      ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
      : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;

    let defenderX: number;
    let defenderZ: number;

    if (defenderConfig.position === 'goal_front') {
      // ゴール前に配置
      const distance = defenderConfig.distanceFromGoal ?? SHOOT_CHECK_DEFENDER.DEFAULT_DISTANCE_FROM_GOAL;
      defenderX = 0; // ゴール中央
      defenderZ = this.config.targetGoal === 'goal1'
        ? goalZ - distance
        : goalZ + distance;
    } else {
      // シューター前に配置
      const distance = defenderConfig.distanceFromShooter ?? SHOOT_CHECK_DEFENDER.DEFAULT_DISTANCE_FROM_SHOOTER;
      // シューターとゴールの間の線上に配置
      const dirToGoal = new Vector3(0 - shooterPos.x, 0, goalZ - shooterPos.z).normalize();
      defenderX = shooterPos.x + dirToGoal.x * distance;
      defenderZ = shooterPos.z + dirToGoal.z * distance;
    }

    const characterHeight = this.defender.config?.physical?.height ?? 1.9;
    const defenderPos = new Vector3(defenderX, characterHeight / 2, defenderZ);

    this.defender.setPosition(defenderPos);
    this.defenderOriginalPosition = defenderPos.clone();

    // シューター方向を向く
    this.defender.lookAt(shooterPos);
  }

  /**
   * ダンク時のディフェンダー配置
   * シューターの踏切位置とゴールの間に配置
   */
  private positionDefenderForDunk(): void {
    if (!this.defender || !this.config.defender?.enabled) return;

    const shooterPos = this.character.getPosition();
    const goalZ = this.config.targetGoal === 'goal1'
      ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
      : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;

    // シューターからゴールへの方向ベクトル
    const goalX = 0; // ゴールのX座標は中央
    const dirX = goalX - shooterPos.x;
    const dirZ = goalZ - shooterPos.z;
    const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

    // ゴールから1.0m手前（シューター側）に配置
    // シューターとゴールの間の線上
    const defenderDistanceFromGoal = 1.0;
    const ratio = (distance - defenderDistanceFromGoal) / distance;

    const defenderX = shooterPos.x + dirX * ratio;
    const defenderZ = shooterPos.z + dirZ * ratio;

    const characterHeight = this.defender.config?.physical?.height ?? 1.9;
    const defenderPos = new Vector3(defenderX, characterHeight / 2, defenderZ);

    this.defender.setPosition(defenderPos);
    this.defenderOriginalPosition = defenderPos.clone();

    // シューター方向を向く
    this.defender.lookAt(shooterPos);
  }

  /**
   * ディフェンダーにブロックジャンプさせる
   */
  private triggerDefenderBlock(): void {
    if (!this.defender || !this.config.defender?.enabled) return;
    if (this.isDefenderBlocking) return;

    this.isDefenderBlocking = true;

    // ブロック対象を設定
    this.defender.setBlockJumpTarget(this.character);

    // ブロックアクションを開始
    const actionController = this.defender.getActionController();
    actionController.startAction('block_shot');
  }

  /**
   * ディフェンダーのブロック状態をリセット
   */
  private resetDefenderBlock(): void {
    if (!this.defender) return;

    this.isDefenderBlocking = false;
    this.defender.setBlockJumpTarget(null);

    // ダンクブロック衝突状態をリセット
    this.dunkCollisionChecked = false;
    this.dunkBlocked = false;

    // 元の位置に戻す
    if (this.defenderOriginalPosition) {
      this.defender.setPosition(this.defenderOriginalPosition);
      // シューター方向を向く
      this.defender.lookAt(this.character.getPosition());
    }

    // バランスをリセット
    this.defender.resetBalance();
  }

  /**
   * ダンク時の衝突判定（ダンカーとブロッカーの接触）
   * @returns 衝突が発生したか
   */
  private checkDunkBlockCollision(): boolean {
    if (!this.defender || !this.isDunking || this.dunkCollisionChecked) {
      return false;
    }

    // ダンクモーションの進行率を計算
    const elapsed = (Date.now() - this.dunkStartTime) / 1000;
    const progress = elapsed / ShootCheckController.DUNK_DURATION;

    // 衝突判定を行うタイミングかチェック
    if (progress < DUNK_BLOCK_COLLISION.COLLISION_START_RATIO ||
        progress > DUNK_BLOCK_COLLISION.COLLISION_END_RATIO) {
      return false;
    }

    const dunkerPos = this.character.getPosition();
    const defenderPos = this.defender.getPosition();

    // 高さが衝突範囲内かチェック
    const dunkerHeight = dunkerPos.y;
    const defenderHeight = defenderPos.y;
    const avgHeight = (dunkerHeight + defenderHeight) / 2;

    if (avgHeight < DUNK_BLOCK_COLLISION.MIN_COLLISION_HEIGHT ||
        avgHeight > DUNK_BLOCK_COLLISION.MAX_COLLISION_HEIGHT) {
      return false;
    }

    // 水平距離を計算
    const dx = dunkerPos.x - defenderPos.x;
    const dz = dunkerPos.z - defenderPos.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

    // 衝突判定
    if (horizontalDistance <= DUNK_BLOCK_COLLISION.COLLISION_RADIUS) {
      this.dunkCollisionChecked = true;
      this.resolveDunkBlockCollision();
      return true;
    }

    return false;
  }

  /**
   * ダンクブロック衝突を解決（POWER比較と吹き飛ばし）
   */
  private resolveDunkBlockCollision(): void {
    if (!this.defender) return;

    // POWER値を取得
    const dunkerPower = this.character.playerData?.stats.power ?? 50;
    const defenderPower = this.defender.playerData?.stats.power ?? 50;
    const powerDiff = defenderPower - dunkerPower;

    // 吹き飛ばし距離を計算
    const knockbackDistance = Math.min(
      DUNK_BLOCK_COLLISION.MAX_KNOCKBACK_DISTANCE,
      Math.max(
        DUNK_BLOCK_COLLISION.MIN_KNOCKBACK_DISTANCE,
        Math.abs(powerDiff) * DUNK_BLOCK_COLLISION.KNOCKBACK_MULTIPLIER
      )
    );

    const dunkerPos = this.character.getPosition();
    const defenderPos = this.defender.getPosition();

    // 吹き飛ばし方向を計算（相手から自分への方向）
    const dirFromDefenderToDunker = new Vector3(
      dunkerPos.x - defenderPos.x,
      0,
      dunkerPos.z - defenderPos.z
    ).normalize();

    if (powerDiff > DUNK_BLOCK_COLLISION.BLOCK_SUCCESS_POWER_THRESHOLD) {
      // ディフェンダーのPOWERが高い → ダンクをブロック、ダンカーを吹き飛ばす
      this.dunkBlocked = true;

      // ダンカーを後方に吹き飛ばす
      const knockbackPos = new Vector3(
        dunkerPos.x + dirFromDefenderToDunker.x * knockbackDistance,
        dunkerPos.y,
        dunkerPos.z + dirFromDefenderToDunker.z * knockbackDistance
      );
      this.character.setPosition(knockbackPos);

      // ダンクを中断（ボールを落とす）
      this.cancelDunk();

      console.log(`[DunkBlock] ブロック成功! DEF:${defenderPower} > ATK:${dunkerPower}, 吹き飛ばし:${knockbackDistance.toFixed(2)}m`);
    } else {
      // ダンカーのPOWERが高いか同等 → ダンク成功、ディフェンダーを吹き飛ばす
      this.dunkBlocked = false;

      // ディフェンダーを吹き飛ばす（ダンカーの進行方向）
      const knockbackPos = new Vector3(
        defenderPos.x - dirFromDefenderToDunker.x * knockbackDistance,
        defenderPos.y,
        defenderPos.z - dirFromDefenderToDunker.z * knockbackDistance
      );
      this.defender.setPosition(knockbackPos);

      console.log(`[DunkBlock] ダンク成功! ATK:${dunkerPower} >= DEF:${defenderPower}, ディフェンダー吹き飛ばし:${knockbackDistance.toFixed(2)}m`);
    }
  }

  /**
   * ダンクを中断（ブロックされた場合）
   */
  private cancelDunk(): void {
    // ダンク状態を解除
    this.isDunking = false;

    // ボールを落とす（保持を解除してルーズボールに）
    if (this.ball.getHolder() === this.character) {
      this.ball.setHolder(null);
      // ボールを少し上に弾く
      const ballPos = this.ball.getPosition();
      this.ball.setPosition(new Vector3(ballPos.x, ballPos.y + 0.5, ballPos.z));
    }

    // シュート判定を失敗として処理
    this.waitingForShot = false;
    this.waitingForBallRelease = false;

    // 少し待ってから次のシュートへ
    setTimeout(() => {
      this.onShotComplete(false);
    }, 500);
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

    // ディフェンダーを配置
    this.positionDefender();

    // シュートカウントをリセット
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;

    // シュートレンジをチェック（ダンクフィルター時はforceDunk=true）
    const forceDunk = this.config.shotTypeFilter === 'dunk';
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character, forceDunk);

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
    this.isDunking = false;
    this.isReturningToStart = false;
    this.dunkTargetPosition = null;

    // ダンク中または戻り中に中断した場合、元の位置に戻す
    if (this.originalPosition) {
      this.character.setPosition(this.originalPosition);
      this.originalPosition = null;
    }

    // ディフェンダーをリセット
    this.resetDefenderBlock();

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

    // ディフェンダーを配置
    this.positionDefender();

    // シュートカウントをリセット
    this.currentShotCount = 0;
    this.currentCellSuccessCount = 0;

    // シュートレンジをチェック（ダンクフィルター時はforceDunk=true）
    const forceDunk = this.config.shotTypeFilter === 'dunk';
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character, forceDunk);

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

    // シュートを実行（ダンクモーションはジャンプを含むので特別処理不要）
    this.executeShot();
  }

  /**
   * シュートを実行（共通処理）
   */
  private executeShot(): void {
    const forceDunk = this.config.shotTypeFilter === 'dunk';

    // ダンクブロック衝突状態をリセット
    this.dunkCollisionChecked = false;
    this.dunkBlocked = false;

    // ダンクの場合、踏切位置とゴールエリア（目標位置）を設定
    if (forceDunk) {
      this.originalPosition = this.character.getPosition().clone();

      // ゴールエリアの位置を計算（H29またはH2のマス）
      const goalZ = this.config.targetGoal === 'goal1'
        ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
        : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;

      // ゴール直下に移動（X座標は現在位置を維持、リムの真下あたり）
      // リムの手前0.3mくらいの位置が叩きつけ位置
      const dunkOffset = this.config.targetGoal === 'goal1' ? -0.3 : 0.3;
      const characterHeight = this.character.config?.physical?.height ?? 1.9;

      // X座標: 踏切位置のX座標をある程度維持しつつ、リムに近づく
      // （完全にX=0にすると斜めダンクの味がなくなる）
      const targetX = this.originalPosition.x * 0.3; // リムに向かいつつ少し横を維持

      this.dunkTargetPosition = new Vector3(
        targetX,
        characterHeight / 2,
        goalZ + dunkOffset
      );

      this.isDunking = true;
      this.dunkStartTime = Date.now();

      // ダンク時はディフェンダーをシューターとゴールの間に配置
      if (this.config.defender?.enabled) {
        this.positionDefenderForDunk();
      }
    }

    // シュートアクションを開始（アニメーション付き）
    const result = this.shootingController.startShootAction(this.character, forceDunk);

    if (result.success) {
      // アニメーション開始成功 → ボールが発射されるのを待つ
      this.waitingForShot = true;
      this.waitingForBallRelease = true;
      this.shotStartTime = Date.now();

      // ダンク時はディフェンダーも同時にジャンプ（シューターと同時）
      if (forceDunk && this.config.defender?.enabled) {
        // ダンク時は即座にブロックジャンプ（シューターと同時にジャンプ）
        this.triggerDefenderBlock();
      } else if (this.config.defender?.enabled && this.config.defender.blockTiming === 'on_shot') {
        // 通常シュート時は設定に従う
        setTimeout(() => {
          this.triggerDefenderBlock();
        }, SHOOT_CHECK_DEFENDER.BLOCK_REACTION_DELAY_MS);
      }
    } else {
      // シュート開始失敗 → リセットしてリトライ
      this.originalPosition = null;
      this.dunkTargetPosition = null;
      this.isDunking = false;
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
    const forceDunk = this.config.shotTypeFilter === 'dunk';
    const rangeInfo = this.shootingController.getShootRangeInfo(this.character, forceDunk);

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
  public update(deltaTime: number): void {
    if (this.state !== 'running') return;

    // ダンク中の位置補間
    if (this.isDunking) {
      // ダンクブロック衝突判定（ディフェンダーがいる場合）
      if (this.defender && this.config.defender?.enabled) {
        this.checkDunkBlockCollision();
        // ブロックされた場合はダンク処理を中断（cancelDunkで処理済み）
        if (this.dunkBlocked) {
          return;
        }
      }

      this.updateDunkPosition();
      // ダンク中は他の処理をスキップ（着地完了まで待つ）
      return;
    }

    // ダンク後、踏切位置へ歩いて戻る（ダンクモーション完了後のみ）
    if (this.isReturningToStart) {
      this.updateReturnToStart(deltaTime);
      return; // 戻っている間は他の処理をスキップ
    }

    if (this.waitingForShot) {
      // シュート結果を待機中
      this.checkShotResult();
    }
  }

  /**
   * ダンク中のキャラクター位置を補間
   * 踏切位置からゴールエリアへスムーズに移動し、叩きつけ後はその位置に留まる
   */
  private updateDunkPosition(): void {
    if (!this.originalPosition || !this.dunkTargetPosition) {
      this.isDunking = false;
      return;
    }

    const elapsed = (Date.now() - this.dunkStartTime) / 1000; // 秒に変換

    // 叩きつけ時点（DUNK_SLAM_TIME）までは踏切位置→ゴールエリアへ移動
    // 叩きつけ後はゴールエリアに留まって垂直に着地
    const currentPos = this.character.getPosition();

    if (elapsed < ShootCheckController.DUNK_SLAM_TIME) {
      // 叩きつけまで：踏切位置からゴールエリアへ移動
      const progress = elapsed / ShootCheckController.DUNK_SLAM_TIME;
      // イージング関数（ease-out）でスムーズな移動
      const easedProgress = 1 - Math.pow(1 - progress, 2);

      const currentX = this.originalPosition.x + (this.dunkTargetPosition.x - this.originalPosition.x) * easedProgress;
      const currentZ = this.originalPosition.z + (this.dunkTargetPosition.z - this.originalPosition.z) * easedProgress;

      this.character.setPosition(new Vector3(currentX, currentPos.y, currentZ));
    } else {
      // 叩きつけ後：ゴールエリアに留まる（Y座標のみモーションで制御、XZは固定）
      this.character.setPosition(new Vector3(
        this.dunkTargetPosition.x,
        currentPos.y,
        this.dunkTargetPosition.z
      ));
    }

    // ダンクモーション終了後はフラグをリセット
    if (elapsed >= ShootCheckController.DUNK_DURATION) {
      this.isDunking = false;
    }
  }

  /**
   * ダンク後、踏切位置へ歩いて戻る
   */
  private updateReturnToStart(deltaTime: number): void {
    if (!this.originalPosition) {
      this.isReturningToStart = false;
      this.proceedToNextShot();
      return;
    }

    const currentPos = this.character.getPosition();
    const targetPos = this.originalPosition;

    // 目標位置への方向を計算
    const dx = targetPos.x - currentPos.x;
    const dz = targetPos.z - currentPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 到着判定
    if (distance < ShootCheckController.ARRIVAL_THRESHOLD) {
      // 踏切位置に到着
      this.character.setPosition(new Vector3(targetPos.x, currentPos.y, targetPos.z));
      this.isReturningToStart = false;
      this.originalPosition = null;
      this.dunkTargetPosition = null;

      // ゴール方向を向く
      const goalZ = this.config.targetGoal === 'goal1'
        ? SHOOT_CHECK_GOAL_POSITION.GOAL1_Z
        : SHOOT_CHECK_GOAL_POSITION.GOAL2_Z;
      const goalPosition = new Vector3(0, 0, goalZ);
      this.character.lookAt(goalPosition);

      // 次のシュートへ
      this.proceedToNextShot();
      return;
    }

    // 移動方向を向く
    const angle = Math.atan2(dx, dz);
    this.character.setRotation(angle);

    // 歩いて移動
    const moveDistance = ShootCheckController.WALK_SPEED * deltaTime;
    const moveX = (dx / distance) * Math.min(moveDistance, distance);
    const moveZ = (dz / distance) * Math.min(moveDistance, distance);

    this.character.setPosition(new Vector3(
      currentPos.x + moveX,
      currentPos.y,
      currentPos.z + moveZ
    ));

    // 歩行モーションを再生（キャラクターに歩行メソッドがあれば）
    // this.character.playWalkMotion() など
  }

  /**
   * 次のシュートへ進む（遅延付き）
   */
  private proceedToNextShot(): void {
    // ディフェンダーをリセット
    this.resetDefenderBlock();

    setTimeout(() => {
      if (this.state === 'running') {
        this.ball.setHolder(this.character);
        this.shootNextShot();
      }
    }, SHOOT_CHECK_TIMING.SHOT_INTERVAL_DELAY_MS);
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

        // ディフェンダーのブロック（on_release タイミング）
        // ダンク時は既にシュート開始時にブロックしているのでスキップ
        const forceDunk = this.config.shotTypeFilter === 'dunk';
        if (!forceDunk && this.config.defender?.enabled && this.config.defender.blockTiming === 'on_release') {
          setTimeout(() => {
            this.triggerDefenderBlock();
          }, SHOOT_CHECK_DEFENDER.BLOCK_REACTION_DELAY_MS);
        }
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

    // ボールをリセット
    this.ball.endFlight();

    // ダンクの場合、モーション完了（着地）を待ってから歩いて戻る
    if (this.originalPosition && this.isDunking) {
      // ダンクモーション完了まで待ってから歩き始める
      const elapsed = (Date.now() - this.dunkStartTime) / 1000;
      const remainingTime = Math.max(0, ShootCheckController.DUNK_DURATION - elapsed);

      setTimeout(() => {
        if (this.state !== 'running') return;

        // モーション完了後にリセット
        this.character.resetBalance();
        this.isDunking = false;
        // 歩いて戻る状態を開始（着地位置から）
        this.isReturningToStart = true;
      }, remainingTime * 1000);
      return;
    }

    // ダンク中でない場合（通常のダンク着地後や他のシュート）
    if (this.originalPosition) {
      // ダンク着地済みの場合
      this.character.resetBalance();
      this.isDunking = false;
      this.isReturningToStart = true;
      return;
    }

    // 通常のシュート（ダンク以外）の場合
    this.character.resetBalance();
    this.proceedToNextShot();
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
    this.isDunking = false;
    this.isReturningToStart = false;
    this.originalPosition = null;
    this.dunkTargetPosition = null;
    this.isDefenderBlocking = false;
    this.defenderOriginalPosition = null;
    this.results.clear();
  }
}
