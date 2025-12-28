import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "@babylonjs/core";
import { GridMaterial } from "@babylonjs/materials";
import { FIELD_CONFIG } from "../config/gameConfig";

/**
 * フィールド（地面）エンティティ
 */
export class Field {
  private scene: Scene;
  public mesh: Mesh;

  constructor(scene: Scene) {
    this.scene = scene;
    this.mesh = this.createField();
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
    } catch (error) {
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
   * 破棄
   */
  public dispose(): void {
    this.mesh.dispose();
  }
}
