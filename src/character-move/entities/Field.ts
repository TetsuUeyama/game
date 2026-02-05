import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
  DynamicTexture,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMaterialCombineMode,
} from "@babylonjs/core";
import { FIELD_CONFIG, GOAL_CONFIG } from "../config/gameConfig";
import { GRID_CONFIG, OUTER_GRID_CONFIG } from "../config/FieldGridConfig";
import { Net } from "./Net";
import { PhysicsConstants } from "../../physics/PhysicsConfig";

/**
 * NBA 3ポイントライン設定
 * - アーク半径: 23フィート9インチ = 7.24m（バスケット中心から）
 * - コーナー距離: 22フィート = 6.71m
 */
const THREE_POINT_LINE_CONFIG = {
  arcRadius: 7.24,         // アーク半径 (m)
  cornerDistance: 6.71,    // コーナーからバスケットまでの距離 (m)
  lineColor: '#FFFFFF',    // ライン色（白）
  lineY: 0.02,             // 地面からの高さ
  arcSegments: 48,         // アークのセグメント数
};

/**
 * NBA ペイントエリア（キー／レーン）設定
 * すべての寸法はNBA公式規格に基づく
 *
 * 【座標系】
 * - 原点 (0,0,0) = コート中央
 * - X軸：左右（コート幅方向）
 * - Z軸：ゴール方向（コート長さ方向）
 *
 * 【幾何関係】
 * ```
 *                    ベースライン
 *     ─────────────────────────────────
 *           │                   │
 *           │   ペイントエリア   │  ← レーン幅: 4.88m
 *           │                   │
 *           │       ●          │  ← ゴール中心
 *           │                   │
 *           ├───────────────────┤  ← レーン底線
 *           │                   │     （ゴール中心から backboardOffset + laneBottomOffset）
 *           │                   │
 *           │                   │  ← レーン長: 5.79m
 *           │                   │
 *           ├───────────────────┤  ← フリースローライン
 *          ╱                     ╲    （ゴール中心から freeThrowDistance）
 *         (    フリースローサークル )  ← 半径: 1.80m（上半円）
 *          ╲                     ╱
 * ```
 */
const PAINT_AREA_CONFIG = {
  /** レーン幅 (m) - NBA: 16フィート = 4.88m */
  laneWidth: 4.88,

  /** レーン長 (m) - NBA: ベースライン→フリースローライン = 19フィート = 5.79m */
  laneLength: 5.79,

  /** ゴール中心→フリースローライン距離 (m) - NBA: 約15フィート = 4.57m */
  freeThrowDistance: 4.57,

  /** フリースローサークル半径 (m) - NBA: 6フィート = 1.83m（近似1.80m使用） */
  freeThrowCircleRadius: 1.80,

  /** ゴール中心→バックボード距離 (m) - rimOffset に相当 */
  backboardOffset: 0.4,

  /** バックボード→レーン底（ベースライン側）距離 (m) */
  laneBottomOffset: 0.0,  // レーン底はバックボード位置とほぼ一致

  /** ライン色（白） */
  lineColor: '#FFFFFF',

  /** 地面からの高さ (m) */
  lineY: 0.02,

  /** フリースローサークルのセグメント数 */
  circleSegments: 32,
} as const;

export class Field {
  private scene: Scene;
  public mesh: Mesh;
  private goal1Backboard: Mesh; // ゴール1のバックボード
  private goal1Rim: Mesh; // ゴール1のリム
  private goal1Net: Net; // ゴール1のネット
  private goal1TargetMarker: Mesh; // ゴール1のシュート目標マーカー
  private goal2Backboard: Mesh; // ゴール2のバックボード
  private goal2Rim: Mesh; // ゴール2のリム
  private goal2Net: Net; // ゴール2のネット
  private goal2TargetMarker: Mesh; // ゴール2のシュート目標マーカー
  private centerCircle: Mesh; // センターサークル
  private threePointLines: Mesh[] = []; // 3ポイントライン
  private paintAreaLines: Mesh[] = []; // ペイントエリア（キー）ライン
  private gridLines: Mesh[] = []; // カスタムグリッド線
  private gridLabels: Mesh[] = []; // 座標ラベル
  private outerAreaMeshes: Mesh[] = []; // 外側マスエリア

  // 物理ボディ
  private groundPhysics: PhysicsAggregate | null = null;
  private backboard1Physics: PhysicsAggregate | null = null;
  private backboard2Physics: PhysicsAggregate | null = null;
  private rim1Physics: PhysicsAggregate | null = null;
  private rim2Physics: PhysicsAggregate | null = null;
  private outerAreaPhysics: PhysicsAggregate[] = []; // 外側マスエリアの物理ボディ

