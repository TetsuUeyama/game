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
 *
 * - mesh: 物理判定を持つメッシュ（球 or 箱）
 * - innerMesh: 箱モードのとき内部に表示される球体（視覚のみ）
 * - legs: 脚メッシュの配列（バランスアニメーション用）
 *   順序: [(-1,-1), (-1,+1), (+1,-1), (+1,+1)] の角位置に対応
 */
export interface MarbleEntry {
  mesh: Mesh;
  innerMesh: Mesh | null;
  hips: Mesh | null;
  legs: Mesh[];
  arms: Mesh[];
  aggregate: PhysicsAggregate;
  preset: WeightPreset;
  laneX: number;
  startZ: number;
  materials?: StandardMaterial[];
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

  /** ランダム移動: フィールド中央付近にランダム配置（ヒューマノイドビー玉） */
  private createMarblesRandom(baseParams: MarbleParams, presets: WeightPreset[], areaSize: number): MarbleEntry[] {
    const half = areaSize / 2;
    const spacing = baseParams.radius * 3;
    for (let i = 0; i < presets.length; i++) {
      const cols = Math.ceil(Math.sqrt(presets.length));
      const row = Math.floor(i / cols);
      const col = i % cols;
      const gridX = -half + (col + 0.5) * (areaSize / cols);
      const gridZ = -half + (row + 0.5) * (areaSize / cols);
      const jitterX = (Math.random() - 0.5) * spacing;
      const jitterZ = (Math.random() - 0.5) * spacing;
      this.marbles.push(this.buildHumanoidMarble(baseParams, presets[i], gridX + jitterX, gridZ + jitterZ));
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
    aggregate.body.setCollisionCallbackEnabled(true);

    return { mesh, innerMesh: null, hips: null, legs: [], arms: [], aggregate, preset, laneX: x, startZ: z, materials: undefined };
  }

  /** マテリアル生成ヘルパー */
  private makeMat(name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.diffuseColor = color;
    return mat;
  }

  /**
   * ヒューマノイドビー玉を生成
   *
   * 構造（下から上）:
   *   地面 → ビー玉球体 → 脚(2本) → 不可視BOX(物理ボディ) → 胴体・頭・腕
   *
   * 不可視BOXが物理判定を持ち、バネ力でY高さを維持する。
   */
  private buildHumanoidMarble(baseParams: MarbleParams, preset: WeightPreset, x: number, z: number): MarbleEntry {
    const boxSize = baseParams.radius * 2.4;
    const legHeight = baseParams.radius * 2;
    const boxCenterY = legHeight * 1.07 + boxSize / 2 + 0.05;

    const presetColor = new Color3(preset.color[0], preset.color[1], preset.color[2]);

    // ── マテリアル群 ──
    const skinMat = this.makeMat(`skin_${preset.label}`, new Color3(0.9, 0.75, 0.6));
    const shirtMat = this.makeMat(`shirt_${preset.label}`, presetColor);
    const pantsMat = this.makeMat(`pants_${preset.label}`, new Color3(
      preset.color[0] * 0.5, preset.color[1] * 0.5, preset.color[2] * 0.5,
    ));
    const shoesMat = this.makeMat(`shoes_${preset.label}`, new Color3(0.3, 0.2, 0.15));
    const sphereMat = this.makeMat(`sphere_${preset.label}`, presetColor);
    sphereMat.specularColor = new Color3(0.8, 0.8, 0.8);
    sphereMat.alpha = 0.6;

    const allMats = [skinMat, shirtMat, pantsMat, shoesMat, sphereMat];

    // ── 不可視BOXメッシュ（物理ボディ） ──
    const boxMesh = MeshBuilder.CreateBox(
      `box_${preset.label}`,
      { size: boxSize },
      this.scene,
    );
    boxMesh.position = new Vector3(x, boxCenterY, z);
    boxMesh.isVisible = false;

    // ── HIPS ──
    const hipsW = boxSize * 0.48;
    const hipsH = boxSize * 0.15;
    const hipsD = boxSize * 0.30;
    const hips = MeshBuilder.CreateBox(
      `hips_${preset.label}`,
      { width: hipsW, height: hipsH, depth: hipsD },
      this.scene,
    );
    hips.position.y = -boxSize * 0.35;
    hips.material = pantsMat;
    hips.parent = boxMesh;

    // ── TORSO ──
    const torsoW = boxSize * 0.52;
    const torsoH = boxSize * 0.85;
    const torsoD = boxSize * 0.33;
    const torso = MeshBuilder.CreateBox(
      `torso_${preset.label}`,
      { width: torsoW, height: torsoH, depth: torsoD },
      this.scene,
    );
    torso.position.y = boxSize * 0.05;
    torso.material = shirtMat;
    torso.parent = boxMesh;

    // ── HEAD ──
    const headDiam = boxSize * 0.37;
    const head = MeshBuilder.CreateSphere(
      `head_${preset.label}`,
      { diameter: headDiam, segments: 12 },
      this.scene,
    );
    head.position.y = boxSize / 2 + headDiam / 2;
    head.material = skinMat;
    head.parent = boxMesh;

    // ── ARMS (上腕 + 前腕 + 手) ──
    const armH = boxSize * 0.48;
    const armW = boxSize * 0.15;
    const forearmH = boxSize * 0.37;
    const forearmW = boxSize * 0.13;
    const handW = boxSize * 0.12;
    const handH = boxSize * 0.10;

    const arms: Mesh[] = [];
    for (const side of [-1, 1]) {
      // 上腕
      const upperArm = MeshBuilder.CreateBox(
        `uArm_${preset.label}_${side}`,
        { width: armW, height: armH, depth: armW },
        this.scene,
      );
      upperArm.position = new Vector3(
        side * (torsoW / 2 + armW / 2),
        boxSize * 0.2 - armH / 2,
        0,
      );
      upperArm.setPivotPoint(new Vector3(0, armH / 2, 0));
      upperArm.material = shirtMat;
      upperArm.parent = boxMesh;
      arms.push(upperArm);

      // 前腕
      const forearm = MeshBuilder.CreateBox(
        `fArm_${preset.label}_${side}`,
        { width: forearmW, height: forearmH, depth: forearmW },
        this.scene,
      );
      forearm.position.y = -armH / 2 - forearmH / 2;
      forearm.material = skinMat;
      forearm.parent = upperArm;

      // 手
      const hand = MeshBuilder.CreateBox(
        `hand_${preset.label}_${side}`,
        { width: handW, height: handH, depth: handW },
        this.scene,
      );
      hand.position.y = -forearmH / 2 - handH / 2;
      hand.material = skinMat;
      hand.parent = forearm;
    }

    // ── LEGS (上腿 + 下腿 + 足) ──
    const upperLegH = legHeight * 0.50;
    const upperLegW = legHeight * 0.131;
    const lowerLegH = legHeight * 0.50;
    const lowerLegW = legHeight * 0.107;
    const footH = legHeight * 0.07;
    const footD = legHeight * 0.24;
    const legInset = boxSize * 0.3;

    const legs: Mesh[] = [];
    for (const [lx, lz] of [[-1, 0], [1, 0]]) {
      // 上腿
      const upperLeg = MeshBuilder.CreateBox(
        `uLeg_${preset.label}_${lx}_${lz}`,
        { width: upperLegW, height: upperLegH, depth: upperLegW },
        this.scene,
      );
      upperLeg.position = new Vector3(
        lx * legInset,
        -boxSize / 2 - upperLegH / 2,
        lz * legInset,
      );
      upperLeg.setPivotPoint(new Vector3(0, upperLegH / 2, 0));
      upperLeg.material = pantsMat;
      upperLeg.parent = boxMesh;
      legs.push(upperLeg);

      // 下腿（膝関節ピボット: 上端で回転）
      const lowerLeg = MeshBuilder.CreateBox(
        `lLeg_${preset.label}_${lx}_${lz}`,
        { width: lowerLegW, height: lowerLegH, depth: lowerLegW },
        this.scene,
      );
      lowerLeg.position.y = -upperLegH / 2 - lowerLegH / 2;
      lowerLeg.setPivotPoint(new Vector3(0, lowerLegH / 2, 0));
      lowerLeg.material = pantsMat;
      lowerLeg.parent = upperLeg;

      // 足（半球: 上面フラット、底面が半円）
      const foot = MeshBuilder.CreateSphere(
        `foot_${preset.label}_${lx}_${lz}`,
        { diameterX: footD, diameterY: footH * 2, diameterZ: footD, slice: 0.5, segments: 8 },
        this.scene,
      );
      foot.rotation.x = Math.PI;
      foot.position = new Vector3(0, -lowerLegH / 2, footD / 4);
      foot.material = shoesMat;
      foot.parent = lowerLeg;
    }

    // ── MARBLE SPHERE (innerMesh) ──
    const sphere = MeshBuilder.CreateSphere(
      `marble_${preset.label}`,
      { diameter: baseParams.radius, segments: 24 },
      this.scene,
    );
    sphere.position.y = -boxSize * 0.35;
    sphere.material = sphereMat;
    sphere.parent = boxMesh;

    // ── 物理（BOX形状 + 四肢の衝突球を子シェイプとして追加） ──
    const aggregate = new PhysicsAggregate(
      boxMesh,
      PhysicsShapeType.BOX,
      { mass: preset.mass, restitution: 0, friction: baseParams.friction },
      this.scene,
    );
    const physMat = {
      restitution: 0,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: baseParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
    aggregate.shape.material = physMat;
    aggregate.body.setLinearDamping(baseParams.linearDamping);
    aggregate.body.setAngularDamping(baseParams.angularDamping);
    aggregate.body.setCollisionCallbackEnabled(true);
    aggregate.body.setGravityFactor(1);

    return {
      mesh: boxMesh, innerMesh: sphere, hips, legs, arms, aggregate,
      preset, laneX: x, startZ: z, materials: allMats,
    };
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

    // 天井
    const ceilingMesh = MeshBuilder.CreateBox("ceiling", { width: size, height: wallThickness, depth: size }, this.scene);
    ceilingMesh.position = new Vector3(0, height, 0);
    const ceilingMat = new StandardMaterial("ceilingMat", this.scene);
    ceilingMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    ceilingMat.alpha = 0.1;
    ceilingMesh.material = ceilingMat;

    const ceilingAgg = new PhysicsAggregate(ceilingMesh, PhysicsShapeType.BOX, { mass: 0, restitution, friction: 0.2 }, this.scene);
    ceilingAgg.shape.material = { restitution, restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY, friction: 0.2, frictionCombine: PhysicsMaterialCombineMode.MULTIPLY };
    this.wallMeshes.push(ceilingMesh);
    this.wallAggregates.push(ceilingAgg);
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

  /** ランダムコース: 中央に範囲を示す矩形ライン */
  private decorateRandom(areaSize: number): void {
    const half = areaSize / 2;
    const lineMat = new StandardMaterial("randomAreaMat", this.scene);
    lineMat.diffuseColor = new Color3(0.4, 0.8, 1.0);
    lineMat.alpha = 0.3;

    const defs = [
      { name: "rN", w: areaSize, d: 0.08, x: 0, z: half },
      { name: "rS", w: areaSize, d: 0.08, x: 0, z: -half },
      { name: "rE", w: 0.08, d: areaSize, x: half, z: 0 },
      { name: "rW", w: 0.08, d: areaSize, x: -half, z: 0 },
    ];
    for (const def of defs) {
      const mesh = MeshBuilder.CreateBox(def.name, { width: def.w, height: 0.02, depth: def.d }, this.scene);
      mesh.position = new Vector3(def.x, 0.01, def.z);
      mesh.material = lineMat;
      this.decorMeshes.push(mesh);
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
      case CourseType.RANDOM:
        this.createMarblesRandom(config.marble, config.weightPresets, config.random.areaSize);
        this.decorateRandom(config.random.areaSize);
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
      // 脚付き箱の場合は脚+箱中心の高さを使用
      const yOffset = entry.innerMesh
        ? baseParams.radius * 2.14 + baseParams.radius * 2.4 / 2 + 0.05
        : baseParams.radius + 0.05;
      entry.mesh.position.set(entry.laneX, yOffset, entry.startZ);
      // 股関節の回転をリセット
      if (entry.hips) {
        entry.hips.rotation.set(0, 0, 0);
      }
      // 脚の回転・足裏スケーリングをリセット
      for (const leg of entry.legs) {
        leg.rotation.set(0, 0, 0);
        const lowerLeg = leg.getChildren()[0] as Mesh | undefined;
        if (lowerLeg) {
          lowerLeg.rotation.set(0, 0, 0);
          const foot = lowerLeg.getChildren()[0] as Mesh | undefined;
          if (foot) {
            foot.scaling.set(1, 1, 1);
          }
        }
      }
      // 腕の回転をリセット
      for (const arm of entry.arms) {
        arm.rotation.set(0, 0, 0);
      }
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
      entry.innerMesh?.dispose();
      entry.mesh.dispose();
      if (entry.materials) {
        for (const mat of entry.materials) mat.dispose();
      }
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
