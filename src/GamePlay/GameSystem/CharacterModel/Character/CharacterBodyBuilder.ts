import { Scene, Vector3, Mesh, StandardMaterial, Color3 } from "@babylonjs/core";
import { CharacterBodyParts } from "@/GamePlay/GameSystem/CharacterModel/Character/CharacterBodyParts";
import type { CharacterBody } from "@/GamePlay/GameSystem/CharacterModel/Character/CharacterBodyTypes";
import { CharacterState } from "@/GamePlay/GameSystem/StatusCheckSystem/CharacterState";
import { FaceConfig } from "@/GamePlay/GameSystem/CharacterModel/Types/FaceConfig";

/**
 * キャラクターの身体モデルを構築するビルダー
 * メッシュ生成・親子階層設定・破棄を一括管理
 */
export class CharacterBodyBuilder {
  private factory: CharacterBodyParts;

  constructor(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState,
    faceConfig?: FaceConfig
  ) {
    this.factory = new CharacterBodyParts(scene, config, state, faceConfig);
  }

  /**
   * メッシュ全作成 + 親子階層構築 → CharacterBody返却
   */
  public build(position: Vector3): { rootMesh: Mesh; body: CharacterBody } {
    // ルートメッシュを作成
    const rootMesh = this.factory.createRootMesh(position);

    // 身体パーツを作成
    const head = this.factory.createHead();
    const waistJoint = this.factory.createWaistJoint();
    const upperBody = this.factory.createUpperBody();
    const lowerBodyConnection = this.factory.createLowerBodyConnection();
    const lowerBody = this.factory.createLowerBody();
    const leftShoulder = this.factory.createShoulder("left");
    const rightShoulder = this.factory.createShoulder("right");
    const leftUpperArm = this.factory.createUpperArm("left");
    const rightUpperArm = this.factory.createUpperArm("right");
    const leftElbow = this.factory.createElbow("left");
    const rightElbow = this.factory.createElbow("right");
    const leftForearm = this.factory.createForearm("left");
    const rightForearm = this.factory.createForearm("right");
    const leftHand = this.factory.createHand("left");
    const rightHand = this.factory.createHand("right");
    const leftHip = this.factory.createHip("left");
    const rightHip = this.factory.createHip("right");
    const leftThigh = this.factory.createThigh("left");
    const rightThigh = this.factory.createThigh("right");
    const leftKnee = this.factory.createKnee("left");
    const rightKnee = this.factory.createKnee("right");
    const leftShin = this.factory.createShin("left");
    const rightShin = this.factory.createShin("right");
    const leftFoot = this.factory.createFoot("left");
    const rightFoot = this.factory.createFoot("right");

    // 顔のパーツを作成
    const leftEye = this.factory.createEye("left");
    const rightEye = this.factory.createEye("right");
    const mouth = this.factory.createMouth();

    // パーツの親子関係を設定
    // 腰関節はルートの子（接続位置、固定）
    waistJoint.parent = rootMesh;

    // 上半身は腰関節の子（腰関節を回転すると上半身全体が回転）
    upperBody.parent = waistJoint;

    // 下半身の接続点もルートの子（上半身とは独立してY回転可能）
    lowerBodyConnection.parent = rootMesh;

    // 下半身ボックスは接続点の子（ローカルXでオフセット）
    lowerBody.parent = lowerBodyConnection;

    // 頭：上半身に固定
    head.parent = upperBody;

    // 顔のパーツ：頭に固定
    leftEye.parent = head;
    rightEye.parent = head;
    mouth.parent = head;

    // 左腕：肩を上半身に固定し、肩を基点とした階層構造
    leftShoulder.parent = upperBody;
    leftUpperArm.parent = leftShoulder;
    leftElbow.parent = leftShoulder;
    leftForearm.parent = leftElbow;
    leftHand.parent = leftForearm;

    // 右腕：肩を上半身に固定し、肩を基点とした階層構造
    rightShoulder.parent = upperBody;
    rightUpperArm.parent = rightShoulder;
    rightElbow.parent = rightShoulder;
    rightForearm.parent = rightElbow;
    rightHand.parent = rightForearm;

    // 左脚：股関節を下半身に固定し、股関節を基点とした階層構造
    leftHip.parent = lowerBody;
    leftThigh.parent = leftHip;
    leftKnee.parent = leftHip;
    leftShin.parent = leftKnee;
    leftFoot.parent = leftShin;

    // 右脚：股関節を下半身に固定し、股関節を基点とした階層構造
    rightHip.parent = lowerBody;
    rightThigh.parent = rightHip;
    rightKnee.parent = rightHip;
    rightShin.parent = rightKnee;
    rightFoot.parent = rightShin;

    // 状態インジケーター球体を作成
    const stateIndicator = this.factory.createStateIndicator();
    stateIndicator.parent = head;

    // 視野コーンを作成
    const visionCone = this.factory.createVisionCone();
    visionCone.parent = head;

    const body: CharacterBody = {
      head,
      waistJoint,
      upperBody,
      lowerBodyConnection,
      lowerBody,
      leftShoulder, rightShoulder,
      leftUpperArm, rightUpperArm,
      leftElbow, rightElbow,
      leftForearm, rightForearm,
      leftHand, rightHand,
      leftHip, rightHip,
      leftThigh, rightThigh,
      leftKnee, rightKnee,
      leftShin, rightShin,
      leftFoot, rightFoot,
      leftEye, rightEye,
      mouth,
      hair: null,
      beard: null,
      stateIndicator,
      visionCone,
    };

    return { rootMesh, body };
  }