  // 境界壁（ボールがフィールド外に出るのを防ぐ）
  private boundaryWalls: Mesh[] = [];
  private boundaryWallPhysics: PhysicsAggregate[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();

    // 外側マスエリアを作成
    this.createOuterCells();

    // 境界壁を作成（ボールがフィールド外に出るのを防ぐ）
    this.createBoundaryWalls();

    // センターサークルを作成
    this.centerCircle = this.createCenterCircle();

    // 3ポイントラインを作成
    this.createThreePointLines();

    // ペイントエリア（キー）を作成
    this.createPaintAreas();

    // 座標ラベルを作成
    this.createGridLabels();

    // ゴール1（奥側、+Z）を作成
    const goal1 = this.createBasketballGoal(1);
    this.goal1Backboard = goal1.backboard;
    this.goal1Rim = goal1.rim;
    this.goal1Net = goal1.net;
    this.goal1TargetMarker = goal1.targetMarker;

    // ゴール2（手前側、-Z）を作成
    const goal2 = this.createBasketballGoal(2);
    this.goal2Backboard = goal2.backboard;
    this.goal2Rim = goal2.rim;
    this.goal2Net = goal2.net;
    this.goal2TargetMarker = goal2.targetMarker;
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
   * 外側マスエリアを作成（スローイン用）
   * フィールドの外周に1マス分のエリアを追加
   */
  private createOuterCells(): void {
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const cellSize = OUTER_GRID_CONFIG.cellSize; // 1m
    const groundY = 0.001; // 地面より少し上
    const gridY = 0.011; // グリッド線

    // 外側エリアの地面色（薄い緑で目立つように）
    const outerMaterial = new StandardMaterial("outer-area-material", this.scene);
    outerMaterial.diffuseColor = Color3.FromHexString('#7CB87C'); // 薄い緑
    outerMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    const gridColor = Color3.FromHexString('#707070'); // グリッド線の色

    // 左サイドライン外側（@列）- フィールドに隣接、中心は -8.5m、幅は1.5m（-9.25 ~ -7.75）
    // ただし視覚的にはフィールドから -9.0m まで（1.5m幅）
    const leftOuter = MeshBuilder.CreateGround(
      "outer-left",
      { width: cellSize * 1.5, height: FIELD_CONFIG.length },
      this.scene
    );
    leftOuter.position = new Vector3(-halfWidth - cellSize * 0.75, groundY, 0);
    leftOuter.material = outerMaterial;
    this.outerAreaMeshes.push(leftOuter);

    // 右サイドライン外側（P列）- フィールドに隣接、中心は +8.5m、幅は1.5m（+7.75 ~ +9.25）
    const rightOuter = MeshBuilder.CreateGround(
      "outer-right",
      { width: cellSize * 1.5, height: FIELD_CONFIG.length },
      this.scene
    );
    rightOuter.position = new Vector3(halfWidth + cellSize * 0.75, groundY, 0);
    rightOuter.material = outerMaterial;
    this.outerAreaMeshes.push(rightOuter);

    // 上エンドライン外側（0行）- コーナーを含む（幅は左右外側マスの端まで）
    const topOuter = MeshBuilder.CreateGround(
      "outer-top",
      { width: FIELD_CONFIG.width + cellSize * 3, height: cellSize },
      this.scene
    );
    topOuter.position = new Vector3(0, groundY, halfLength + cellSize / 2);
    topOuter.material = outerMaterial;
    this.outerAreaMeshes.push(topOuter);

    // 下エンドライン外側（31行）- コーナーを含む（幅は左右外側マスの端まで）
    const bottomOuter = MeshBuilder.CreateGround(
      "outer-bottom",
      { width: FIELD_CONFIG.width + cellSize * 3, height: cellSize },
      this.scene
    );
    bottomOuter.position = new Vector3(0, groundY, -halfLength - cellSize / 2);
    bottomOuter.material = outerMaterial;
    this.outerAreaMeshes.push(bottomOuter);

    // 外側エリアのグリッド線を描画
    this.createOuterGridLines(gridY, gridColor);
  }

  /**
   * 境界壁を作成（半透明ガラス風、高さ5m）
   * フィールドの端に壁を設置してボールが外に出ないようにする
   */
  private createBoundaryWalls(): void {
    const halfWidth = FIELD_CONFIG.width / 2;   // 7.5m
    const halfLength = FIELD_CONFIG.length / 2; // 15m
    const wallHeight = 5.0; // 壁の高さ
    const wallThickness = 0.1; // 壁の厚さ

    // 半透明ガラス風マテリアル
    const wallMaterial = new StandardMaterial("wall-material", this.scene);
    wallMaterial.diffuseColor = new Color3(0.7, 0.85, 0.95); // 薄い青みがかった白
    wallMaterial.specularColor = new Color3(0.5, 0.5, 0.5); // 反射
    wallMaterial.alpha = 0.15; // 半透明（ガラス風）
    wallMaterial.backFaceCulling = false; // 両面表示

    // 左壁（x = -halfWidth）
    const leftWall = MeshBuilder.CreateBox(
      "boundary-wall-left",
      { width: wallThickness, height: wallHeight, depth: FIELD_CONFIG.length },
      this.scene
    );
    leftWall.position = new Vector3(-halfWidth - wallThickness / 2, wallHeight / 2, 0);
    leftWall.material = wallMaterial;
    this.boundaryWalls.push(leftWall);

    // 右壁（x = +halfWidth）
    const rightWall = MeshBuilder.CreateBox(
      "boundary-wall-right",
      { width: wallThickness, height: wallHeight, depth: FIELD_CONFIG.length },
      this.scene
    );
    rightWall.position = new Vector3(halfWidth + wallThickness / 2, wallHeight / 2, 0);
    rightWall.material = wallMaterial;
    this.boundaryWalls.push(rightWall);

    // 奥壁（z = +halfLength）
    const backWall = MeshBuilder.CreateBox(
      "boundary-wall-back",
      { width: FIELD_CONFIG.width, height: wallHeight, depth: wallThickness },
      this.scene
    );
    backWall.position = new Vector3(0, wallHeight / 2, halfLength + wallThickness / 2);
    backWall.material = wallMaterial;
    this.boundaryWalls.push(backWall);

    // 手前壁（z = -halfLength）
    const frontWall = MeshBuilder.CreateBox(
      "boundary-wall-front",
      { width: FIELD_CONFIG.width, height: wallHeight, depth: wallThickness },
      this.scene
    );
    frontWall.position = new Vector3(0, wallHeight / 2, -halfLength - wallThickness / 2);
    frontWall.material = wallMaterial;
    this.boundaryWalls.push(frontWall);
  }

  /**
   * 外側エリアのグリッド線を描画
   * 外側マスの範囲: サイドラインから1.5m外側（中心が1m外側、幅1m）
   */
  private createOuterGridLines(gridY: number, color: Color3): void {
    const halfWidth = FIELD_CONFIG.width / 2;
    const halfLength = FIELD_CONFIG.length / 2;
    const cellSize = OUTER_GRID_CONFIG.cellSize;
    // 外側マスの外端（中心が halfWidth + cellSize なので、外端は halfWidth + cellSize * 1.5）
    const outerEdge = cellSize * 1.5;

    // 外側の境界線（外周）
    const outerBoundary = [
      new Vector3(-halfWidth - outerEdge, gridY, -halfLength - cellSize),
      new Vector3(halfWidth + outerEdge, gridY, -halfLength - cellSize),
      new Vector3(halfWidth + outerEdge, gridY, halfLength + cellSize),
      new Vector3(-halfWidth - outerEdge, gridY, halfLength + cellSize),
      new Vector3(-halfWidth - outerEdge, gridY, -halfLength - cellSize),
    ];
    const boundaryLine = MeshBuilder.CreateLines("outer-boundary", { points: outerBoundary }, this.scene);
    boundaryLine.color = color;
    this.gridLines.push(boundaryLine);

    // 左サイドライン外側の縦線（@列の外端）
    const leftLine = MeshBuilder.CreateLines("outer-left-line", {
      points: [
        new Vector3(-halfWidth - outerEdge, gridY, -halfLength - cellSize),
        new Vector3(-halfWidth - outerEdge, gridY, halfLength + cellSize),
      ],
    }, this.scene);
    leftLine.color = color;
    this.gridLines.push(leftLine);

    // 右サイドライン外側の縦線（P列の外端）
    const rightLine = MeshBuilder.CreateLines("outer-right-line", {
      points: [
        new Vector3(halfWidth + outerEdge, gridY, -halfLength - cellSize),
        new Vector3(halfWidth + outerEdge, gridY, halfLength + cellSize),
      ],
    }, this.scene);
    rightLine.color = color;
    this.gridLines.push(rightLine);

    // 上エンドライン外側の横線（0行と1行の間）
    const topLine = MeshBuilder.CreateLines("outer-top-line", {
      points: [
        new Vector3(-halfWidth - outerEdge, gridY, halfLength + cellSize),
        new Vector3(halfWidth + outerEdge, gridY, halfLength + cellSize),
      ],
    }, this.scene);
    topLine.color = color;
    this.gridLines.push(topLine);

    // 下エンドライン外側の横線（30行と31行の間）
    const bottomLine = MeshBuilder.CreateLines("outer-bottom-line", {
      points: [
        new Vector3(-halfWidth - outerEdge, gridY, -halfLength - cellSize),
        new Vector3(halfWidth + outerEdge, gridY, -halfLength - cellSize),
      ],
    }, this.scene);
    bottomLine.color = color;
    this.gridLines.push(bottomLine);

    // 左右外側エリアの横線（1mごと）
    for (let z = -halfLength; z <= halfLength + 0.001; z += cellSize) {
      // 左外側
      const leftHLine = MeshBuilder.CreateLines(`outer-left-h-${z}`, {
        points: [
          new Vector3(-halfWidth - outerEdge, gridY, z),
          new Vector3(-halfWidth, gridY, z),
        ],
      }, this.scene);
      leftHLine.color = color;
      this.gridLines.push(leftHLine);

      // 右外側
      const rightHLine = MeshBuilder.CreateLines(`outer-right-h-${z}`, {
        points: [
          new Vector3(halfWidth, gridY, z),
          new Vector3(halfWidth + outerEdge, gridY, z),
        ],
      }, this.scene);
      rightHLine.color = color;
      this.gridLines.push(rightHLine);
    }

    // 上下外側エリアの縦線（1mごと）
    for (let x = -halfWidth; x <= halfWidth + 0.001; x += cellSize) {
      // 上外側
      const topVLine = MeshBuilder.CreateLines(`outer-top-v-${x}`, {
        points: [
          new Vector3(x, gridY, halfLength),
          new Vector3(x, gridY, halfLength + cellSize),
        ],
      }, this.scene);
      topVLine.color = color;
      this.gridLines.push(topVLine);

      // 下外側
      const bottomVLine = MeshBuilder.CreateLines(`outer-bottom-v-${x}`, {
        points: [
          new Vector3(x, gridY, -halfLength),
          new Vector3(x, gridY, -halfLength - cellSize),
        ],
      }, this.scene);
      bottomVLine.color = color;
      this.gridLines.push(bottomVLine);
    }
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
   * 3ポイントラインを作成（両ゴール用）
   * NBA仕様: アーク半径7.24m、コーナー距離6.71m
   */
  private createThreePointLines(): void {
    const fieldHalfLength = FIELD_CONFIG.length / 2;
    const { arcRadius, cornerDistance, lineColor, lineY, arcSegments } = THREE_POINT_LINE_CONFIG;

    // goal1（+Z側）のバスケット中心位置
    const basket1Z = fieldHalfLength - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
    // goal2（-Z側）のバスケット中心位置
    const basket2Z = -basket1Z;

    // アークとコーナーラインの交点のZ座標を計算
    // アーク: x² + (z - basketZ)² = arcRadius²
    // コーナーライン: x = ±cornerDistance
    // → (z - basketZ)² = arcRadius² - cornerDistance²
    const deltaZ = Math.sqrt(arcRadius * arcRadius - cornerDistance * cornerDistance);

    // goal1の3ポイントライン
    this.createThreePointLineForGoal(basket1Z, deltaZ, cornerDistance, arcRadius, lineY, lineColor, arcSegments, 1);

    // goal2の3ポイントライン（反転）
    this.createThreePointLineForGoal(basket2Z, deltaZ, cornerDistance, arcRadius, lineY, lineColor, arcSegments, 2);
  }

  /**
   * 1つのゴール用の3ポイントラインを作成
   */
  private createThreePointLineForGoal(
    basketZ: number,
    deltaZ: number,
    cornerDistance: number,
    arcRadius: number,
    lineY: number,
    lineColor: string,
    arcSegments: number,
    goalNumber: number
  ): void {
    const fieldHalfLength = FIELD_CONFIG.length / 2;
    const color = Color3.FromHexString(lineColor);

    // goal1は+Z側、goal2は-Z側
    const zSign = goalNumber === 1 ? 1 : -1;

    // コーナーラインとアークの交点
    const intersectionZ = basketZ - zSign * deltaZ;

    // ベースライン位置
    const baselineZ = zSign * fieldHalfLength;

    // 左コーナーライン（X = -cornerDistance、ベースラインから交点まで）
    const leftCornerPoints = [
      new Vector3(-cornerDistance, lineY, baselineZ),
      new Vector3(-cornerDistance, lineY, intersectionZ),
    ];
    const leftCornerLine = MeshBuilder.CreateLines(
      `three-point-corner-left-${goalNumber}`,
      { points: leftCornerPoints },
      this.scene
    );
    leftCornerLine.color = color;
    this.threePointLines.push(leftCornerLine);

    // 右コーナーライン（X = +cornerDistance、ベースラインから交点まで）
    const rightCornerPoints = [
      new Vector3(cornerDistance, lineY, baselineZ),
      new Vector3(cornerDistance, lineY, intersectionZ),
    ];
    const rightCornerLine = MeshBuilder.CreateLines(
      `three-point-corner-right-${goalNumber}`,
      { points: rightCornerPoints },
      this.scene
    );
    rightCornerLine.color = color;
    this.threePointLines.push(rightCornerLine);

    // アーク（左交点から右交点まで）
    // goal1: 左(-cornerDistance, intersectionZ)から右(cornerDistance, intersectionZ)へ、下に膨らむ
    // goal2: 左(-cornerDistance, intersectionZ)から右(cornerDistance, intersectionZ)へ、上に膨らむ
    const arcPoints: Vector3[] = [];

    // アークの開始角度と終了角度を計算
    // バスケット中心を原点とした座標系で考える
    // 左交点: (-cornerDistance, intersectionZ - basketZ) = (-cornerDistance, -zSign * deltaZ)
    // 右交点: (cornerDistance, intersectionZ - basketZ) = (cornerDistance, -zSign * deltaZ)
    //
    // 角度: atan2(z - basketZ, x)
    // 左交点の角度: atan2(-zSign * deltaZ, -cornerDistance)
    // 右交点の角度: atan2(-zSign * deltaZ, cornerDistance)

    const leftAngle = Math.atan2(-zSign * deltaZ, -cornerDistance);
    const rightAngle = Math.atan2(-zSign * deltaZ, cornerDistance);

    // goal1: アークは下側（-Z方向）に膨らむ → 角度は約-160度から約-20度
    // goal2: アークは上側（+Z方向）に膨らむ → 角度は約160度から約20度
    //
    // leftAngle to rightAngle の範囲でアークを描画
    // goal1の場合、leftAngle ≈ -2.4rad, rightAngle ≈ -0.7rad なので leftAngle < rightAngle
    // goal2の場合、leftAngle ≈ 2.4rad, rightAngle ≈ 0.7rad なので leftAngle > rightAngle

    let startAngle: number;
    let endAngle: number;

    if (goalNumber === 1) {
      // goal1: 左から右へ（角度増加方向）
      startAngle = leftAngle;
      endAngle = rightAngle;
    } else {
      // goal2: 左から右へ（角度減少方向）
      startAngle = leftAngle;
      endAngle = rightAngle;
    }

    // アークを描画
    for (let i = 0; i <= arcSegments; i++) {
      const t = i / arcSegments;
      const angle = startAngle + (endAngle - startAngle) * t;
      const x = Math.cos(angle) * arcRadius;
      const z = basketZ + Math.sin(angle) * arcRadius;
      arcPoints.push(new Vector3(x, lineY, z));
    }

    const arcLine = MeshBuilder.CreateLines(
      `three-point-arc-${goalNumber}`,
      { points: arcPoints },
      this.scene
    );
    arcLine.color = color;
    this.threePointLines.push(arcLine);
  }

  /**
   * ペイントエリア（キー／レーン）を作成（両ゴール用）
   *
   * 【幾何計算】
   * ゴール中心座標を基準に、以下を算出:
   * - フリースローライン: goalZ - zSign * freeThrowDistance
   * - レーン左右境界: X = ±(laneWidth / 2)
   * - レーン底（ベースライン側）: goalZ + zSign * (backboardOffset + laneBottomOffset)
   * - フリースローサークル: フリースローライン上に中心、上半円（コート中央向き）
   */
  private createPaintAreas(): void {
    const fieldHalfLength = FIELD_CONFIG.length / 2;

    // goal1（+Z側）のバスケット中心位置
    const basket1Z = fieldHalfLength - GOAL_CONFIG.backboardDistance - GOAL_CONFIG.rimOffset;
    // goal2（-Z側）のバスケット中心位置
    const basket2Z = -basket1Z;

    // goal1のペイントエリア
    this.createPaintAreaForGoal(basket1Z, 1);

    // goal2のペイントエリア
    this.createPaintAreaForGoal(basket2Z, 2);
  }

  /**
   * 1つのゴール用のペイントエリアを作成
   *
   * @param goalCenterZ ゴール中心のZ座標
   * @param goalNumber ゴール番号（1 = +Z側、2 = -Z側）
   *
   * 【構成要素】
   * 1. レーン左境界線: (-halfWidth, freeThrowZ) → (-halfWidth, laneBottomZ)
   * 2. レーン右境界線: (+halfWidth, freeThrowZ) → (+halfWidth, laneBottomZ)
   * 3. フリースローライン: (-halfWidth, freeThrowZ) → (+halfWidth, freeThrowZ)
   * 4. レーン底線: (-halfWidth, laneBottomZ) → (+halfWidth, laneBottomZ)
   * 5. フリースローサークル上半円: 中心 (0, freeThrowZ)、半径 1.80m
   */
  private createPaintAreaForGoal(goalCenterZ: number, goalNumber: number): void {
    const {
      laneWidth,
      freeThrowDistance,
      freeThrowCircleRadius,
      lineColor,
      lineY,
      circleSegments,
    } = PAINT_AREA_CONFIG;

    const color = Color3.FromHexString(lineColor);
    const halfWidth = laneWidth / 2;

    // goal1は+Z側（ベースラインが+Z方向）、goal2は-Z側
    const zSign = goalNumber === 1 ? 1 : -1;
    const fieldHalfLength = FIELD_CONFIG.length / 2;

    // フリースローライン Z座標
    // = ゴール中心から freeThrowDistance だけコート中央方向（-zSign方向）
    const freeThrowZ = goalCenterZ - zSign * freeThrowDistance;

    // レーン底 Z座標 = ベースラインと一致
    const laneBottomZ = zSign * fieldHalfLength;

    // ========================================
    // 1. レーン左境界線
    // ========================================
    const leftBoundaryPoints = [
      new Vector3(-halfWidth, lineY, freeThrowZ),
      new Vector3(-halfWidth, lineY, laneBottomZ),
    ];
    const leftBoundaryLine = MeshBuilder.CreateLines(
      `paint-left-boundary-${goalNumber}`,
      { points: leftBoundaryPoints },
      this.scene
    );
    leftBoundaryLine.color = color;
    this.paintAreaLines.push(leftBoundaryLine);

    // ========================================
    // 2. レーン右境界線
    // ========================================
    const rightBoundaryPoints = [
      new Vector3(halfWidth, lineY, freeThrowZ),
      new Vector3(halfWidth, lineY, laneBottomZ),
    ];
    const rightBoundaryLine = MeshBuilder.CreateLines(
      `paint-right-boundary-${goalNumber}`,
      { points: rightBoundaryPoints },
      this.scene
    );
    rightBoundaryLine.color = color;
    this.paintAreaLines.push(rightBoundaryLine);

    // ========================================
    // 3. フリースローライン
    // ========================================
    const freeThrowLinePoints = [
      new Vector3(-halfWidth, lineY, freeThrowZ),
      new Vector3(halfWidth, lineY, freeThrowZ),
    ];
    const freeThrowLine = MeshBuilder.CreateLines(
      `paint-free-throw-line-${goalNumber}`,
      { points: freeThrowLinePoints },
      this.scene
    );
    freeThrowLine.color = color;
    this.paintAreaLines.push(freeThrowLine);

    // ========================================
    // 4. レーン底線（ベースライン側）
    // ========================================
    const laneBottomLinePoints = [
      new Vector3(-halfWidth, lineY, laneBottomZ),
      new Vector3(halfWidth, lineY, laneBottomZ),
    ];
    const laneBottomLine = MeshBuilder.CreateLines(
      `paint-lane-bottom-${goalNumber}`,
      { points: laneBottomLinePoints },
      this.scene
    );
    laneBottomLine.color = color;
    this.paintAreaLines.push(laneBottomLine);

    // ========================================
    // 5. フリースローサークル（上半円 = コート中央向き）
    // ========================================
    // goal1: 上半円は -Z 方向に膨らむ（角度: π → 2π）
    // goal2: 上半円は +Z 方向に膨らむ（角度: 0 → π）
    const circlePoints: Vector3[] = [];

    let startAngle: number;
    let endAngle: number;

    if (goalNumber === 1) {
      // goal1: 半円は -Z 方向（コート中央向き）
      // 左端 (-radius, 0) から右端 (+radius, 0) へ、下側を通る
      // atan2 で考えると、左端は角度 π、右端は角度 0（または 2π）
      // 下側を通るので π → 2π
      startAngle = Math.PI;
      endAngle = 2 * Math.PI;
    } else {
      // goal2: 半円は +Z 方向（コート中央向き）
      // 左端 (-radius, 0) から右端 (+radius, 0) へ、上側を通る
      // 上側を通るので π → 0
      startAngle = Math.PI;
      endAngle = 0;
    }

    for (let i = 0; i <= circleSegments; i++) {
      const t = i / circleSegments;
      const angle = startAngle + (endAngle - startAngle) * t;
      const x = Math.cos(angle) * freeThrowCircleRadius;
      const z = freeThrowZ + Math.sin(angle) * freeThrowCircleRadius;
      circlePoints.push(new Vector3(x, lineY, z));
    }

    const freeThrowCircle = MeshBuilder.CreateLines(
      `paint-free-throw-circle-${goalNumber}`,
      { points: circlePoints },
      this.scene
    );
    freeThrowCircle.color = color;
    this.paintAreaLines.push(freeThrowCircle);
  }

  /**
   * バスケットゴールを作成
   * @param goalNumber ゴール番号（1または2）
   */
  private createBasketballGoal(goalNumber: number): { backboard: Mesh; rim: Mesh; net: Net; targetMarker: Mesh } {
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
    // goal1（+Z側）は青チームが攻める → 青色
    // goal2（-Z側）は赤チームが攻める → 赤色
    if (goalNumber === 1) {
      backboardMaterial.diffuseColor = new Color3(0.3, 0.5, 1); // 青
      backboardMaterial.emissiveColor = new Color3(0.05, 0.1, 0.3);
    } else {
      backboardMaterial.diffuseColor = new Color3(1, 0.3, 0.3); // 赤
      backboardMaterial.emissiveColor = new Color3(0.3, 0.05, 0.05);
    }
    backboardMaterial.alpha = 0.6;
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

    // シュート目標マーカー（リム中心の、ボール半径分高い位置）
    const targetMarker = MeshBuilder.CreateSphere(
      `target-marker-${goalNumber}`,
      {
        diameter: 0.08, // 小さな点（直径8cm）
        segments: 8,
      },
      this.scene
    );
    targetMarker.position = new Vector3(
      0,
      // GOAL_CONFIG.rimHeight + PhysicsConstants.BALL.RADIUS, // リム高さ + ボール半径
      GOAL_CONFIG.rimHeight + 10* PhysicsConstants.BALL.RADIUS, // リム高さ + ボール半径
      zPosition - zSign * GOAL_CONFIG.rimOffset // リムと同じZ位置
    );
    const markerMaterial = new StandardMaterial(`marker-material-${goalNumber}`, this.scene);
    markerMaterial.diffuseColor = new Color3(1, 1, 0); // 黄色
    markerMaterial.emissiveColor = new Color3(1, 1, 0); // 発光
    targetMarker.material = markerMaterial;
    targetMarker.isPickable = false; // クリック判定なし

    // ネット
    const rimCenter = rim.position.clone();
    const net = new Net(this.scene, rimCenter, goalNumber === 1 ? "goal1" : "goal2");

    return { backboard, rim, net, targetMarker };
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

  // ============================================
  // チーム別ゴール取得（GoalUtils）
  // ============================================

  /**
   * 攻撃側のゴールリム位置を取得
   * @param team チーム（'ally' | 'enemy'）
   * @returns ゴールリムのワールド座標
   */
  public getAttackingGoalRim(team: 'ally' | 'enemy'): Vector3 {
    // allyチームはgoal1（+Z方向）を攻撃
    // enemyチームはgoal2（-Z方向）を攻撃
    const rim = team === 'ally' ? this.goal1Rim : this.goal2Rim;
    return rim.position.clone();
  }

  /**
   * 守備側のゴールリム位置を取得
   * @param team チーム（'ally' | 'enemy'）
   * @returns ゴールリムのワールド座標
   */
  public getDefendingGoalRim(team: 'ally' | 'enemy'): Vector3 {
    // allyチームはgoal2（-Z方向）を守備
    // enemyチームはgoal1（+Z方向）を守備
    const rim = team === 'ally' ? this.goal2Rim : this.goal1Rim;
    return rim.position.clone();
  }

  /**
   * 攻撃側のバックボード位置を取得
   * @param team チーム（'ally' | 'enemy'）
   * @returns バックボードのワールド座標
   */
  public getAttackingBackboard(team: 'ally' | 'enemy'): Vector3 {
    const backboard = team === 'ally' ? this.goal1Backboard : this.goal2Backboard;
    return backboard.position.clone();
  }

  /**
   * 守備側のバックボード位置を取得
   * @param team チーム（'ally' | 'enemy'）
   * @returns バックボードのワールド座標
   */
  public getDefendingBackboard(team: 'ally' | 'enemy'): Vector3 {
    const backboard = team === 'ally' ? this.goal2Backboard : this.goal1Backboard;
    return backboard.position.clone();
  }

  /**
   * 更新（ネットの物理シミュレーション）
   */
  public update(deltaTime: number): void {
    this.goal1Net.update(deltaTime);
    this.goal2Net.update(deltaTime);
  }

  /**
   * Havok物理エンジンで地面・バックボード・リムの物理ボディを初期化
   */
  public initializePhysics(): void {
    // シーンに物理エンジンが有効化されているか確認
    if (!this.scene.getPhysicsEngine()) {
      console.warn("[Field] Physics engine not enabled on scene");
      return;
    }

    // 地面の静的物理ボディ
    this.groundPhysics = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.BOX,
      {
        mass: 0, // 静的オブジェクト
        restitution: PhysicsConstants.GROUND.RESTITUTION,
        friction: PhysicsConstants.GROUND.FRICTION,
      },
      this.scene
    );

    // バックボード1の静的物理ボディ
    this.backboard1Physics = new PhysicsAggregate(
      this.goal1Backboard,
      PhysicsShapeType.BOX,
      {
        mass: 0,
        restitution: PhysicsConstants.BACKBOARD.RESTITUTION,
        friction: PhysicsConstants.BACKBOARD.FRICTION,
      },
      this.scene
    );

    // バックボード2の静的物理ボディ
    this.backboard2Physics = new PhysicsAggregate(
      this.goal2Backboard,
      PhysicsShapeType.BOX,
      {
        mass: 0,
        restitution: PhysicsConstants.BACKBOARD.RESTITUTION,
        friction: PhysicsConstants.BACKBOARD.FRICTION,
      },
      this.scene
    );

    // リム1の静的物理ボディ（トーラス形状はMESHで近似）
    this.rim1Physics = new PhysicsAggregate(
      this.goal1Rim,
      PhysicsShapeType.MESH,
      {
        mass: 0,
        restitution: PhysicsConstants.RIM.RESTITUTION,
        friction: PhysicsConstants.RIM.FRICTION,
      },
      this.scene
    );
    // マテリアル設定: 反発係数を両オブジェクトの積で計算
    this.rim1Physics.shape.material = {
      restitution: PhysicsConstants.RIM.RESTITUTION,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: PhysicsConstants.RIM.FRICTION,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };

    // リム2の静的物理ボディ
    this.rim2Physics = new PhysicsAggregate(
      this.goal2Rim,
      PhysicsShapeType.MESH,
      {
        mass: 0,
        restitution: PhysicsConstants.RIM.RESTITUTION,
        friction: PhysicsConstants.RIM.FRICTION,
      },
      this.scene
    );
    // マテリアル設定: 反発係数を両オブジェクトの積で計算
    this.rim2Physics.shape.material = {
      restitution: PhysicsConstants.RIM.RESTITUTION,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: PhysicsConstants.RIM.FRICTION,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };

    // ネットの物理を初期化
    this.goal1Net.initializePhysics();
    this.goal2Net.initializePhysics();

    // 外側マスエリアの静的物理ボディ（スローイン時のボール着地用）
    for (const outerMesh of this.outerAreaMeshes) {
      const outerPhysics = new PhysicsAggregate(
        outerMesh,
        PhysicsShapeType.BOX,
        {
          mass: 0, // 静的オブジェクト
          restitution: PhysicsConstants.GROUND.RESTITUTION,
          friction: PhysicsConstants.GROUND.FRICTION,
        },
        this.scene
      );
      this.outerAreaPhysics.push(outerPhysics);
    }

    // 境界壁の静的物理ボディ（ボールが外に出るのを防ぐ）
    for (const wallMesh of this.boundaryWalls) {
      const wallPhysics = new PhysicsAggregate(
        wallMesh,
        PhysicsShapeType.BOX,
        {
          mass: 0, // 静的オブジェクト
          restitution: 0.5, // 適度な反発
          friction: 0.3,
        },
        this.scene
      );
      this.boundaryWallPhysics.push(wallPhysics);
    }
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 物理ボディを破棄
    this.groundPhysics?.dispose();
    this.backboard1Physics?.dispose();
    this.backboard2Physics?.dispose();
    this.rim1Physics?.dispose();
    this.rim2Physics?.dispose();
    for (const physics of this.outerAreaPhysics) {
      physics?.dispose();
    }
    this.outerAreaPhysics = [];
    // 境界壁の物理ボディを破棄
    for (const physics of this.boundaryWallPhysics) {
      physics?.dispose();
    }
    this.boundaryWallPhysics = [];

    this.mesh.dispose();
    this.centerCircle.dispose();
    // 3ポイントラインを破棄
    for (const line of this.threePointLines) {
      line.dispose();
    }
    this.threePointLines = [];
    // ペイントエリアラインを破棄
    for (const line of this.paintAreaLines) {
      line.dispose();
    }
    this.paintAreaLines = [];
    this.goal1Backboard.dispose();
    this.goal1Rim.dispose();
    this.goal1Net.dispose();
    this.goal1TargetMarker.dispose();
    this.goal2Backboard.dispose();
    this.goal2Rim.dispose();
    this.goal2Net.dispose();
    this.goal2TargetMarker.dispose();
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
    // 外側マスエリアを破棄
    for (const mesh of this.outerAreaMeshes) {
      mesh.dispose();
    }
    this.outerAreaMeshes = [];
    // 境界壁を破棄
    for (const wall of this.boundaryWalls) {
      wall.dispose();
    }
    this.boundaryWalls = [];
  }
}
