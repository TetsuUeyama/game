import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, AbstractMesh, VertexData, LinesMesh } from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { CHARACTER_CONFIG } from "../config/gameConfig";
import { MotionController } from "../controllers/MotionController";
import { MotionData } from "../types/MotionTypes";
import { CharacterState, CHARACTER_STATE_COLORS } from "../types/CharacterState";
import { CharacterConfig, DEFAULT_CHARACTER_CONFIG } from "../types/CharacterStats";
import { PlayerData } from "../types/PlayerData";
import { BallAction, FACE_ACTIONS } from "../types/BallAction";
import { OffenseStrategy, OFFENSE_STRATEGY_FACES } from "../types/OffenseStrategy";

/**
 * 3Dキャラクターエンティティ
 */
export class Character {
  public scene: Scene;
  public mesh: Mesh; // ルートメッシュ（親メッシュ）
  public model: AbstractMesh | null = null; // 読み込んだ3Dモデル

  // 身体パーツ
  private headMesh: Mesh; // 頭
  private upperBodyMesh: Mesh; // 胴体上半身
  private lowerBodyMesh: Mesh; // 胴体下半身
  private waistJointMesh: Mesh; // 腰関節（上半身と下半身の接続）
  private lowerBodyConnectionMesh: Mesh; // 下半身の接続点（回転可能）
  private leftShoulderMesh: Mesh; // 左肩
  private rightShoulderMesh: Mesh; // 右肩
  private leftUpperArmMesh: Mesh; // 左上腕
  private rightUpperArmMesh: Mesh; // 右上腕
  private leftElbowMesh: Mesh; // 左肘
  private rightElbowMesh: Mesh; // 右肘
  private leftForearmMesh: Mesh; // 左前腕
  private rightForearmMesh: Mesh; // 右前腕
  private leftHandMesh: Mesh; // 左手のひら
  private rightHandMesh: Mesh; // 右手のひら
  private leftHipMesh: Mesh; // 左股関節
  private rightHipMesh: Mesh; // 右股関節
  private leftThighMesh: Mesh; // 左太もも
  private rightThighMesh: Mesh; // 右太もも
  private leftKneeMesh: Mesh; // 左膝
  private rightKneeMesh: Mesh; // 右膝
  private leftShinMesh: Mesh; // 左すね
  private rightShinMesh: Mesh; // 右すね
  private leftFootMesh: Mesh; // 左足
  private rightFootMesh: Mesh; // 右足

  // 顔のパーツ
  private leftEyeMesh: Mesh; // 左目
  private rightEyeMesh: Mesh; // 右目
  private mouthMesh: Mesh; // 口

  // 状態インジケーター（頭上の球体）
  private stateIndicator: Mesh;

  // 視野
  private visionConeMesh: Mesh; // 視野コーン（可視化用）
  public visionAngle: number; // 視野角（度）
  public visionRange: number; // 視野範囲（m）

  public position: Vector3; // 位置
  public rotation: number = 0; // Y軸周りの回転（ラジアン）
  public velocity: Vector3 = Vector3.Zero(); // 速度ベクトル

  private groundY: number; // 地面のY座標
  private motionOffsetY: number = 0; // モーションによるY軸オフセット

  // 衝突判定
  public collisionRadius: number = 0.3; // 衝突半径（m）

  // キャラクターの状態
  private state: CharacterState = CharacterState.BALL_LOST;

  // チーム識別（味方か敵か）
  public team: "ally" | "enemy" = "ally"; // デフォルトは味方チーム

  // キャラクター設定
  public config: CharacterConfig;

  // モーションコントローラー
  private motionController: MotionController;

  // 選手データ
  public playerData: PlayerData | null = null;
  public playerPosition: 'GK' | 'DF' | 'MF' | 'FW' | null = null;

  // 名前表示用
  private nameLabel: Mesh | null = null;
  private nameLabelTexture: AdvancedDynamicTexture | null = null;

  // 足元の円
  private footCircle: LinesMesh | null = null;
  private footCircleRadius: number = 1.0; // 足元の円の半径（初期値1m）
  private footCircleVertexLabels: Mesh[] = []; // 8角形の頂点番号表示用
  private footCircleFaceSegments: Mesh[] = []; // 8角形の面セグメント（色分け用）

  // ボール保持位置設定
  private ballHoldingFaces: number[] = [0, 1, 2, 6, 7]; // 使用する8角形の面番号（前方5箇所）
  private currentBallHoldingIndex: number = 0; // 現在のボール保持位置インデックス（0-4）

  // オフェンス戦術
  private offenseStrategy: OffenseStrategy = OffenseStrategy.HIGH_RISK; // デフォルトはハイリスク

  // 無力化フラグ（1on1勝負で負けた場合など）
  private defeated: boolean = false;

  constructor(scene: Scene, position: Vector3, config?: CharacterConfig) {
    this.scene = scene;
    this.position = position.clone();

    // 設定を初期化（指定がなければデフォルト）
    this.config = config || DEFAULT_CHARACTER_CONFIG;

    // 身長に応じて地面のY座標を設定
    this.groundY = this.config.physical.height / 2;

    // 視野設定を初期化
    this.visionAngle = this.config.vision.visionAngle;
    this.visionRange = this.config.vision.visionRange;

    // ルートメッシュを作成（透明な親メッシュ）
    this.mesh = this.createRootMesh();

    // 身体パーツを作成
    this.headMesh = this.createHead();
    this.waistJointMesh = this.createWaistJoint();
    this.upperBodyMesh = this.createUpperBody();
    this.lowerBodyConnectionMesh = this.createLowerBodyConnection();
    this.lowerBodyMesh = this.createLowerBody();
    this.leftShoulderMesh = this.createShoulder("left");
    this.rightShoulderMesh = this.createShoulder("right");
    this.leftUpperArmMesh = this.createUpperArm("left");
    this.rightUpperArmMesh = this.createUpperArm("right");
    this.leftElbowMesh = this.createElbow("left");
    this.rightElbowMesh = this.createElbow("right");
    this.leftForearmMesh = this.createForearm("left");
    this.rightForearmMesh = this.createForearm("right");
    this.leftHandMesh = this.createHand("left");
    this.rightHandMesh = this.createHand("right");
    this.leftHipMesh = this.createHip("left");
    this.rightHipMesh = this.createHip("right");
    this.leftThighMesh = this.createThigh("left");
    this.rightThighMesh = this.createThigh("right");
    this.leftKneeMesh = this.createKnee("left");
    this.rightKneeMesh = this.createKnee("right");
    this.leftShinMesh = this.createShin("left");
    this.rightShinMesh = this.createShin("right");
    this.leftFootMesh = this.createFoot("left");
    this.rightFootMesh = this.createFoot("right");

    // 顔のパーツを作成
    this.leftEyeMesh = this.createEye("left");
    this.rightEyeMesh = this.createEye("right");
    this.mouthMesh = this.createMouth();

    // パーツの親子関係を設定
    // 腰関節はルートの子（接続位置、固定）
    this.waistJointMesh.parent = this.mesh;

    // 上半身は腰関節の子（腰関節を回転すると上半身全体が回転）
    this.upperBodyMesh.parent = this.waistJointMesh;

    // 下半身の接続点もルートの子（上半身とは独立してY回転可能）
    this.lowerBodyConnectionMesh.parent = this.mesh;

    // 下半身ボックスは接続点の子（ローカルXでオフセット）
    this.lowerBodyMesh.parent = this.lowerBodyConnectionMesh;

    // 頭：上半身に固定
    this.headMesh.parent = this.upperBodyMesh;

    // 顔のパーツ：頭に固定
    this.leftEyeMesh.parent = this.headMesh;
    this.rightEyeMesh.parent = this.headMesh;
    this.mouthMesh.parent = this.headMesh;

    // 左腕：肩を上半身に固定し、肩を基点とした階層構造
    this.leftShoulderMesh.parent = this.upperBodyMesh; // 上半身の子
    this.leftUpperArmMesh.parent = this.leftShoulderMesh; // 肩の子
    this.leftElbowMesh.parent = this.leftShoulderMesh; // 肩の子
    this.leftForearmMesh.parent = this.leftElbowMesh; // 肘の子
    this.leftHandMesh.parent = this.leftForearmMesh; // 前腕の子

    // 右腕：肩を上半身に固定し、肩を基点とした階層構造
    this.rightShoulderMesh.parent = this.upperBodyMesh; // 上半身の子
    this.rightUpperArmMesh.parent = this.rightShoulderMesh; // 肩の子
    this.rightElbowMesh.parent = this.rightShoulderMesh; // 肩の子
    this.rightForearmMesh.parent = this.rightElbowMesh; // 肘の子
    this.rightHandMesh.parent = this.rightForearmMesh; // 前腕の子

    // 左脚：股関節を下半身に固定し、股関節を基点とした階層構造
    this.leftHipMesh.parent = this.lowerBodyMesh; // 下半身の子
    this.leftThighMesh.parent = this.leftHipMesh; // 股関節の子
    this.leftKneeMesh.parent = this.leftHipMesh; // 股関節の子
    this.leftShinMesh.parent = this.leftKneeMesh; // 膝の子
    this.leftFootMesh.parent = this.leftShinMesh; // すねの子

    // 右脚：股関節を下半身に固定し、股関節を基点とした階層構造
    this.rightHipMesh.parent = this.lowerBodyMesh; // 下半身の子
    this.rightThighMesh.parent = this.rightHipMesh; // 股関節の子
    this.rightKneeMesh.parent = this.rightHipMesh; // 股関節の子
    this.rightShinMesh.parent = this.rightKneeMesh; // 膝の子
    this.rightFootMesh.parent = this.rightShinMesh; // すねの子

    // 状態インジケーター球体を作成
    this.stateIndicator = this.createStateIndicator();

    // 視野コーンを作成
    this.visionConeMesh = this.createVisionCone();

    // 足元の円を作成
    this.footCircle = this.createFootCircle();

    // 足元の円の色分けセグメントを作成
    this.createFootCircleFaceSegments();

    // モーションコントローラーを初期化
    this.motionController = new MotionController(this);
  }

