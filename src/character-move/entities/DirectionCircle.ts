import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, VertexData, LinesMesh } from "@babylonjs/core";
import { CharacterState } from "../types/CharacterState";

/**
 * 円の描画に使用するセグメント数
 * 数が多いほど滑らかな円になる
 */
const CIRCLE_SEGMENTS = 32;

/**
 * キャラクターの方向サークル（円形の足元のサークル）を管理するクラス
 * 視覚的には円だが、論理的には8方向（0-7）を維持
 * 各方向ごとに異なる半径を設定可能
 */
export class DirectionCircle {
  private scene: Scene;
  private footCircle: LinesMesh | null = null;
  private footCircleRadii: number[] = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]; // 8方向の半径（比率）
  private footCircleScale: number = 1.0; // 全体のスケール
  private footCircleFaceSegments: Mesh[] = [];
  private footCircleVertexLabels: Mesh[] = [];

  // 位置と回転への参照を保持するコールバック
  private getPosition: () => Vector3;
  private getRotation: () => number;

  constructor(
    scene: Scene,
    getPosition: () => Vector3,
    getRotation: () => number,
    initialRadius: number | number[] = 1.0
  ) {
    this.scene = scene;
    this.getPosition = getPosition;
    this.getRotation = getRotation;

    if (Array.isArray(initialRadius)) {
      // 8方向の半径が配列で指定された場合
      this.footCircleRadii = initialRadius.length === 8
        ? [...initialRadius]
        : [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    } else {
      // 単一の半径が指定された場合、全方向に適用
      this.footCircleRadii = Array(8).fill(initialRadius);
    }
  }

  /**
   * 特定の角度での半径を取得（方向間を補間）
   * @param angle ローカル角度（ラジアン、0=正面）
   */
  public getRadiusAtAngle(angle: number): number {
    // 角度を0〜2πの範囲に正規化
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;

    // 描画は反時計回り（角度増加）だが、方向インデックスは時計回り
    // 角度を反転して時計回りに変換
    const clockwiseAngle = (Math.PI * 2 - angle) % (Math.PI * 2);

    // 方向インデックスを計算
    const angleStep = (Math.PI * 2) / 8;
    const normalizedAngle = clockwiseAngle / angleStep;

    // 前後の方向インデックス
    const faceIndex1 = Math.floor(normalizedAngle) % 8;
    const faceIndex2 = (faceIndex1 + 1) % 8;

    // 補間係数（0〜1）
    const t = normalizedAngle - Math.floor(normalizedAngle);

    // 線形補間で半径を計算（スケールを適用）
    const radius1 = this.footCircleRadii[faceIndex1] * this.footCircleScale;
    const radius2 = this.footCircleRadii[faceIndex2] * this.footCircleScale;

    return radius1 + (radius2 - radius1) * t;
  }

  /**
   * 足元の円を作成（8方向ごとに異なる半径をサポート）
   */
  public createFootCircle(): LinesMesh {
    const lines: Vector3[][] = [];
    const position = this.getPosition();

    // 円を描画（CIRCLE_SEGMENTS個のセグメントで構成）
    // 各セグメントの半径は方向間を補間
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const angleStep = (Math.PI * 2) / CIRCLE_SEGMENTS;

      const angle1 = i * angleStep;
      const radius1 = this.getRadiusAtAngle(angle1);
      const x1 = Math.sin(angle1) * radius1;
      const z1 = Math.cos(angle1) * radius1;

      const angle2 = (i + 1) * angleStep;
      const radius2 = this.getRadiusAtAngle(angle2);
      const x2 = Math.sin(angle2) * radius2;
      const z2 = Math.cos(angle2) * radius2;

      lines.push([
        new Vector3(x1, 0.01, z1),
        new Vector3(x2, 0.01, z2)
      ]);
    }

    const circle = MeshBuilder.CreateLineSystem(
      "foot-circle",
      { lines: lines, updatable: true },
      this.scene
    );

    circle.color = new Color3(1.0, 1.0, 1.0);
    circle.parent = null;

    circle.position = new Vector3(
      position.x,
      0,
      position.z
    );

    circle.isVisible = true;

    this.footCircle = circle;
    return circle;
  }

  /**
   * 足元の円の色分けセグメント（8つの扇形）を作成
   * 円を8等分した扇形で、各方向を色分け
   */
  public createFootCircleFaceSegments(): void {
    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];

    const colors = [
      new Color3(1, 0, 0),
      new Color3(1, 0.5, 0),
      new Color3(1, 1, 0),
      new Color3(0, 1, 0),
      new Color3(0, 1, 1),
      new Color3(0, 0, 1),
      new Color3(0.5, 0, 1),
      new Color3(1, 0, 1),
    ];

    const position = this.getPosition();
    const rotation = this.getRotation();

    // 各方向（0-7）の扇形を作成
    // 扇形は複数の三角形で構成（滑らかな円弧のため）
    const segmentsPerFace = 4; // 各扇形を4つの三角形で構成

    for (let faceIndex = 0; faceIndex < 8; faceIndex++) {
      const positions: number[] = [];
      const indices: number[] = [];
      const normals: number[] = [];

      const center = position.clone();
      center.y = 0.02;

      // この方向の開始角度と終了角度
      const angleStep = (Math.PI * 2) / 8;
      const angleOffset = Math.PI / 8; // 0方向を正面に合わせるオフセット
      const startAngle = -faceIndex * angleStep + angleOffset + rotation;
      const endAngle = -(faceIndex + 1) * angleStep + angleOffset + rotation;

      // 中心点を追加
      positions.push(center.x, center.y, center.z);
      normals.push(0, 1, 0);

      // 扇形の外周点を追加（その方向の半径にスケールを適用）
      const radius = this.footCircleRadii[faceIndex] * this.footCircleScale;
      for (let j = 0; j <= segmentsPerFace; j++) {
        const t = j / segmentsPerFace;
        const angle = startAngle + (endAngle - startAngle) * t;
        const x = position.x + Math.sin(angle) * radius;
        const z = position.z + Math.cos(angle) * radius;
        positions.push(x, center.y, z);
        normals.push(0, 1, 0);
      }

      // 三角形のインデックスを設定（中心点 + 外周の2点）
      for (let j = 0; j < segmentsPerFace; j++) {
        indices.push(0, j + 1, j + 2);
      }

      const fanMesh = new Mesh(`face-segment-${faceIndex}`, this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(fanMesh);

      const material = new StandardMaterial(`face-material-${faceIndex}`, this.scene);
      material.diffuseColor = colors[faceIndex];
      material.emissiveColor = colors[faceIndex].scale(0.3);
      material.alpha = 0.6;
      material.backFaceCulling = false;
      fanMesh.material = material;

      this.footCircleFaceSegments.push(fanMesh);
    }
  }

  /**
   * 足元の円の色を状態に応じて更新
   */
  public updateFootCircleColor(state: CharacterState): void {
    if (!this.footCircle || !this.footCircle.material) {
      return;
    }

    const material = this.footCircle.material as StandardMaterial;

    switch (state) {
      case CharacterState.ON_BALL_PLAYER:
      case CharacterState.OFF_BALL_PLAYER:
        material.diffuseColor = new Color3(1.0, 0.0, 0.0);
        material.emissiveColor = new Color3(0.3, 0.0, 0.0);
        break;
      case CharacterState.ON_BALL_DEFENDER:
      case CharacterState.OFF_BALL_DEFENDER:
        material.diffuseColor = new Color3(0.0, 0.5, 1.0);
        material.emissiveColor = new Color3(0.0, 0.15, 0.3);
        break;
      case CharacterState.BALL_LOST:
      default:
        material.diffuseColor = new Color3(1.0, 1.0, 1.0);
        material.emissiveColor = new Color3(0.3, 0.3, 0.3);
        break;
    }
  }

  /**
   * 足元の円の表示/非表示を設定
   */
  public setFootCircleVisible(visible: boolean): void {
    if (this.footCircle) {
      this.footCircle.isVisible = visible;
    }
    // 色分けセグメント（三角形）も表示/非表示にする
    for (const segment of this.footCircleFaceSegments) {
      segment.isVisible = visible;
    }
    // 頂点ラベルも表示/非表示にする
    for (const label of this.footCircleVertexLabels) {
      label.isVisible = visible;
    }
  }

  /**
   * 足元の円のスケールを設定（8方向の比率を保持したまま全体サイズを変更）
   */
  public setFootCircleRadius(radius: number): void {
    this.footCircleScale = Math.max(0, radius);

    if (this.footCircle) {
      const wasVisible = this.footCircle.isVisible;
      this.footCircle.dispose();
      this.footCircle = this.createFootCircle();
      this.footCircle.isVisible = wasVisible;
    }
  }

  /**
   * 特定の方向の半径を設定
   * @param directionIndex 方向インデックス（0-7）
   * @param radius 半径
   */
  public setDirectionRadius(directionIndex: number, radius: number): void {
    if (directionIndex >= 0 && directionIndex < 8) {
      this.footCircleRadii[directionIndex] = Math.max(0, radius);

      if (this.footCircle) {
        const wasVisible = this.footCircle.isVisible;
        this.footCircle.dispose();
        this.footCircle = this.createFootCircle();
        this.footCircle.isVisible = wasVisible;
      }
    }
  }

  /**
   * 8方向すべての半径を設定
   * @param radii 8方向の半径配列
   */
  public setAllDirectionRadii(radii: number[]): void {
    if (radii.length === 8) {
      this.footCircleRadii = radii.map(r => Math.max(0, r));

      if (this.footCircle) {
        const wasVisible = this.footCircle.isVisible;
        this.footCircle.dispose();
        this.footCircle = this.createFootCircle();
        this.footCircle.isVisible = wasVisible;
      }
    }
  }

  /**
   * 足元の円のスケールを取得（互換性のため）
   */
  public getFootCircleRadius(): number {
    return this.footCircleScale;
  }

  /**
   * 特定の方向の半径を取得（スケール適用済み）
   * @param directionIndex 方向インデックス（0-7）
   */
  public getDirectionRadius(directionIndex: number): number {
    if (directionIndex >= 0 && directionIndex < 8) {
      return this.footCircleRadii[directionIndex] * this.footCircleScale;
    }
    return this.footCircleRadii[0] * this.footCircleScale;
  }

  /**
   * 8方向すべての半径を取得（スケール適用済み）
   */
  public getAllDirectionRadii(): number[] {
    return this.footCircleRadii.map(r => r * this.footCircleScale);
  }

  /**
   * ワールド座標での方向から半径を取得（接触判定用）
   * @param worldDirection ワールド座標での方向ベクトル（正規化不要）
   * @returns その方向での半径（スケール適用済み）
   */
  public getRadiusInWorldDirection(worldDirection: { x: number; z: number }): number {
    const rotation = this.getRotation();

    // ワールド方向をローカル方向に変換
    const worldAngle = Math.atan2(worldDirection.x, worldDirection.z);
    const localAngle = worldAngle - rotation;

    return this.getRadiusAtAngle(localAngle);
  }

  /**
   * 方向境界の位置を取得（ワールド座標）
   * 円形サークルで方向iとi+1の境界点を返す
   * @param vertexIndex 方向インデックス（0-7）
   */
  public getDirectionBoundaryPosition(vertexIndex: number): Vector3 {
    const position = this.getPosition();
    const rotation = this.getRotation();

    const angleStep = (Math.PI * 2) / 8;
    const angleOffset = Math.PI / 8;
    const localAngle = -vertexIndex * angleStep + angleOffset;

    const totalAngle = localAngle + rotation;

    // ローカル角度で半径を取得
    const radius = this.getRadiusAtAngle(localAngle);

    const x = position.x + Math.sin(totalAngle) * radius;
    const z = position.z + Math.cos(totalAngle) * radius;

    return new Vector3(x, position.y, z);
  }

  /**
   * 8角形の頂点位置を取得（互換性のため維持）
   * @deprecated getDirectionBoundaryPositionを使用してください
   */
  public getOctagonVertexPosition(vertexIndex: number): Vector3 {
    return this.getDirectionBoundaryPosition(vertexIndex);
  }

  /**
   * 方向（0-7）の中心位置を取得（ワールド座標）
   * @param faceIndex 方向インデックス（0-7）
   */
  public getFaceCenter(faceIndex: number): Vector3 {
    const position = this.getPosition();
    const rotation = this.getRotation();

    // 方向の中心角度を計算
    const angleStep = (Math.PI * 2) / 8;
    const localAngle = -faceIndex * angleStep;
    const worldAngle = localAngle + rotation;

    // その方向の半径を取得（スケール適用）
    const radius = this.footCircleRadii[faceIndex] * this.footCircleScale;

    const x = position.x + Math.sin(worldAngle) * radius;
    const z = position.z + Math.cos(worldAngle) * radius;

    return new Vector3(x, position.y, z);
  }

  /**
   * ワールド座標の角度から方向インデックス（0-7）を計算
   * @param worldAngle ワールド座標での角度（ラジアン）
   * @returns 方向インデックス（0-7）
   */
  public getFaceIndexFromWorldAngle(worldAngle: number): number {
    const rotation = this.getRotation();

    // ワールド角度からローカル角度に変換
    let localAngle = worldAngle - rotation;

    // 角度を0〜2πの範囲に正規化
    while (localAngle < 0) localAngle += Math.PI * 2;
    while (localAngle >= Math.PI * 2) localAngle -= Math.PI * 2;

    // 方向インデックスを計算
    // 各方向は45度（π/4）の範囲を持つ
    // 方向0は正面（0度を中心に±22.5度）
    const angleStep = (Math.PI * 2) / 8;
    const offsetAngle = localAngle + angleStep / 2; // 中心からのオフセットを調整

    let faceIndex = Math.floor(offsetAngle / angleStep);
    faceIndex = ((8 - faceIndex) % 8); // 時計回りに変換

    return faceIndex;
  }

  /**
   * 2点間の接触点から方向インデックスを計算
   * @param contactPoint 接触点のワールド座標
   * @returns 方向インデックス（0-7）
   */
  public getFaceIndexFromContactPoint(contactPoint: Vector3): number {
    const position = this.getPosition();

    // 中心から接触点への角度を計算
    const dx = contactPoint.x - position.x;
    const dz = contactPoint.z - position.z;
    const worldAngle = Math.atan2(dx, dz);

    return this.getFaceIndexFromWorldAngle(worldAngle);
  }

  /**
   * 方向を色分けして表示（デバッグ用）
   */
  public showDirectionColors(): void {
    this.hideDirectionColors();
    this.createFootCircleFaceSegments();
  }

  /**
   * 8角形の面を色分けして表示（互換性のため維持）
   * @deprecated showDirectionColorsを使用してください
   */
  public showOctagonVertexNumbers(): void {
    this.showDirectionColors();
  }

  /**
   * 方向の色分けを非表示（デバッグ用）
   */
  public hideDirectionColors(): void {
    for (const label of this.footCircleVertexLabels) {
      label.dispose();
    }
    this.footCircleVertexLabels = [];

    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];
  }

  /**
   * 8角形の頂点番号を非表示（互換性のため維持）
   * @deprecated hideDirectionColorsを使用してください
   */
  public hideOctagonVertexNumbers(): void {
    this.hideDirectionColors();
  }

  /**
   * 足元のサークルを相手の方向に向けて回転させる
   * 注意: サークルの回転はupdate()で頂点を再計算する際に反映されるため、
   *       このメソッドは使用されていません（互換性のために残しています）
   */
  public alignFootCircleToTarget(_targetPosition: Vector3): void {
    // 注意: rotation.z を設定するとサークルが斜めに傾いてしまうため削除
    // サークルの回転はキャラクターの回転に追従し、update()で自動的に反映される
  }

  /**
   * 足元の円を更新
   */
  public update(): void {
    const position = this.getPosition();
    const rotation = this.getRotation();

    // 円の外周を更新（8方向ごとの半径を使用）
    if (this.footCircle) {
      this.footCircle.position.x = position.x;
      this.footCircle.position.z = position.z;

      const lines: Vector3[][] = [];

      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const angleStep = (Math.PI * 2) / CIRCLE_SEGMENTS;

        const angle1 = i * angleStep;
        const radius1 = this.getRadiusAtAngle(angle1);
        const x1 = Math.sin(angle1) * radius1;
        const z1 = Math.cos(angle1) * radius1;

        const angle2 = (i + 1) * angleStep;
        const radius2 = this.getRadiusAtAngle(angle2);
        const x2 = Math.sin(angle2) * radius2;
        const z2 = Math.cos(angle2) * radius2;

        lines.push([
          new Vector3(x1, 0.01, z1),
          new Vector3(x2, 0.01, z2)
        ]);
      }

      MeshBuilder.CreateLineSystem(
        "foot-circle",
        { lines: lines, instance: this.footCircle as LinesMesh },
        this.scene
      );
    }

    // 色分けセグメント（扇形）を更新（8方向ごとの半径を使用）
    if (this.footCircleFaceSegments.length > 0) {
      const segmentsPerFace = 4;

      for (let faceIndex = 0; faceIndex < 8; faceIndex++) {
        const positions: number[] = [];
        const normals: number[] = [];

        const center = position.clone();
        center.y = 0.02;

        // この方向の開始角度と終了角度
        const angleStep = (Math.PI * 2) / 8;
        const angleOffset = Math.PI / 8;
        const startAngle = -faceIndex * angleStep + angleOffset + rotation;
        const endAngle = -(faceIndex + 1) * angleStep + angleOffset + rotation;

        // 中心点を追加
        positions.push(center.x, center.y, center.z);
        normals.push(0, 1, 0);

        // 扇形の外周点を追加（その方向の半径にスケールを適用）
        const radius = this.footCircleRadii[faceIndex] * this.footCircleScale;
        for (let j = 0; j <= segmentsPerFace; j++) {
          const t = j / segmentsPerFace;
          const angle = startAngle + (endAngle - startAngle) * t;
          const x = position.x + Math.sin(angle) * radius;
          const z = position.z + Math.cos(angle) * radius;
          positions.push(x, center.y, z);
          normals.push(0, 1, 0);
        }

        // インデックス配列を作成
        const indices: number[] = [];
        for (let j = 0; j < segmentsPerFace; j++) {
          indices.push(0, j + 1, j + 2);
        }

        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.normals = normals;
        vertexData.applyToMesh(this.footCircleFaceSegments[faceIndex]);
      }
    }
  }

  /**
   * 足元の円を取得
   */
  public getFootCircle(): LinesMesh | null {
    return this.footCircle;
  }

  /**
   * 足元の円の色分けセグメントを取得
   */
  public getFootCircleFaceSegments(): Mesh[] {
    return this.footCircleFaceSegments;
  }

  /**
   * リソースを破棄
   */
  public dispose(): void {
    if (this.footCircle) {
      this.footCircle.dispose();
      this.footCircle = null;
    }

    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];

    for (const label of this.footCircleVertexLabels) {
      label.dispose();
    }
    this.footCircleVertexLabels = [];
  }
}
