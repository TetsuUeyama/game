import {Scene, Mesh, Vector3, VertexData, StandardMaterial, Color3} from "@babylonjs/core";
import {COURT_CONFIG} from "../config/gameConfig";

/**
 * ネットの頂点情報
 */
interface NetVertex {
  position: Vector3; // 現在の位置
  velocity: Vector3; // 速度
  restPosition: Vector3; // 静止時の位置
  isFixed: boolean; // リムに固定されているか
}

/**
 * バスケットゴールのネットクラス
 */
export class Net {
  public mesh: Mesh;
  private scene: Scene;
  private vertices: NetVertex[] = [];
  private rimCenter: Vector3;
  private rimRadius: number;

  // 物理パラメータ
  private readonly stiffness: number;
  private readonly damping: number;
  private readonly gravity = new Vector3(0, -9.81, 0);

  // メッシュ構造
  private readonly segmentsVertical: number;
  private readonly segmentsCircular: number;
  private readonly netLength: number;

  constructor(scene: Scene, rimCenter: Vector3, side: "left" | "right") {
    this.scene = scene;
    this.rimCenter = rimCenter;
    this.rimRadius = COURT_CONFIG.rimDiameter / 2;

    this.segmentsVertical = COURT_CONFIG.netSegmentsVertical;
    this.segmentsCircular = COURT_CONFIG.netSegmentsCircular;
    this.netLength = COURT_CONFIG.netLength;
    this.stiffness = COURT_CONFIG.netStiffness;
    this.damping = COURT_CONFIG.netDamping;

    this.mesh = this.createNetMesh(side);
    this.initializeVertices();
  }

  /**
   * ネットメッシュを作成
   */
  private createNetMesh(side: "left" | "right"): Mesh {
    const mesh = new Mesh(`net-${side}`, this.scene);

    // マテリアル（白い半透明のネット）
    const material = new StandardMaterial(`net-material-${side}`, this.scene);
    material.diffuseColor = Color3.FromHexString(COURT_CONFIG.netColor);
    material.alpha = 0.8;
    material.wireframe = true; // ワイヤーフレーム表示でネット感を出す
    material.backFaceCulling = false; // 裏面も表示
    mesh.material = material;

    console.log(`[Net] Creating net for ${side} side at rim center:`, this.rimCenter);

    return mesh;
  }

  /**
   * 頂点を初期化
   */
  private initializeVertices(): void {
    this.vertices = [];

    // 円錐形のネットを作成
    for (let v = 0; v <= this.segmentsVertical; v++) {
      const t = v / this.segmentsVertical; // 0（上）から1（下）
      const y = -t * this.netLength; // 下に向かって伸びる

      // 円錐形：上は広く、下は狭い
      const radiusAtHeight = this.rimRadius * (1 - t * 0.7); // 下に行くほど30%狭まる

      for (let c = 0; c < this.segmentsCircular; c++) {
        const angle = (c / this.segmentsCircular) * Math.PI * 2;
        const x = Math.cos(angle) * radiusAtHeight;
        const z = Math.sin(angle) * radiusAtHeight;

        const worldPos = this.rimCenter.add(new Vector3(x, y, z));

        this.vertices.push({
          position: worldPos.clone(),
          velocity: Vector3.Zero(),
          restPosition: worldPos.clone(),
          isFixed: v === 0, // 最上層（リム）のみ固定
        });
      }
    }

    console.log(`[Net] Initialized ${this.vertices.length} vertices. Top Y: ${this.rimCenter.y}, Bottom Y: ${this.rimCenter.y - this.netLength}`);

    this.updateMeshGeometry();
  }

  /**
   * メッシュのジオメトリを更新
   */
  private updateMeshGeometry(): void {
    const positions: number[] = [];
    const indices: number[] = [];

    // 位置データを作成
    for (const vertex of this.vertices) {
      positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
    }

    // インデックスを作成（三角形メッシュ）
    for (let v = 0; v < this.segmentsVertical; v++) {
      for (let c = 0; c < this.segmentsCircular; c++) {
        const current = v * this.segmentsCircular + c;
        const next = v * this.segmentsCircular + ((c + 1) % this.segmentsCircular);
        const below = (v + 1) * this.segmentsCircular + c;
        const belowNext = (v + 1) * this.segmentsCircular + ((c + 1) % this.segmentsCircular);

        // 2つの三角形で四角形を作る
        indices.push(current, below, next);
        indices.push(next, below, belowNext);
      }
    }

    // VertexDataを作成
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;

    // 法線を自動計算
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    // メッシュに適用
    vertexData.applyToMesh(this.mesh, true);
  }

