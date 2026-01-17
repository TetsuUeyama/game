import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import { FIELD_CONFIG, GOAL_CONFIG } from "../config/gameConfig";
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

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();

    // センターサークルを作成
    this.centerCircle = this.createCenterCircle();

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

    // グリッドマテリアルを使用（グリッド線が表示される）
    try {
      const gridMaterial = new GridMaterial("field-grid-material", this.scene);
      gridMaterial.majorUnitFrequency = 5; // メジャーラインの頻度
      gridMaterial.minorUnitVisibility = 0.3; // マイナーラインの可視性
      gridMaterial.gridRatio = 1; // グリッドの比率
      gridMaterial.backFaceCulling = false;
      gridMaterial.mainColor = Color3.FromHexString(FIELD_CONFIG.floorColor);
      gridMaterial.lineColor = Color3.FromHexString(FIELD_CONFIG.gridColor);
      gridMaterial.opacity = 1.0;

      ground.material = gridMaterial;
    } catch {
      // GridMaterialが使えない場合は標準マテリアルを使用
      console.warn("[Field] GridMaterialが使用できません。StandardMaterialにフォールバックします。");
      const material = new StandardMaterial("field-material", this.scene);
      material.diffuseColor = Color3.FromHexString(FIELD_CONFIG.floorColor);
      material.specularColor = new Color3(0.1, 0.1, 0.1);
      ground.material = material;
    }

    return ground;
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

    console.log(`[Field] センターサークルを作成: 半径=${radius}m`);

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

    console.log(`[Field] ゴール${goalNumber}を作成: バックボード Z=${zPosition}, リム Z=${rim.position.z}`);

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
  }
}
