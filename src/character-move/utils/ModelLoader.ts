import { Scene, SceneLoader, AbstractMesh } from "@babylonjs/core";
import "@babylonjs/loaders/glTF"; // GLTFローダーをインポート

/**
 * 3Dモデルローダーユーティリティ
 */
export class ModelLoader {
  /**
   * GLTFモデルをロード
   * @param scene シーン
   * @param modelPath モデルのパス（例: "/models/character.glb"）
   * @returns ロードしたモデルのルートメッシュ
   */
  public static async loadGLTF(scene: Scene, modelPath: string): Promise<AbstractMesh> {
    try {
      console.log(`[ModelLoader] モデルをロード中: ${modelPath}`);

      // パスをファイル名とディレクトリに分割
      const lastSlashIndex = modelPath.lastIndexOf("/");
      const rootUrl = modelPath.substring(0, lastSlashIndex + 1);
      const fileName = modelPath.substring(lastSlashIndex + 1);

      // モデルをロード
      const result = await SceneLoader.ImportMeshAsync(
        "", // すべてのメッシュをインポート
        rootUrl,
        fileName,
        scene
      );

      console.log(`[ModelLoader] モデルのロードに成功: ${modelPath}`);
      console.log(`[ModelLoader] メッシュ数: ${result.meshes.length}`);

      // ルートメッシュ（最初のメッシュ）を返す
      if (result.meshes.length === 0) {
        throw new Error("モデルにメッシュが含まれていません");
      }

      return result.meshes[0];
    } catch (error) {
      console.error(`[ModelLoader] モデルのロードに失敗: ${modelPath}`, error);
      throw error;
    }
  }

  /**
   * モデルのスケールを設定
   * @param mesh メッシュ
   * @param scale スケール
   */
  public static setScale(mesh: AbstractMesh, scale: number): void {
    mesh.scaling.x = scale;
    mesh.scaling.y = scale;
    mesh.scaling.z = scale;
  }

  /**
   * モデルの回転を設定（度）
   * @param mesh メッシュ
   * @param x X軸回転（度）
   * @param y Y軸回転（度）
   * @param z Z軸回転（度）
   */
  public static setRotation(mesh: AbstractMesh, x: number, y: number, z: number): void {
    mesh.rotation.x = (x * Math.PI) / 180;
    mesh.rotation.y = (y * Math.PI) / 180;
    mesh.rotation.z = (z * Math.PI) / 180;
  }
}
