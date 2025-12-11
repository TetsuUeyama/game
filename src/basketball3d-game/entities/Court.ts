import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  Mesh,
} from '@babylonjs/core';
import { COURT_CONFIG } from '../config/gameConfig';

/**
 * 3Dバスケットボールコートクラス
 */
export class Court {
  private scene: Scene;
  private floorMesh: Mesh;
  private lines: Mesh[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    this.floorMesh = this.createFloor();
    this.createLines();
    this.createGoals();
  }

  /**
   * 床を作成
   */
  private createFloor(): Mesh {
    const floor = MeshBuilder.CreateGround(
      'court-floor',
      {
        width: COURT_CONFIG.width,
        height: COURT_CONFIG.length,
      },
      this.scene
    );

    const material = new StandardMaterial('floor-material', this.scene);
    material.diffuseColor = Color3.FromHexString(COURT_CONFIG.floorColor);
    material.specularColor = new Color3(0.1, 0.1, 0.1);
    floor.material = material;

    return floor;
  }

  /**
   * コートのラインを作成
   */
  private createLines(): void {
    const lineHeight = 0.01; // ラインの高さ（床から少し浮かせる）
    const lineColor = Color3.FromHexString(COURT_CONFIG.lineColor);

    // アウトライン（コートの外枠）
    this.createRectangleLine(
      0,
      0,
      COURT_CONFIG.length,
      COURT_CONFIG.width,
      lineHeight,
      lineColor
    );

    // ハーフコートライン
    this.createLine(
      { x: -COURT_CONFIG.width / 2, y: lineHeight, z: 0 },
      { x: COURT_CONFIG.width / 2, y: lineHeight, z: 0 },
      lineColor
    );

    // センターサークル
    this.createCircleLine(0, 0, 1.8, lineHeight, lineColor);
  }

  /**
   * 矩形のラインを作成
   */
  private createRectangleLine(
    centerX: number,
    centerZ: number,
    length: number,
    width: number,
    height: number,
    color: Color3
  ): void {
    const halfLength = length / 2;
    const halfWidth = width / 2;

    // 4つの辺
    const corners = [
      { x: -halfWidth, z: -halfLength },
      { x: halfWidth, z: -halfLength },
      { x: halfWidth, z: halfLength },
      { x: -halfWidth, z: halfLength },
    ];

    for (let i = 0; i < corners.length; i++) {
      const start = corners[i];
      const end = corners[(i + 1) % corners.length];

      this.createLine(
        {
          x: centerX + start.x,
          y: height,
          z: centerZ + start.z,
        },
        {
          x: centerX + end.x,
          y: height,
          z: centerZ + end.z,
        },
        color
      );
    }
  }

  /**
   * 直線を作成
   */
  private createLine(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    color: Color3
  ): void {
    const line = MeshBuilder.CreateTube(
      'line',
      {
        path: [
          new Vector3(start.x, start.y, start.z),
          new Vector3(end.x, end.y, end.z),
        ],
        radius: COURT_CONFIG.lineWidth,
        cap: Mesh.CAP_ALL,
      },
      this.scene
    );

    const material = new StandardMaterial('line-material', this.scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.2);
    line.material = material;

    this.lines.push(line);
  }

  /**
   * 円形のラインを作成
   */
  private createCircleLine(
    centerX: number,
    centerZ: number,
    radius: number,
    height: number,
    color: Color3
  ): void {
    const torus = MeshBuilder.CreateTorus(
      'circle-line',
      {
        diameter: radius * 2,
        thickness: COURT_CONFIG.lineWidth * 2,
        tessellation: 32,
      },
      this.scene
    );

    torus.position = new Vector3(centerX, height, centerZ);
    // トーラスはデフォルトで水平（XZ平面に平行）なので回転不要

    const material = new StandardMaterial('circle-line-material', this.scene);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.2);
    torus.material = material;

    this.lines.push(torus);
  }

  /**
   * ゴール（リムとバックボード）を作成
   */
  private createGoals(): void {
    // 左側のゴール（プレイヤー1）
    this.createGoal(
      -COURT_CONFIG.length / 2 + COURT_CONFIG.backboardDistance,
      'left'
    );

    // 右側のゴール（プレイヤー2）
    this.createGoal(
      COURT_CONFIG.length / 2 - COURT_CONFIG.backboardDistance,
      'right'
    );
  }

  /**
   * 1つのゴールを作成
   */
  private createGoal(zPosition: number, side: 'left' | 'right'): void {
    // バックボード
    const backboard = MeshBuilder.CreateBox(
      `backboard-${side}`,
      {
        width: COURT_CONFIG.backboardWidth,
        height: COURT_CONFIG.backboardHeight,
        depth: 0.05,
      },
      this.scene
    );

    backboard.position = new Vector3(
      0,
      COURT_CONFIG.rimHeight + COURT_CONFIG.backboardHeight / 2,
      zPosition
    );

    const backboardMaterial = new StandardMaterial(
      `backboard-material-${side}`,
      this.scene
    );
    backboardMaterial.diffuseColor = new Color3(1, 1, 1);
    backboardMaterial.alpha = 0.5;
    backboard.material = backboardMaterial;

    // リム（輪）
    const rim = MeshBuilder.CreateTorus(
      `rim-${side}`,
      {
        diameter: COURT_CONFIG.rimDiameter,
        thickness: 0.02,
        tessellation: 32,
      },
      this.scene
    );

    rim.position = new Vector3(
      0,
      COURT_CONFIG.rimHeight,
      zPosition + (side === 'left' ? 0.15 : -0.15)
    );
    // リムは水平（地面に平行）なので回転不要

    const rimMaterial = new StandardMaterial(`rim-material-${side}`, this.scene);
    rimMaterial.diffuseColor = new Color3(1, 0.4, 0);
    rimMaterial.emissiveColor = new Color3(0.2, 0.08, 0);
    rim.material = rimMaterial;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.floorMesh.dispose();
    this.lines.forEach((line) => line.dispose());
    this.lines = [];
  }
}
