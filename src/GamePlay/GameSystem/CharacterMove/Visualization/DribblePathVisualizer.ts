/**
 * ドリブル導線可視化クラス
 * オンボールオフェンスプレイヤーのドリブル移動経路を表示する
 * ボール保持面に応じて可能なドリブル方向を表示
 */

import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  LinesMesh,
} from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { Ball } from "@/GamePlay/Object/Entities/Ball";
import { Field } from "@/GamePlay/Object/Entities/Field";
import { FACE_ACTIONS, BallActionType } from "@/GamePlay/GameSystem/BallHandlingSystem/BallAction";

/**
 * 方向番号から角度オフセット（ラジアン）への変換
 * 0=正面(0°), 1=右前(45°), 7=左前(-45°)
 */
const DIRECTION_ANGLES: Record<number, number> = {
  0: 0,                    // 正面
  1: Math.PI / 4,          // 右前 (+45°)
  2: Math.PI / 2,          // 右 (+90°)
  3: Math.PI * 3 / 4,      // 右後 (+135°)
  4: Math.PI,              // 後 (+180°)
  5: -Math.PI * 3 / 4,     // 左後 (-135°)
  6: -Math.PI / 2,         // 左 (-90°)
  7: -Math.PI / 4,         // 左前 (-45°)
};

/**
 * 方向ごとの色
 */
const DIRECTION_COLORS: Record<number, Color3> = {
  0: new Color3(1, 0.8, 0),     // 黄色（正面）
  1: new Color3(1, 0.5, 0),     // オレンジ（右前）
  7: new Color3(0, 0.8, 1),     // 水色（左前）
};

/**
 * ドリブル導線可視化クラス
 */
export class DribblePathVisualizer {
  private scene: Scene;
  private ball: Ball;

  // 可視化オプション
  private isEnabled: boolean = true;

  // 現在の可視化オブジェクト（複数導線対応）
  private pathLines: LinesMesh[] = [];
  private endMarkers: Mesh[] = [];
  private directionArrows: LinesMesh[] = [];

  // マテリアルキャッシュ
  private markerMaterials: Map<number, StandardMaterial> = new Map();

  constructor(
    scene: Scene,
    ball: Ball,
    _field: Field,
    _allCharacters: Character[]
  ) {
    this.scene = scene;
    this.ball = ball;
    // _field, _allCharacters are kept for API compatibility with other visualizers

    this.initMaterials();
  }

  /**
   * マテリアルを初期化
   */
  private initMaterials(): void {
    // 各方向用のマテリアルを作成
    for (const [dir, color] of Object.entries(DIRECTION_COLORS)) {
      const material = new StandardMaterial(`dribble-marker-${dir}`, this.scene);
      material.diffuseColor = color;
      material.emissiveColor = color.scale(0.5);
      material.alpha = 0.7;
      this.markerMaterials.set(Number(dir), material);
    }
  }

  /**
   * 可視化を有効/無効にする
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearVisualizations();
    }
  }

  /**
   * 可視化が有効かどうか
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * キャラクターリストを更新
   * チェックモード切り替え時などに使用
   * 将来の拡張用（障害物判定など）
   */
  public updateCharacters(_allCharacters: Character[]): void {
    // 将来の実装用
  }

  /**
   * 毎フレーム更新
   */
  public update(): void {
    // 前回の可視化をクリア
    this.clearVisualizations();

    if (!this.isEnabled) {
      return;
    }

    // オンボールプレイヤーを取得
    const holder = this.ball.getHolder();
    if (!holder) {
      return;
    }

    // ボールが飛行中は表示しない
    if (this.ball.isInFlight()) {
      return;
    }

    // 現在のボール保持面を取得
    const currentFace = holder.getCurrentBallFace();

    // この面で可能なドリブルアクションを取得
    const faceActions = FACE_ACTIONS[currentFace] || [];
    const dribbleActions = faceActions.filter(action => action.type === BallActionType.DRIBBLE);

    if (dribbleActions.length === 0) {
      return; // ドリブル不可
    }

    const holderPos = holder.getPosition();
    const holderRotation = holder.getRotation();

    // 各ドリブル方向に対して導線を作成
    for (const action of dribbleActions) {
      const direction = action.direction;
      const angleOffset = DIRECTION_ANGLES[direction] ?? 0;
      const totalAngle = holderRotation + angleOffset;

      // 方向ベクトルを計算
      const dirX = Math.sin(totalAngle);
      const dirZ = Math.cos(totalAngle);

      // 導線の長さ（前方8m）
      const pathLength = 8.0;

      // 終点を計算
      const endX = holderPos.x + dirX * pathLength;
      const endZ = holderPos.z + dirZ * pathLength;

      // 導線を作成
      this.createPathVisualization(
        holderPos,
        endX,
        endZ,
        dirX,
        dirZ,
        direction
      );
    }
  }

