import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh } from "@babylonjs/core";
import { CHARACTER_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/GameConfig";
import { CharacterState, CHARACTER_STATE_COLORS } from "@/GamePlay/GameSystem/CharacterMove/Types/CharacterState";
import { FaceConfig, DEFAULT_FACE_CONFIG, HairStyle, BeardStyle, EyeStyle, MouthStyle } from "@/GamePlay/GameSystem/CharacterMove/Types/FaceConfig";

/**
 * キャラクターの身体パーツを作成するクラス
 */
export class CharacterBodyParts {
  private scene: Scene;
  private config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } };
  private state: CharacterState;
  private visionAngle: number;
  private visionRange: number;
  private faceConfig: FaceConfig;

  constructor(
    scene: Scene,
    config: { physical: { height: number }; vision: { visionAngle: number; visionRange: number } },
    state: CharacterState,
    faceConfig?: FaceConfig
  ) {
    this.scene = scene;
    this.config = config;
    this.state = state;
    this.visionAngle = config.vision.visionAngle;
    this.visionRange = config.vision.visionRange;
    this.faceConfig = faceConfig ?? DEFAULT_FACE_CONFIG;
  }

  /**
   * FaceConfig を更新する（applyFaceConfig から呼ばれる）
   */
  public setFaceConfig(faceConfig: FaceConfig): void {
    this.faceConfig = faceConfig;
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
    const sc = this.faceConfig.skinColor;
    material.diffuseColor = new Color3(sc.r, sc.g, sc.b);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    head.material = material;

    return head;
  }

  /**
   * 目を作成（EyeStyleに応じた形状）
   */
  public createEye(side: "left" | "right"): Mesh {
    const baseEyeRadius = 0.03;
    const eyeRadius = baseEyeRadius * this.faceConfig.eyeSize;
    const headSize = 0.20;
    const style = this.faceConfig.eyeStyle;

    let eye: Mesh;

    switch (style) {
      case EyeStyle.NARROW: {
        // 切れ長：横に潰した楕円形（X方向に伸ばしたスフィア）
        eye = MeshBuilder.CreateSphere(
          `character-eye-${side}`,
          { diameter: eyeRadius * 2, segments: 8 },
          this.scene
        );
        eye.scaling = new Vector3(1.6, 0.5, 1.0);
        break;
      }
      case EyeStyle.WIDE: {
        // 大きい丸目：1.4倍の球
        eye = MeshBuilder.CreateSphere(
          `character-eye-${side}`,
          { diameter: eyeRadius * 2 * 1.4, segments: 12 },
          this.scene
        );
        break;
      }
      case EyeStyle.SHARP: {
        // つり目：菱形に近い形（Y回転+スケール）
        eye = MeshBuilder.CreateSphere(
          `character-eye-${side}`,
          { diameter: eyeRadius * 2, segments: 8 },
          this.scene
        );
        eye.scaling = new Vector3(1.4, 0.6, 1.0);
        // つり目の傾き（左右対称）
        eye.rotation.z = side === "left" ? -0.3 : 0.3;
        break;
      }
      case EyeStyle.DROOPY: {
        // たれ目：外側が下がった形
        eye = MeshBuilder.CreateSphere(
          `character-eye-${side}`,
          { diameter: eyeRadius * 2, segments: 8 },
          this.scene
        );
        eye.scaling = new Vector3(1.3, 0.7, 1.0);
        // たれ目の傾き（左右対称で外側が下がる）
        eye.rotation.z = side === "left" ? 0.3 : -0.3;
        break;
      }
      default: {
        // ROUND: デフォルトの丸い目
        eye = MeshBuilder.CreateSphere(
          `character-eye-${side}`,
          { diameter: eyeRadius * 2, segments: 8 },
          this.scene
        );
        break;
      }
    }

    const eyeX = side === "left" ? -0.04 : 0.04;
    const eyeY = this.faceConfig.eyePositionY;
    const eyeZ = headSize / 2 - 0.01;

    eye.position = new Vector3(eyeX, eyeY, eyeZ);

    const material = new StandardMaterial(`eye-${side}-material`, this.scene);
    const ec = this.faceConfig.eyeColor;
    material.diffuseColor = new Color3(ec.r, ec.g, ec.b);
    material.specularColor = new Color3(0.5, 0.5, 0.5);
    eye.material = material;

    return eye;
  }

  /**
   * 口を作成（MouthStyleに応じた形状）
   */
  public createMouth(): Mesh {
    const mouthWidth = this.faceConfig.mouthWidth;
    const headSize = 0.25;
    const style = this.faceConfig.mouthStyle;

    let mouth: Mesh;

    switch (style) {
      case MouthStyle.WIDE: {
        // 横に広い薄い口
        mouth = MeshBuilder.CreateBox(
          "character-mouth",
          { width: mouthWidth * 1.5, height: 0.015, depth: 0.02 },
          this.scene
        );
        break;
      }
      case MouthStyle.SMALL: {
        // 小さい丸口
        mouth = MeshBuilder.CreateSphere(
          "character-mouth",
          { diameter: mouthWidth * 0.5, segments: 8 },
          this.scene
        );
        break;
      }
      case MouthStyle.SMILE: {
        // 笑顔：トーラスの一部で上向きカーブ
        mouth = MeshBuilder.CreateTorus(
          "character-mouth",
          { diameter: mouthWidth * 1.2, thickness: 0.012, tessellation: 16 },
          this.scene
        );
        // 上半分だけ見せる（下に配置+スケール調整）
        mouth.scaling = new Vector3(1.0, 0.5, 0.4);
        mouth.rotation.x = 0.2;
        break;
      }
      case MouthStyle.SERIOUS: {
        // 真一文字：横に細長い板
        mouth = MeshBuilder.CreateBox(
          "character-mouth",
          { width: mouthWidth * 1.2, height: 0.008, depth: 0.02 },
          this.scene
        );
        break;
      }
      default: {
        // NORMAL: デフォルト
        mouth = MeshBuilder.CreateBox(
          "character-mouth",
          { width: mouthWidth, height: 0.02, depth: 0.02 },
          this.scene
        );
        break;
      }
    }

    const mouthY = this.faceConfig.mouthPositionY;
    const mouthZ = headSize / 2 - 0.01;

    mouth.position = new Vector3(0, mouthY, mouthZ);

    const material = new StandardMaterial("mouth-material", this.scene);
    const mc = this.faceConfig.mouthColor;
    material.diffuseColor = new Color3(mc.r, mc.g, mc.b);
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
    const scUA = this.faceConfig.skinColor;
    material.diffuseColor = new Color3(scUA.r, scUA.g, scUA.b);
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
    const scEl = this.faceConfig.skinColor;
    material.diffuseColor = new Color3(scEl.r, scEl.g, scEl.b);
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
    const scFA = this.faceConfig.skinColor;
    material.diffuseColor = new Color3(scFA.r, scFA.g, scFA.b);
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
    const scHd = this.faceConfig.skinColor;
    material.diffuseColor = new Color3(scHd.r, scHd.g, scHd.b);
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
   * 髪を作成（hairStyleに応じたメッシュ）
   * @returns 髪メッシュ（NONE の場合は null）
   */
  public createHair(): Mesh | null {
    const style = this.faceConfig.hairStyle;
    if (style === HairStyle.NONE) return null;

    const hc = this.faceConfig.hairColor;
    const headRadius = 0.125; // 頭直径0.25の半分
    let hair: Mesh;

    switch (style) {
      case HairStyle.SHORT: {
        // 頭頂部にフィットする薄い半球
        hair = MeshBuilder.CreateSphere(
          "character-hair",
          { diameter: headRadius * 2.1, segments: 16, slice: 0.5 },
          this.scene
        );
        hair.position = new Vector3(0, 0.02, 0);
        break;
      }
      case HairStyle.MEDIUM: {
        // やや大きめの半球
        hair = MeshBuilder.CreateSphere(
          "character-hair",
          { diameter: headRadius * 2.3, segments: 16, slice: 0.5 },
          this.scene
        );
        hair.position = new Vector3(0, 0.02, -0.01);
        break;
      }
      case HairStyle.LONG: {
        // 後頭部に垂れるカプセル
        hair = MeshBuilder.CreateCapsule(
          "character-hair",
          { radius: headRadius * 0.9, height: headRadius * 3.5, tessellation: 12 },
          this.scene
        );
        hair.position = new Vector3(0, -0.02, -0.04);
        break;
      }
      case HairStyle.MOHAWK: {
        // 中央の細長いボックス
        hair = MeshBuilder.CreateBox(
          "character-hair",
          { width: 0.04, height: 0.1, depth: headRadius * 1.8 },
          this.scene
        );
        hair.position = new Vector3(0, headRadius * 0.7, 0);
        break;
      }
      case HairStyle.BUZZ: {
        // 頭にぴったりの薄い球
        hair = MeshBuilder.CreateSphere(
          "character-hair",
          { diameter: headRadius * 2.05, segments: 16, slice: 0.55 },
          this.scene
        );
        hair.position = new Vector3(0, 0.01, 0);
        break;
      }
      default:
        return null;
    }

    const material = new StandardMaterial("hair-material", this.scene);
    material.diffuseColor = new Color3(hc.r, hc.g, hc.b);
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    hair.material = material;

    return hair;
  }

  /**
   * 髭を作成（beardStyleに応じたメッシュ）
   * @returns 髭メッシュ（NONE の場合は null）
   */
  public createBeard(): Mesh | null {
    const style = this.faceConfig.beardStyle;
    if (style === BeardStyle.NONE) return null;

    const bc = this.faceConfig.beardColor;
    const headSize = 0.25;
    let beard: Mesh;

    switch (style) {
      case BeardStyle.STUBBLE: {
        // 薄い板（口の下に配置）
        beard = MeshBuilder.CreateBox(
          "character-beard",
          { width: 0.08, height: 0.03, depth: 0.02 },
          this.scene
        );
        beard.position = new Vector3(0, -0.07, headSize / 2 - 0.02);
        break;
      }
      case BeardStyle.FULL: {
        // 大きめの顎全体を覆うボックス
        beard = MeshBuilder.CreateBox(
          "character-beard",
          { width: 0.12, height: 0.06, depth: 0.04 },
          this.scene
        );
        beard.position = new Vector3(0, -0.07, headSize / 2 - 0.03);
        break;
      }
      case BeardStyle.GOATEE: {
        // 口の下の小さい縦長ボックス
        beard = MeshBuilder.CreateBox(
          "character-beard",
          { width: 0.04, height: 0.05, depth: 0.02 },
          this.scene
        );
        beard.position = new Vector3(0, -0.08, headSize / 2 - 0.02);
        break;
      }
      default:
        return null;
    }

    const material = new StandardMaterial("beard-material", this.scene);
    material.diffuseColor = new Color3(bc.r, bc.g, bc.b);
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    beard.material = material;

    return beard;
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
