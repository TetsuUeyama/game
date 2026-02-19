import {
  Scene,
  Mesh,
  Vector3,
  VertexData,
  StandardMaterial,
  Color3,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  PhysicsMotionType,
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
} from "@babylonjs/core";
import { GOAL_CONFIG } from "@/GamePlay/Object/Entities/Goal";

/**
 * ネットノード（紐の結び目）
 */
interface NetNode {
  mesh: Mesh;
  physics: PhysicsAggregate | null;
  isFixed: boolean; // リムに固定されているか
  row: number; // 縦位置
  col: number; // 円周位置
  restPosition: Vector3; // 静止位置
}

/**
 * ネットの活性化レベル（ボール通過位置に応じて段階的に活性化）
 *
 * 0: 静止 — ボールがまだ中間リングに到達していない
 * 1: 上部活性化 — ボールが中間リングを通過（行 1〜midRow が DYNAMIC）
 * 2: 全体活性化 — ボールが下部リングを通過（全ノードが DYNAMIC）
 */
type ActivationLevel = 0 | 1 | 2;

/**
 * バスケットゴールのネットクラス
 * Havok物理エンジンを使用した紐シミュレーション
 */
export class Net {
  public mesh: Mesh; // 表示用メッシュ
  private scene: Scene;
  private nodes: NetNode[] = [];
  private constraints: Physics6DoFConstraint[] = [];
  private rimCenter: Vector3;
  private rimRadius: number;
  private side: "goal1" | "goal2";

  // リング（形状維持用）
  private midRing: Mesh | null = null;
  private bottomRing: Mesh | null = null;
  private readonly midRow: number;

  // リング高さ（ワールドY座標）
  readonly midRingY: number;
  readonly bottomRingY: number;

  // メッシュ構造
  private readonly segmentsVertical: number;
  private readonly segmentsCircular: number;
  private readonly netLength: number;

  // 物理パラメータ
  private readonly nodeRadius = 0.015;
  private readonly nodeMass = 0.002;
  private readonly midRingMassFactor = 2;

  // 物理エンジン初期化済みフラグ
  private physicsInitialized = false;

  // ネットのアクティブ状態管理
  private isActive = false;
  private activeTimer = 0;
  private readonly activeDuration = 2.0;
  private readonly settleThreshold = 0.01;

  // 段階的活性化
  private activationLevel: ActivationLevel = 0;

  constructor(scene: Scene, rimCenter: Vector3, side: "goal1" | "goal2") {
    this.scene = scene;
    this.rimCenter = rimCenter;
    this.rimRadius = GOAL_CONFIG.rimDiameter / 2;
    this.side = side;

    this.segmentsVertical = GOAL_CONFIG.netSegmentsVertical;
    this.segmentsCircular = GOAL_CONFIG.netSegmentsCircular;
    this.netLength = GOAL_CONFIG.netLength;
    this.midRow = Math.floor(this.segmentsVertical / 2);


    // リング高さ（ワールドY座標）— 各5cm上げ
    this.midRingY = rimCenter.y - (this.midRow / this.segmentsVertical) * this.netLength + 0.05;
    this.bottomRingY = rimCenter.y - this.netLength + 0.05;

    // 表示用メッシュを作成（初期状態）
    this.mesh = this.createDisplayMesh();

    // ノードを作成（メッシュのみ、物理はまだ）
    this.createNodes();

    // リング（紐リング）を作成
    this.midRing = this.createRing("midring", this.midRow);
    this.bottomRing = this.createRing("bottomring", this.segmentsVertical);
  }

  private createDisplayMesh(): Mesh {
    const mesh = new Mesh(`net-${this.side}`, this.scene);

    const material = new StandardMaterial(`net-material-${this.side}`, this.scene);
    material.diffuseColor = Color3.FromHexString(GOAL_CONFIG.netColor);
    material.alpha = 0.8;
    material.wireframe = true;
    material.backFaceCulling = false;
    mesh.material = material;

    return mesh;
  }