  /**
   * 導線の可視化を作成
   */
  private createPathVisualization(
    holderPos: Vector3,
    endX: number,
    endZ: number,
    dirX: number,
    dirZ: number,
    direction: number
  ): void {
    const lineHeight = 0.15; // 地面からの高さ

    // 開始点と終了点
    const startPoint = new Vector3(holderPos.x, lineHeight, holderPos.z);
    const endPoint = new Vector3(endX, lineHeight, endZ);

    // 導線の色を取得
    const color = DIRECTION_COLORS[direction] || new Color3(1, 0.8, 0);

    // 導線ラインを作成
    const pathLine = MeshBuilder.CreateLines(
      `dribble-path-line-${direction}`,
      { points: [startPoint, endPoint] },
      this.scene
    );
    pathLine.color = color;
    this.pathLines.push(pathLine);

    // 終点マーカーを作成
    const endMarker = MeshBuilder.CreateDisc(
      `dribble-end-marker-${direction}`,
      { radius: 0.25, tessellation: 16 },
      this.scene
    );
    endMarker.position = new Vector3(endX, 0.1, endZ);
    endMarker.rotation.x = Math.PI / 2;
    endMarker.material = this.markerMaterials.get(direction) || this.markerMaterials.get(0)!;
    this.endMarkers.push(endMarker);

    // 方向矢印を作成（導線上に等間隔で配置）
    this.createDirectionArrowsForPath(startPoint, endPoint, dirX, dirZ, color);
  }

  /**
   * 1本の導線に対して方向矢印を作成
   */
  private createDirectionArrowsForPath(
    start: Vector3,
    end: Vector3,
    dirX: number,
    dirZ: number,
    color: Color3
  ): void {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // 矢印の間隔（2m）
    const arrowInterval = 2.0;
    const numArrows = Math.floor(distance / arrowInterval);

    if (numArrows === 0) return;

    const angle = Math.atan2(dirX, dirZ);

    // 各矢印を配置
    for (let i = 1; i <= numArrows; i++) {
      const t = (i * arrowInterval) / distance;
      const posX = start.x + dx * t;
      const posZ = start.z + dz * t;

      const arrow = this.createArrowMesh(posX, start.y, posZ, angle, color);
      this.directionArrows.push(arrow);
    }
  }

  /**
   * 矢印メッシュを作成（三角形ラインで描画）
   */
  private createArrowMesh(
    x: number,
    y: number,
    z: number,
    angle: number,
    color: Color3
  ): LinesMesh {
    // 三角形の頂点（Y軸上向きの平面）
    const size = 0.25;

    // ローカル座標での頂点
    const localPoints = [
      { x: 0, z: size },                       // 前方（尖り）
      { x: -size * 0.5, z: -size * 0.3 },      // 左後ろ
      { x: size * 0.5, z: -size * 0.3 },       // 右後ろ
    ];

    // 角度で回転してワールド座標に変換
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const worldPoints = localPoints.map(p => new Vector3(
      x + (p.x * cos - p.z * sin),
      y + 0.05,
      z + (p.x * sin + p.z * cos)
    ));

    // 閉じた三角形のラインを作成
    const linePoints = [...worldPoints, worldPoints[0]];

    const arrow = MeshBuilder.CreateLines(
      `dribble-arrow-${Date.now()}-${Math.random()}`,
      { points: linePoints },
      this.scene
    );

    arrow.color = color;

    return arrow;
  }

  /**
   * 全ての可視化をクリア
   */
  public clearVisualizations(): void {
    for (const line of this.pathLines) {
      line.dispose();
    }
    this.pathLines = [];

    for (const marker of this.endMarkers) {
      marker.dispose();
    }
    this.endMarkers = [];

    for (const arrow of this.directionArrows) {
      arrow.dispose();
    }
    this.directionArrows = [];
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.clearVisualizations();

    for (const material of this.markerMaterials.values()) {
      material.dispose();
    }
    this.markerMaterials.clear();
  }
}
