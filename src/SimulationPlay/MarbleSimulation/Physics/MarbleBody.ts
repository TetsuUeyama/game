// Babylon.js コアモジュール: シーン, メッシュ生成, 物理, マテリアル, 色, ベクトル
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
// 型定義: ビー玉パラメータ, 地面パラメータ, シミュレーション設定, 重量プリセット, コースタイプ
import {
  MarbleParams,
  GroundParams,
  SimulationConfig,
  WeightPreset,
  CourseType,
} from "@/SimulationPlay/MarbleSimulation/Types/MarbleConfig";

/**
 * 個別ビー玉の情報
 *
 * - mesh: 物理判定を持つメッシュ（球 or 箱）
 * - innerMesh: 箱モードのとき内部に表示される球体（視覚のみ）
 * - legs: 脚メッシュの配列（バランスアニメーション用）
 *   順序: [(-1,-1), (-1,+1), (+1,-1), (+1,+1)] の角位置に対応
 */
export interface MarbleEntry {
  /** 物理判定を持つメインメッシュ（通常ビー玉は球、ヒューマノイドは不可視BOX） */
  mesh: Mesh;
  /** ヒューマノイドの内部ビー玉球体（視覚表示のみ）。通常ビー玉はnull */
  innerMesh: Mesh | null;
  /** ヒューマノイドの股関節メッシュ（バランスアニメ用）。通常ビー玉はnull */
  hips: Mesh | null;
  /** 脚メッシュの配列（上腿が親、下腿→足が子階層）。通常ビー玉は空配列 */
  legs: Mesh[];
  /** 腕メッシュの配列（上腕が親、前腕→手が子階層）。通常ビー玉は空配列 */
  arms: Mesh[];
  /** Havok物理集合体: メッシュ + 物理ボディ + 形状を一括管理 */
  aggregate: PhysicsAggregate;
  /** このビー玉の重量・性能プリセット */
  preset: WeightPreset;
  /** レーンのX座標: ビー玉の横位置（リセット時に使用） */
  laneX: number;
  /** スタート時のZ座標（リセット時に使用） */
  startZ: number;
  /** ヒューマノイド用マテリアル配列（破棄時に使用）。通常ビー玉はundefined */
  materials?: StandardMaterial[];
}

/**
 * ビー玉・地面・壁・コース装飾の生成・管理
 *
 * コースタイプに応じてビー玉の配置方法・装飾を切り替える
 */
export class MarbleBody {
  /** Babylon.jsシーンへの参照 */
  private scene: Scene;
  /** 生成されたビー玉エントリの配列 */
  private marbles: MarbleEntry[] = [];
  /** 地面メッシュ */
  private groundMesh!: Mesh;
  /** 地面の物理集合体 */
  private groundAggregate!: PhysicsAggregate;
  /** 壁メッシュの配列（北南東西 + 天井） */
  private wallMeshes: Mesh[] = [];
  /** 壁の物理集合体の配列 */
  private wallAggregates: PhysicsAggregate[] = [];
  /** コース装飾メッシュの配列（ライン、ダッシュ等） */
  private decorMeshes: Mesh[] = [];
  /** レーン間隔(m): ビー玉の横並びの間隔 */
  private laneSpacing = 0;

  /**
   * コンストラクタ
   * @param scene - ビー玉を生成するBabylon.jsシーン
   */
  constructor(scene: Scene) {
    this.scene = scene;
  }

  // ─── ビー玉生成 ───

  /**
   * 直線・反復横跳び用: 全ビー玉を横並びに z=0 で配置
   * @param baseParams - ビー玉共通物理パラメータ
   * @param presets - 各ビー玉の重量・性能プリセット
   * @returns 生成されたビー玉エントリ配列
   */
  private createMarblesParallel(baseParams: MarbleParams, presets: WeightPreset[]): MarbleEntry[] {
    // レーン間隔: 半径の6倍
    this.laneSpacing = baseParams.radius * 6;
    // 全体幅: (ビー玉数-1) × レーン間隔
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    // 開始X座標: 中央揃えのため全体幅の半分を左にオフセット
    const startX = -totalWidth / 2;

    // 各プリセットに対応するビー玉を横並びに生成
    for (let i = 0; i < presets.length; i++) {
      const xPos = startX + i * this.laneSpacing;
      this.marbles.push(this.buildMarble(baseParams, presets[i], xPos, 0));
    }
    return this.marbles;
  }

