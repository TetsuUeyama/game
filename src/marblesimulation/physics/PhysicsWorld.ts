import { Scene, Vector3 } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

/**
 * Havok物理エンジンの初期化・管理
 *
 * 初期化フロー:
 * 1. HavokPhysics() で WASM インスタンスを非同期取得
 * 2. HavokPlugin を作成
 * 3. scene.enablePhysics() で重力を設定しシーンに有効化
 */
export class PhysicsWorld {
  private havokPlugin: HavokPlugin | null = null;

  /**
   * Havok物理エンジンを初期化してシーンに適用
   */
  async initialize(scene: Scene): Promise<void> {
    const havokInstance = await HavokPhysics();
    this.havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), this.havokPlugin);
  }

  dispose(scene: Scene): void {
    scene.disablePhysicsEngine();
    this.havokPlugin = null;
  }
}