  /**
   * ルートメッシュを作成（透明な親メッシュ）
   */
  private createRootMesh(): Mesh {
    const root = MeshBuilder.CreateBox(
      "character-root",
      { size: 0.1 },
      this.scene
    );
    root.position = this.position;
    root.isVisible = false; // 透明にする

    // 身長に応じてスケーリング（基準身長: 1.8m）
    const baseHeight = 1.8;
    const scale = this.config.physical.height / baseHeight;
    root.scaling = new Vector3(scale, scale, scale);

    return root;
  }

  /**
   * 頭を作成
   */
  private createHead(): Mesh {
    const headSize = 0.25;
    const upperBodyHeight = 0.35;

    const head = MeshBuilder.CreateSphere(
      "character-head",
      { diameter: headSize, segments: 16 },
      this.scene
    );

    // 位置: 上半身からの相対位置（親が上半身）
    head.position = new Vector3(0, upperBodyHeight / 2 + headSize / 2, 0);

    // マテリアル（肌色）
    const material = new StandardMaterial("head-material", this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7); // 肌色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    head.material = material;

    return head;
  }

  /**
   * 目を作成
   */
  private createEye(side: "left" | "right"): Mesh {
    const eyeRadius = 0.03;
    const headSize = 0.20;

    const eye = MeshBuilder.CreateSphere(
      `character-eye-${side}`,
      { diameter: eyeRadius * 2, segments: 8 },
      this.scene
    );

    // 位置: 頭の前面（Z方向に突き出す）
    const eyeX = side === "left" ? -0.04 : 0.04;
    const eyeY = 0.03; // 少し上
    const eyeZ = headSize / 2 - 0.01; // 頭の半径から少し前

    eye.position = new Vector3(eyeX, eyeY, eyeZ);

    // マテリアル（黒い目）
    const material = new StandardMaterial(`eye-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.1, 0.1, 0.1); // 濃い灰色
    material.specularColor = new Color3(0.5, 0.5, 0.5);
    eye.material = material;

    return eye;
  }

  /**
   * 口を作成
   */
  private createMouth(): Mesh {
    const mouthWidth = 0.06;
    const mouthHeight = 0.02;
    const mouthDepth = 0.02;
    const headSize = 0.25;

    const mouth = MeshBuilder.CreateBox(
      "character-mouth",
      { width: mouthWidth, height: mouthHeight, depth: mouthDepth },
      this.scene
    );

    // 位置: 頭の前面下部
    const mouthY = -0.04; // 少し下
    const mouthZ = headSize / 2 - 0.01; // 頭の半径から少し前

    mouth.position = new Vector3(0, mouthY, mouthZ);

    // マテリアル（赤い口）
    const material = new StandardMaterial("mouth-material", this.scene);
    material.diffuseColor = new Color3(0.8, 0.2, 0.2); // 赤色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    mouth.material = material;

    return mouth;
  }

  /**
   * 腰関節を作成（上半身と下半身の接続点）
   */
  private createWaistJoint(): Mesh {
    const waistRadius = 0.10;

    const waistJoint = MeshBuilder.CreateSphere(
      "character-waist-joint",
      { diameter: waistRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 下半身の上部（上半身と下半身の間）
    const headSize = 0.25;
    const upperBodyHeight = 0.6;
    const waistY = CHARACTER_CONFIG.height / 2 - headSize - upperBodyHeight;

    waistJoint.position = new Vector3(0, waistY, 0);

    // マテリアル（茶色いベルト）
    const material = new StandardMaterial("waist-joint-material", this.scene);
    material.diffuseColor = new Color3(0.4, 0.3, 0.2); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    waistJoint.material = material;

    return waistJoint;
  }

  /**
   * 下半身の接続点を作成（回転可能な接続点）
   */
  private createLowerBodyConnection(): Mesh {
    const connectionRadius = 0.08;

    const connection = MeshBuilder.CreateSphere(
      "character-lower-body-connection",
      { diameter: connectionRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 腰関節と同じ位置（親がルートなので絶対位置）
    const headSize = 0.25;
    const upperBodyHeight = 0.6;
    const waistY = CHARACTER_CONFIG.height / 2 - headSize - upperBodyHeight;
    connection.position = new Vector3(0, waistY, 0);

    // マテリアル（暗い茶色）
    const material = new StandardMaterial("lower-body-connection-material", this.scene);
    material.diffuseColor = new Color3(0.35, 0.25, 0.15); // 暗い茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    connection.material = material;

    return connection;
  }

  /**
   * 胴体上半身を作成
   */
  private createUpperBody(): Mesh {
    const width = 0.38;
    const height = 0.4;
    const depth = 0.20;

    const upperBody = MeshBuilder.CreateBox(
      "character-upper-body",
      { width, height, depth },
      this.scene
    );

    // 位置: 腰関節からの相対位置（親が腰関節）
    upperBody.position = new Vector3(0, height / 2, 0);

    // マテリアル（青いシャツ）
    const material = new StandardMaterial("upper-body-material", this.scene);
    material.diffuseColor = new Color3(0.2, 0.4, 0.8); // 青色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    upperBody.material = material;

    return upperBody;
  }

  /**
   * 胴体下半身を作成
   */
  private createLowerBody(): Mesh {
    const width = 0.35;
    const height = 0.2; // 半分の長さに変更
    const depth = 0.20;

    const lowerBody = MeshBuilder.CreateBox(
      "character-lower-body",
      { width, height, depth },
      this.scene
    );

    // 位置: 接続点からの相対位置（親が接続点）
    // 下半身の上端が接続点に来るように、Y = -height / 2
    // X = 0 がデフォルト（オフセットはUIで調整）
    lowerBody.position = new Vector3(0, -height / 2, 0);

    // マテリアル（茶色いズボン）
    const material = new StandardMaterial("lower-body-material", this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    lowerBody.material = material;

    return lowerBody;
  }

  /**
   * 肩を作成
   */
  private createShoulder(side: "left" | "right"): Mesh {
    const shoulderRadius = 0.08;
    const upperBodyHeight = 0.4;

    const shoulder = MeshBuilder.CreateSphere(
      `character-shoulder-${side}`,
      { diameter: shoulderRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 上半身からの相対位置（親が上半身）
    const shoulderY = upperBodyHeight / 2 - upperBodyHeight / 6;
    const shoulderX = side === "left" ? -0.25 : 0.25;

    shoulder.position = new Vector3(shoulderX, shoulderY, 0);

    // マテリアル（青いシャツと同じ色）
    const material = new StandardMaterial(`shoulder-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.4, 0.8); // 青色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    shoulder.material = material;

    return shoulder;
  }