  /**
   * ランダム移動用: フィールド中央付近にグリッド+ジッター配置（ヒューマノイドビー玉）
   * @param baseParams - ビー玉共通物理パラメータ
   * @param presets - 各ビー玉の重量・性能プリセット
   * @param areaSize - 配置エリアの一辺のサイズ
   * @returns 生成されたビー玉エントリ配列
   */
  private createMarblesRandom(baseParams: MarbleParams, presets: WeightPreset[], areaSize: number): MarbleEntry[] {
    const half = areaSize / 2;
    // ジッター（位置ずらし）の幅: 半径の3倍
    const spacing = baseParams.radius * 3;
    for (let i = 0; i < presets.length; i++) {
      // グリッド配置: 正方形グリッドの列数を算出
      const cols = Math.ceil(Math.sqrt(presets.length));
      const row = Math.floor(i / cols);  // 行番号
      const col = i % cols;              // 列番号
      // グリッドの中央座標を計算
      const gridX = -half + (col + 0.5) * (areaSize / cols);
      const gridZ = -half + (row + 0.5) * (areaSize / cols);
      // ランダムなジッターを追加して重なりを防止
      const jitterX = (Math.random() - 0.5) * spacing;
      const jitterZ = (Math.random() - 0.5) * spacing;
      // ヒューマノイドビー玉を生成
      this.marbles.push(this.buildHumanoidMarble(baseParams, presets[i], gridX + jitterX, gridZ + jitterZ));
    }
    return this.marbles;
  }

  /**
   * 衝突実験用: ビー玉をペアで対向配置
   *
   * preset[0] vs preset[1] → レーン0, preset[2] vs preset[3] → レーン1
   * @param baseParams - ビー玉共通物理パラメータ
   * @param presets - 各ビー玉の重量・性能プリセット
   * @param startDistance - 対向ビー玉間の初期距離
   * @returns 生成されたビー玉エントリ配列
   */
  private createMarblesCollision(baseParams: MarbleParams, presets: WeightPreset[], startDistance: number): MarbleEntry[] {
    // ペア数: プリセット数の半分
    const pairCount = Math.floor(presets.length / 2);
    this.laneSpacing = baseParams.radius * 6;
    const totalWidth = (pairCount - 1) * this.laneSpacing;
    const startX = -totalWidth / 2;

    for (let p = 0; p < pairCount; p++) {
      const xPos = startX + p * this.laneSpacing;
      // 手前側 (z=0): 偶数番目のプリセット
      this.marbles.push(this.buildMarble(baseParams, presets[p * 2], xPos, 0));
      // 奥側 (z=startDistance): 奇数番目のプリセット
      this.marbles.push(this.buildMarble(baseParams, presets[p * 2 + 1], xPos, startDistance));
    }
    return this.marbles;
  }

  /**
   * 通常ビー玉（球体）を1つ生成
   * @param baseParams - ビー玉共通物理パラメータ
   * @param preset - このビー玉の重量・性能プリセット
   * @param x - X座標
   * @param z - Z座標
   * @returns 生成されたビー玉エントリ
   */
  private buildMarble(baseParams: MarbleParams, preset: WeightPreset, x: number, z: number): MarbleEntry {
    // 球体メッシュを生成（直径 = 半径×2, 32セグメント）
    const mesh = MeshBuilder.CreateSphere(
      `marble_${preset.label}`,
      { diameter: baseParams.radius * 2, segments: 32 },
      this.scene
    );
    // 初期位置: 地面の上に配置（半径分 + 少し浮かせる）
    mesh.position = new Vector3(x, baseParams.radius + 0.05, z);

    // マテリアル: プリセット色で着色、光沢つき
    const mat = new StandardMaterial(`marbleMat_${preset.label}`, this.scene);
    mat.diffuseColor = new Color3(preset.color[0], preset.color[1], preset.color[2]);
    mat.specularColor = new Color3(0.8, 0.8, 0.8); // 光沢（白に近い反射）
    mesh.material = mat;

    // 物理集合体: 球体形状、プリセットの質量を使用
    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      { mass: preset.mass, restitution: baseParams.restitution, friction: baseParams.friction },
      this.scene
    );
    // 物理マテリアル: 摩擦と反発の合成方法をMULTIPLYに設定
    aggregate.shape.material = {
      restitution: baseParams.restitution,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: baseParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
    // 並進減衰: 移動速度の自然減衰率
    aggregate.body.setLinearDamping(baseParams.linearDamping);
    // 回転減衰: 回転速度の自然減衰率
    aggregate.body.setAngularDamping(baseParams.angularDamping);
    // 衝突コールバック有効化: ForceControllerでの衝突検出に必要
    aggregate.body.setCollisionCallbackEnabled(true);

    return { mesh, innerMesh: null, hips: null, legs: [], arms: [], aggregate, preset, laneX: x, startZ: z, materials: undefined };
  }

