import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, DynamicTexture } from "@babylonjs/core";
import { FIELD_CONFIG, GOAL_CONFIG } from "../config/gameConfig";
import { GRID_CONFIG } from "../config/FieldGridConfig";
import { Net } from "./Net";

/**
 * フィールド（地面）エンティティ
 */
export class Field {
  private scene: Scene;
  public mesh: Mesh;
  private goal1Backboard: Mesh; // ゴール1のバックボード
  private goal1Rim: Mesh; // ゴール1のリム
  private goal1Net: Net; // ゴール1のネット
  private goal2Backboard: Mesh; // ゴール2のバックボード
  private goal2Rim: Mesh; // ゴール2のリム
  private goal2Net: Net; // ゴール2のネット
  private centerCircle: Mesh; // センターサークル
  private gridLines: Mesh[] = []; // カスタムグリッド線
  private gridLabels: Mesh[] = []; // 座標ラベル

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();

    // センターサークルを作成
    this.centerCircle = this.createCenterCircle();

    // 座標ラベルを作成
    this.createGridLabels();

    // ゴール1（奥側、+Z）を作成
    const goal1 = this.createBasketballGoal(1);
    this.goal1Backboard = goal1.backboard;
    this.goal1Rim = goal1.rim;
    this.goal1Net = goal1.net;

