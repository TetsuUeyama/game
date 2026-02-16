import { Scene, Mesh, PointerEventTypes, PointerInfo, StandardMaterial, KeyboardEventTypes } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import {
  JOINT_CONFIG,
  JOINT_NAMES,
  JOINT_MESH_PATTERNS,
  JOINT_HIGHLIGHT,
} from "@/GamePlay/GameSystem/CharacterMove/Config/JointConfig";

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
        this.isCtrlPressed = isCtrlPressed;
        this.handlePointerEvent(pointerInfo);
      } else if (this.isCtrlPressed) {
        this.isCtrlPressed = false;
        if (this.selectedJoint) {
          this.highlightJoint(this.selectedJoint, false);
          this.selectedJoint = null;
        }
        this.isDragging = false;
      }
    });

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

      if (this.isJoint(mesh)) {
        this.selectedJoint = mesh;
        this.isDragging = true;

        const event = pointerInfo.event as PointerEvent;
        this.previousPointerX = event.clientX;
        this.previousPointerY = event.clientY;

        this.highlightJoint(mesh, true);

        if (this.scene.activeCamera) {
          this.scene.activeCamera.detachControl();
        }
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

    if (Math.abs(deltaX) < JOINT_CONFIG.MIN_MOVEMENT_THRESHOLD && Math.abs(deltaY) < JOINT_CONFIG.MIN_MOVEMENT_THRESHOLD) {
      return;
    }

    const rotationSpeed = JOINT_CONFIG.ROTATION_SPEED;

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
    }

    if (this.isDragging) {
      this.isDragging = false;

      if (this.scene.activeCamera) {
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (canvas) {
          this.scene.activeCamera.attachControl(canvas, true);
        }
      }
    }
  }

  /**
   * メッシュが関節かどうかを判定
   */
  private isJoint(mesh: Mesh): boolean {
    const name = mesh.name;
    return JOINT_MESH_PATTERNS.some(pattern => name.includes(pattern));
  }

  /**
   * 関節を強調表示
   */
  private highlightJoint(mesh: Mesh, highlight: boolean): void {
    if (mesh.material) {
      const material = mesh.material as StandardMaterial;
      if (material.emissiveColor) {
        const color = highlight ? JOINT_HIGHLIGHT.ACTIVE_COLOR : JOINT_HIGHLIGHT.INACTIVE_COLOR;
        material.emissiveColor.set(color.r, color.g, color.b);
      }
    }
  }

  /**
   * すべての関節をリセット
   */
  private resetAllJoints(): void {
    JOINT_NAMES.forEach(jointName => {
      const joint = this.character.getJoint(jointName);
      if (joint) {
        joint.rotation.x = 0;
        joint.rotation.y = 0;
        joint.rotation.z = 0;
      }
    });
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