  /**
   * マテリアル生成ヘルパー: 指定色のStandardMaterialを生成
   * @param name - マテリアル名
   * @param color - 拡散色
   * @returns 生成されたStandardMaterial
   */
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
   * @param baseParams - ビー玉共通物理パラメータ
   * @param preset - このビー玉の重量・性能プリセット
   * @param x - X座標
   * @param z - Z座標
   * @returns 生成されたビー玉エントリ
   */
  private buildHumanoidMarble(baseParams: MarbleParams, preset: WeightPreset, x: number, z: number): MarbleEntry {
    // BOXサイズ: 半径×2.4（胴体の大きさ）
    const boxSize = baseParams.radius * 2.4;
    // 脚の高さ: 半径×2
    const legHeight = baseParams.radius * 2;
    // BOX中心のY座標: 脚の高さ + BOXの半分 + 少し浮かせる
    const boxCenterY = legHeight * 1.07 + boxSize / 2 + 0.05;

    // プリセット色をColor3に変換
    const presetColor = new Color3(preset.color[0], preset.color[1], preset.color[2]);

    // ── マテリアル群: 各パーツの着色用 ──
    /** 肌色マテリアル（頭、前腕、手） */
    const skinMat = this.makeMat(`skin_${preset.label}`, new Color3(0.9, 0.75, 0.6));
    /** シャツマテリアル（胴体、上腕）: プリセット色 */
    const shirtMat = this.makeMat(`shirt_${preset.label}`, presetColor);
    /** パンツマテリアル（股関節、脚）: プリセット色を暗くしたもの */
    const pantsMat = this.makeMat(`pants_${preset.label}`, new Color3(
      preset.color[0] * 0.5, preset.color[1] * 0.5, preset.color[2] * 0.5,
    ));
    /** 靴マテリアル（足） */
    const shoesMat = this.makeMat(`shoes_${preset.label}`, new Color3(0.3, 0.2, 0.15));
    /** 内部ビー玉マテリアル: プリセット色の半透明球体 */
    const sphereMat = this.makeMat(`sphere_${preset.label}`, presetColor);
    sphereMat.specularColor = new Color3(0.8, 0.8, 0.8); // 光沢
    sphereMat.alpha = 0.6; // 半透明

    /** 全マテリアルの配列（破棄時にまとめて解放するため） */
    const allMats = [skinMat, shirtMat, pantsMat, shoesMat, sphereMat];

    // ── 不可視BOXメッシュ（物理ボディ）: ヒューマノイドの物理判定を担当 ──
    const boxMesh = MeshBuilder.CreateBox(
      `box_${preset.label}`,
      { size: boxSize },
      this.scene,
    );
    // 脚の上にBOXが乗る位置に配置
    boxMesh.position = new Vector3(x, boxCenterY, z);
    // 描画しない（胴体パーツが視覚を担当）
    boxMesh.isVisible = false;

    // ── HIPS（股関節メッシュ）: バランスアニメーションの回転基準 ──
    const hipsW = boxSize * 0.48;  // 股関節の幅
    const hipsH = boxSize * 0.15;  // 股関節の高さ
    const hipsD = boxSize * 0.30;  // 股関節の奥行き
    const hips = MeshBuilder.CreateBox(
      `hips_${preset.label}`,
      { width: hipsW, height: hipsH, depth: hipsD },
      this.scene,
    );
    hips.position.y = -boxSize * 0.35; // BOX下部に配置
    hips.material = pantsMat;           // パンツ色
    hips.parent = boxMesh;              // BOXの子として親子関係設定

    // ── TORSO（胴体メッシュ）: 上半身の視覚表示 ──
    const torsoW = boxSize * 0.52; // 胴体の幅
    const torsoH = boxSize * 0.85; // 胴体の高さ
    const torsoD = boxSize * 0.33; // 胴体の奥行き
    const torso = MeshBuilder.CreateBox(
      `torso_${preset.label}`,
      { width: torsoW, height: torsoH, depth: torsoD },
      this.scene,
    );
    torso.position.y = boxSize * 0.05; // BOX中央やや上に配置
    torso.material = shirtMat;          // シャツ色
    torso.parent = boxMesh;             // BOXの子

    // ── HEAD（頭メッシュ）: 球体で頭を表現 ──
    const headDiam = boxSize * 0.37; // 頭の直径
    const head = MeshBuilder.CreateSphere(
      `head_${preset.label}`,
      { diameter: headDiam, segments: 12 },
      this.scene,
    );
    head.position.y = boxSize / 2 + headDiam / 2; // BOX上端の上に配置
    head.material = skinMat;                        // 肌色
    head.parent = boxMesh;                          // BOXの子

    // ── ARMS（腕メッシュ: 上腕 + 前腕 + 手）: 左右2本 ──
    const armH = boxSize * 0.48;     // 上腕の高さ
    const armW = boxSize * 0.15;     // 上腕の幅
    const forearmH = boxSize * 0.37; // 前腕の高さ
    const forearmW = boxSize * 0.13; // 前腕の幅
    const handW = boxSize * 0.12;    // 手の幅
    const handH = boxSize * 0.10;    // 手の高さ

    /** 腕メッシュの配列（左右2本の上腕を格納） */
    const arms: Mesh[] = [];
    for (const side of [-1, 1]) { // -1=左, 1=右
      // 上腕: 肩の位置から下へ伸びる
      const upperArm = MeshBuilder.CreateBox(
        `uArm_${preset.label}_${side}`,
        { width: armW, height: armH, depth: armW },
        this.scene,
      );
      upperArm.position = new Vector3(
        side * (torsoW / 2 + armW / 2), // 胴体の横に配置
        boxSize * 0.2 - armH / 2,       // 肩の高さから下向き
        0,
      );
      // ピボットポイント: 上腕の上端（肩関節で回転するため）
      upperArm.setPivotPoint(new Vector3(0, armH / 2, 0));
      upperArm.material = shirtMat; // シャツ色
      upperArm.parent = boxMesh;    // BOXの子
      arms.push(upperArm);

      // 前腕: 上腕の下に接続
      const forearm = MeshBuilder.CreateBox(
        `fArm_${preset.label}_${side}`,
        { width: forearmW, height: forearmH, depth: forearmW },
        this.scene,
      );
      forearm.position.y = -armH / 2 - forearmH / 2; // 上腕の下端に配置
      forearm.material = skinMat;  // 肌色
      forearm.parent = upperArm;   // 上腕の子

      // 手: 前腕の下に接続
      const hand = MeshBuilder.CreateBox(
        `hand_${preset.label}_${side}`,
        { width: handW, height: handH, depth: handW },
        this.scene,
      );
      hand.position.y = -forearmH / 2 - handH / 2; // 前腕の下端に配置
      hand.material = skinMat;  // 肌色
      hand.parent = forearm;    // 前腕の子
    }

    // ── LEGS（脚メッシュ: 上腿 + 下腿 + 足）: 左右2本 ──
    const upperLegH = legHeight * 0.50;   // 上腿の高さ
    const upperLegW = legHeight * 0.131;  // 上腿の幅
    const lowerLegH = legHeight * 0.50;   // 下腿の高さ
    const lowerLegW = legHeight * 0.107;  // 下腿の幅
    const footH = legHeight * 0.07;       // 足の高さ
    const footD = legHeight * 0.24;       // 足の奥行き
    const legInset = boxSize * 0.3;       // BOX中心からの脚のオフセット

    /** 脚メッシュの配列（左右2本の上腿を格納） */
    const legs: Mesh[] = [];
    for (const [lx, lz] of [[-1, 0], [1, 0]]) { // [-1,0]=左脚, [1,0]=右脚
      // 上腿: BOX下端から下へ伸びる
      const upperLeg = MeshBuilder.CreateBox(
        `uLeg_${preset.label}_${lx}_${lz}`,
        { width: upperLegW, height: upperLegH, depth: upperLegW },
        this.scene,
      );
      upperLeg.position = new Vector3(
        lx * legInset,                   // 左右にオフセット
        -boxSize / 2 - upperLegH / 2,   // BOX下端から下向き
        lz * legInset,                   // 前後オフセット（現在は0）
      );
      // ピボットポイント: 上腿の上端（股関節で回転するため）
      upperLeg.setPivotPoint(new Vector3(0, upperLegH / 2, 0));
      upperLeg.material = pantsMat; // パンツ色
      upperLeg.parent = boxMesh;    // BOXの子
      legs.push(upperLeg);

      // 下腿（膝関節ピボット: 上端で回転）
      const lowerLeg = MeshBuilder.CreateBox(
        `lLeg_${preset.label}_${lx}_${lz}`,
        { width: lowerLegW, height: lowerLegH, depth: lowerLegW },
        this.scene,
      );
      lowerLeg.position.y = -upperLegH / 2 - lowerLegH / 2; // 上腿の下端に配置
      // ピボットポイント: 下腿の上端（膝関節）
      lowerLeg.setPivotPoint(new Vector3(0, lowerLegH / 2, 0));
      lowerLeg.material = pantsMat; // パンツ色
      lowerLeg.parent = upperLeg;   // 上腿の子

      // 足（半球: 上面フラット、底面が半円）
      const foot = MeshBuilder.CreateSphere(
        `foot_${preset.label}_${lx}_${lz}`,
        { diameterX: footD, diameterY: footH * 2, diameterZ: footD, slice: 0.5, segments: 8 },
        this.scene,
      );
      foot.rotation.x = Math.PI;                          // 半球を反転して底面を下に
      foot.position = new Vector3(0, -lowerLegH / 2, footD / 4); // 下腿の下端、やや前方に配置
      foot.material = shoesMat; // 靴色
      foot.parent = lowerLeg;   // 下腿の子
    }

    // ── MARBLE SPHERE (innerMesh): 胴体内部の半透明ビー玉球体 ──
    const sphere = MeshBuilder.CreateSphere(
      `marble_${preset.label}`,
      { diameter: baseParams.radius, segments: 24 },
      this.scene,
    );
    sphere.position.y = -boxSize * 0.35; // 股関節の位置に配置
    sphere.material = sphereMat;          // 半透明プリセット色
    sphere.parent = boxMesh;              // BOXの子

    // ── 物理（BOX形状 + 四肢の衝突球を子シェイプとして追加） ──
    const aggregate = new PhysicsAggregate(
      boxMesh,
      PhysicsShapeType.BOX,
      { mass: preset.mass, restitution: 0, friction: baseParams.friction },
      this.scene,
    );
    /** 物理マテリアル: 反発なし、摩擦はMULTIPLY合成 */
    const physMat = {
      restitution: 0,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: baseParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
    aggregate.shape.material = physMat;
    // 並進減衰を設定
    aggregate.body.setLinearDamping(baseParams.linearDamping);
    // 回転減衰を設定
    aggregate.body.setAngularDamping(baseParams.angularDamping);
    // 衝突コールバック有効化
    aggregate.body.setCollisionCallbackEnabled(true);
    // 重力係数: 1（ForceControllerで分散重力に切り替え時は0にされる）
    aggregate.body.setGravityFactor(1);

    return {
      mesh: boxMesh, innerMesh: sphere, hips, legs, arms, aggregate,
      preset, laneX: x, startZ: z, materials: allMats,
    };
  }

  // ─── 地面・壁 ───

  /**
   * 地面メッシュと物理ボディを生成
   * @param groundParams - 地面の物理パラメータ
   * @param size - 地面の一辺のサイズ(m)
   */
  createGround(groundParams: GroundParams, size: number): void {
    // 正方形の地面メッシュを生成
    this.groundMesh = MeshBuilder.CreateGround("ground", { width: size, height: size }, this.scene);
    // 地面の色: 暗いグレー
    const mat = new StandardMaterial("groundMat", this.scene);
    mat.diffuseColor = new Color3(0.35, 0.35, 0.4);
    this.groundMesh.material = mat;

    // 地面の物理集合体: 質量0（静的オブジェクト）
    this.groundAggregate = new PhysicsAggregate(
      this.groundMesh, PhysicsShapeType.BOX,
      { mass: 0, restitution: groundParams.restitution, friction: groundParams.friction },
      this.scene
    );
    // 物理マテリアルの合成モード設定
    this.groundAggregate.shape.material = {
      restitution: groundParams.restitution,
      restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY,
      friction: groundParams.friction,
      frictionCombine: PhysicsMaterialCombineMode.MULTIPLY,
    };
  }

  /**
   * フィールドを囲む壁（4面 + 天井）を生成
   * @param size - フィールドの一辺のサイズ(m)
   * @param height - 壁の高さ(m)
   * @param restitution - 壁の反発係数
   */
  createWalls(size: number, height: number, restitution: number): void {
    const halfSize = size / 2;      // フィールドの半分のサイズ
    const wallThickness = 0.5;      // 壁の厚み(m)
    /** 4面の壁の定義: 名前、幅、奥行き、位置 */
    const wallDefs = [
      { name: "wallN", w: size, d: wallThickness, x: 0, z: halfSize },   // 北壁
      { name: "wallS", w: size, d: wallThickness, x: 0, z: -halfSize },  // 南壁
      { name: "wallE", w: wallThickness, d: size, x: halfSize, z: 0 },   // 東壁
      { name: "wallW", w: wallThickness, d: size, x: -halfSize, z: 0 },  // 西壁
    ];
    for (const def of wallDefs) {
      // 壁メッシュを生成
      const mesh = MeshBuilder.CreateBox(def.name, { width: def.w, height: height, depth: def.d }, this.scene);
      mesh.position = new Vector3(def.x, height / 2, def.z); // 地面から壁の高さの半分の位置
      // 壁のマテリアル: 半透明のグレー
      const mat = new StandardMaterial(def.name + "Mat", this.scene);
      mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
      mat.alpha = 0.15; // ほぼ透明
      mesh.material = mat;

      // 壁の物理集合体: 質量0（静的）、反発と摩擦を設定
      const agg = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, restitution, friction: 0.2 }, this.scene);
      agg.shape.material = { restitution, restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY, friction: 0.2, frictionCombine: PhysicsMaterialCombineMode.MULTIPLY };
      this.wallMeshes.push(mesh);
      this.wallAggregates.push(agg);
    }

