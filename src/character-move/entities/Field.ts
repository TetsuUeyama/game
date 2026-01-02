import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import { FIELD_CONFIG } from "../config/gameConfig";

/**
 * フィールド（地面）エンティティ
 */
export class Field {
  private scene: Scene;
  public mesh: Mesh;
  private goal1: Mesh; // ゴール1（奥側）
  private goal2: Mesh; // ゴール2（手前側）

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();
    this.goal1 = this.createGoal(1);
    this.goal2 = this.createGoal(2);
  }

  /**
   * フィールドメッシュを作成
   */
  private createField(): Mesh {
    // 地面の平面を作成
    const ground = MeshBuilder.CreateGround(
      "field-ground",
      {
        width: FIELD_CONFIG.size,
        height: FIELD_CONFIG.size,
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
   * ゴールを作成
   * @param goalNumber ゴール番号（1または2）
   */
  private createGoal(goalNumber: number): Mesh {
    const goalWidth = 5; // ゴールの幅（m）
    const goalHeight = 2.5; // ゴールの高さ（m）
    const goalDepth = 0.5; // ゴールの奥行き（m）

    // ゴールのボックスを作成
    const goal = MeshBuilder.CreateBox(
      `goal-${goalNumber}`,
      {
        width: goalWidth,
        height: goalHeight,
        depth: goalDepth,
      },
      this.scene
    );

    // ゴールの位置を設定（フィールドの端）
    const fieldHalfSize = FIELD_CONFIG.size / 2;
    const zPosition = goalNumber === 1 ? fieldHalfSize : -fieldHalfSize;
    goal.position = new Vector3(0, goalHeight / 2, zPosition);

    // マテリアルを設定
    const material = new StandardMaterial(`goal-${goalNumber}-material`, this.scene);
    // ゴール1は青、ゴール2は赤
    if (goalNumber === 1) {
      material.diffuseColor = new Color3(0.2, 0.4, 1.0); // 青
      material.emissiveColor = new Color3(0.1, 0.2, 0.5); // 青の発光
    } else {
      material.diffuseColor = new Color3(1.0, 0.3, 0.2); // 赤
      material.emissiveColor = new Color3(0.5, 0.15, 0.1); // 赤の発光
    }
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    material.alpha = 0.7; // 半透明
    goal.material = material;

    return goal;
  }

  /**
   * ゴール1のメッシュを取得
   */
  public getGoal1(): Mesh {
    return this.goal1;
  }

  /**
   * ゴール2のメッシュを取得
   */
  public getGoal2(): Mesh {
    return this.goal2;
  }

  /**
   * 破棄
   */
  public dispose(): void {
    this.mesh.dispose();
    this.goal1.dispose();
    this.goal2.dispose();
  }
}
