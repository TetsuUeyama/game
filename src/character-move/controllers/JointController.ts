import { Scene, Mesh, PointerEventTypes, PointerInfo, Vector3, StandardMaterial } from "@babylonjs/core";
import { Character } from "../entities/Character";

/**
 * 関節操作コントローラー
 * マウスで肩などの関節を回転させることができる
 */
export class JointController {
  private scene: Scene;
  private character: Character;

  private selectedJoint: Mesh | null = null;
  private isDragging: boolean = false;
  private previousPointerPosition: Vector3 | null = null;

  constructor(scene: Scene, character: Character) {
    this.scene = scene;
    this.character = character;

    // ポインターイベントを監視
    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      this.handlePointerEvent(pointerInfo);
    });

    console.log("[JointController] 関節操作コントローラーを初期化しました");
  }

  /**
   * ポインターイベントを処理
   */
  private handlePointerEvent(pointerInfo: PointerInfo): void {
    switch (pointerInfo.type) {
      case PointerEventTypes.POINTERDOWN:
        this.onPointerDown(pointerInfo);
        break;
      case PointerEventTypes.POINTERMOVE:
        this.onPointerMove(pointerInfo);
        break;
      case PointerEventTypes.POINTERUP:
        this.onPointerUp();
        break;
    }
  }

  /**
   * ポインターダウン
   */
  private onPointerDown(pointerInfo: PointerInfo): void {
    const pickResult = pointerInfo.pickInfo;

    if (pickResult && pickResult.hit && pickResult.pickedMesh) {
      const mesh = pickResult.pickedMesh as Mesh;

      // 肩または他の関節がクリックされたか確認
      if (this.isJoint(mesh)) {
        this.selectedJoint = mesh;
        this.isDragging = true;
        this.previousPointerPosition = pickResult.pickedPoint;

        // 選択された関節を強調表示
        this.highlightJoint(mesh, true);

        console.log(`[JointController] 関節を選択: ${mesh.name}`);
      }
    }
  }

  /**
   * ポインター移動
   */
  private onPointerMove(pointerInfo: PointerInfo): void {
    if (!this.isDragging || !this.selectedJoint || !this.previousPointerPosition) {
      return;
    }

    const pickResult = pointerInfo.pickInfo;
    if (!pickResult || !pickResult.pickedPoint) {
      return;
    }

    // マウスの移動量を計算
    const currentPosition = pickResult.pickedPoint;
    const deltaX = currentPosition.x - this.previousPointerPosition.x;
    const deltaY = currentPosition.y - this.previousPointerPosition.y;

    // 関節を回転（Y軸とZ軸）
    const rotationSpeed = 2.0;
    this.selectedJoint.rotation.y += deltaX * rotationSpeed;
    this.selectedJoint.rotation.z += deltaY * rotationSpeed;

    this.previousPointerPosition = currentPosition;
  }

  /**
   * ポインターアップ
   */
  private onPointerUp(): void {
    if (this.selectedJoint) {
      // 選択を解除
      this.highlightJoint(this.selectedJoint, false);
      this.selectedJoint = null;
    }

    this.isDragging = false;
    this.previousPointerPosition = null;
  }

  /**
   * メッシュが関節かどうかを判定
   */
  private isJoint(mesh: Mesh): boolean {
    const name = mesh.name;
    return (
      name.includes("shoulder") ||
      name.includes("elbow") ||
      name.includes("hip") ||
      name.includes("knee")
    );
  }

  /**
   * 関節を強調表示
   */
  private highlightJoint(mesh: Mesh, highlight: boolean): void {
    if (mesh.material) {
      // エミッシブカラーで強調表示
      const material = mesh.material as StandardMaterial;
      if (material.emissiveColor) {
        if (highlight) {
          material.emissiveColor.set(0.3, 0.3, 0.0); // 黄色く光らせる
        } else {
          material.emissiveColor.set(0, 0, 0); // 元に戻す
        }
      }
    }
  }

  /**
   * 更新（毎フレーム）
   */
  public update(_deltaTime: number): void {
    // 現在は特に処理なし
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 必要に応じてクリーンアップ
  }
}