  /**
   * 上腕を作成
   */
  private createUpperArm(side: "left" | "right"): Mesh {
    const radius = 0.06;
    const height = 0.3; // 腕を半分に

    const upperArm = MeshBuilder.CreateCapsule(
      `character-upper-arm-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    // 位置: 肩からの相対位置（親が肩）
    upperArm.position = new Vector3(0, -height / 2, 0);

    // マテリアル（肌色）
    const material = new StandardMaterial(`upper-arm-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7); // 肌色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    upperArm.material = material;

    return upperArm;
  }

  /**
   * 肘を作成
   */
  private createElbow(side: "left" | "right"): Mesh {
    const elbowRadius = 0.06;
    const upperArmHeight = 0.3;

    const elbow = MeshBuilder.CreateSphere(
      `character-elbow-${side}`,
      { diameter: elbowRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 肩からの相対位置（親が肩）
    elbow.position = new Vector3(0, -upperArmHeight, 0);

    // マテリアル（肌色）
    const material = new StandardMaterial(`elbow-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7); // 肌色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    elbow.material = material;

    return elbow;
  }

  /**
   * 前腕を作成
   */
  private createForearm(side: "left" | "right"): Mesh {
    const radius = 0.05;
    const height = 0.3; // 腕を半分に

    const forearm = MeshBuilder.CreateCapsule(
      `character-forearm-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    // 位置: 肘からの相対位置（親が肘）
    forearm.position = new Vector3(0, -height / 2, 0);

    // マテリアル（肌色）
    const material = new StandardMaterial(`forearm-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7); // 肌色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    forearm.material = material;

    return forearm;
  }

  /**
   * 手のひらを作成
   */
  private createHand(side: "left" | "right"): Mesh {
    const handRadius = 0.07;
    const forearmHeight = 0.3;

    const hand = MeshBuilder.CreateSphere(
      `character-hand-${side}`,
      { diameter: handRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 前腕からの相対位置（親が前腕）
    hand.position = new Vector3(0, -forearmHeight / 2, 0);

    // マテリアル（肌色）
    const material = new StandardMaterial(`hand-${side}-material`, this.scene);
    material.diffuseColor = new Color3(1.0, 0.8, 0.7); // 肌色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    hand.material = material;

    return hand;
  }

  /**
   * 股関節を作成
   */
  private createHip(side: "left" | "right"): Mesh {
    const hipRadius = 0.09;
    const lowerBodyHeight = 0.2;

    const hip = MeshBuilder.CreateSphere(
      `character-hip-${side}`,
      { diameter: hipRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 下半身からの相対位置（親が下半身）
    const hipY = -lowerBodyHeight / 2;
    const hipX = side === "left" ? -0.1 : 0.1;

    hip.position = new Vector3(hipX, hipY, 0);

    // マテリアル（茶色いズボン）
    const material = new StandardMaterial(`hip-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    hip.material = material;

    return hip;
  }

  /**
   * 太ももを作成
   */
  private createThigh(side: "left" | "right"): Mesh {
    const radius = 0.08;
    const height = 0.4; // 足を半分に

    const thigh = MeshBuilder.CreateCapsule(
      `character-thigh-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    // 位置: 股関節からの相対位置（親が股関節）
    thigh.position = new Vector3(0, -height / 2, 0);

    // マテリアル（茶色いズボン）
    const material = new StandardMaterial(`thigh-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    thigh.material = material;

    return thigh;
  }

  /**
   * 膝を作成
   */
  private createKnee(side: "left" | "right"): Mesh {
    const kneeRadius = 0.08;
    const thighHeight = 0.4;

    const knee = MeshBuilder.CreateSphere(
      `character-knee-${side}`,
      { diameter: kneeRadius * 2, segments: 12 },
      this.scene
    );

    // 位置: 股関節からの相対位置（親が股関節）
    knee.position = new Vector3(0, -thighHeight, 0);

    // マテリアル（茶色いズボン）
    const material = new StandardMaterial(`knee-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    knee.material = material;

    return knee;
  }

  /**
   * すねを作成
   */
  private createShin(side: "left" | "right"): Mesh {
    const radius = 0.07;
    const height = 0.4; // 足を半分に

    const shin = MeshBuilder.CreateCapsule(
      `character-shin-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    // 位置: 膝からの相対位置（親が膝）
    shin.position = new Vector3(0, -height / 2, 0);

    // マテリアル（茶色いズボン）
    const material = new StandardMaterial(`shin-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.3, 0.2, 0.1); // 茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    shin.material = material;

    return shin;
  }

  /**
   * 足を作成
   */
  private createFoot(side: "left" | "right"): Mesh {
    const radius = 0.06;
    const height = 0.2; // 前後に長い
    const shinHeight = 0.4;

    const foot = MeshBuilder.CreateCapsule(
      `character-foot-${side}`,
      { radius, height, tessellation: 8 },
      this.scene
    );

    // カプセルを横向きに回転（Z軸方向に伸びるように）
    foot.rotation.x = Math.PI / 2;

    // 位置: すねからの相対位置（親がすね）
    foot.position = new Vector3(0, -shinHeight / 2 + radius, height / 4); // 少し前に出す

    // マテリアル（茶色い靴）
    const material = new StandardMaterial(`foot-${side}-material`, this.scene);
    material.diffuseColor = new Color3(0.2, 0.15, 0.1); // 濃い茶色
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    foot.material = material;

    return foot;
  }

  /**
   * 状態インジケーター球体を作成（頭のすぐ上に配置）
   */
  private createStateIndicator(): Mesh {
    const indicator = MeshBuilder.CreateSphere(
      "state-indicator",
      { diameter: 0.2, segments: 16 },
      this.scene
    );

    // 頭のすぐ上に配置
    const headHeight = 0.15; // 頭の半径
    const indicatorOffset = 0.25; // 頭からのオフセット
    indicator.position = new Vector3(0, headHeight + indicatorOffset, 0);

    // 初期状態の色を設定
    const material = new StandardMaterial("state-indicator-material", this.scene);
    const color = CHARACTER_STATE_COLORS[this.state];
    material.diffuseColor = new Color3(color.r, color.g, color.b);
    material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3); // 少し発光させる
    indicator.material = material;

    // 頭の子として設定
    indicator.parent = this.headMesh;

    return indicator;
  }

  /**
   * 視野コーン（円錐形）を作成
   */
  private createVisionCone(): Mesh {
    // 視野角の半分をラジアンに変換
    const halfAngleRad = (this.visionAngle / 2) * (Math.PI / 180);
    // 視野範囲と視野角から底面の半径を三角関数で計算
    const coneRadius = this.visionRange * Math.tan(halfAngleRad);

    // 円錐メッシュを作成
    const visionCone = MeshBuilder.CreateCylinder(
      "vision-cone",
      {
        diameterTop: coneRadius * 2, // 底面（広がった部分）の直径
        diameterBottom: 0, // 頂点（尖った部分）の直径
        height: this.visionRange, // 円錐の高さ = 視野範囲
        tessellation: 16, // 円錐の滑らかさ
      },
      this.scene
    );

    // デフォルトでは円錐はY軸方向（上向き）に作成される
    // X軸周りに90度回転して、Z軸方向（前方）を向くようにする
    visionCone.rotation = new Vector3(Math.PI / 2, 0, 0);

    // 位置を設定（目の位置から開始）
    // 目のY位置（頭の中心から少し上）
    const eyeY = 0.03;
    // 目のZ位置（頭の前面）
    const headSize = 0.20;
    const eyeZ = headSize / 2 - 0.01;

    visionCone.position = new Vector3(
      0, // X座標: 中央（両目の中間）
      eyeY, // Y座標: 目の高さ
      eyeZ + this.visionRange / 2 // Z座標: 頂点が目の位置に来るように中心を前方にずらす
    );

    // マテリアル（見た目）を設定
    const material = new StandardMaterial("vision-cone-material", this.scene);
    // 初期状態の色を設定
    const initialColor = CHARACTER_STATE_COLORS[this.state];
    material.diffuseColor = new Color3(initialColor.r, initialColor.g, initialColor.b);
    material.alpha = 0.15; // 透明度
    material.wireframe = false;
    visionCone.material = material;

    // 頭の子として設定（頭の向きに追従）
    visionCone.parent = this.headMesh;

    return visionCone;
  }

  /**
   * 足元の円を作成（8角形）
   */
  private createFootCircle(): LinesMesh {
    // 8つの線分を定義（各辺を個別の線として作成）
    const lines: Vector3[][] = [];

    for (let i = 0; i < 8; i++) {
      const angleStep = (Math.PI * 2) / 8;
      const angleOffset = Math.PI / 8; // 22.5度のオフセット（辺を正面に配置）

      // 現在の頂点
      const angle1 = -i * angleStep + angleOffset;
      const totalAngle1 = angle1 + this.rotation;
      const x1 = Math.sin(totalAngle1) * this.footCircleRadius;
      const z1 = Math.cos(totalAngle1) * this.footCircleRadius;

      // 次の頂点
      const angle2 = -(i + 1) * angleStep + angleOffset;
      const totalAngle2 = angle2 + this.rotation;
      const x2 = Math.sin(totalAngle2) * this.footCircleRadius;
      const z2 = Math.cos(totalAngle2) * this.footCircleRadius;

      // 線分を追加
      lines.push([
        new Vector3(x1, 0.01, z1),
        new Vector3(x2, 0.01, z2)
      ]);
    }

    // CreateLineSystemでLinesMeshを作成
    const octagon = MeshBuilder.CreateLineSystem(
      "foot-circle",
      { lines: lines, updatable: true },
      this.scene
    );

    // 色を設定（LinesMeshはcolorプロパティを持つ）
    octagon.color = new Color3(1.0, 1.0, 1.0);

    // 親を設定しない（シーンの直接の子として独立させる）
    octagon.parent = null;

    // ワールド座標で位置を設定
    octagon.position = new Vector3(
      this.position.x,
      0, // 頂点のY座標に0.01を入れたので、positionは0
      this.position.z
    );

    // 明示的に表示を有効化
    octagon.isVisible = true;

    return octagon;
  }

  /**
   * 足元の円の色分けセグメント（8つの三角形）を作成
   */
  private createFootCircleFaceSegments(): void {
    // 既存のセグメントを削除
    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];

    // 8色のカラーパレット
    const colors = [
      new Color3(1, 0, 0),     // 0: 赤
      new Color3(1, 0.5, 0),   // 1: オレンジ
      new Color3(1, 1, 0),     // 2: 黄色
      new Color3(0, 1, 0),     // 3: 緑
      new Color3(0, 1, 1),     // 4: シアン
      new Color3(0, 0, 1),     // 5: 青
      new Color3(0.5, 0, 1),   // 6: 紫
      new Color3(1, 0, 1),     // 7: マゼンタ
    ];

    // 8角形の各面を三角形として作成
    for (let i = 0; i < 8; i++) {
      // 三角形の3つの頂点
      const center = this.position.clone();
      center.y = 0.02; // 地面より少し上
      const vertex1 = this.getOctagonVertexPosition(i);
      vertex1.y = 0.02;
      const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
      vertex2.y = 0.02;

      // カスタムメッシュで三角形を作成
      const positions = [
        center.x, center.y, center.z,
        vertex1.x, vertex1.y, vertex1.z,
        vertex2.x, vertex2.y, vertex2.z,
      ];

      const indices = [0, 1, 2];
      const normals: number[] = [];

      // 法線を計算（上向き）
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      const triangle = new Mesh(`face-segment-${i}`, this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(triangle);

      // マテリアルを設定
      const material = new StandardMaterial(`face-material-${i}`, this.scene);
      material.diffuseColor = colors[i];
      material.emissiveColor = colors[i].scale(0.3); // 少し発光させる
      material.alpha = 0.6; // 半透明
      material.backFaceCulling = false; // 両面表示
      triangle.material = material;

      this.footCircleFaceSegments.push(triangle);
    }
  }

  /**
   * 3Dモデルを設定
   * @param model ロードした3Dモデル
   */
  public setModel(model: AbstractMesh): void {
    // 既存の身体パーツを非表示に
    this.headMesh.isVisible = false;
    this.leftEyeMesh.isVisible = false;
    this.rightEyeMesh.isVisible = false;
    this.mouthMesh.isVisible = false;
    this.upperBodyMesh.isVisible = false;
    this.lowerBodyMesh.isVisible = false;
    this.waistJointMesh.isVisible = false;
    this.leftShoulderMesh.isVisible = false;
    this.rightShoulderMesh.isVisible = false;
    this.leftUpperArmMesh.isVisible = false;
    this.rightUpperArmMesh.isVisible = false;
    this.leftElbowMesh.isVisible = false;
    this.rightElbowMesh.isVisible = false;
    this.leftForearmMesh.isVisible = false;
    this.rightForearmMesh.isVisible = false;
    this.leftHandMesh.isVisible = false;
    this.rightHandMesh.isVisible = false;
    this.leftHipMesh.isVisible = false;
    this.rightHipMesh.isVisible = false;
    this.leftThighMesh.isVisible = false;
    this.rightThighMesh.isVisible = false;
    this.leftKneeMesh.isVisible = false;
    this.rightKneeMesh.isVisible = false;
    this.leftShinMesh.isVisible = false;
    this.rightShinMesh.isVisible = false;
    this.leftFootMesh.isVisible = false;
    this.rightFootMesh.isVisible = false;

    // モデルをルートメッシュの子として追加
    this.model = model;
    this.model.parent = this.mesh;

    // モデルの位置をルートメッシュの中心に配置
    // （3Dモデルの原点がキャラクターの足元にある場合は調整が必要）
    this.model.position = new Vector3(0, -CHARACTER_CONFIG.height / 2, 0);
  }

  /**
   * 下半身ボックスメッシュを取得（オフセット調整用）
   */
  public getLowerBodyMesh(): Mesh {
    return this.lowerBodyMesh;
  }

  /**
   * 関節メッシュを取得
   */
  public getJoint(jointName: string): Mesh | null {
    switch (jointName) {
      case "head":
        return this.headMesh;
      case "upperBody":
        // 上半身を動かす = 腰関節を回転させる
        return this.waistJointMesh;
      case "lowerBody":
        // 下半身を動かす = 接続点を回転させる
        return this.lowerBodyConnectionMesh;
      case "leftShoulder":
        return this.leftShoulderMesh;
      case "rightShoulder":
        return this.rightShoulderMesh;
      case "leftElbow":
        return this.leftElbowMesh;
      case "rightElbow":
        return this.rightElbowMesh;
      case "leftHip":
        return this.leftHipMesh;
      case "rightHip":
        return this.rightHipMesh;
      case "leftKnee":
        return this.leftKneeMesh;
      case "rightKnee":
        return this.rightKneeMesh;
      default:
        return null;
    }
  }

  /**
   * 位置を取得（モーションオフセットを除いた基準位置）
   */
  public getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * 位置を設定
   */
  public setPosition(position: Vector3): void {
    // Y座標が地面より下にならないように制限
    const clampedPosition = new Vector3(
      position.x,
      Math.max(position.y, this.groundY),
      position.z
    );

    // モーションオフセットを加算してメッシュ位置を設定
    this.mesh.position = new Vector3(
      clampedPosition.x,
      clampedPosition.y + this.motionOffsetY,
      clampedPosition.z
    );
    this.position = clampedPosition;
  }

  /**
   * モーションによるY軸オフセットを設定
   */
  public setMotionOffsetY(offset: number): void {
    this.motionOffsetY = offset;
    // 現在位置を再設定してオフセットを反映
    this.setPosition(this.position);
  }

  /**
   * 向きを設定（ラジアン）
   */
  public setRotation(angle: number): void {
    this.rotation = angle;
    this.mesh.rotation.y = angle;
  }

  /**
   * 向きを取得（ラジアン）
   */
  public getRotation(): number {
    return this.rotation;
  }

  /**
   * 前方方向ベクトルを取得
   */
  public getForwardDirection(): Vector3 {
    return new Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );
  }

  /**
   * 右方向ベクトルを取得
   */
  public getRightDirection(): Vector3 {
    return new Vector3(
      Math.cos(this.rotation),
      0,
      -Math.sin(this.rotation)
    );
  }

  /**
   * 指定方向に移動
   * @param direction 移動方向ベクトル（正規化済み）
   * @param deltaTime フレーム時間（秒）
   */
  public move(direction: Vector3, deltaTime: number): void {
    // 速度を計算
    const speed = CHARACTER_CONFIG.speed;
    this.velocity = direction.scale(speed);

    // 新しい位置を計算（モーションオフセットを除いた基準位置を使用）
    const newPosition = this.position.add(this.velocity.scale(deltaTime));

    // 位置を更新
    this.setPosition(newPosition);
  }

  /**
   * ターゲット位置を向く
   * @param targetPosition ターゲット位置
   */
  public lookAt(targetPosition: Vector3): void {
    const direction = targetPosition.subtract(this.mesh.position);
    direction.y = 0; // Y軸は無視（水平面での回転のみ）

    if (direction.length() > 0.01) {
      const angle = Math.atan2(direction.x, direction.z);
      this.setRotation(angle);
    }
  }

  /**
   * スムーズに回転（補間）
   * @param targetRotation ターゲット回転（ラジアン）
   * @param deltaTime フレーム時間（秒）
   */
  public rotateTowards(targetRotation: number, deltaTime: number): void {
    const rotationSpeed = CHARACTER_CONFIG.rotationSpeed;

    // 角度差を計算（-π から π の範囲に正規化）
    let diff = targetRotation - this.rotation;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // 回転量を計算（速度を考慮）
    const maxRotation = rotationSpeed * deltaTime;
    const rotation = Math.max(-maxRotation, Math.min(maxRotation, diff));

    // 回転を適用
    this.setRotation(this.rotation + rotation);
  }

  /**
   * 更新
   * @param _deltaTime フレーム時間（秒）
   */
  public update(deltaTime: number): void {
    // モーションコントローラーを更新
    this.motionController.update(deltaTime);

    // 足元の円（8角形）の頂点位置を更新（キャラクターに追従・回転に対応）
    if (this.footCircle) {
      // LinesMesh用の線分配列を作成
      const lines: Vector3[][] = [];

      for (let i = 0; i < 8; i++) {
        const angleStep = (Math.PI * 2) / 8;
        const angleOffset = Math.PI / 8; // 22.5度のオフセット（辺を正面に配置）

        // 現在の頂点
        const angle1 = -i * angleStep + angleOffset;
        const totalAngle1 = angle1 + this.rotation;
        const x1 = Math.sin(totalAngle1) * this.footCircleRadius;
        const z1 = Math.cos(totalAngle1) * this.footCircleRadius;

        // 次の頂点
        const angle2 = -(i + 1) * angleStep + angleOffset;
        const totalAngle2 = angle2 + this.rotation;
        const x2 = Math.sin(totalAngle2) * this.footCircleRadius;
        const z2 = Math.cos(totalAngle2) * this.footCircleRadius;

        // 線分を追加
        lines.push([
          new Vector3(x1, 0.01, z1),
          new Vector3(x2, 0.01, z2)
        ]);
      }

      // LinesMeshを更新（CreateLineSystemで再作成）
      const _updatedOctagon = MeshBuilder.CreateLineSystem(
        "foot-circle",
        { lines: lines, instance: this.footCircle },
        this.scene
      );

      // 位置を更新
      this.footCircle.position.x = this.position.x;
      this.footCircle.position.z = this.position.z;
    }

    // 三角形セグメントの頂点を更新
    if (this.footCircleFaceSegments.length === 8) {
      for (let i = 0; i < 8; i++) {
        const center = this.position.clone();
        center.y = 0.02;
        const vertex1 = this.getOctagonVertexPosition(i);
        vertex1.y = 0.02;
        const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
        vertex2.y = 0.02;

        const positions = [
          center.x, center.y, center.z,
          vertex1.x, vertex1.y, vertex1.z,
          vertex2.x, vertex2.y, vertex2.z,
        ];

        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = [0, 1, 2];
        vertexData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0];
        vertexData.applyToMesh(this.footCircleFaceSegments[i]);
      }
    }
  }

  /**
   * モーションを再生
   */
  public playMotion(motion: MotionData, speed: number = 1.0, blendDuration: number = 0.3): void {
    this.motionController.play(motion, speed, blendDuration);
  }

  /**
   * 位置オフセットをスケールしてモーションを再生
   */
  public playMotionWithScale(motion: MotionData, positionScale: number, speed: number = 1.0, blendDuration: number = 0.3): void {
    this.motionController.playWithScale(motion, positionScale, speed, blendDuration);
  }

  /**
   * モーションを停止
   */
  public stopMotion(): void {
    this.motionController.stop();
  }

  /**
   * モーションを一時停止
   */
  public pauseMotion(): void {
    this.motionController.pause();
  }

  /**
   * モーションを再開
   */
  public resumeMotion(): void {
    this.motionController.resume();
  }

  /**
   * モーションの再生時間を直接設定
   * @param time 設定する時間（秒）
   */
  public setMotionTime(time: number): void {
    this.motionController.setCurrentTime(time);
  }

  /**
   * モーションの基準位置を更新（ジャンプ中の慣性移動などで使用）
   */
  public updateMotionBasePosition(position: Vector3): void {
    this.motionController.updateBasePosition({x: position.x, y: position.y, z: position.z});
  }

  /**
   * モーションが再生中かどうか
   */
  public isPlayingMotion(): boolean {
    return this.motionController.isPlaying();
  }

  /**
   * 現在再生中のモーション名を取得
   */
  public getCurrentMotionName(): string | null {
    return this.motionController.getCurrentMotionName();
  }

  /**
   * モーションコントローラーを取得
   */
  public getMotionController(): MotionController {
    return this.motionController;
  }

  /**
   * キャラクターの色を変更
   * @param r 赤 (0.0 - 1.0)
   * @param g 緑 (0.0 - 1.0)
   * @param b 青 (0.0 - 1.0)
   */
  public setColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);

    // 全ての身体パーツの色を変更
    const bodyParts = [
      this.headMesh,
      this.upperBodyMesh,
      this.lowerBodyMesh,
      this.leftShoulderMesh,
      this.rightShoulderMesh,
      this.leftUpperArmMesh,
      this.rightUpperArmMesh,
      this.leftElbowMesh,
      this.rightElbowMesh,
      this.leftForearmMesh,
      this.rightForearmMesh,
      this.leftHandMesh,
      this.rightHandMesh,
      this.leftHipMesh,
      this.rightHipMesh,
      this.leftThighMesh,
      this.rightThighMesh,
      this.leftKneeMesh,
      this.rightKneeMesh,
      this.leftShinMesh,
      this.rightShinMesh,
      this.leftFootMesh,
      this.rightFootMesh,
    ];

    bodyParts.forEach((mesh) => {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    });
  }

  /**
   * 胴体の色を変更（肩を含む）
   * @param r 赤 (0.0 - 1.0)
   * @param g 緑 (0.0 - 1.0)
   * @param b 青 (0.0 - 1.0)
   */
  public setBodyColor(r: number, g: number, b: number): void {
    const color = new Color3(r, g, b);

    // 胴体と肩パーツの色を変更
    const bodyParts = [
      this.upperBodyMesh,
      this.lowerBodyMesh,
      this.leftShoulderMesh,
      this.rightShoulderMesh,
    ];

    bodyParts.forEach((mesh) => {
      if (mesh.material && mesh.material instanceof StandardMaterial) {
        mesh.material.diffuseColor = color;
      }
    });
  }

  /**
   * 右手のひらの先端位置を取得（ワールド座標）
   */
  public getRightHandPosition(): Vector3 {
    // 右手のひらのワールド座標を取得
    const handWorldPosition = this.rightHandMesh.getAbsolutePosition();

    // 手のひらの半径分下に移動（手のひらの先端）
    const handRadius = 0.07;
    const handTipOffset = new Vector3(0, -handRadius, 0);

    // ワールド座標系での手のひらの先端位置を返す
    return handWorldPosition.add(handTipOffset);
  }

  /**
   * キャラクターの状態を取得
   */
  public getState(): CharacterState {
    return this.state;
  }

  /**
   * キャラクターの状態を設定
   */
  public setState(state: CharacterState): void {
    this.state = state;

    // 状態の色を取得
    const color = CHARACTER_STATE_COLORS[state];

    // 状態インジケーターの色を更新
    if (this.stateIndicator.material && this.stateIndicator.material instanceof StandardMaterial) {
      this.stateIndicator.material.diffuseColor = new Color3(color.r, color.g, color.b);
      this.stateIndicator.material.emissiveColor = new Color3(color.r * 0.3, color.g * 0.3, color.b * 0.3);
    }

    // 視野コーンの色も更新
    if (this.visionConeMesh.material && this.visionConeMesh.material instanceof StandardMaterial) {
      this.visionConeMesh.material.diffuseColor = new Color3(color.r, color.g, color.b);
    }

    // 足元の円の色を更新
    this.updateFootCircleColor();
  }

  /**
   * 足元の円の色を状態に応じて更新
   */
  private updateFootCircleColor(): void {
    if (!this.footCircle || !this.footCircle.material) {
      return;
    }

    const material = this.footCircle.material as StandardMaterial;

    // 状態に応じて色を設定
    switch (this.state) {
      case CharacterState.ON_BALL_PLAYER:
      case CharacterState.OFF_BALL_PLAYER:
        // 攻撃円（赤）
        material.diffuseColor = new Color3(1.0, 0.0, 0.0);
        material.emissiveColor = new Color3(0.3, 0.0, 0.0);
        break;
      case CharacterState.ON_BALL_DEFENDER:
      case CharacterState.OFF_BALL_DEFENDER:
        // 守備円（青）
        material.diffuseColor = new Color3(0.0, 0.5, 1.0);
        material.emissiveColor = new Color3(0.0, 0.15, 0.3);
        break;
      case CharacterState.BALL_LOST:
      default:
        // ボールロスト（白色で見やすく）
        material.diffuseColor = new Color3(1.0, 1.0, 1.0);
        material.emissiveColor = new Color3(0.3, 0.3, 0.3);
        break;
    }
  }

  /**
   * 足元の円の表示/非表示を設定
   */
  public setFootCircleVisible(visible: boolean): void {
    if (this.footCircle) {
      this.footCircle.isVisible = visible;
    }
  }

  /**
   * 足元の円のサイズを設定
   * @param radius 半径（メートル）
   */
  public setFootCircleRadius(radius: number): void {
    this.footCircleRadius = Math.max(0, radius); // 負の値にならないようにする

    // 既存の円を破棄して再作成
    if (this.footCircle) {
      const wasVisible = this.footCircle.isVisible;
      this.footCircle.dispose();
      this.footCircle = this.createFootCircle();
      this.footCircle.isVisible = wasVisible;
    }
  }

  /**
   * 足元の円の半径を取得
   * @returns 半径（メートル）
   */
  public getFootCircleRadius(): number {
    return this.footCircleRadius;
  }

  /**
   * 8角形の頂点位置を取得（ワールド座標）
   * @param vertexIndex 頂点番号（0-7）
   * @returns 頂点のワールド座標
   *
   * 頂点の配置（上から見て時計回り）：
   * 辺0がキャラクターの正面に来るように配置
   *    7   0
   *   /     \
   *  6       1
   *  |       |
   *  5       2
   *   \     /
   *    4   3
   */
  public getOctagonVertexPosition(vertexIndex: number): Vector3 {
    // 8角形の各頂点の角度を計算
    const angleStep = (Math.PI * 2) / 8; // 45度 = π/4
    const angleOffset = Math.PI / 8; // 22.5度のオフセット（辺を正面に配置するため）
    const angle = -vertexIndex * angleStep + angleOffset; // 時計回りなので負の値

    // キャラクターの向きを考慮
    const totalAngle = angle + this.rotation;

    // 頂点の位置を計算（XZ平面上）
    const x = this.position.x + Math.sin(totalAngle) * this.footCircleRadius;
    const z = this.position.z + Math.cos(totalAngle) * this.footCircleRadius;

    return new Vector3(x, this.position.y, z);
  }

  /**
   * 8角形の面（三角形）を色分けして表示（デバッグ用）
   */
  public showOctagonVertexNumbers(): void {
    // 既存のセグメントを削除
    this.hideOctagonVertexNumbers();

    // 8色のカラーパレット
    const colors = [
      new Color3(1, 0, 0),     // 0: 赤
      new Color3(1, 0.5, 0),   // 1: オレンジ
      new Color3(1, 1, 0),     // 2: 黄色
      new Color3(0, 1, 0),     // 3: 緑
      new Color3(0, 1, 1),     // 4: シアン
      new Color3(0, 0, 1),     // 5: 青
      new Color3(0.5, 0, 1),   // 6: 紫
      new Color3(1, 0, 1),     // 7: マゼンタ
    ];

    // 8角形の各面を三角形として作成
    for (let i = 0; i < 8; i++) {
      // 三角形の3つの頂点
      const center = this.position.clone();
      center.y = 0.02; // 地面より少し上
      const vertex1 = this.getOctagonVertexPosition(i);
      vertex1.y = 0.02;
      const vertex2 = this.getOctagonVertexPosition((i + 1) % 8);
      vertex2.y = 0.02;

      // カスタムメッシュで三角形を作成
      const positions = [
        center.x, center.y, center.z,
        vertex1.x, vertex1.y, vertex1.z,
        vertex2.x, vertex2.y, vertex2.z,
      ];

      const indices = [0, 1, 2];
      const normals: number[] = [];

      // 法線を計算（上向き）
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);
      normals.push(0, 1, 0);

      const triangle = new Mesh(`face-segment-${i}`, this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(triangle);

      // マテリアルを設定
      const material = new StandardMaterial(`face-material-${i}`, this.scene);
      material.diffuseColor = colors[i];
      material.emissiveColor = colors[i].scale(0.3); // 少し発光させる
      material.alpha = 0.6; // 半透明
      material.backFaceCulling = false; // 両面表示
      triangle.material = material;

      this.footCircleFaceSegments.push(triangle);
    }
  }

  /**
   * 8角形の頂点番号を非表示（デバッグ用）
   */
  public hideOctagonVertexNumbers(): void {
    for (const label of this.footCircleVertexLabels) {
      label.dispose();
    }
    this.footCircleVertexLabels = [];

    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];
  }

  /**
   * ボール保持位置に使用する面を設定
   * @param faceIndices 使用する面の番号配列（0-7）。最大5つまで。
   */
  public setBallHoldingFaces(faceIndices: number[]): void {
    if (faceIndices.length > 5) {
      console.warn('[Character] ボール保持位置は最大5箇所までです。最初の5つを使用します。');
      this.ballHoldingFaces = faceIndices.slice(0, 5);
    } else {
      this.ballHoldingFaces = faceIndices;
    }

    // インデックスをリセット
    this.currentBallHoldingIndex = 0;
  }

  /**
   * ボール保持位置に使用する面を取得
   * @returns 使用する面の番号配列
   */
  public getBallHoldingFaces(): number[] {
    return [...this.ballHoldingFaces];
  }

  /**
   * 現在のボール保持位置インデックスを設定
   * @param index ボール保持位置インデックス（0～使用面数-1）
   */
  public setBallHoldingPositionIndex(index: number): void {
    if (index < 0 || index >= this.ballHoldingFaces.length) {
      console.warn(`[Character] ボール保持位置インデックスは0～${this.ballHoldingFaces.length - 1}の範囲で指定してください。`);
      return;
    }
    this.currentBallHoldingIndex = index;
  }

  /**
   * 現在のボール保持位置インデックスを取得
   * @returns 現在のインデックス
   */
  public getBallHoldingPositionIndex(): number {
    return this.currentBallHoldingIndex;
  }

  /**
   * 現在のボール保持位置（ワールド座標）を取得
   * 8角形の面の中心位置を返す
   * @returns ボール保持位置のワールド座標
   */
  public getBallHoldingPosition(): Vector3 {
    if (this.ballHoldingFaces.length === 0) {
      console.warn('[Character] ボール保持位置が設定されていません。キャラクター位置を返します。');
      return this.position.clone();
    }

    // 現在選択されている面の番号を取得
    const faceIndex = this.ballHoldingFaces[this.currentBallHoldingIndex];

    // その面の頂点2つを取得
    const vertex1 = this.getOctagonVertexPosition(faceIndex);
    const vertex2 = this.getOctagonVertexPosition((faceIndex + 1) % 8);

    // 辺の中点を計算
    const edgeMidX = (vertex1.x + vertex2.x) / 2;
    const edgeMidZ = (vertex1.z + vertex2.z) / 2;

    // 辺の中点からキャラクター中心方向へのベクトル
    const towardsCenterX = this.position.x - edgeMidX;
    const towardsCenterZ = this.position.z - edgeMidZ;

    // ベクトルの長さを計算
    const vectorLength = Math.sqrt(towardsCenterX * towardsCenterX + towardsCenterZ * towardsCenterZ);

    // 単位ベクトル化
    const unitX = towardsCenterX / vectorLength;
    const unitZ = towardsCenterZ / vectorLength;

    // 辺から内側に0.3m入った位置（面の中心付近）
    const insetDistance = 0.3;
    const ballX = edgeMidX + unitX * insetDistance;
    const ballZ = edgeMidZ + unitZ * insetDistance;

    // ボールは腰関節の高さに配置（上半身と下半身の境界）
    const ballY = this.waistJointMesh.getAbsolutePosition().y;

    return new Vector3(ballX, ballY, ballZ);
  }

  /**
   * 足元の8角形を相手の方向に向けて、辺が一致するように回転させる
   * @param targetPosition 相手の位置
   */
  public alignFootCircleToTarget(targetPosition: Vector3): void {
    if (!this.footCircle) return;

    const myPosition = this.getPosition();

    // 相手への方向ベクトルを計算（XZ平面上）
    const direction = new Vector3(
      targetPosition.x - myPosition.x,
      0,
      targetPosition.z - myPosition.z
    );

    if (direction.length() < 0.01) return;

    // 相手への角度を計算（ラジアン）
    const angleToTarget = Math.atan2(direction.x, direction.z);

    // 8角形の辺の法線方向は n * 45度（n = 0, 1, 2, ..., 7）
    // ※辺が既に正面に配置されているため、オフセット不要
    // 最も近い辺の角度を見つける
    const segmentAngle = Math.PI / 4; // 45度（ラジアン）

    // 最も近い辺の角度を計算
    const nearestSegmentIndex = Math.round(angleToTarget / segmentAngle);
    const alignedAngle = nearestSegmentIndex * segmentAngle;

    // 8角形を回転（Y軸周りの回転を設定）
    // rotation.xは地面に平行にするための回転なので、rotation.zで調整
    this.footCircle.rotation.z = -alignedAngle;
  }

  /**
   * チームを設定
   */
  public setTeam(team: "ally" | "enemy"): void {
    this.team = team;
  }

  /**
   * 身長を設定（メートル単位）
   * @param heightInMeters 身長（メートル）
   */
  public setHeight(heightInMeters: number): void {
    // 身長を更新
    this.config.physical.height = heightInMeters;
    this.groundY = heightInMeters / 2;

    // 基準身長（1.8m）に対するスケール比率を計算
    const baseHeight = 1.8;
    const scale = heightInMeters / baseHeight;

    // ルートメッシュのスケーリングを更新（メッシュが存在する場合のみ）
    if (this.mesh) {
      this.mesh.scaling = new Vector3(scale, scale, scale);

      // キャラクターの位置を更新（新しいgroundYに合わせる）
      // 現在のXZ座標を保持し、Y座標だけを新しいgroundYに更新
      this.setPosition(new Vector3(this.position.x, this.groundY, this.position.z));

      console.log(`[Character] 身長を${heightInMeters}mに変更しました（スケール: ${scale}、新しいY座標: ${this.groundY}）`);
    } else {
      console.warn(`[Character] ルートメッシュが存在しないため、身長の変更をスキップしました`);
    }
  }

  /**
   * 視野コーンの表示/非表示を切り替え
   */
  public setVisionVisible(visible: boolean): void {
    this.visionConeMesh.isVisible = visible;
  }

  /**
   * 指定した位置が視野内にあるかを判定
   * @param targetPosition 対象の位置
   * @returns 視野内にある場合はtrue
   */
  public isInVision(targetPosition: Vector3): boolean {
    const characterPosition = this.getPosition();

    // 目の位置（視野の始点）
    const headOffsetY = 0.6; // 上半身の中心から頭までのオフセット
    const eyeY = 0.03; // 頭の中心から目までのオフセット
    const visionStartPosition = new Vector3(
      characterPosition.x,
      characterPosition.y + headOffsetY + eyeY,
      characterPosition.z
    );

    // 対象までの距離
    const distance = Vector3.Distance(visionStartPosition, targetPosition);

    // 視野範囲外ならfalse
    if (distance > this.visionRange) {
      return false;
    }

    // キャラクターの向き（正面方向）
    const forwardDirection = new Vector3(
      Math.sin(this.rotation),
      0,
      Math.cos(this.rotation)
    );

    // 対象への方向ベクトル
    const toTarget = targetPosition.subtract(visionStartPosition);
    toTarget.y = 0; // Y軸（高さ）は無視して水平面で判定
    toTarget.normalize();

    // 内積から角度を計算
    const dotProduct = Vector3.Dot(forwardDirection, toTarget);
    const angleToTarget = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // clampして安全に

    // 視野角の半分（ラジアン）
    const halfVisionAngleRad = (this.visionAngle / 2) * (Math.PI / 180);

    // 視野角内ならtrue
    return angleToTarget <= halfVisionAngleRad;
  }

  /**
   * 別のキャラクターが視野内にいるかを判定
   */
  public canSeeCharacter(otherCharacter: Character): boolean {
    return this.isInVision(otherCharacter.getPosition());
  }

  /**
   * ボールが視野内にあるかを判定
   */
  public canSeeBall(ballPosition: Vector3): boolean {
    return this.isInVision(ballPosition);
  }

  /**
   * 選手データを設定する
   */
  public setPlayerData(playerData: PlayerData, position: 'GK' | 'DF' | 'MF' | 'FW'): void {
    this.playerData = playerData;
    this.playerPosition = position;

    // 名前ラベルを作成
    this.createNameLabel();

    console.log(`[Character] 選手データを設定: ${playerData.basic.NAME} (${position})`);
  }

  /**
   * 名前ラベルを作成
   */
  private createNameLabel(): void {
    if (!this.playerData) return;

    // 既存のラベルがあれば削除
    if (this.nameLabel) {
      this.nameLabel.dispose();
      this.nameLabel = null;
    }

    // ラベル用の平面メッシュを作成（幅を広くして長い名前に対応）
    this.nameLabel = MeshBuilder.CreatePlane(
      `nameLabel_${this.playerData.basic.ID}`,
      { width: 5, height: 2.5 },
      this.scene
    );

    // ラベルを頭上に配置（キャラクターの子として設定）
    // 位置を低く調整（身長の65%の高さ）
    this.nameLabel.parent = this.mesh;
    this.nameLabel.position = new Vector3(0, this.config.physical.height * 0.65, 0);
    this.nameLabel.billboardMode = Mesh.BILLBOARDMODE_ALL; // 常にカメラの方を向く

    // GUI用のテクスチャを作成
    this.nameLabelTexture = AdvancedDynamicTexture.CreateForMesh(this.nameLabel);

    // テキストブロックを作成（名前のみ表示）
    const textBlock = new TextBlock();
    textBlock.text = this.playerData.basic.NAME;
    textBlock.color = "white";
    textBlock.fontSize = 50;
    textBlock.fontFamily = "Arial";
    textBlock.fontWeight = "bold";
    textBlock.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
    textBlock.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;

    // テキストに影（アウトライン）を追加
    textBlock.outlineWidth = 5;
    textBlock.outlineColor = "black";

    this.nameLabelTexture.addControl(textBlock);
  }

  /**
   * 無力化フラグを設定
   */
  public setDefeated(defeated: boolean): void {
    this.defeated = defeated;
  }

  /**
   * 無力化フラグを取得
   */
  public isDefeated(): boolean {
    return this.defeated;
  }

  /**
   * 現在のボール保持面で取れる行動を取得
   * @returns 利用可能な行動の配列
   */
  public getAvailableActions(): BallAction[] {
    if (this.ballHoldingFaces.length === 0) return [];

    const currentFace = this.ballHoldingFaces[this.currentBallHoldingIndex];
    const actions = FACE_ACTIONS[currentFace] || [];

    return actions;
  }

  /**
   * 現在のボール保持面の番号を取得
   * @returns 現在の面番号（0-7）
   */
  public getCurrentBallFace(): number {
    if (this.ballHoldingFaces.length === 0) return 0;
    return this.ballHoldingFaces[this.currentBallHoldingIndex];
  }

  /**
   * 指定した面にボールを移動する（ボールハンドリング用）
   * @param targetFace 目標の面番号（0-7）
   * @returns 移動成功したかどうか
   */
  public handleBallToFace(targetFace: number): boolean {
    // 面番号の妥当性チェック
    if (targetFace < 0 || targetFace > 7) {
      console.warn(`[Character] 無効な面番号: ${targetFace}`);
      return false;
    }

    // 目標の面が使用可能な面リストに含まれているかチェック
    const targetIndex = this.ballHoldingFaces.indexOf(targetFace);
    if (targetIndex === -1) {
      console.warn(`[Character] 面${targetFace}は使用可能な面リストに含まれていません`);
      return false;
    }

    // ボール保持位置を変更
    this.setBallHoldingPositionIndex(targetIndex);
    console.log(`[Character] ボールを面${targetFace}に移動しました`);
    return true;
  }

  /**
   * オフェンス戦術を設定
   * @param strategy オフェンス戦術
   */
  public setOffenseStrategy(strategy: OffenseStrategy): void {
    this.offenseStrategy = strategy;

    // 戦術に応じて使用する面を設定
    const faces = OFFENSE_STRATEGY_FACES[strategy];
    this.setBallHoldingFaces(faces);

    console.log(`[Character] オフェンス戦術を${strategy}に設定（使用面: ${faces.join(', ')}）`);
  }

  /**
   * 現在のオフェンス戦術を取得
   * @returns オフェンス戦術
   */
  public getOffenseStrategy(): OffenseStrategy {
    return this.offenseStrategy;
  }

  /**
   * ボール保持位置をランダムに変更（1on1バトル時）
   */
  public randomizeBallPosition(): void {
    if (this.ballHoldingFaces.length === 0) return;

    const randomIndex = Math.floor(Math.random() * this.ballHoldingFaces.length);
    this.setBallHoldingPositionIndex(randomIndex);
  }

  /**
   * 破棄
   */
  public dispose(): void {
    // 身体パーツを破棄
    this.headMesh.dispose();
    this.leftEyeMesh.dispose();
    this.rightEyeMesh.dispose();
    this.mouthMesh.dispose();
    this.upperBodyMesh.dispose();
    this.lowerBodyMesh.dispose();
    this.waistJointMesh.dispose();
    this.leftShoulderMesh.dispose();
    this.rightShoulderMesh.dispose();
    this.leftUpperArmMesh.dispose();
    this.rightUpperArmMesh.dispose();
    this.leftElbowMesh.dispose();
    this.rightElbowMesh.dispose();
    this.leftForearmMesh.dispose();
    this.rightForearmMesh.dispose();
    this.leftHandMesh.dispose();
    this.rightHandMesh.dispose();
    this.leftHipMesh.dispose();
    this.rightHipMesh.dispose();
    this.leftThighMesh.dispose();
    this.rightThighMesh.dispose();
    this.leftKneeMesh.dispose();
    this.rightKneeMesh.dispose();
    this.leftShinMesh.dispose();
    this.rightShinMesh.dispose();
    this.leftFootMesh.dispose();
    this.rightFootMesh.dispose();

    // 状態インジケーターを破棄
    this.stateIndicator.dispose();

    // 視野コーンを破棄
    this.visionConeMesh.dispose();

    // 足元の円を破棄
    if (this.footCircle) {
      this.footCircle.dispose();
      this.footCircle = null;
    }

    // 足元の円の色分けセグメントを破棄
    for (const segment of this.footCircleFaceSegments) {
      segment.dispose();
    }
    this.footCircleFaceSegments = [];

    // 頂点ラベルを破棄
    for (const label of this.footCircleVertexLabels) {
      label.dispose();
    }
    this.footCircleVertexLabels = [];

    // 名前ラベルを破棄
    if (this.nameLabel) {
      this.nameLabel.dispose();
      this.nameLabel = null;
    }
    if (this.nameLabelTexture) {
      this.nameLabelTexture.dispose();
      this.nameLabelTexture = null;
    }

    // 3Dモデルを破棄
    if (this.model) {
      this.model.dispose();
    }

    // ルートメッシュを破棄
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
