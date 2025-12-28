import {Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Mesh} from "@babylonjs/core";

/**
 * 手のポーズタイプ
 */
export enum HandPose {
  NEUTRAL = "neutral", // 通常（両サイド）
  DRIBBLE = "dribble", // ドリブル（片手前）
  DEFEND = "defend", // ディフェンス（両手前に広げる）
  SHOOT = "shoot", // シュート（両手上）
  BLOCK = "block", // ブロック（両手を真上に伸ばす）
  LAYUP = "layup", // レイアップ（片手を高く上げる）
  BALL_KEEP_LEFT = "ball_keep_left", // ボールキープ（左側）
  BALL_KEEP_RIGHT = "ball_keep_right", // ボールキープ（右側）
}

/**
 * プレイヤーの腕を管理するクラス
 */
export class Arm {
  public mesh: Mesh; // 腕のメッシュ（衝突判定用にpublic）
  private side: "left" | "right";
  private scene: Scene;
  private currentPose: HandPose = HandPose.NEUTRAL;

  constructor(scene: Scene, side: "left" | "right", playerId: number, color: Color3) {
    this.scene = scene;
    this.side = side;
    this.mesh = this.createArmMesh(playerId, color);
  }

  /**
   * 腕のメッシュを作成（1本の長いカプセル）
   */
  private createArmMesh(playerId: number, color: Color3): Mesh {
    const arm = MeshBuilder.CreateCapsule(
      `arm-${this.side}-${playerId}`,
      {
        radius: 0.12,
        height: 1.0, // 長い腕（100cm）
        tessellation: 8,
      },
      this.scene,
    );

    // 肩の位置（体に親子付け）
    const xOffset = this.side === "left" ? -0.4 : 0.4;
    arm.position = new Vector3(xOffset, 0, 0);

    // 腕の上端（肩）を回転の中心に設定
    const armLength = 1.0; // 腕の長さ
    arm.setPivotPoint(new Vector3(0, armLength / 2, 0));

    // 初期姿勢：真下に降ろしておく（NEUTRAL）
    arm.rotation = new Vector3(0, 0, 0);

    // マテリアル（体と同じ色）
    const material = new StandardMaterial(`arm-material-${this.side}-${playerId}`, this.scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    arm.material = material;

    return arm;
  }

  /**
   * ポーズを設定（腕の角度を制御）
   */
  setPose(pose: HandPose): void {
    this.currentPose = pose;

    // 一旦すべてのポーズを通常位置（真下）に統一
    switch (pose) {
      case HandPose.NEUTRAL:
        // 通常：真下に降ろす
        this.mesh.rotation = new Vector3(0, 0, 0);
        break;

      case HandPose.DRIBBLE:
        // ドリブル：右手を前に出す、左手は真下
        if (this.side === "left") {
          this.mesh.rotation = new Vector3(0, 0, 0); // 左手は真下
        } else {
          // this.mesh.rotation = new Vector3(Math.PI / -3, 0, 0); // 右手は前方60度
          this.mesh.rotation = new Vector3(0, 0, 0);
        }
        break;

      case HandPose.DEFEND:
        // ディフェンス：両手を前に伸ばしてスティールを狙う
        // this.mesh.rotation = new Vector3(Math.PI / -4, 0, 0); // 前方45度
        this.mesh.rotation = new Vector3(0, 0, 0); // 左手は真下
        break;

      case HandPose.SHOOT:
        // 一旦通常位置
        if (this.side === "left") {
          this.mesh.rotation = new Vector3(0, 0, 0); // 左手は真下
        } else {
          this.mesh.rotation = new Vector3(Math.PI / -1.5, 0, 0); // 右手は前方60度
        }
        break;

      case HandPose.BLOCK:
        // ブロック：両手を真上に完全に伸ばす（90度）
        this.mesh.rotation = new Vector3(-Math.PI / 1, 0, 0); // 真上90度
        break;

      case HandPose.LAYUP:
        // レイアップ：右手を高く上げる、左手は横に広げる
        if (this.side === "left") {
          this.mesh.rotation = new Vector3(0, Math.PI / 2, 0); // 左手は横に広げる
        } else {
          this.mesh.rotation = new Vector3(-Math.PI / 1, 0, 0); // 右手を高く上げる（約150度）
        }
        break;

      case HandPose.BALL_KEEP_LEFT:
        // ボールキープ（左側）：左手でボールを守り、右手は体の前
        if (this.side === "left") {
          this.mesh.rotation = new Vector3(Math.PI / -6, Math.PI / 3, 0); // 左手：やや前方、横に広げる
        } else {
          this.mesh.rotation = new Vector3(Math.PI / -4, 0, 0); // 右手：前方45度で守る
        }
        break;

      case HandPose.BALL_KEEP_RIGHT:
        // ボールキープ（右側）：右手でボールを守り、左手は体の前
        if (this.side === "left") {
          this.mesh.rotation = new Vector3(Math.PI / -4, 0, 0); // 左手：前方45度で守る
        } else {
          this.mesh.rotation = new Vector3(Math.PI / -6, -Math.PI / 3, 0); // 右手：やや前方、横に広げる
        }
        break;
    }
  }

  /**
   * 現在のポーズを取得
   */
  getPose(): HandPose {
    return this.currentPose;
  }

  /**
   * 腕の先端位置を取得（ワールド座標）
   */
  getTipPosition(): Vector3 {
    // ワールド変換行列を使って正確な先端位置を計算
    const worldMatrix = this.mesh.computeWorldMatrix(true);

    // 腕の長さ
    const armLength = 1.0;

    // ローカル座標での先端位置
    // ピボットポイントが(0, 0.5, 0)なので、先端は(0, -0.5, 0)
    const localTipPosition = new Vector3(0, -armLength / 2, 0);

    // ローカル座標をワールド座標に変換
    const worldTipPosition = Vector3.TransformCoordinates(localTipPosition, worldMatrix);

    return worldTipPosition;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
  }
}
