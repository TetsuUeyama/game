import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, VertexData, LinesMesh } from "@babylonjs/core";
import { CharacterState } from "../types/CharacterState";

/**
 * キャラクターの方向サークル（8角形の足元の円）を管理するクラス
 */
export class DirectionCircle {
  private scene: Scene;
  private footCircle: LinesMesh | null = null;
  private footCircleRadius: number = 1.0;
  private footCircleFaceSegments: Mesh[] = [];
  private footCircleVertexLabels: Mesh[] = [];

  // 位置と回転への参照を保持するコールバック
  private getPosition: () => Vector3;
  private getRotation: () => number;

  constructor(
    scene: Scene,
    getPosition: () => Vector3,
    getRotation: () => number,
    initialRadius: number = 1.0
  ) {
    this.scene = scene;
    this.getPosition = getPosition;
    this.getRotation = getRotation;
    this.footCircleRadius = initialRadius;
  }

  /**
   * 足元の円を作成（8角形）
   */
  public createFootCircle(): LinesMesh {
    const lines: Vector3[][] = [];
    const position = this.getPosition();
    const rotation = this.getRotation();

    for (let i = 0; i < 8; i++) {
      const angleStep = (Math.PI * 2) / 8;
      const angleOffset = Math.PI / 8;

      const angle1 = -i * angleStep + angleOffset;
      const totalAngle1 = angle1 + rotation;
      const x1 = Math.sin(totalAngle1) * this.footCircleRadius;
      const z1 = Math.cos(totalAngle1) * this.footCircleRadius;

      const angle2 = -(i + 1) * angleStep + angleOffset;
      const totalAngle2 = angle2 + rotation;
      const x2 = Math.sin(totalAngle2) * this.footCircleRadius;
      const z2 = Math.cos(totalAngle2) * this.footCircleRadius;

      lines.push([
        new Vector3(x1, 0.01, z1),
        new Vector3(x2, 0.01, z2)
      ]);
    }

    const octagon = MeshBuilder.CreateLineSystem(
      "foot-circle",
      { lines: lines, updatable: true },
      this.scene
    );

    octagon.color = new Color3(1.0, 1.0, 1.0);
    octagon.parent = null;

    octagon.position = new Vector3(
      position.x,
      0,
      position.z
    );

    octagon.isVisible = true;

    this.footCircle = octagon;
    return octagon;
  }

  /**
   * 足元の円の色分けセグメント（8つの三角形）を作成
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

    for (let i = 0; i < 8; i++) {
      const center = position.clone();
      center.y = 0.02;
      const vertex1 = this.getOctagonVertexPosition(i);
      vertex1.y = 0.02;
      const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
      vertex2.y = 0.02;

      const positions = [
        center.x, center.y, center.z,
        vertex1.x, vertex1.y, vertex1.z,
        vertex2.x, vertex2.y, vertex2.z,
      ];

      const indices = [0, 1, 2];
      const normals: number[] = [];

      normals.push(0, 1, 0);
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      const triangle = new Mesh(`face-segment-${i}`, this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(triangle);

      const material = new StandardMaterial(`face-material-${i}`, this.scene);
      material.diffuseColor = colors[i];
      material.emissiveColor = colors[i].scale(0.3);
      material.alpha = 0.6;
      material.backFaceCulling = false;
      triangle.material = material;

      this.footCircleFaceSegments.push(triangle);
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
  }

  /**
   * 足元の円のサイズを設定
   */
  public setFootCircleRadius(radius: number): void {
    this.footCircleRadius = Math.max(0, radius);

    if (this.footCircle) {
      const wasVisible = this.footCircle.isVisible;
      this.footCircle.dispose();
      this.footCircle = this.createFootCircle();
      this.footCircle.isVisible = wasVisible;
    }
  }

  /**
   * 足元の円の半径を取得
   */
  public getFootCircleRadius(): number {
    return this.footCircleRadius;
  }

  /**
   * 8角形の頂点位置を取得（ワールド座標）
   */
  public getOctagonVertexPosition(vertexIndex: number): Vector3 {
    const position = this.getPosition();
    const rotation = this.getRotation();

    const angleStep = (Math.PI * 2) / 8;
    const angleOffset = Math.PI / 8;
    const angle = -vertexIndex * angleStep + angleOffset;

    const totalAngle = angle + rotation;

    const x = position.x + Math.sin(totalAngle) * this.footCircleRadius;
    const z = position.z + Math.cos(totalAngle) * this.footCircleRadius;

    return new Vector3(x, position.y, z);
  }

  /**
   * 8角形の面（三角形）を色分けして表示（デバッグ用）
   */
  public showOctagonVertexNumbers(): void {
    this.hideOctagonVertexNumbers();

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

    for (let i = 0; i < 8; i++) {
      const center = position.clone();
      center.y = 0.02;
      const vertex1 = this.getOctagonVertexPosition(i);
      vertex1.y = 0.02;
      const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
      vertex2.y = 0.02;

      const positions = [
        center.x, center.y, center.z,
        vertex1.x, vertex1.y, vertex1.z,
        vertex2.x, vertex2.y, vertex2.z,
      ];

      const indices = [0, 1, 2];
      const normals: number[] = [];

      normals.push(0, 1, 0);
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      const triangle = new Mesh(`face-segment-${i}`, this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(triangle);

      const material = new StandardMaterial(`face-material-${i}`, this.scene);
      material.diffuseColor = colors[i];
      material.emissiveColor = colors[i].scale(0.3);
      material.alpha = 0.6;
      material.backFaceCulling = false;
      triangle.material = material;

      this.footCircleFaceSegments.push(triangle);
    }
  }

  /**
   * 8角形の頂点番号を非表示（デバッグ用）
   */
  public hideOctagonVertexNumbers(): void {
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
   * 足元の8角形を相手の方向に向けて、辺が一致するように回転させる
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

    if (this.footCircle) {
      this.footCircle.position.x = position.x;
      this.footCircle.position.z = position.z;

      const lines: Vector3[][] = [];

      for (let i = 0; i < 8; i++) {
        const angleStep = (Math.PI * 2) / 8;
        const angleOffset = Math.PI / 8;

        const angle1 = -i * angleStep + angleOffset;
        const totalAngle1 = angle1 + rotation;
        const x1 = Math.sin(totalAngle1) * this.footCircleRadius;
        const z1 = Math.cos(totalAngle1) * this.footCircleRadius;

        const angle2 = -(i + 1) * angleStep + angleOffset;
        const totalAngle2 = angle2 + rotation;
        const x2 = Math.sin(totalAngle2) * this.footCircleRadius;
        const z2 = Math.cos(totalAngle2) * this.footCircleRadius;

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

    if (this.footCircleFaceSegments.length > 0) {
      for (let i = 0; i < 8; i++) {
        const center = position.clone();
        center.y = 0.02;
        const vertex1 = this.getOctagonVertexPosition(i);
        vertex1.y = 0.02;
        const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
        vertex2.y = 0.02;

        const positions = [
          center.x, center.y, center.z,
          vertex1.x, vertex1.y, vertex1.z,
          vertex2.x, vertex2.y, vertex2.z,
        ];

        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = [0, 1, 2];
        vertexData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0];
        vertexData.applyToMesh(this.footCircleFaceSegments[i]);
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
