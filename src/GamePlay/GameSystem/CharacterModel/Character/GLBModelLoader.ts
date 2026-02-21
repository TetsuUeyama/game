/**
 * GLBModelLoader — seconf.glb + newmodel.glb（髪）を1回だけ読み込み、
 * 10体分のクローンを生成するシングルトンローダー。
 *
 * AssetContainer.instantiateModelsToScene() でクローンごとに独立したスケルトンを生成し、
 * AnimationGroup 停止・破棄、TransformNode.animations クリア、worldMatrix unfreeze を行う。
 */
import {
  Scene,
  SceneLoader,
  Mesh,
  AbstractMesh,
  Skeleton,
  AssetContainer,
  InstantiatedEntries,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

/** GLB ファイルパス設定 */
const MODEL_PATH = "/";
const MODEL_FILE = "seconf.glb";
const HAIR_MODEL_FILE = "newmodel.glb";

/** 髪差し替え設定 */
const MAIN_HIDE_MESHES = ["Ch42_Hair1", "Cube"];
const HAIR_SHOW_MESHES = ["Hair"];
export const HAIR_SCALE_RATIO = 96.37 / 209.15;

/** クローン1体分のデータ */
export interface GLBCloneData {
  rootMesh: Mesh;
  allMeshes: AbstractMesh[];
  skeleton: Skeleton;
  hairRootMesh: Mesh | null;
  hairMeshes: AbstractMesh[];
}

export class GLBModelLoader {
  private static _instance: GLBModelLoader | null = null;

  private _ready = false;
  private _mainContainer: AssetContainer | null = null;
  private _hairContainer: AssetContainer | null = null;

  private constructor() {}

  static getInstance(): GLBModelLoader {
    if (!GLBModelLoader._instance) {
      GLBModelLoader._instance = new GLBModelLoader();
    }
    return GLBModelLoader._instance;
  }

  /** ロードが完了しているか */
  isReady(): boolean {
    return this._ready;
  }

  /**
   * GLB ファイルを読み込み、AssetContainer として保持する。
   * 2回目以降は何もしない。
   */
  async loadAsync(scene: Scene): Promise<void> {
    if (this._ready) return;

    const [mainContainer, hairContainer] = await Promise.all([
      SceneLoader.LoadAssetContainerAsync(MODEL_PATH, MODEL_FILE, scene),
      SceneLoader.LoadAssetContainerAsync(MODEL_PATH, HAIR_MODEL_FILE, scene),
    ]);

    this._mainContainer = mainContainer;
    this._hairContainer = hairContainer;
    this._ready = true;
  }

  /**
   * クローンを1体生成する。
   * instantiateModelsToScene() でコンテナからクローンし、
   * AnimationGroup 停止・破棄、TransformNode.animations クリア、worldMatrix unfreeze を行う。
   */
  createClone(_scene: Scene): GLBCloneData {
    if (!this._mainContainer || !this._hairContainer) {
      throw new Error("[GLBModelLoader] loadAsync() が未完了です");
    }

    return this._createAllyClone();
  }

  /** 味方チーム用クローン（seconf.glb + newmodel.glb 髪差し替え） */
  private _createAllyClone(): GLBCloneData {
    // ── メインモデルのクローン ──
    const mainInstance = this._mainContainer!.instantiateModelsToScene(
      (name) => `${name}_clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    );

    const mainSkeleton = this._cleanupInstance(mainInstance);
    const mainRootMesh = mainInstance.rootNodes[0] as Mesh;

    // メインモデルの不要メッシュを非表示
    const allMainMeshes = mainRootMesh.getChildMeshes(false) as AbstractMesh[];
    for (const m of allMainMeshes) {
      if (MAIN_HIDE_MESHES.includes(m.name.replace(/_clone_.*$/, ""))) {
        m.setEnabled(false);
      }
    }

    // ── 髪モデルのクローン ──
    const hairInstance = this._hairContainer!.instantiateModelsToScene(
      (name) => `${name}_hair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    );

    this._cleanupInstance(hairInstance);
    const hairRootMesh = hairInstance.rootNodes[0] as Mesh;

    // 髪モデルの位置・スケールをメインモデルに合わせる
    hairRootMesh.position.copyFrom(mainRootMesh.position);
    hairRootMesh.scaling.copyFrom(mainRootMesh.scaling);
    hairRootMesh.scaling.scaleInPlace(HAIR_SCALE_RATIO);

    // 髪モデルの不要メッシュを非表示、表示メッシュだけ残す
    const allHairMeshes = hairRootMesh.getChildMeshes(false) as AbstractMesh[];
    const visibleHairMeshes: AbstractMesh[] = [];
    for (const m of allHairMeshes) {
      const baseName = m.name.replace(/_hair_.*$/, "");
      if (HAIR_SHOW_MESHES.includes(baseName)) {
        visibleHairMeshes.push(m);
      } else if (m !== hairRootMesh) {
        m.setEnabled(false);
      }
    }

    return {
      rootMesh: mainRootMesh,
      allMeshes: [mainRootMesh, ...allMainMeshes],
      skeleton: mainSkeleton!,
      hairRootMesh,
      hairMeshes: visibleHairMeshes,
    };
  }

  /** クローンインスタンスの初期化（AnimationGroup破棄、animations クリア、worldMatrix unfreeze） */
  private _cleanupInstance(instance: InstantiatedEntries): Skeleton | undefined {
    for (const ag of instance.animationGroups) {
      ag.stop();
      ag.dispose();
    }
    const skeleton = instance.skeletons[0];
    if (skeleton) {
      for (const bone of skeleton.bones) {
        const node = bone.getTransformNode();
        if (node) {
          node.animations = [];
          if (node.isWorldMatrixFrozen) {
            node.unfreezeWorldMatrix();
          }
        }
      }
    }
    return skeleton;
  }

  /**
   * シングルトンをリセット（テスト用）
   */
  static reset(): void {
    if (GLBModelLoader._instance) {
      GLBModelLoader._instance._mainContainer?.dispose();
      GLBModelLoader._instance._hairContainer?.dispose();
      GLBModelLoader._instance._ready = false;
      GLBModelLoader._instance._mainContainer = null;
      GLBModelLoader._instance._hairContainer = null;
    }
  }
}