    // ゴール2（手前側、-Z）を作成
    const goal2 = this.createBasketballGoal(2);
    this.goal2Backboard = goal2.backboard;
    this.goal2Rim = goal2.rim;
    this.goal2Net = goal2.net;
  }

  /**
   * フィールドメッシュを作成
   */
  private createField(): Mesh {
    // 地面の平面を作成（width=X軸方向、height=Z軸方向）
    const ground = MeshBuilder.CreateGround(
      "field-ground",
      {
        width: FIELD_CONFIG.width,
        height: FIELD_CONFIG.length,
        subdivisions: FIELD_CONFIG.gridSize,
      },
      this.scene
    );

    ground.position = new Vector3(0, 0, 0);

    // 床の色を設定（グリッド線なし）
    const material = new StandardMaterial("field-material", this.scene);
    material.diffuseColor = Color3.FromHexString(FIELD_CONFIG.floorColor);
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    ground.material = material;

    // カスタムグリッドを描画
    this.createCustomGrid();

    return ground;
  }

  /**
   * カスタムグリッド線を作成（フィールド端から始まる将棋盤スタイル）
   */
  private createCustomGrid(): void {
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const cellSize = 1; // 小さな升目のサイズ（1m）
    const majorInterval = 5; // 大枠の間隔（5マスごと）
    const gridY = 0.01; // 地面より少し上

    const minorColor = Color3.FromHexString(FIELD_CONFIG.gridColor);
    const majorColor = Color3.FromHexString('#4A2508'); // 大枠は濃い色

    // X方向の線（Z軸に平行な線）
    for (let x = -halfWidth; x <= halfWidth + 0.001; x += cellSize) {
      const isMajor = Math.abs((x + halfWidth) % majorInterval) < 0.001 ||
                      Math.abs((x + halfWidth) % majorInterval - majorInterval) < 0.001;
      const points = [
        new Vector3(x, gridY, -halfLength),
        new Vector3(x, gridY, halfLength),
      ];
      const line = MeshBuilder.CreateLines(
        `grid-line-x-${x}`,
        { points },
        this.scene
      );
      line.color = isMajor ? majorColor : minorColor;
      this.gridLines.push(line);
    }

    // Z方向の線（X軸に平行な線）
    for (let z = -halfLength; z <= halfLength + 0.001; z += cellSize) {
      const isMajor = Math.abs((z + halfLength) % majorInterval) < 0.001 ||
                      Math.abs((z + halfLength) % majorInterval - majorInterval) < 0.001;
      const points = [
        new Vector3(-halfWidth, gridY, z),
        new Vector3(halfWidth, gridY, z),
      ];
      const line = MeshBuilder.CreateLines(
        `grid-line-z-${z}`,
        { points },
        this.scene
      );
      line.color = isMajor ? majorColor : minorColor;
      this.gridLines.push(line);
    }
  }

  /**
   * 座標ラベルを作成（各マスに座標を表示）
   */
  private createGridLabels(): void {
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    const labelY = 0.02;
    const labelSize = 0.8; // ラベルのサイズ（マスに収まるよう調整）

    // 各マスに座標を表示（A1〜O30）
    for (let col = 0; col < GRID_CONFIG.cell.colCount; col++) {
      for (let row = 0; row < GRID_CONFIG.cell.rowCount; row++) {
        const label = `${GRID_CONFIG.cell.colLabels[col]}${row + 1}`;
        const x = -halfWidth + col * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;
        const z = -halfLength + row * GRID_CONFIG.cell.size + GRID_CONFIG.cell.size / 2;

        const labelMesh = this.createTextLabel(label, x, labelY, z, labelSize);
        this.gridLabels.push(labelMesh);
      }
    }
  }

  /**
   * テキストラベルを作成
   */
  private createTextLabel(text: string, x: number, y: number, z: number, size: number): Mesh {
    // テクスチャサイズ（解像度）
    const textureSize = 128;

    // DynamicTextureでテキストを描画
    const texture = new DynamicTexture(
      `label-texture-${text}`,
      { width: textureSize, height: textureSize },
      this.scene,
      true // hasAlpha
    );

    // 背景を透明にクリア
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, textureSize, textureSize);

    // 文字を描画（濃い色で見やすく）
    ctx.fillStyle = '#2A1A0A'; // 濃い茶色
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textureSize / 2, textureSize / 2);
    texture.update();
    texture.hasAlpha = true;

    // Planeメッシュにテクスチャを適用
    const plane = MeshBuilder.CreatePlane(
      `label-${text}`,
      { size },
      this.scene
    );
    plane.position = new Vector3(x, y, z);
    plane.rotation.x = Math.PI / 2; // 地面と平行に

    const material = new StandardMaterial(`label-material-${text}`, this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.backFaceCulling = false;
    material.transparencyMode = 2; // ALPHATEST
    plane.material = material;

    return plane;
  }

  /**
   * センターサークルを作成
   */
  private createCenterCircle(): Mesh {
    const radius = FIELD_CONFIG.centerCircleRadius;

    // 円周上の点を生成してラインで描画
    const segments = 64;
    const points: Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      points.push(new Vector3(x, 0.02, z)); // 地面より少し上
    }

    // ラインシステムで円を描画
    const circle = MeshBuilder.CreateLines(
      "center-circle",
      {
        points: points,
      },
      this.scene
    );

    // ラインの色（白色）
    circle.color = Color3.FromHexString(FIELD_CONFIG.centerCircleColor);

    return circle;
  }

  /**
   * センターサークルの半径を取得
   */
  public getCenterCircleRadius(): number {
    return FIELD_CONFIG.centerCircleRadius;
  }

  /**
   * バスケットゴールを作成
   * @param goalNumber ゴール番号（1または2）
   */
  private createBasketballGoal(goalNumber: number): { backboard: Mesh; rim: Mesh; net: Net } {
    const fieldHalfLength = FIELD_CONFIG.length / 2;

    // ゴール1は+Z側（奥）、ゴール2は-Z側（手前）
    const zSign = goalNumber === 1 ? 1 : -1;
    const zPosition = zSign * (fieldHalfLength - GOAL_CONFIG.backboardDistance);

    // バックボード
    const backboard = MeshBuilder.CreateBox(
      `backboard-${goalNumber}`,
      {
        width: GOAL_CONFIG.backboardWidth,
        height: GOAL_CONFIG.backboardHeight,
        depth: GOAL_CONFIG.backboardDepth,
      },
      this.scene
    );

    backboard.position = new Vector3(
      0,
      GOAL_CONFIG.rimHeight + GOAL_CONFIG.backboardHeight / 2,
      zPosition
    );

    const backboardMaterial = new StandardMaterial(
      `backboard-material-${goalNumber}`,
      this.scene
    );
    backboardMaterial.diffuseColor = new Color3(1, 1, 1);
    backboardMaterial.alpha = 0.5;
    backboard.material = backboardMaterial;

    // リム（輪）
    const rim = MeshBuilder.CreateTorus(
      `rim-${goalNumber}`,
      {
        diameter: GOAL_CONFIG.rimDiameter,
        thickness: GOAL_CONFIG.rimThickness,
        tessellation: 32,
      },
      this.scene
    );

    // リムの位置：バックボードからrimOffset分だけコート内側に配置
    rim.position = new Vector3(
      0,
      GOAL_CONFIG.rimHeight,
      zPosition - zSign * GOAL_CONFIG.rimOffset
    );

    const rimMaterial = new StandardMaterial(`rim-material-${goalNumber}`, this.scene);
    rimMaterial.diffuseColor = Color3.FromHexString(GOAL_CONFIG.rimColor);
    rimMaterial.emissiveColor = Color3.FromHexString(GOAL_CONFIG.rimColor).scale(0.3);
    rim.material = rimMaterial;

    // ネット
    const rimCenter = rim.position.clone();
    const net = new Net(this.scene, rimCenter, goalNumber === 1 ? "goal1" : "goal2");

    return { backboard, rim, net };
  }

  /**
   * ゴール1のバックボードを取得
   */
  public getGoal1Backboard(): Mesh {
    return this.goal1Backboard;
  }

  /**
   * ゴール2のバックボードを取得
   */
  public getGoal2Backboard(): Mesh {
    return this.goal2Backboard;
  }

  /**
   * ゴール1のリムを取得
   */
  public getGoal1Rim(): Mesh {
    return this.goal1Rim;
  }

  /**
   * ゴール2のリムを取得
   */
  public getGoal2Rim(): Mesh {
    return this.goal2Rim;
  }

  /**
   * ゴール1のネットを取得
   */
  public getGoal1Net(): Net {
    return this.goal1Net;
  }

  /**
   * ゴール2のネットを取得
   */
  public getGoal2Net(): Net {
    return this.goal2Net;
  }

  /**
   * 更新（ネットの物理シミュレーション）
   */
  public update(deltaTime: number): void {
    this.goal1Net.update(deltaTime);
    this.goal2Net.update(deltaTime);
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.mesh.dispose();
    this.centerCircle.dispose();
    this.goal1Backboard.dispose();
    this.goal1Rim.dispose();
    this.goal1Net.dispose();
    this.goal2Backboard.dispose();
    this.goal2Rim.dispose();
    this.goal2Net.dispose();
    // グリッド線を破棄
    for (const line of this.gridLines) {
      line.dispose();
    }
    this.gridLines = [];
    // ラベルを破棄
    for (const label of this.gridLabels) {
      label.dispose();
    }
    this.gridLabels = [];
  }
}
