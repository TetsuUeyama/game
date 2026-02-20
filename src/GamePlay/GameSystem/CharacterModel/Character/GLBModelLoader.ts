/**
 * GLBModelLoader — seconf.glb + newmodel.glb（髪）を1回だけ読み込み、
 * 10体分のクローンを生成するシングルトンローダー。
 *
 * テストシーン（UseHumanoidControl.ts）と同じ読み込み・髪差し替えパターンを踏襲。
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
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

/** GLB ファイルパス設定 */
const MODEL_PATH = "/";
const MODEL_FILE = "seconf.glb";
const HAIR_MODEL_FILE = "newmodel.glb";

/** 髪差し替え設定（UseHumanoidControl.ts と同じ値） */
const MAIN_HIDE_MESHES = ["Ch42_Hair1", "Cube"];
const HAIR_SHOW_MESHES = ["Hair"];
const HAIR_SCALE_RATIO = 96.37 / 209.15;

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
  createClone(scene: Scene): GLBCloneData {
    if (!this._mainContainer || !this._hairContainer) {
      throw new Error("[GLBModelLoader] loadAsync() が未完了です");
    }

    // ── メインモデルのクローン ──
    const mainInstance = this._mainContainer.instantiateModelsToScene(
      (name) => `${name}_clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    );

    // AnimationGroup を停止・破棄
    for (const ag of mainInstance.animationGroups) {
      ag.stop();
      ag.dispose();
    }

    // TransformNode.animations クリア + worldMatrix unfreeze
    const mainSkeleton = mainInstance.skeletons[0];
    if (mainSkeleton) {
      for (const bone of mainSkeleton.bones) {
        const node = bone.getTransformNode();
        if (node) {
          node.animations = [];
          if (node.isWorldMatrixFrozen) {
            node.unfreezeWorldMatrix();
          }
        }
      }
    }

    const mainRootMesh = mainInstance.rootNodes[0] as Mesh;

    // メインモデルの不要メッシュを非表示
    const allMainMeshes = mainRootMesh.getChildMeshes(false) as AbstractMesh[];
    for (const m of allMainMeshes) {
      if (MAIN_HIDE_MESHES.includes(m.name.replace(/_clone_.*$/, ""))) {
        m.setEnabled(false);
      }
    }

    // ── 髪モデルのクローン ──
    const hairInstance = this._hairContainer.instantiateModelsToScene(
      (name) => `${name}_hair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    );

    // 髪の AnimationGroup を停止・破棄
    for (const ag of hairInstance.animationGroups) {
      ag.stop();
      ag.dispose();
    }

    // 髪の TransformNode.animations クリア + worldMatrix unfreeze
    const hairSkeleton = hairInstance.skeletons[0];
    if (hairSkeleton) {
      for (const bone of hairSkeleton.bones) {
        const node = bone.getTransformNode();
        if (node) {
          node.animations = [];
          if (node.isWorldMatrixFrozen) {
            node.unfreezeWorldMatrix();
          }
        }
      }
    }

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