  private createNodes(): void {
    this.nodes = [];

    for (let v = 0; v <= this.segmentsVertical; v++) {
      const t = v / this.segmentsVertical;
      const y = -t * this.netLength;
      const radiusAtHeight = this.rimRadius * (1 - t * 0.7);

      for (let c = 0; c < this.segmentsCircular; c++) {
        const angle = (c / this.segmentsCircular) * Math.PI * 2;
        const x = Math.cos(angle) * radiusAtHeight;
        const z = Math.sin(angle) * radiusAtHeight;

        const worldPos = this.rimCenter.add(new Vector3(x, y, z));

        const nodeMesh = MeshBuilder.CreateSphere(
          `net-node-${this.side}-${v}-${c}`,
          { diameter: this.nodeRadius * 2, segments: 4 },
          this.scene
        );
        nodeMesh.position = worldPos.clone();
        nodeMesh.isVisible = false;

        this.nodes.push({
          mesh: nodeMesh,
          physics: null,
          isFixed: v === 0,
          row: v,
          col: c,
          restPosition: worldPos.clone(),
        });
      }
    }

    this.updateDisplayMesh();
  }

  /**
   * 指定行の高さに紐質感のリング（トーラス）を作成。
   */
  /**
   * 行のノード位置をつないだチューブ状メッシュを生成。
   * ノードが動くと一緒に変形する柔らかいリング。
   */
  private createRing(name: string, row: number): Mesh {
    const mesh = new Mesh(`net-${name}-${this.side}`, this.scene);

    const mat = new StandardMaterial(`net-${name}-mat-${this.side}`, this.scene);
    mat.diffuseColor = new Color3(0.95, 0.9, 0.8);
    mesh.material = mat;

    // 初期ジオメトリを構築
    this.buildRingGeometry(mesh, row);

    return mesh;
  }

