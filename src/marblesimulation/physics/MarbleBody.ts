import {
  Scene,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMaterialCombineMode,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
} from "@babylonjs/core";
import {
  MarbleParams,
  GroundParams,
  SimulationConfig,
  WeightPreset,
  CourseType,
} from "../types/MarbleConfig";

/**
 * 個別ビー玉の情報
 */
export interface MarbleEntry {
  mesh: Mesh;
  aggregate: PhysicsAggregate;
  preset: WeightPreset;
  laneX: number;
  startZ: number;
}

/**
 * ビー玉・地面・壁・コース装飾の生成・管理
 */
export class MarbleBody {
  private scene: Scene;
  private marbles: MarbleEntry[] = [];
  private groundMesh!: Mesh;
  private groundAggregate!: PhysicsAggregate;
  private wallMeshes: Mesh[] = [];
  private wallAggregates: PhysicsAggregate[] = [];
  private decorMeshes: Mesh[] = [];
  private laneSpacing = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  // ─── ビー玉生成 ───

  /** 直線・反復横跳び: 全ビー玉横並び z=0 */
  private createMarblesParallel(baseParams: MarbleParams, presets: WeightPreset[]): MarbleEntry[] {
    this.laneSpacing = baseParams.radius * 6;
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    const startX = -totalWidth / 2;

    for (let i = 0; i < presets.length; i++) {
      const xPos = startX + i * this.laneSpacing;
      this.marbles.push(this.buildMarble(baseParams, presets[i], xPos, 0));
    }
    return this.marbles;
  }

  /** 衝突実験: ペアで対向配置 */
  private createMarblesCollision(baseParams: MarbleParams, presets: WeightPreset[], startDistance: number): MarbleEntry[] {
    const pairCount = Math.floor(presets.length / 2);
    this.laneSpacing = baseParams.radius * 6;
    const totalWidth = (pairCount - 1) * this.laneSpacing;
    const startX = -totalWidth / 2;

    for (let p = 0; p < pairCount; p++) {
      const xPos = startX + p * this.laneSpacing;
      // 手前側 (z=0)
      this.marbles.push(this.buildMarble(baseParams, presets[p * 2], xPos, 0));
      // 奥側 (z=startDistance)
      this.marbles.push(this.buildMarble(baseParams, presets[p * 2 + 1], xPos, startDistance));
    }
    return this.marbles;
  }

  private buildMarble(baseParams: MarbleParams, preset: WeightPreset, x: number, z: number): MarbleEntry {
    const mesh = MeshBuilder.CreateSphere(
      `marble_${preset.label}`,
      { diameter: baseParams.radius * 2, segments: 32 },
      this.scene
    );
    mesh.position = new Vector3(x, baseParams.radius + 0.05, z);

    const mat = new StandardMaterial(`marbleMat_${preset.label}`, this.scene);
    mat.diffuseColor = new Color3(preset.color[0], preset.color[1], preset.color[2]);
    mat.specularColor = new Color3(0.8, 0.8, 0.8);
    mesh.material = mat;

    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      { mass: preset.mass, restitution: baseParams.restitution, friction: baseParams.friction },
      this.scene
    );
    aggregate.shape.material = {
      restitution: baseParams.restitution,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: baseParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
    aggregate.body.setLinearDamping(baseParams.linearDamping);
    aggregate.body.setAngularDamping(baseParams.angularDamping);

    return { mesh, aggregate, preset, laneX: x, startZ: z };
  }

  // ─── 地面・壁 ───