  /**
   * 顔設定適用（eye/mouth/hair/beard再生成）
   */
  public applyFaceConfig(body: CharacterBody, fc: FaceConfig): void {
    // ファクトリーのFaceConfigを更新
    this.factory.setFaceConfig(fc);

    // 頭の肌色を更新
    const headMat = body.head.material as StandardMaterial;
    if (headMat) {
      headMat.diffuseColor = new Color3(fc.skinColor.r, fc.skinColor.g, fc.skinColor.b);
    }

    // 目メッシュを再作成（EyeStyleで形状が変わるため）
    const leftEyeParent = body.leftEye.parent;
    const rightEyeParent = body.rightEye.parent;
    body.leftEye.dispose();
    body.rightEye.dispose();
    body.leftEye = this.factory.createEye("left");
    body.rightEye = this.factory.createEye("right");
    body.leftEye.parent = leftEyeParent;
    body.rightEye.parent = rightEyeParent;

    // 口メッシュを再作成（MouthStyleで形状が変わるため）
    const mouthParent = body.mouth.parent;
    body.mouth.dispose();
    body.mouth = this.factory.createMouth();
    body.mouth.parent = mouthParent;

    // 腕・手の肌色を更新
    const skinMeshes = [
      body.leftUpperArm, body.rightUpperArm,
      body.leftElbow, body.rightElbow,
      body.leftForearm, body.rightForearm,
      body.leftHand, body.rightHand,
    ];
    for (const mesh of skinMeshes) {
      const mat = mesh.material as StandardMaterial;
      if (mat) {
        mat.diffuseColor = new Color3(fc.skinColor.r, fc.skinColor.g, fc.skinColor.b);
      }
    }

    // 既存の髪メッシュを削除
    if (body.hair) {
      body.hair.dispose();
      body.hair = null;
    }
    // 新しい髪メッシュを生成
    body.hair = this.factory.createHair();
    if (body.hair) {
      body.hair.parent = body.head;
    }

    // 既存の髭メッシュを削除
    if (body.beard) {
      body.beard.dispose();
      body.beard = null;
    }
    // 新しい髭メッシュを生成
    body.beard = this.factory.createBeard();
    if (body.beard) {
      body.beard.parent = body.head;
    }
  }

  /**
   * 関節メッシュを取得
   */
  static getJoint(body: CharacterBody, jointName: string): Mesh | null {
    switch (jointName) {
      case "head":
        return body.head;
      case "upperBody":
        return body.waistJoint;
      case "lowerBody":
        return body.lowerBodyConnection;
      case "leftShoulder":
        return body.leftShoulder;
      case "rightShoulder":
        return body.rightShoulder;
      case "leftElbow":
        return body.leftElbow;
      case "rightElbow":
        return body.rightElbow;
      case "leftHip":
        return body.leftHip;
      case "rightHip":
        return body.rightHip;
      case "leftKnee":
        return body.leftKnee;
      case "rightKnee":
        return body.rightKnee;
      default:
        return null;
    }
  }

