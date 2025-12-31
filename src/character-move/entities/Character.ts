import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh, AbstractMesh } from "@babylonjs/core";
import { CHARACTER_CONFIG } from "../config/gameConfig";
import { MotionController } from "../controllers/MotionController";
import { MotionData } from "../types/MotionTypes";

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

  public position: Vector3; // 位置
  public rotation: number = 0; // Y軸周りの回転（ラジアン）
  public velocity: Vector3 = Vector3.Zero(); // 速度ベクトル

  private groundY: number = CHARACTER_CONFIG.height / 2; // 地面のY座標

  // モーションコントローラー
  private motionController: MotionController;

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.position = position.clone();

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
   * 位置を取得
   */
  public getPosition(): Vector3 {
    return this.mesh.position.clone();
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

    this.mesh.position = clampedPosition;
    this.position = clampedPosition;
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

    // 新しい位置を計算
    const newPosition = this.mesh.position.add(this.velocity.scale(deltaTime));

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