    // 天井: ビー玉が上に飛び出さないための蓋
    const ceilingMesh = MeshBuilder.CreateBox("ceiling", { width: size, height: wallThickness, depth: size }, this.scene);
    ceilingMesh.position = new Vector3(0, height, 0); // 壁の高さに配置
    // 天井のマテリアル: ほぼ透明のグレー
    const ceilingMat = new StandardMaterial("ceilingMat", this.scene);
    ceilingMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    ceilingMat.alpha = 0.1;
    ceilingMesh.material = ceilingMat;

    // 天井の物理集合体
    const ceilingAgg = new PhysicsAggregate(ceilingMesh, PhysicsShapeType.BOX, { mass: 0, restitution, friction: 0.2 }, this.scene);
    ceilingAgg.shape.material = { restitution, restitutionCombine: PhysicsMaterialCombineMode.MULTIPLY, friction: 0.2, frictionCombine: PhysicsMaterialCombineMode.MULTIPLY };
    this.wallMeshes.push(ceilingMesh);
    this.wallAggregates.push(ceilingAgg);
  }

  // ─── コース装飾 ───

  /**
   * 直線コースの装飾: スタートライン + ゴールライン + レーン区切り
   * @param presets - ビー玉プリセット（レーン数の算出に使用）
   * @param goalDistance - ゴールまでの距離
   */
  private decorateStraight(presets: WeightPreset[], goalDistance: number): void {
    // トラック全体の幅を計算
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    const trackWidth = totalWidth + this.laneSpacing; // 両端にマージン
    const startX = -totalWidth / 2;

    // スタートライン（白）: z=0
    this.addLine("startLine", trackWidth, 0, new Color3(1, 1, 1));
    // ゴールライン（黄色）: z=goalDistance
    this.addLine("goalLine", trackWidth, goalDistance, new Color3(1, 0.9, 0.2));
    // レーン区切りの破線
    this.addLaneDashes(presets.length, startX, 0, goalDistance + 5);
  }

  /**
   * 反復横跳びコースの装飾: 左右境界ライン + 中央ライン
   * @param presets - ビー玉プリセット（レーン数の算出に使用）
   * @param shuttleWidth - 跳び幅
   */
  private decorateLateralShuttle(presets: WeightPreset[], shuttleWidth: number): void {
    const totalWidth = (presets.length - 1) * this.laneSpacing;
    const startX = -totalWidth / 2;
    const lineDepth = 4;  // ラインの奥行き(m)
    const shuttleZ = 5;   // ビー玉のZ位置

    // 左ラインのマテリアル（赤）
    const leftMat = new StandardMaterial("leftLineMat", this.scene);
    leftMat.diffuseColor = new Color3(1, 0.4, 0.4);
    // 右ラインのマテリアル（青）
    const rightMat = new StandardMaterial("rightLineMat", this.scene);
    rightMat.diffuseColor = new Color3(0.4, 0.4, 1);
    // 中央ラインのマテリアル（白半透明）
    const centerMat = new StandardMaterial("centerLineMat", this.scene);
    centerMat.diffuseColor = new Color3(1, 1, 1);
    centerMat.alpha = 0.5;

    // 各レーンに左右境界ラインと中央ラインを配置
    for (let i = 0; i < presets.length; i++) {
      const lx = startX + i * this.laneSpacing; // レーンのX中心

      // 左ライン（赤）: 左側の折り返し地点
      const leftLine = MeshBuilder.CreateBox(`leftLine_${i}`, { width: 0.1, height: 0.02, depth: lineDepth }, this.scene);
      leftLine.position = new Vector3(lx - shuttleWidth, 0.01, shuttleZ);
      leftLine.material = leftMat;
      this.decorMeshes.push(leftLine);

      // 右ライン（青）: 右側の折り返し地点
      const rightLine = MeshBuilder.CreateBox(`rightLine_${i}`, { width: 0.1, height: 0.02, depth: lineDepth }, this.scene);
      rightLine.position = new Vector3(lx + shuttleWidth, 0.01, shuttleZ);
      rightLine.material = rightMat;
      this.decorMeshes.push(rightLine);

      // 中央ライン（白半透明）: レーンの中央位置
      const centerLine = MeshBuilder.CreateBox(`centerLine_${i}`, { width: 0.06, height: 0.02, depth: lineDepth }, this.scene);
      centerLine.position = new Vector3(lx, 0.01, shuttleZ);
      centerLine.material = centerMat;
      this.decorMeshes.push(centerLine);
    }
  }

  /**
   * ランダムコースの装飾: 中央に範囲を示す矩形ライン
   * @param areaSize - 移動範囲の一辺のサイズ
   */
  private decorateRandom(areaSize: number): void {
    const half = areaSize / 2;
    // 範囲ラインのマテリアル（水色半透明）
    const lineMat = new StandardMaterial("randomAreaMat", this.scene);
    lineMat.diffuseColor = new Color3(0.4, 0.8, 1.0);
    lineMat.alpha = 0.3;

    /** 4辺の範囲ラインの定義: 名前、幅、奥行き、位置 */
    const defs = [
      { name: "rN", w: areaSize, d: 0.08, x: 0, z: half },   // 北辺
      { name: "rS", w: areaSize, d: 0.08, x: 0, z: -half },  // 南辺
      { name: "rE", w: 0.08, d: areaSize, x: half, z: 0 },   // 東辺
      { name: "rW", w: 0.08, d: areaSize, x: -half, z: 0 },  // 西辺
    ];
    for (const def of defs) {
      // 範囲ライン（地面に薄く表示）
      const mesh = MeshBuilder.CreateBox(def.name, { width: def.w, height: 0.02, depth: def.d }, this.scene);
      mesh.position = new Vector3(def.x, 0.01, def.z);
      mesh.material = lineMat;
      this.decorMeshes.push(mesh);
    }
  }

  /**
   * 衝突実験コースの装飾: スタートライン×2 + 衝突ポイント + レーン区切り
   * @param presets - ビー玉プリセット（レーン数の算出に使用）
   * @param startDistance - 対向ビー玉間の距離
   */
  private decorateCollision(presets: WeightPreset[], startDistance: number): void {
    // ペア数からトラック幅を計算
    const pairCount = Math.floor(presets.length / 2);
    const totalWidth = (pairCount - 1) * this.laneSpacing;
    const trackWidth = totalWidth + this.laneSpacing;
    const startX = -totalWidth / 2;
    const midZ = startDistance / 2; // 衝突ポイント

    // スタートライン手前（白）: z=0
    this.addLine("startLineA", trackWidth, 0, new Color3(1, 1, 1));
    // スタートライン奥（白）: z=startDistance
    this.addLine("startLineB", trackWidth, startDistance, new Color3(1, 1, 1));
    // 衝突ポイント（赤）: z=midZ（2つのスタートラインの中間）
    this.addLine("collisionLine", trackWidth, midZ, new Color3(1, 0.2, 0.2));

    // レーン区切りの破線
    this.addLaneDashes(pairCount, startX, -2, startDistance + 2);
  }

  /**
   * 地面にラインメッシュを追加
   * @param name - メッシュ名
   * @param width - ラインの幅(m)
   * @param z - Z座標
   * @param color - ラインの色
   */
  private addLine(name: string, width: number, z: number, color: Color3): void {
    // 薄いBOXでラインを表現
    const line = MeshBuilder.CreateBox(name, { width, height: 0.02, depth: 0.15 }, this.scene);
    line.position = new Vector3(0, 0.01, z); // 地面のすぐ上
    const mat = new StandardMaterial(name + "Mat", this.scene);
    mat.diffuseColor = color;
    line.material = mat;
    this.decorMeshes.push(line);
  }

  /**
   * レーン区切りの破線を追加
   * @param laneCount - レーン数
   * @param startX - 最左レーンのX座標
   * @param zFrom - 破線の開始Z座標
   * @param zTo - 破線の終了Z座標
   */
  private addLaneDashes(laneCount: number, startX: number, zFrom: number, zTo: number): void {
    // 破線のマテリアル（薄いグレー半透明）
    const dashMat = new StandardMaterial("laneDashMat", this.scene);
    dashMat.diffuseColor = new Color3(0.55, 0.55, 0.55);
    dashMat.alpha = 0.3;

    // 各レーン間に破線を配置
    for (let i = 0; i <= laneCount; i++) {
      const lx = startX + (i - 0.5) * this.laneSpacing; // レーン間の中間位置
      // Z方向に2m間隔で破線を配置
      for (let z = zFrom; z < zTo; z += 2) {
        const dash = MeshBuilder.CreateBox(`lane_${i}_${z}`, { width: 0.03, height: 0.02, depth: 0.8 }, this.scene);
        dash.position = new Vector3(lx, 0.01, z + 0.5);
        dash.material = dashMat;
        this.decorMeshes.push(dash);
      }
    }
  }

  // ─── 統合 ───

  /**
   * コースタイプに応じて地面・壁・ビー玉・装飾をすべて生成
   * @param config - シミュレーション全体設定
   * @returns 生成されたビー玉エントリ配列
   */
  createAll(config: SimulationConfig): MarbleEntry[] {
    // 地面を生成
    this.createGround(config.ground, config.groundSize);
    // 壁を生成
    this.createWalls(config.groundSize, config.wallHeight, config.marble.restitution);

    // コースタイプに応じてビー玉と装飾を生成
    switch (config.courseType) {
      case CourseType.STRAIGHT:
        // 直線コース: 横並び配置 + スタート/ゴールライン
        this.createMarblesParallel(config.marble, config.weightPresets);
        this.decorateStraight(config.weightPresets, config.straight.goalDistance);
        break;
      case CourseType.LATERAL_SHUTTLE:
        // 反復横跳びコース: 横並び配置 + 左右ライン
        this.createMarblesParallel(config.marble, config.weightPresets);
        this.decorateLateralShuttle(config.weightPresets, config.lateralShuttle.shuttleWidth);
        break;
      case CourseType.COLLISION:
        // 衝突実験コース: 対向配置 + スタートライン + 衝突ポイント
        this.createMarblesCollision(config.marble, config.weightPresets, config.collision.startDistance);
        this.decorateCollision(config.weightPresets, config.collision.startDistance);
        break;
      case CourseType.RANDOM:
        // ランダムコース: グリッド+ジッター配置 + 範囲ライン
        this.createMarblesRandom(config.marble, config.weightPresets, config.random.areaSize);
        this.decorateRandom(config.random.areaSize);
        break;
    }
    return this.marbles;
  }

  /**
   * 生成済みビー玉エントリ配列を取得
   * @returns ビー玉エントリの配列
   */
  getMarbles(): MarbleEntry[] {
    return this.marbles;
  }

  /**
   * 全ビー玉をスタート位置にリセット
   *
   * 速度・角速度をゼロにし、位置・回転・スケーリングを初期状態に戻す
   * @param baseParams - ビー玉共通物理パラメータ（Y座標の計算に使用）
   */
  resetMarbles(baseParams: MarbleParams): void {
    for (const entry of this.marbles) {
      // 速度をゼロに
      entry.aggregate.body.setLinearVelocity(Vector3.Zero());
      // 角速度をゼロに
      entry.aggregate.body.setAngularVelocity(Vector3.Zero());
      // Y座標: ヒューマノイドは脚+BOX分の高さ、通常は球の半径分
      const yOffset = entry.innerMesh
        ? baseParams.radius * 2.14 + baseParams.radius * 2.4 / 2 + 0.05
        : baseParams.radius + 0.05;
      // スタート位置に戻す
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
            foot.scaling.set(1, 1, 1); // 足裏の変形をリセット
          }
        }
      }
      // 腕の回転をリセット
      for (const arm of entry.arms) {
        arm.rotation.set(0, 0, 0);
      }
      // 物理のプリステップを一時無効化（位置テレポート用）
      entry.aggregate.body.disablePreStep = false;
    }
    // 100ms後にプリステップを再有効化（物理シミュレーションが位置を反映するまで待つ）
    setTimeout(() => {
      for (const entry of this.marbles) {
        entry.aggregate.body.disablePreStep = true;
      }
    }, 100);
  }

  /**
   * 全リソースを破棄してメモリを解放
   *
   * ビー玉、地面、壁、装飾のメッシュ・物理・マテリアルをすべて破棄
   */
  dispose(): void {
    // ビー玉の物理・メッシュ・マテリアルを破棄
    for (const entry of this.marbles) {
      entry.aggregate.dispose();
      entry.innerMesh?.dispose();
      entry.mesh.dispose();
      if (entry.materials) {
        for (const mat of entry.materials) mat.dispose();
      }
    }
    this.marbles = [];
    // 壁の物理・メッシュを破棄
    for (const agg of this.wallAggregates) agg.dispose();
    for (const mesh of this.wallMeshes) mesh.dispose();
    // 装飾メッシュを破棄
    for (const mesh of this.decorMeshes) mesh.dispose();
    this.decorMeshes = [];
    // 地面の物理・メッシュを破棄
    this.groundAggregate?.dispose();
    this.groundMesh?.dispose();
  }
}