  /**
   * すべての身体メッシュを取得
   */
  static getAllBodyMeshes(body: CharacterBody): Mesh[] {
    return [
      body.head,
      body.upperBody,
      body.lowerBody,
      body.waistJoint,
      body.lowerBodyConnection,
      body.leftShoulder,
      body.rightShoulder,
      body.leftUpperArm,
      body.rightUpperArm,
      body.leftElbow,
      body.rightElbow,
      body.leftForearm,
      body.rightForearm,
      body.leftHand,
      body.rightHand,
      body.leftHip,
      body.rightHip,
      body.leftThigh,
      body.rightThigh,
      body.leftKnee,
      body.rightKnee,
      body.leftShin,
      body.rightShin,
      body.leftFoot,
      body.rightFoot,
    ];
  }

  /**
   * すべての身体パーツを非表示にする
   */
  static hideAllParts(body: CharacterBody): void {
    body.head.isVisible = false;
    body.leftEye.isVisible = false;
    body.rightEye.isVisible = false;
    body.mouth.isVisible = false;
    body.upperBody.isVisible = false;
    body.lowerBody.isVisible = false;
    body.waistJoint.isVisible = false;
    body.leftShoulder.isVisible = false;
    body.rightShoulder.isVisible = false;
    body.leftUpperArm.isVisible = false;
    body.rightUpperArm.isVisible = false;
    body.leftElbow.isVisible = false;
    body.rightElbow.isVisible = false;
    body.leftForearm.isVisible = false;
    body.rightForearm.isVisible = false;
    body.leftHand.isVisible = false;
    body.rightHand.isVisible = false;
    body.leftHip.isVisible = false;
    body.rightHip.isVisible = false;
    body.leftThigh.isVisible = false;
    body.rightThigh.isVisible = false;
    body.leftKnee.isVisible = false;
    body.rightKnee.isVisible = false;
    body.leftShin.isVisible = false;
    body.rightShin.isVisible = false;
    body.leftFoot.isVisible = false;
    body.rightFoot.isVisible = false;
  }

  /**
   * すべての身体パーツの色を変更
   */
  static setColor(body: CharacterBody, r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);
    for (const mesh of CharacterBodyBuilder.getAllBodyMeshes(body)) {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    }
  }

  /**
   * 胴体の色を変更（肩を含む）
   */
  static setBodyColor(body: CharacterBody, r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);
    const parts = [
      body.upperBody,
      body.lowerBody,
      body.leftShoulder,
      body.rightShoulder,
    ];
    for (const mesh of parts) {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    }
  }

  /**
   * 身体メッシュをすべて破棄する
   */
  static disposeBody(body: CharacterBody): void {
    body.head.dispose();
    body.leftEye.dispose();
    body.rightEye.dispose();
    body.mouth.dispose();
    if (body.hair) {
      body.hair.dispose();
      body.hair = null;
    }
    if (body.beard) {
      body.beard.dispose();
      body.beard = null;
    }
    body.upperBody.dispose();
    body.lowerBody.dispose();
    body.waistJoint.dispose();
    body.leftShoulder.dispose();
    body.rightShoulder.dispose();
    body.leftUpperArm.dispose();
    body.rightUpperArm.dispose();
    body.leftElbow.dispose();
    body.rightElbow.dispose();
    body.leftForearm.dispose();
    body.rightForearm.dispose();
    body.leftHand.dispose();
    body.rightHand.dispose();
    body.leftHip.dispose();
    body.rightHip.dispose();
    body.leftThigh.dispose();
    body.rightThigh.dispose();
    body.leftKnee.dispose();
    body.rightKnee.dispose();
    body.leftShin.dispose();
    body.rightShin.dispose();
    body.leftFoot.dispose();
    body.rightFoot.dispose();
    body.stateIndicator.dispose();
    body.visionCone.dispose();
  }
}
