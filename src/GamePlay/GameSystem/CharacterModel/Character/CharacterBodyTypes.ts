import { Mesh } from "@babylonjs/core";

/**
 * キャラクターの全身体メッシュ参照を保持するインターフェース
 */
export interface CharacterBody {
  head: Mesh;
  waistJoint: Mesh;
  upperBody: Mesh;
  lowerBodyConnection: Mesh;
  lowerBody: Mesh;
  leftShoulder: Mesh;
  rightShoulder: Mesh;
  leftUpperArm: Mesh;
  rightUpperArm: Mesh;
  leftElbow: Mesh;
  rightElbow: Mesh;
  leftForearm: Mesh;
  rightForearm: Mesh;
  leftHand: Mesh;
  rightHand: Mesh;
  leftHip: Mesh;
  rightHip: Mesh;
  leftThigh: Mesh;
  rightThigh: Mesh;
  leftKnee: Mesh;
  rightKnee: Mesh;
  leftShin: Mesh;
  rightShin: Mesh;
  leftFoot: Mesh;
  rightFoot: Mesh;
  leftEye: Mesh;
  rightEye: Mesh;
  mouth: Mesh;
  hair: Mesh | null;
  beard: Mesh | null;
  stateIndicator: Mesh;
  visionCone: Mesh;
}
