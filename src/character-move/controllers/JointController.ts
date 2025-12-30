import { Scene, Mesh, PointerEventTypes, PointerInfo, StandardMaterial, KeyboardEventTypes } from "@babylonjs/core";
import { Character } from "../entities/Character";

/**
 * 関節操作コントローラー
 * Ctrlキーを押しながらマウスで関節を回転
 */
export class JointController {
  private scene: Scene;
  private character: Character;

  private selectedJoint: Mesh | null = null;
  private isDragging: boolean = false;
  private previousPointerX: number = 0;
  private previousPointerY: number = 0;
  private isCtrlPressed: boolean = false;

  // 関節名の一覧
  private readonly jointNames = [
    "head", "upperBody", "lowerBody",
    "leftShoulder", "rightShoulder",
    "leftElbow", "rightElbow",
    "leftHip", "rightHip",
    "leftKnee", "rightKnee"
  ];

  constructor(scene: Scene, character: Character) {
    this.scene = scene;
    this.character = character;

    // キーボードイベントを監視
    this.scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        // Rキーでリセット
        if (kbInfo.event.key === "r" || kbInfo.event.key === "R") {
          this.resetAllJoints();
        }
      }
    });

    // ポインターイベントを監視
    this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
      const event = pointerInfo.event as PointerEvent;
      const isCtrlPressed = event.ctrlKey;

      if (isCtrlPressed || this.isDragging) {
        if (isCtrlPressed && !this.isCtrlPressed) {
          console.log("[JointController] 関節コントロールモード有効（Ctrl+クリック）");
        }
        this.isCtrlPressed = isCtrlPressed;
        this.handlePointerEvent(pointerInfo);
      } else if (this.isCtrlPressed) {
        console.log("[JointController] 関節コントロールモード無効");
        this.isCtrlPressed = false;
        if (this.selectedJoint) {
          this.highlightJoint(this.selectedJoint, false);
          this.selectedJoint = null;
        }
        this.isDragging = false;
      }
    });

    console.log("[JointController] 関節操作コントローラーを初期化しました");
    console.log("[JointController] Ctrlキーを押しながら関節をクリック＆ドラッグで操作、Rキーでリセット");
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
    if (!this.isCtrlPressed) return;

    const pickResult = pointerInfo.pickInfo;

    if (pickResult && pickResult.hit && pickResult.pickedMesh) {
      const mesh = pickResult.pickedMesh as Mesh;
      console.log(`[JointController] クリックされたメッシュ: ${mesh.name}`);

      if (this.isJoint(mesh)) {
        this.selectedJoint = mesh;
        this.isDragging = true;

        const event = pointerInfo.event as PointerEvent;
        this.previousPointerX = event.clientX;
        this.previousPointerY = event.clientY;

        this.highlightJoint(mesh, true);

        console.log(`[JointController] 関節を選択: ${mesh.name}`);

        if (this.scene.activeCamera) {
          this.scene.activeCamera.detachControl();
          console.log("[JointController] カメラコントロールを無効化");
        }
      } else {
        console.log(`[JointController] ${mesh.name} は関節ではありません`);
      }
    }
  }

  /**
   * ポインター移動
   */
  private onPointerMove(pointerInfo: PointerInfo): void {
    if (!this.isDragging || !this.selectedJoint) {
      return;
    }

    const event = pointerInfo.event as PointerEvent;

    const deltaX = event.clientX - this.previousPointerX;
    const deltaY = event.clientY - this.previousPointerY;

    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) {
      return;
    }

    const rotationSpeed = 0.01;

    this.selectedJoint.rotation.y += deltaX * rotationSpeed;
    this.selectedJoint.rotation.x -= deltaY * rotationSpeed;

    this.previousPointerX = event.clientX;
    this.previousPointerY = event.clientY;
  }

  /**
   * ポインターアップ
   */
  private onPointerUp(): void {
    if (this.selectedJoint) {
      this.highlightJoint(this.selectedJoint, false);
      this.selectedJoint = null;
      console.log("[JointController] 関節の選択を解除");
    }

    if (this.isDragging) {
      this.isDragging = false;

      if (this.scene.activeCamera) {
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (canvas) {
          this.scene.activeCamera.attachControl(canvas, true);
          console.log("[JointController] カメラコントロールを再有効化");
        }
      }
    }
  }

  /**
   * メッシュが関節かどうかを判定
   */
  private isJoint(mesh: Mesh): boolean {
    const name = mesh.name;
    const isJoint = (
      name.includes("shoulder") ||
      name.includes("elbow") ||
      name.includes("hip") ||
      name.includes("knee") ||
      name.includes("head") ||
      name.includes("upper-body") ||
      name.includes("lower-body") ||
      name.includes("waist-joint")
    );

    if (isJoint) {
      console.log(`[JointController] ${name} は関節として認識されました`);
    }

    return isJoint;
  }

  /**
   * 関節を強調表示
   */
  private highlightJoint(mesh: Mesh, highlight: boolean): void {
    if (mesh.material) {
      const material = mesh.material as StandardMaterial;
      if (material.emissiveColor) {
        if (highlight) {
          material.emissiveColor.set(0.5, 0.5, 0.0);
        } else {
          material.emissiveColor.set(0, 0, 0);
        }
      }
    }
  }

  /**
   * すべての関節をリセット
   */
  private resetAllJoints(): void {
    console.log("[JointController] すべての関節をリセットします");

    this.jointNames.forEach(jointName => {
      const joint = this.character.getJoint(jointName);
      if (joint) {
        joint.rotation.x = 0;
        joint.rotation.y = 0;
        joint.rotation.z = 0;
      }
    });

    console.log("[JointController] リセット完了");
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
    // 現在は特に破棄する必要なし
  }
}