  createGround(groundParams: GroundParams, size: number): void {
    this.groundMesh = MeshBuilder.CreateGround("ground", { width: size, height: size }, this.scene);
    const mat = new StandardMaterial("groundMat", this.scene);
    mat.diffuseColor = new Color3(0.35, 0.35, 0.4);
    this.groundMesh.material = mat;

    this.groundAggregate = new PhysicsAggregate(
      this.groundMesh, PhysicsShapeType.BOX,
      { mass: 0, restitution: groundParams.restitution, friction: groundParams.friction },
      this.scene
    );
    this.groundAggregate.shape.material = {
      restitution: groundParams.restitution,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: groundParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
  }

  createWalls(size: number, height: number, restitution: number): void {
    const halfSize = size / 2;
    const wallThickness = 0.5;
    const wallDefs = [
      { name: "wallN", w: size, d: wallThickness, x: 0, z: halfSize },
      { name: "wallS", w: size, d: wallThickness, x: 0, z: -halfSize },
      { name: "wallE", w: wallThickness, d: size, x: halfSize, z: 0 },
      { name: "wallW", w: wallThickness, d: size, x: -halfSize, z: 0 },
    ];
    for (const def of wallDefs) {
      const mesh = MeshBuilder.CreateBox(def.name, { width: def.w, height: height, depth: def.d }, this.scene);
      mesh.position = new Vector3(def.x, height / 2, def.z);
      const mat = new StandardMaterial(def.name + "Mat", this.scene);
      mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
      mat.alpha = 0.15;
      mesh.material = mat;

      const agg = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, restitution, friction: 0.2 }, this.scene);
      agg.shape.material = { restitution, restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY, friction: 0.2, frictionCombine: PhysicsMaterialCombineMode.MULTIPLY };
      this.wallMeshes.push(mesh);
      this.wallAggregates.push(agg);
    }
  }

  // ─── コース装飾 ───

  /** 直線コース: スタートライン + ゴールライン + レーン区切り */
  private decorateStraight(presets: WeightPreset[], goalDistance: number): void {
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    const trackWidth = totalWidth + this.laneSpacing;
    const startX = -totalWidth / 2;

    this.addLine("startLine", trackWidth, 0, new Color3(1, 1, 1));
    this.addLine("goalLine", trackWidth, goalDistance, new Color3(1, 0.9, 0.2));
    this.addLaneDashes(presets.length, startX, 0, goalDistance + 5);
  }

  /** 反復横跳びコース: 左右境界ライン + 中央ライン */
  private decorateLateralShuttle(presets: WeightPreset[], shuttleWidth: number): void {
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    const startX = -totalWidth / 2;
    const lineDepth = 4;
    const shuttleZ = 5; // ビー玉のZ位置

    const leftMat = new StandardMaterial("leftLineMat", this.scene);
    leftMat.diffuseColor = new Color3(1, 0.4, 0.4);
    const rightMat = new StandardMaterial("rightLineMat", this.scene);
    rightMat.diffuseColor = new Color3(0.4, 0.4, 1);
    const centerMat = new StandardMaterial("centerLineMat", this.scene);
    centerMat.diffuseColor = new Color3(1, 1, 1);
    centerMat.alpha = 0.5;

    for (let i = 0; i < presets.length; i++) {
      const lx = startX + i * this.laneSpacing;

      // 左ライン（赤）
      const leftLine = MeshBuilder.CreateBox(`leftLine_${i}`, { width: 0.1, height: 0.02, depth: lineDepth }, this.scene);
      leftLine.position = new Vector3(lx - shuttleWidth, 0.01, shuttleZ);
      leftLine.material = leftMat;
      this.decorMeshes.push(leftLine);

      // 右ライン（青）
      const rightLine = MeshBuilder.CreateBox(`rightLine_${i}`, { width: 0.1, height: 0.02, depth: lineDepth }, this.scene);
      rightLine.position = new Vector3(lx + shuttleWidth, 0.01, shuttleZ);
      rightLine.material = rightMat;
      this.decorMeshes.push(rightLine);

      // 中央ライン（白半透明）
      const centerLine = MeshBuilder.CreateBox(`centerLine_${i}`, { width: 0.06, height: 0.02, depth: lineDepth }, this.scene);
      centerLine.position = new Vector3(lx, 0.01, shuttleZ);
      centerLine.material = centerMat;
      this.decorMeshes.push(centerLine);
    }
  }

  /** 衝突実験コース: スタートライン×2 + 衝突ポイント + レーン区切り */
  private decorateCollision(presets: WeightPreset[], startDistance: number): void {
    const pairCount = Math.floor(presets.length / 2);
    const totalWidth = (pairCount - 1) * this.laneSpacing;
    const trackWidth = totalWidth + this.laneSpacing;
    const startX = -totalWidth / 2;
    const midZ = startDistance / 2;

    // スタートライン手前（白）
    this.addLine("startLineA", trackWidth, 0, new Color3(1, 1, 1));
    // スタートライン奥（白）
    this.addLine("startLineB", trackWidth, startDistance, new Color3(1, 1, 1));
    // 衝突ポイント（赤）
    this.addLine("collisionLine", trackWidth, midZ, new Color3(1, 0.2, 0.2));

    this.addLaneDashes(pairCount, startX, -2, startDistance + 2);
  }

  private addLine(name: string, width: number, z: number, color: Color3): void {
    const line = MeshBuilder.CreateBox(name, { width, height: 0.02, depth: 0.15 }, this.scene);
    line.position = new Vector3(0, 0.01, z);
    const mat = new StandardMaterial(name + "Mat", this.scene);
    mat.diffuseColor = color;
    line.material = mat;
    this.decorMeshes.push(line);
  }

  private addLaneDashes(laneCount: number, startX: number, zFrom: number, zTo: number): void {
    const dashMat = new StandardMaterial("laneDashMat", this.scene);
    dashMat.diffuseColor = new Color3(0.55, 0.55, 0.55);
    dashMat.alpha = 0.3;

    for (let i = 0; i <= laneCount; i++) {
      const lx = startX + (i - 0.5) * this.laneSpacing;
      for (let z = zFrom; z < zTo; z += 2) {
        const dash = MeshBuilder.CreateBox(`lane_${i}_${z}`, { width: 0.03, height: 0.02, depth: 0.8 }, this.scene);
        dash.position = new Vector3(lx, 0.01, z + 0.5);
        dash.material = dashMat;
        this.decorMeshes.push(dash);
      }
    }
  }

  // ─── 統合 ───

  createAll(config: SimulationConfig): MarbleEntry[] {
    this.createGround(config.ground, config.groundSize);
    this.createWalls(config.groundSize, config.wallHeight, config.marble.restitution);

    switch (config.courseType) {
      case CourseType.STRAIGHT:
        this.createMarblesParallel(config.marble, config.weightPresets);
        this.decorateStraight(config.weightPresets, config.straight.goalDistance);
        break;
      case CourseType.LATERAL_SHUTTLE:
        this.createMarblesParallel(config.marble, config.weightPresets);
        this.decorateLateralShuttle(config.weightPresets, config.lateralShuttle.shuttleWidth);
        break;
      case CourseType.COLLISION:
        this.createMarblesCollision(config.marble, config.weightPresets, config.collision.startDistance);
        this.decorateCollision(config.weightPresets, config.collision.startDistance);
        break;
    }
    return this.marbles;
  }

  getMarbles(): MarbleEntry[] {
    return this.marbles;
  }

  /** 全ビー玉をスタート位置にリセット */
  resetMarbles(baseParams: MarbleParams): void {
    for (const entry of this.marbles) {
      entry.aggregate.body.setLinearVelocity(Vector3.Zero());
      entry.aggregate.body.setAngularVelocity(Vector3.Zero());
      entry.mesh.position.set(entry.laneX, baseParams.radius + 0.05, entry.startZ);
      entry.aggregate.body.disablePreStep = false;
    }
    setTimeout(() => {
      for (const entry of this.marbles) {
        entry.aggregate.body.disablePreStep = true;
      }
    }, 100);
  }

  dispose(): void {
    for (const entry of this.marbles) {
      entry.aggregate.dispose();
      entry.mesh.dispose();
    }
    this.marbles = [];
    for (const agg of this.wallAggregates) agg.dispose();
    for (const mesh of this.wallMeshes) mesh.dispose();
    for (const mesh of this.decorMeshes) mesh.dispose();
    this.decorMeshes = [];
    this.groundAggregate?.dispose();
    this.groundMesh?.dispose();
  }
}
