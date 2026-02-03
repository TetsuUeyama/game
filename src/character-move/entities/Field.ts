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

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();

    // 外側マスエリアを作成
    this.createOuterCells();

    // センターサークルを作成
    this.centerCircle = this.createCenterCircle();

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

    this.mesh.dispose();
    this.centerCircle.dispose();
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
  }
}