  /**
   * チューブ状リングのジオメトリを構築/更新。
   * 対応する行のノード位置からリング断面を生成。
   */
  private buildRingGeometry(mesh: Mesh, row: number): void {
    const tubeRadius = 0.005; // チューブの太さ（細い紐）
    const tubeSides = 6;      // 断面の多角形数

    const startIdx = row * this.segmentsCircular;
    const positions: number[] = [];
    const indices: number[] = [];

    for (let c = 0; c < this.segmentsCircular; c++) {
      const node = this.nodes[startIdx + c];
      const nextNode = this.nodes[startIdx + ((c + 1) % this.segmentsCircular)];

      // チューブ方向（次のノードへ）
      const px = node.mesh.position.x;
      const py = node.mesh.position.y;
      const pz = node.mesh.position.z;
      const nx = nextNode.mesh.position.x;
      const ny = nextNode.mesh.position.y;
      const nz = nextNode.mesh.position.z;

      const dx = nx - px;
      const dy = ny - py;
      const dz = nz - pz;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      const tx = dx / len;
      const ty = dy / len;
      const tz = dz / len;

      // 断面の法線・binormal（upベクトルとの外積）
      let upX = 0, upY = 1, upZ = 0;
      if (Math.abs(ty) > 0.99) { upX = 1; upY = 0; upZ = 0; }
      // normal = cross(tangent, up)
      let bnX = ty * upZ - tz * upY;
      let bnY = tz * upX - tx * upZ;
      let bnZ = tx * upY - ty * upX;
      const bnLen = Math.sqrt(bnX * bnX + bnY * bnY + bnZ * bnZ) || 0.001;
      bnX /= bnLen; bnY /= bnLen; bnZ /= bnLen;
      // binormal = cross(tangent, normal)
      const nmX = ty * bnZ - tz * bnY;
      const nmY = tz * bnX - tx * bnZ;
      const nmZ = tx * bnY - ty * bnX;

      // 断面頂点を生成
      const baseIdx = c * tubeSides;
      for (let s = 0; s < tubeSides; s++) {
        const angle = (s / tubeSides) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        positions.push(
          px + tubeRadius * (cosA * bnX + sinA * nmX),
          py + tubeRadius * (cosA * bnY + sinA * nmY),
          pz + tubeRadius * (cosA * bnZ + sinA * nmZ),
        );
      }

      // 隣接セグメントとの三角形
      const nextBaseIdx = ((c + 1) % this.segmentsCircular) * tubeSides;
      for (let s = 0; s < tubeSides; s++) {
        const s1 = (s + 1) % tubeSides;
        indices.push(baseIdx + s, nextBaseIdx + s, baseIdx + s1);
        indices.push(baseIdx + s1, nextBaseIdx + s, nextBaseIdx + s1);
      }
    }

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh, true);
  }

  /**
   * ノードが現在の活性化レベルで動的かどうかを判定。
   */
  private isNodeActive(node: NetNode): boolean {
    if (node.isFixed) return false;
    if (this.activationLevel === 0) return false;
    // Level 1以上: 中間リングを超えたら全ノード活性化
    return true;
  }

  /**
   * Havok物理を初期化（シーンに物理エンジンが有効になった後に呼び出す）
   */
  public initializePhysics(): void {
    if (this.physicsInitialized) return;

    if (!this.scene.getPhysicsEngine()) {
      console.warn("[Net] Physics engine not enabled on scene");
      return;
    }

    for (const node of this.nodes) {
      if (node.isFixed) {
        node.physics = new PhysicsAggregate(
          node.mesh,
          PhysicsShapeType.SPHERE,
          { mass: 0, restitution: 0.1, friction: 0.5 },
          this.scene
        );
      } else {
        const isMidRingNode = node.row === this.midRow;
        const mass = isMidRingNode
          ? this.nodeMass * this.midRingMassFactor
          : this.nodeMass;

        node.physics = new PhysicsAggregate(
          node.mesh,
          PhysicsShapeType.SPHERE,
          { mass, restitution: 0.1, friction: 0.5 },
          this.scene
        );

        const linearDamping = isMidRingNode ? 0.8 : 0.3;
        node.physics.body.setLinearDamping(linearDamping);
        node.physics.body.setAngularDamping(0.3);

        // 初期状態は全ノード ANIMATED（静止）
        node.physics.body.setMotionType(PhysicsMotionType.ANIMATED);
        node.physics.body.disablePreStep = false;
      }
    }

    this.createConstraints();
    this.physicsInitialized = true;
    this.isActive = false;
    this.activationLevel = 0;
  }

  /**
   * ボールのY位置に応じて段階的にネットを活性化する。
   * - ボールが中間リングを通過: 上部セクション（行1〜midRow）を DYNAMIC に
   * - ボールが下部リングを通過: 下部セクション（midRow+1〜最下行）も DYNAMIC に
   *
   * 活性化レベルは上がるのみ（下がらない）。deactivatePhysics で全リセット。
   */
  private activateToLevel(level: ActivationLevel): void {
    if (level <= this.activationLevel) return;

    const prevLevel = this.activationLevel;
    this.activationLevel = level;
    this.isActive = true;
    this.activeTimer = this.activeDuration;

    // 新たに活性化するノードを DYNAMIC に切り替え
    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      const wasActive = prevLevel >= 1;
      const isNowActive = level >= 1;

      if (!wasActive && isNowActive) {
        node.physics.body.setMotionType(PhysicsMotionType.DYNAMIC);
        node.physics.body.disablePreStep = true;
      }
    }
  }

  /**
   * ネットを静止状態に戻す
   */
  private deactivatePhysics(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.activeTimer = 0;
    this.activationLevel = 0;

    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      node.physics.body.setMotionType(PhysicsMotionType.ANIMATED);
      node.physics.body.disablePreStep = false;
      node.physics.body.setLinearVelocity(Vector3.Zero());
      node.physics.body.setAngularVelocity(Vector3.Zero());

      node.mesh.position = node.restPosition.clone();
    }

    // リングもノード位置に合わせて再構築
    if (this.midRing) {
      this.buildRingGeometry(this.midRing, this.midRow);
    }
    if (this.bottomRing) {
      this.buildRingGeometry(this.bottomRing, this.segmentsVertical);
    }

    this.updateDisplayMesh();
  }

  /**
   * ネットが十分に静止したかチェック（活性化ノードのみ）
   */
  private isSettled(): boolean {
    for (const node of this.nodes) {
      if (!this.isNodeActive(node) || !node.physics) continue;

      const velocity = node.physics.body.getLinearVelocity();
      if (velocity.length() > this.settleThreshold) {
        return false;
      }
    }
    return true;
  }

  private createConstraints(): void {
    for (let v = 0; v <= this.segmentsVertical; v++) {
      for (let c = 0; c < this.segmentsCircular; c++) {
        const currentIndex = v * this.segmentsCircular + c;
        const currentNode = this.nodes[currentIndex];

        if (!currentNode.physics) continue;

        const rightCol = (c + 1) % this.segmentsCircular;
        const rightIndex = v * this.segmentsCircular + rightCol;
        const rightNode = this.nodes[rightIndex];

        if (rightNode.physics) {
          this.createDistanceConstraint(currentNode, rightNode);
        }

        if (v < this.segmentsVertical) {
          const belowIndex = (v + 1) * this.segmentsCircular + c;
          const belowNode = this.nodes[belowIndex];

          if (belowNode.physics) {
            this.createDistanceConstraint(currentNode, belowNode);
          }
        }
      }
    }
  }

  private createDistanceConstraint(nodeA: NetNode, nodeB: NetNode): void {
    if (!nodeA.physics || !nodeB.physics) return;

    const distance = Vector3.Distance(nodeA.mesh.position, nodeB.mesh.position);

    const constraint = new Physics6DoFConstraint(
      {
        pivotA: Vector3.Zero(),
        pivotB: Vector3.Zero(),
        axisA: new Vector3(1, 0, 0),
        axisB: new Vector3(1, 0, 0),
        perpAxisA: new Vector3(0, 1, 0),
        perpAxisB: new Vector3(0, 1, 0),
      },
      [
        {
          axis: PhysicsConstraintAxis.LINEAR_X,
          minLimit: -distance * 0.6,
          maxLimit: distance * 0.6,
        },
        {
          axis: PhysicsConstraintAxis.LINEAR_Y,
          minLimit: -distance * 0.6,
          maxLimit: distance * 0.6,
        },
        {
          axis: PhysicsConstraintAxis.LINEAR_Z,
          minLimit: -distance * 0.6,
          maxLimit: distance * 0.6,
        },
      ],
      this.scene
    );

    nodeA.physics.body.addConstraint(nodeB.physics.body, constraint);
    this.constraints.push(constraint);
  }

  /**
   * リングの位置を対応する行ノードの平均位置に合わせる
   */
  private updateRingPositions(): void {
    // 中間リング通過で全リング更新
    if (this.activationLevel >= 1) {
      this.updateRingToRow(this.midRing, this.midRow);
      this.updateRingToRow(this.bottomRing, this.segmentsVertical);
    }
  }

  private updateRingToRow(ring: Mesh | null, row: number): void {
    if (!ring) return;
    this.buildRingGeometry(ring, row);
  }

  /**
   * 表示用メッシュのジオメトリを更新
   * 各行の最小半径制約を適用（中間リング→下部リングで線形補間）
   */
  private updateDisplayMesh(): void {
    const positions: number[] = [];
    const indices: number[] = [];

    for (const node of this.nodes) {
      positions.push(
        node.mesh.position.x,
        node.mesh.position.y,
        node.mesh.position.z,
      );
    }

    for (let v = 0; v < this.segmentsVertical; v++) {
      for (let c = 0; c < this.segmentsCircular; c++) {
        const current = v * this.segmentsCircular + c;
        const next = v * this.segmentsCircular + ((c + 1) % this.segmentsCircular);
        const below = (v + 1) * this.segmentsCircular + c;
        const belowNext = (v + 1) * this.segmentsCircular + ((c + 1) % this.segmentsCircular);

        indices.push(current, below, next);
        indices.push(next, below, belowNext);
      }
    }

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;

    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    vertexData.applyToMesh(this.mesh, true);
  }

  /**
   * 物理シミュレーションを更新（毎フレーム）
   */
  update(deltaTime: number): void {
    if (!this.physicsInitialized) return;

    if (this.isActive) {
      this.activeTimer -= deltaTime;

      const cx = this.rimCenter.x;
      const cz = this.rimCenter.z;
      const RADIAL_SPRING = 0.0001; // 半径方向のバネ強度

      for (const node of this.nodes) {
        if (node.isFixed || !node.physics) continue;

        // Yクランプ: 静止位置より上に上がらない
        if (node.mesh.position.y > node.restPosition.y) {
          node.mesh.position.y = node.restPosition.y;
          const vel = node.physics.body.getLinearVelocity();
          if (vel.y > 0) {
            node.physics.body.setLinearVelocity(new Vector3(vel.x, 0, vel.z));
          }
        }

        // 半径方向スプリング: 静止半径より内側なら外向きに押し戻す
        const dx = node.mesh.position.x - cx;
        const dz = node.mesh.position.z - cz;
        const currentR = Math.sqrt(dx * dx + dz * dz);
        const restDx = node.restPosition.x - cx;
        const restDz = node.restPosition.z - cz;
        const restR = Math.sqrt(restDx * restDx + restDz * restDz);

        if (currentR < restR && currentR > 0.0001) {
          const deficit = restR - currentR;
          const nx = dx / currentR;
          const nz = dz / currentR;
          node.physics.body.applyImpulse(
            new Vector3(nx * deficit * RADIAL_SPRING, 0, nz * deficit * RADIAL_SPRING),
            node.mesh.position,
          );
        }
      }

      if (this.activeTimer <= 0 || this.isSettled()) {
        this.deactivatePhysics();
      }

      this.updateDisplayMesh();
      this.updateRingPositions();
    }
  }

  /**
   * 外部から力を加える（ボールとの衝突など）
   *
   * ボールのY位置に応じて段階的に活性化:
   * - 中間リングより上: 何もしない
   * - 中間リング〜下部リング: 上部セクションのみ活性化
   * - 下部リングより下: 全体活性化
   */
  applyForce(position: Vector3, force: Vector3, radius: number): void {
    if (!this.physicsInitialized) return;

    // ボールのY位置に応じて活性化レベルを決定
    let targetLevel: ActivationLevel = 0;
    if (position.y <= this.bottomRingY) {
      targetLevel = 2;
    } else if (position.y <= this.midRingY) {
      targetLevel = 1;
    }

    // ボールがまだ中間リングに到達していなければ何もしない
    if (targetLevel === 0 && this.activationLevel === 0) return;

    // 活性化レベルを引き上げ（下がることはない）
    if (targetLevel > this.activationLevel) {
      this.activateToLevel(targetLevel);
    } else if (!this.isActive && this.activationLevel === 0) {
      return;
    } else {
      // 既にアクティブならタイマーをリセット
      this.activeTimer = this.activeDuration;
    }

    // 活性化セクション内のノードにのみ力を適用
    for (const node of this.nodes) {
      if (!this.isNodeActive(node) || !node.physics) continue;

      const distance = Vector3.Distance(node.mesh.position, position);
      if (distance < radius) {
        const attenuation = 1 - distance / radius;
        node.physics.body.applyImpulse(
          force.scale(attenuation * 0.01),
          node.mesh.position
        );
      }
    }
  }

  /**
   * ネットとの衝突判定（ボールが通過したか）
   */
  checkBallCollision(ballPosition: Vector3, ballRadius: number): boolean {
    const distanceFromRim = Vector3.Distance(
      new Vector3(ballPosition.x, this.rimCenter.y, ballPosition.z),
      new Vector3(this.rimCenter.x, this.rimCenter.y, this.rimCenter.z)
    );

    if (distanceFromRim < this.rimRadius + ballRadius && ballPosition.y < this.rimCenter.y + ballRadius) {
      return true;
    }

    return false;
  }

  dispose(): void {
    for (const constraint of this.constraints) {
      constraint.dispose();
    }
    this.constraints = [];

    for (const node of this.nodes) {
      node.physics?.dispose();
      node.mesh.dispose();
    }
    this.nodes = [];

    this.midRing?.dispose();
    this.bottomRing?.dispose();
    this.mesh.dispose();
  }
}
