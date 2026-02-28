import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode,
} from "@babylonjs/core";

import {
  ENTITY_HEIGHT,
  OBSTACLE_SIZE,
} from "../Config/FieldConfig";
import type { SimMover } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";

// =========================================================================
// Leg constants
// =========================================================================

const VISUAL_SIZE = OBSTACLE_SIZE;

const LEG_DIAMETER = VISUAL_SIZE * 0.4;
const LEG_SIDE_OFFSET = VISUAL_SIZE * 0.22;
const STEP_SWING_ANGLE = 25 * Math.PI / 180;
const STEP_FREQUENCY = 8.0;
const STEP_RETURN_SPEED = 8.0;

const HIP_BOX_WIDTH = LEG_SIDE_OFFSET * 2 + LEG_DIAMETER;
const HIP_BOX_HEIGHT = ENTITY_HEIGHT * 0.08;
const HIP_BOX_DEPTH = LEG_DIAMETER * 0.9;

// =========================================================================
// Interfaces
// =========================================================================

interface LegStepState {
  phase: number;
  prevX: number;
  prevZ: number;
  prevFacing: number;
}

interface EntityLegSet {
  hipBox: Mesh;
  leftHipJoint: TransformNode;
  rightHipJoint: TransformNode;
  leftLeg: Mesh;
  rightLeg: Mesh;
  leftFoot: Mesh;
  rightFoot: Mesh;
}

// =========================================================================
// LegRenderer
// =========================================================================

export class LegRenderer {
  private scene: Scene;
  private entityLegSets: EntityLegSet[] = [];
  private legStepStates: LegStepState[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * 脚メッシュ（hipBox + 左右股関節 + 左右脚 + 左右足）を生成して返す。
   * 呼び出し側（SimVisualization.createOctEntity）が root に parent 設定する。
   */
  createLegs(
    name: string, size: number, color: Color3,
  ): {
    hipBox: Mesh; leftHipJoint: TransformNode; rightHipJoint: TransformNode;
    leftLeg: Mesh; rightLeg: Mesh; leftFoot: Mesh; rightFoot: Mesh;
  } {
    const halfH = ENTITY_HEIGHT / 2;
    const legColor = new Color3(color.r * 0.55, color.g * 0.55, color.b * 0.55);

    const hipBox = MeshBuilder.CreateBox(`${name}_hipBox`, {
      width: HIP_BOX_WIDTH, height: HIP_BOX_HEIGHT, depth: HIP_BOX_DEPTH,
    }, this.scene);
    hipBox.position.y = -HIP_BOX_HEIGHT / 2;
    const hipMat = new StandardMaterial(`${name}_hipMat`, this.scene);
    hipMat.diffuseColor = legColor;
    hipMat.specularColor = Color3.Black();
    hipBox.material = hipMat;
    hipBox.isPickable = false;

    const legRadius = LEG_DIAMETER / 2;
    const footSize = size * 0.15;
    const footColor = new Color3(color.r * 0.45, color.g * 0.45, color.b * 0.45);

    const createLeg = (side: -1 | 1): { hipJoint: TransformNode; leg: Mesh; foot: Mesh } => {
      const hipJoint = new TransformNode(`${name}_hipJoint${side}`, this.scene);
      hipJoint.position.x = side * LEG_SIDE_OFFSET;
      hipJoint.position.y = 0;

      const legH = halfH * 0.75;
      const leg = MeshBuilder.CreateCylinder(`${name}_leg${side}`, {
        height: legH, diameter: legRadius * 2, tessellation: 8,
      }, this.scene);
      leg.position.y = -legH / 2;
      const legMat = new StandardMaterial(`${name}_legMat${side}`, this.scene);
      legMat.diffuseColor = legColor;
      legMat.specularColor = Color3.Black();
      leg.material = legMat;
      leg.isPickable = false;
      leg.parent = hipJoint;

      const foot = MeshBuilder.CreateBox(`${name}_foot${side}`, {
        width: footSize, height: footSize, depth: footSize,
      }, this.scene);
      foot.position.y = -legH * 0.4;
      foot.position.z = legRadius * 0.85;
      const footMat = new StandardMaterial(`${name}_footMat${side}`, this.scene);
      footMat.diffuseColor = footColor;
      footMat.specularColor = Color3.Black();
      foot.material = footMat;
      foot.isPickable = false;
      foot.parent = leg;

      return { hipJoint, leg, foot };
    };

    const left = createLeg(-1);
    const right = createLeg(1);

    return {
      hipBox,
      leftHipJoint: left.hipJoint, rightHipJoint: right.hipJoint,
      leftLeg: left.leg, rightLeg: right.leg,
      leftFoot: left.foot, rightFoot: right.foot,
    };
  }

  /**
   * 生成した脚メッシュセットを内部配列に保存する。
   */
  storeLegSet(ent: {
    hipBox: Mesh; leftHipJoint: TransformNode; rightHipJoint: TransformNode;
    leftLeg: Mesh; rightLeg: Mesh; leftFoot: Mesh; rightFoot: Mesh;
  }): void {
    this.entityLegSets.push({
      hipBox: ent.hipBox,
      leftHipJoint: ent.leftHipJoint, rightHipJoint: ent.rightHipJoint,
      leftLeg: ent.leftLeg, rightLeg: ent.rightLeg,
      leftFoot: ent.leftFoot, rightFoot: ent.rightFoot,
    });
    this.legStepStates.push({ phase: 0, prevX: 0, prevZ: 0, prevFacing: 0 });
  }

  /**
   * 全エンティティの脚を歩行アニメーションで更新。
   */
  syncLegs(allMovers: SimMover[], dt: number): void {
    for (let idx = 0; idx < this.entityLegSets.length; idx++) {
      const legSet = this.entityLegSets[idx];
      const stepState = this.legStepStates[idx];
      if (!legSet || !stepState) continue;
      if (idx >= allMovers.length) continue;

      const mover = allMovers[idx];

      const dx = mover.x - stepState.prevX;
      const dz = mover.z - stepState.prevZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      const angleDelta = Math.abs(normAngleDiff(stepState.prevFacing, mover.facing));

      const drive = dist + angleDelta * LEG_SIDE_OFFSET;

      if (drive > 0.0005) {
        stepState.phase += drive * STEP_FREQUENCY;
      } else {
        const nearestNPi = Math.round(stepState.phase / Math.PI) * Math.PI;
        const diff = nearestNPi - stepState.phase;
        stepState.phase += diff * (1 - Math.exp(-STEP_RETURN_SPEED * dt));
      }

      const swing = Math.sin(stepState.phase) * STEP_SWING_ANGLE;
      legSet.leftHipJoint.rotation.x = swing;
      legSet.rightHipJoint.rotation.x = -swing;

      stepState.prevX = mover.x;
      stepState.prevZ = mover.z;
      stepState.prevFacing = mover.facing;
    }
  }

  dispose(): void {
    for (const legSet of this.entityLegSets) {
      for (const m of [legSet.hipBox, legSet.leftLeg, legSet.rightLeg, legSet.leftFoot, legSet.rightFoot]) {
        m.material?.dispose();
        m.dispose();
      }
      legSet.leftHipJoint.dispose();
      legSet.rightHipJoint.dispose();
    }
    this.entityLegSets = [];
    this.legStepStates = [];
  }
}
