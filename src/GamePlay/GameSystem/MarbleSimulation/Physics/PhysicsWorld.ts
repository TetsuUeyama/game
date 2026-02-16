// Babylon.jsのシーンとベクトル型をインポート
import { Scene, Vector3 } from "@babylonjs/core";
// Havok物理エンジンのWASMモジュールをインポート
import HavokPhysics from "@babylonjs/havok";
// Babylon.js用のHavokプラグインをインポート
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
  /** Havok物理プラグインのインスタンス。初期化前はnull */
  private havokPlugin: HavokPlugin | null = null;

  /**
   * Havok物理エンジンを初期化してシーンに適用
   *
   * WASMインスタンスを非同期でロードし、重力(9.81m/s²下向き)を設定してシーンに物理を有効化する
   * @param scene - 物理を適用するBabylon.jsシーン
   */
  async initialize(scene: Scene): Promise<void> {
    // HavokのWASMインスタンスを非同期で取得
    const havokInstance = await HavokPhysics();
    // WASMインスタンスからHavokPluginを生成（true=デバッグ表示有効）
    this.havokPlugin = new HavokPlugin(true, havokInstance);
    // シーンに物理エンジンを有効化（重力: Y軸下方向に9.81m/s²）
    scene.enablePhysics(new Vector3(0, -9.81, 0), this.havokPlugin);
  }

  /**
   * 物理エンジンを破棄してリソースを解放
   * @param scene - 物理を無効化するBabylon.jsシーン
   */
  dispose(scene: Scene): void {
    // シーンの物理エンジンを無効化
    scene.disablePhysicsEngine();
    // プラグイン参照をクリア
    this.havokPlugin = null;
  }
}