  /**
   * 物理シミュレーションを更新
   */
  update(deltaTime: number): void {
    // スプリング力と重力を計算
    for (let i = 0; i < this.vertices.length; i++) {
      const vertex = this.vertices[i];

      if (vertex.isFixed) {
        // 固定された頂点は動かない
        vertex.position.copyFrom(vertex.restPosition);
        vertex.velocity.set(0, 0, 0);
        continue;
      }

      // 重力（非常に弱く）
      const force = this.gravity.scale(0.005); // 重力を弱める

      // スプリング力（隣接頂点との繋がり）
      const neighbors = this.getNeighbors(i);
      for (const neighborIndex of neighbors) {
        const neighbor = this.vertices[neighborIndex];
        const delta = neighbor.position.subtract(vertex.position);
        const distance = delta.length();
        const restDistance = neighbor.restPosition.subtract(vertex.restPosition).length();

        if (distance > 0.001) {
          // フックの法則: F = k * (x - x0)
          const springForce = delta.normalize().scale(this.stiffness * 2.0 * (distance - restDistance));
          force.addInPlace(springForce);
        }
      }

      // 静止位置へのスプリング力（形状を保つ）- 最重要
      const toRest = vertex.restPosition.subtract(vertex.position);
      force.addInPlace(toRest.scale(this.stiffness * 8.0)); // 復元力を大幅に強化

      // 速度を更新（減衰を適用）
      vertex.velocity.addInPlace(force.scale(deltaTime));
      vertex.velocity.scaleInPlace(this.damping);

      // 位置を更新
      vertex.position.addInPlace(vertex.velocity.scale(deltaTime));
    }

    // メッシュを更新
    this.updateMeshGeometry();
  }

  /**
   * 隣接する頂点のインデックスを取得
   */
  private getNeighbors(index: number): number[] {
    const neighbors: number[] = [];
    const v = Math.floor(index / this.segmentsCircular); // 縦位置
    const c = index % this.segmentsCircular; // 円周位置

    // 左右の隣接
    const left = v * this.segmentsCircular + ((c - 1 + this.segmentsCircular) % this.segmentsCircular);
    const right = v * this.segmentsCircular + ((c + 1) % this.segmentsCircular);
    neighbors.push(left, right);

    // 上下の隣接
    if (v > 0) {
      const above = (v - 1) * this.segmentsCircular + c;
      neighbors.push(above);
    }
    if (v < this.segmentsVertical) {
      const below = (v + 1) * this.segmentsCircular + c;
      neighbors.push(below);
    }

    return neighbors;
  }

  /**
   * 外部から力を加える（ボールとの衝突など）
   */
  applyForce(position: Vector3, force: Vector3, radius: number): void {
    for (const vertex of this.vertices) {
      if (vertex.isFixed) continue;

      const distance = Vector3.Distance(vertex.position, position);
      if (distance < radius) {
        // 距離に応じて力を減衰
        const attenuation = 1 - distance / radius;
        vertex.velocity.addInPlace(force.scale(attenuation));
      }
    }
  }

  /**
   * ネットとの衝突判定（ボールが通過したか）
   */
  checkBallCollision(ballPosition: Vector3, ballRadius: number): boolean {
    // ボールがネットの範囲内にあるか簡易チェック
    const distanceFromRim = Vector3.Distance(
      new Vector3(ballPosition.x, this.rimCenter.y, ballPosition.z),
      new Vector3(this.rimCenter.x, this.rimCenter.y, this.rimCenter.z)
    );

    // リムの半径内で、リムの高さより下にある場合（ボールの半径も考慮）
    if (distanceFromRim < this.rimRadius + ballRadius && ballPosition.y < this.rimCenter.y + ballRadius) {
      return true;
    }

    return false;
  }

  /**
   * 破棄
   */
  dispose(): void {
    this.mesh.dispose();
    this.vertices = [];
  }
}
