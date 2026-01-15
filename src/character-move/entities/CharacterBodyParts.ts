import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "@babylonjs/core";
import { CHARACTER_CONFIG } from "../config/gameConfig";
import { CharacterState, CHARACTER_STATE_COLORS } from "../types/CharacterState";

/**
 * キャラクターの身体パーツを作成するクラス
 */
export class CharacterBodyParts {
  private scene: Scene;
  private config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } };
  private state: CharacterState;
  private visionAngle: number;
  private visionRange: number;

  constructor(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState
  ) {
    this.scene = scene;
    this.config = config;
    this.state = state;
    this.visionAngle = config.vision.visionAngle;
    this.visionRange = config.vision.visionRange;
  }

  /**
   * ルートメッシュを作成（透明な親メッシュ）
   */
  public createRootMesh(position: Vector3): Mesh {
    const root = MeshBuilder.CreateBox(
      "character-root",
      { size: 0.1 },
      this.scene
    );
    root.position = position;
    root.isVisible = false;

    const baseHeight = 1.8;
    const scale = this.config.physical.height / baseHeight;
    root.scaling = new Vector3(scale, scale, scale);

    return root;
  }

  /**
   * 頭を作成
   */
  public createHead(): Mesh {
    const headSize = 0.25;
    const upperBodyHeight = 0.35;

    const head = MeshBuilder.CreateSphere(
      "character-head",
      { diameter: headSize, segments: 16 },
      this.scene
    );

    head.position = new Vector3(0, upperBodyHeight / 2 + headSize / 2, 0);

    const material = new StandardMaterial("head-material", this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    head.material = material;

    return head;
  }

  /**
   * 目を作成
   */
  public createEye(side: "left" | "right"): Mesh {
    const eyeRadius = 0.03;
    const headSize = 0.20;

    const eye = MeshBuilder.CreateSphere(
      `character-eye-${side}`,
      { diameter: eyeRadius * 2, segments: 8 },
      this.scene
    );

    const eyeX = side === "left" ? -0.04 : 0.04;
    const eyeY = 0.03;
    const eyeZ = headSize / 2 - 0.01;

    eye.position = new Vector3(eyeX, eyeY, eyeZ);

    const material = new StandardMaterial(`eye-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.1, 0.1, 0.1);
    material.specularColor = new Color3(0.5, 0.5, 0.5);
    eye.material = material;

    return eye;
  }

  /**
   * 口を作成
   */
  public createMouth(): Mesh {
    const mouthWidth = 0.06;
    const mouthHeight = 0.02;
    const mouthDepth = 0.02;
    const headSize = 0.25;

    const mouth = MeshBuilder.CreateBox(
      "character-mouth",
      { width: mouthWidth, height: mouthHeight, depth: mouthDepth },
      this.scene
    );

    const mouthY = -0.04;
    const mouthZ = headSize / 2 - 0.01;

    mouth.position = new Vector3(0, mouthY, mouthZ);

    const material = new StandardMaterial("mouth-material", this.scene);
    material.diffuseColor = new Color3(0.8, 0.2, 0.2);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    mouth.material = material;

    return mouth;
  }

  /**
   * 腰関節を作成（上半身と下半身の接続点）
   */
  public createWaistJoint(): Mesh {
    const waistRadius = 0.10;

    const waistJoint = MeshBuilder.CreateSphere(
      "character-waist-joint",
      { diameter: waistRadius * 2, segments: 12 },
      this.scene
    );

    const headSize = 0.25;
    const upperBodyHeight = 0.6;
    const waistY = CHARACTER_CONFIG.height / 2 - headSize - upperBodyHeight;

    waistJoint.position = new Vector3(0, waistY, 0);

    const material = new StandardMaterial("waist-joint-material", this.scene);
    material.diffuseColor = new Color3(0.4, 0.3, 0.2);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    waistJoint.material = material;

    return waistJoint;
  }

  /**
   * 下半身の接続点を作成（回転可能な接続点）
   */
  public createLowerBodyConnection(): Mesh {
    const connectionRadius = 0.08;

    const connection = MeshBuilder.CreateSphere(
      "character-lower-body-connection",
      { diameter: connectionRadius * 2, segments: 12 },
      this.scene
    );

    const headSize = 0.25;
    const upperBodyHeight = 0.6;
    const waistY = CHARACTER_CONFIG.height / 2 - headSize - upperBodyHeight;
    connection.position = new Vector3(0, waistY, 0);

    const material = new StandardMaterial("lower-body-connection-material", this.scene);
    material.diffuseColor = new Color3(0.35, 0.25, 0.15);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    connection.material = material;

    return connection;
  }

  /**
   * 胴体上半身を作成
   */
  public createUpperBody(): Mesh {
    const width = 0.38;
    const height = 0.4;
    const depth = 0.20;

    const upperBody = MeshBuilder.CreateBox(
      "character-upper-body",
      { width, height, depth },
      this.scene
    );

    upperBody.position = new Vector3(0, height / 2, 0);

    const material = new StandardMaterial("upper-body-material", this.scene);
    material.diffuseColor = new Color3(0.2, 0.4, 0.8);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    upperBody.material = material;

    return upperBody;
  }

  /**
   * 胴体下半身を作成
   */
  public createLowerBody(): Mesh {
    const width = 0.35;
    const height = 0.2;
    const depth = 0.20;

    const lowerBody = MeshBuilder.CreateBox(
      "character-lower-body",
      { width, height, depth },
      this.scene
    );

    lowerBody.position = new Vector3(0, -height / 2, 0);

    const material = new StandardMaterial("lower-body-material", this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    lowerBody.material = material;

    return lowerBody;
  }

  /**
   * 肩を作成
   */
  public createShoulder(side: "left" | "right"): Mesh {
    const shoulderRadius = 0.08;
    const upperBodyHeight = 0.4;

    const shoulder = MeshBuilder.CreateSphere(
      `character-shoulder-${side}`,
      { diameter: shoulderRadius * 2, segments: 12 },
      this.scene
    );

    const shoulderY = upperBodyHeight / 2 - upperBodyHeight / 6;
    const shoulderX = side === "left" ? -0.25 : 0.25;

    shoulder.position = new Vector3(shoulderX, shoulderY, 0);

    const material = new StandardMaterial(`shoulder-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.4, 0.8);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    shoulder.material = material;

    return shoulder;
  }

  /**
   * 上腕を作成
   */
  public createUpperArm(side: "left" | "right"): Mesh {
    const radius = 0.06;
    const height = 0.3;

    const upperArm = MeshBuilder.CreateCapsule(
      `character-upper-arm-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    upperArm.position = new Vector3(0, -height / 2, 0);

    const material = new StandardMaterial(`upper-arm-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    upperArm.material = material;

    return upperArm;
  }

  /**
   * 肘を作成
   */
  public createElbow(side: "left" | "right"): Mesh {
    const elbowRadius = 0.06;
    const upperArmHeight = 0.3;

    const elbow = MeshBuilder.CreateSphere(
      `character-elbow-${side}`,
      { diameter: elbowRadius * 2, segments: 12 },
      this.scene
    );

    elbow.position = new Vector3(0, -upperArmHeight, 0);

    const material = new StandardMaterial(`elbow-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    elbow.material = material;

    return elbow;
  }

  /**
   * 前腕を作成
   */
  public createForearm(side: "left" | "right"): Mesh {
    const radius = 0.05;
    const height = 0.3;

    const forearm = MeshBuilder.CreateCapsule(
      `character-forearm-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    forearm.position = new Vector3(0, -height / 2, 0);

    const material = new StandardMaterial(`forearm-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    forearm.material = material;

    return forearm;
  }

  /**
   * 手のひらを作成
   */
  public createHand(side: "left" | "right"): Mesh {
    const handRadius = 0.07;
    const forearmHeight = 0.3;

    const hand = MeshBuilder.CreateSphere(
      `character-hand-${side}`,
      { diameter: handRadius * 2, segments: 12 },
      this.scene
    );

    hand.position = new Vector3(0, -forearmHeight / 2, 0);

    const material = new StandardMaterial(`hand-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    hand.material = material;

    return hand;
  }

  /**
   * 股関節を作成
   */
  public createHip(side: "left" | "right"): Mesh {
    const hipRadius = 0.09;
    const lowerBodyHeight = 0.2;

    const hip = MeshBuilder.CreateSphere(
      `character-hip-${side}`,
      { diameter: hipRadius * 2, segments: 12 },
      this.scene
    );

    const hipY = -lowerBodyHeight / 2;
    const hipX = side === "left" ? -0.1 : 0.1;

    hip.position = new Vector3(hipX, hipY, 0);

    const material = new StandardMaterial(`hip-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    hip.material = material;

    return hip;
  }

  /**
   * 太ももを作成
   */
  public createThigh(side: "left" | "right"): Mesh {
    const radius = 0.08;
    const height = 0.4;

    const thigh = MeshBuilder.CreateCapsule(
      `character-thigh-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    thigh.position = new Vector3(0, -height / 2, 0);

    const material = new StandardMaterial(`thigh-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    thigh.material = material;

    return thigh;
  }

  /**
   * 膝を作成
   */
  public createKnee(side: "left" | "right"): Mesh {
    const kneeRadius = 0.08;
    const thighHeight = 0.4;

    const knee = MeshBuilder.CreateSphere(
      `character-knee-${side}`,
      { diameter: kneeRadius * 2, segments: 12 },
      this.scene
    );

    knee.position = new Vector3(0, -thighHeight, 0);

    const material = new StandardMaterial(`knee-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    knee.material = material;

    return knee;
  }

  /**
   * すねを作成
   */
  public createShin(side: "left" | "right"): Mesh {
    const radius = 0.07;
    const height = 0.4;

    const shin = MeshBuilder.CreateCapsule(
      `character-shin-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    shin.position = new Vector3(0, -height / 2, 0);

    const material = new StandardMaterial(`shin-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    shin.material = material;

    return shin;
  }

  /**
   * 足を作成
   */
  public createFoot(side: "left" | "right"): Mesh {
    const radius = 0.06;
    const height = 0.2;
    const shinHeight = 0.4;

    const foot = MeshBuilder.CreateCapsule(
      `character-foot-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    foot.rotation.x = Math.PI / 2;
    foot.position = new Vector3(0, -shinHeight / 2 + radius, height / 4);

    const material = new StandardMaterial(`foot-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.15, 0.1);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    foot.material = material;

    return foot;
  }

  /**
   * 状態インジケーター球体を作成（頭のすぐ上に配置）
   */
  public createStateIndicator(): Mesh {
    const indicator = MeshBuilder.CreateSphere(
      "state-indicator",
      { diameter: 0.2, segments: 16 },
      this.scene
    );

    const headHeight = 0.15;
    const indicatorOffset = 0.25;
    indicator.position = new Vector3(0, headHeight + indicatorOffset, 0);

    const material = new StandardMaterial("state-indicator-material", this.scene);
    const color = CHARACTER_STATE_COLORS[this.state];
    material.diffuseColor = new Color3(color.r, color.g, color.b);
    material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    indicator.material = material;

    return indicator;
  }

  /**
   * 視野コーン（円錐形）を作成
   */
  public createVisionCone(): Mesh {
    const halfAngleRad = (this.visionAngle / 2) * (Math.PI / 180);
    const coneRadius = this.visionRange * Math.tan(halfAngleRad);

    const visionCone = MeshBuilder.CreateCylinder(
      "vision-cone",
      {
        diameterTop: coneRadius * 2,
        diameterBottom: 0,
        height: this.visionRange,
        tessellation: 16,
      },
      this.scene
    );

    visionCone.rotation = new Vector3(Math.PI / 2, 0, 0);

    const eyeY = 0.03;
    const headSize = 0.20;
    const eyeZ = headSize / 2 - 0.01;

    visionCone.position = new Vector3(
      0,
      eyeY,
      eyeZ + this.visionRange / 2
    );

    const material = new StandardMaterial("vision-cone-material", this.scene);
    const initialColor = CHARACTER_STATE_COLORS[this.state];
    material.diffuseColor = new Color3(initialColor.r, initialColor.g, initialColor.b);
    material.alpha = 0.15;
    material.wireframe = false;
    visionCone.material = material;

    return visionCone;
  }
}
