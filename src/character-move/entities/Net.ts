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
import { GOAL_CONFIG } from "../config/gameConfig";

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

  // メッシュ構造
  private readonly segmentsVertical: number;
  private readonly segmentsCircular: number;
  private readonly netLength: number;

  // 物理パラメータ
  private readonly nodeRadius = 0.015; // ノードの半径（小さな球）
  private readonly nodeMass = 0.01; // ノードの質量（軽い）

  // 物理エンジン初期化済みフラグ
  private physicsInitialized = false;

  // ネットのアクティブ状態管理
  private isActive = false; // ボールが触れて揺れている状態
  private activeTimer = 0; // アクティブ状態の残り時間
  private readonly activeDuration = 2.0; // アクティブ状態の継続時間（秒）
  private readonly settleThreshold = 0.01; // 静止判定の速度閾値

  constructor(scene: Scene, rimCenter: Vector3, side: "goal1" | "goal2") {
    this.scene = scene;
    this.rimCenter = rimCenter;
    this.rimRadius = GOAL_CONFIG.rimDiameter / 2;
    this.side = side;

    this.segmentsVertical = GOAL_CONFIG.netSegmentsVertical;
    this.segmentsCircular = GOAL_CONFIG.netSegmentsCircular;
    this.netLength = GOAL_CONFIG.netLength;

    // 表示用メッシュを作成（初期状態）
    this.mesh = this.createDisplayMesh();

    // ノードを作成（メッシュのみ、物理はまだ）
    this.createNodes();
  }

  /**
   * 表示用のワイヤーフレームメッシュを作成
   */
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

  /**
   * ネットのノード（結び目）を作成
   */
  private createNodes(): void {
    this.nodes = [];

    for (let v = 0; v <= this.segmentsVertical; v++) {
      const t = v / this.segmentsVertical;
      const y = -t * this.netLength;

      // 円錐形：上は広く、下は狭い
      const radiusAtHeight = this.rimRadius * (1 - t * 0.7);

      for (let c = 0; c < this.segmentsCircular; c++) {
        const angle = (c / this.segmentsCircular) * Math.PI * 2;
        const x = Math.cos(angle) * radiusAtHeight;
        const z = Math.sin(angle) * radiusAtHeight;

        const worldPos = this.rimCenter.add(new Vector3(x, y, z));

        // ノード用の小さな球体メッシュ（非表示）
        const nodeMesh = MeshBuilder.CreateSphere(
          `net-node-${this.side}-${v}-${c}`,
          { diameter: this.nodeRadius * 2, segments: 4 },
          this.scene
        );
        nodeMesh.position = worldPos.clone();
        nodeMesh.isVisible = false; // ノード自体は非表示

        this.nodes.push({
          mesh: nodeMesh,
          physics: null,
          isFixed: v === 0, // 最上層（リム）のみ固定
          row: v,
          col: c,
          restPosition: worldPos.clone(), // 静止位置を保存
        });
      }
    }

    // 初期表示を更新
    this.updateDisplayMesh();
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

    // 各ノードに物理ボディを追加
    for (const node of this.nodes) {
      if (node.isFixed) {
        // 固定ノード：STATIC（リムに固定）
        node.physics = new PhysicsAggregate(
          node.mesh,
          PhysicsShapeType.SPHERE,
          {
            mass: 0,
            restitution: 0.1,
            friction: 0.5,
          },
          this.scene
        );
      } else {
        // 動的ノード：初期状態はANIMATED（静止）
        node.physics = new PhysicsAggregate(
          node.mesh,
          PhysicsShapeType.SPHERE,
          {
            mass: this.nodeMass,
            restitution: 0.1,
            friction: 0.5,
          },
          this.scene
        );

        // ダンピングを設定（揺れを抑える）
        node.physics.body.setLinearDamping(2.0); // 高いダンピングで素早く静止
        node.physics.body.setAngularDamping(2.0);

        // 初期状態はANIMATED（静止状態）
        node.physics.body.setMotionType(PhysicsMotionType.ANIMATED);
        node.physics.body.disablePreStep = false;
      }
    }

    // 距離制約を作成（隣接ノード間を接続）
    this.createConstraints();

    this.physicsInitialized = true;
    this.isActive = false;
  }

  /**
   * ネットをアクティブ状態にする（物理シミュレーション開始）
   */
  private activatePhysics(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.activeTimer = this.activeDuration;

    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      // DYNAMICモードに切り替えて物理シミュレーションを有効化
      node.physics.body.setMotionType(PhysicsMotionType.DYNAMIC);
      node.physics.body.disablePreStep = true;
    }
  }

  /**
   * ネットを静止状態に戻す
   */
  private deactivatePhysics(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.activeTimer = 0;

    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      // ANIMATEDモードに切り替えて静止
      node.physics.body.setMotionType(PhysicsMotionType.ANIMATED);
      node.physics.body.disablePreStep = false;
      node.physics.body.setLinearVelocity(Vector3.Zero());
      node.physics.body.setAngularVelocity(Vector3.Zero());

      // 静止位置に戻す
      node.mesh.position = node.restPosition.clone();
    }
  }

  /**
   * ネットが十分に静止したかチェック
   */
  private isSettled(): boolean {
    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      const velocity = node.physics.body.getLinearVelocity();
      if (velocity.length() > this.settleThreshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * ノード間の距離制約を作成
   */
  private createConstraints(): void {
    for (let v = 0; v <= this.segmentsVertical; v++) {
      for (let c = 0; c < this.segmentsCircular; c++) {
        const currentIndex = v * this.segmentsCircular + c;
        const currentNode = this.nodes[currentIndex];

        if (!currentNode.physics) continue;

        // 右隣との接続（水平方向）
        const rightCol = (c + 1) % this.segmentsCircular;
        const rightIndex = v * this.segmentsCircular + rightCol;
        const rightNode = this.nodes[rightIndex];

        if (rightNode.physics) {
          this.createDistanceConstraint(currentNode, rightNode);
        }

        // 下との接続（垂直方向）
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

  /**
   * 2つのノード間に距離制約を作成
   */
  private createDistanceConstraint(nodeA: NetNode, nodeB: NetNode): void {
    if (!nodeA.physics || !nodeB.physics) return;

    // 現在の距離を計算
    const posA = nodeA.mesh.position;
    const posB = nodeB.mesh.position;
    const distance = Vector3.Distance(posA, posB);

    // 6DoF制約を使用して距離を維持
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
          minLimit: -distance * 0.1,
          maxLimit: distance * 0.1,
        },
        {
          axis: PhysicsConstraintAxis.LINEAR_Y,
          minLimit: -distance * 0.1,
          maxLimit: distance * 0.1,
        },
        {
          axis: PhysicsConstraintAxis.LINEAR_Z,
          minLimit: -distance * 0.1,
          maxLimit: distance * 0.1,
        },
      ],
      this.scene
    );

    nodeA.physics.body.addConstraint(nodeB.physics.body, constraint);
    this.constraints.push(constraint);
  }

  /**
   * 表示用メッシュのジオメトリを更新
   */
  private updateDisplayMesh(): void {
    const positions: number[] = [];
    const indices: number[] = [];

    // 位置データを作成
    for (const node of this.nodes) {
      positions.push(node.mesh.position.x, node.mesh.position.y, node.mesh.position.z);
    }

    // インデックスを作成（三角形メッシュ）
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
   * Havok物理エンジンがノードの位置を自動更新
   */
  update(deltaTime: number): void {
    if (!this.physicsInitialized) {
      // Havok物理エンジンが必須
      return;
    }

    // アクティブ状態の管理
    if (this.isActive) {
      this.activeTimer -= deltaTime;

      // タイマー切れまたは十分に静止したら非アクティブに
      if (this.activeTimer <= 0 || this.isSettled()) {
        this.deactivatePhysics();
      }

      // アクティブ時のみ表示用メッシュを更新
      this.updateDisplayMesh();
    }
    // 非アクティブ時はメッシュ更新不要（静止位置のまま）
  }

  /**
   * 外部から力を加える（ボールとの衝突など）
   */
  applyForce(position: Vector3, force: Vector3, radius: number): void {
    if (!this.physicsInitialized) return;

    // 力を加える前にアクティブ状態にする
    this.activatePhysics();

    for (const node of this.nodes) {
      if (node.isFixed || !node.physics) continue;

      const distance = Vector3.Distance(node.mesh.position, position);
      if (distance < radius) {
        const attenuation = 1 - distance / radius;

        // Havok物理でインパルスを適用
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

  /**
   * 破棄
   */
  dispose(): void {
    // 制約を破棄
    for (const constraint of this.constraints) {
      constraint.dispose();
    }
    this.constraints = [];

    // ノードを破棄
    for (const node of this.nodes) {
      node.physics?.dispose();
      node.mesh.dispose();
    }
    this.nodes = [];

    this.mesh.dispose();
  }
}
