// Babylon.js コアモジュール: ベクトル, シーン, メッシュ生成, マテリアル, 色, メッシュ, 物理ボディ, 物理イベント, オブザーバー
import {
  Vector3,
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  PhysicsBody,
  PhysicsEventType,
  Observer,
} from "@babylonjs/core";
// 型定義: シミュレーション設定, コースタイプ, 各コース設定
import {
  SimulationConfig,
  CourseType,
  StraightConfig,
  LateralShuttleConfig,
  CollisionConfig,
  RandomConfig,
} from "@/SimulationPlay/MarbleSimulation/Types/MarbleConfig";
// ビー玉エントリの型定義
import { MarbleEntry } from "@/SimulationPlay/MarbleSimulation/Physics/MarbleBody";

/** 停止判定の速度閾値: この速度以下で停止とみなす */
const STOP_THRESHOLD = 0.3;

// ─── 衝突エフェクト ───

/** 衝突エフェクトの持続時間(秒) */
const COLLISION_FX_DURATION = 0.35;
/** エフェクトの最大スケール倍率 */
const COLLISION_FX_MAX_SCALE = 2.5;

/** 衝突エフェクトの状態管理 */
interface CollisionFx {
  /** エフェクト表示用の球体メッシュ */
  mesh: Mesh;
  /** エフェクト生成からの経過時間(秒) */
  age: number;
}

/** 接地判定: 足裏が地面に面しているか（移動力の適用条件） */
function isGrounded(entry: MarbleEntry, radius: number): boolean {
  if (entry.innerMesh) {
    // ヒューマノイド: 直立度 + Y位置で接地を判定
    // 直立度 > 0.5（傾き60°以内）かつ、足が地面付近にあること
    const uprightness = Math.max(0, entry.mesh.getWorldMatrix().m[5]);
    if (uprightness <= 0.5) return false;
    // boxCenterY の期待値から余裕を持たせた高さ以下であること
    const expectedY = radius * 2.14 + radius * 2.4 / 2 + 0.05;
    return entry.mesh.position.y <= expectedY + 0.3;
  }
  return entry.mesh.position.y <= radius + 0.15;
}

/** 脚付き箱の「無荷重時」ターゲットY座標（脚アニメーション基準用） */
function boxedTargetY(radius: number): number {
  return radius * 2.14 + radius * 2.4 / 2 + 0.05;
}

// ─── 脚ごとの接地バネ ───

/**
 * 脚1本あたりのバネ定数
 * 2本全接地時の合算で荷重を支える: equilibrium sag ≈ mass*g / (2*K)
 */
const LEG_SPRING_K = 50;
/** 脚1本あたりの減衰定数（足先の垂直速度に対して適用） */
const LEG_DAMPING_K = 20;
/** 足先が接地と判定されるY座標（地面 = 0、足パッドの厚み分のマージン） */
const LEG_GROUND_Y = 0.05;
/** 脚バネの最大貫通深度: これ以上の貫通では力が頭打ちになり、復帰時の打ち上げを防ぐ */
const LEG_MAX_PENETRATION = 0.5;
/**
 * 減衰が完全に効くまでの浸透深度
 *
 * 表面付近（浸透量が小さい）では減衰力を弱め、深くなるほど強くする。
 * これにより初回接触時に減衰力だけで体を打ち上げるのを防ぐ。
 */
const DAMP_FULL_PEN = 0.06;
/**
 * 接地面上部の減衰ゾーン高さ(m)
 *
 * 足が地面を離れた直後でも、この範囲内で上昇速度を減衰する。
 * バネ力がゼロになった後のオーバーシュート（跳ね）を防止する。
 */
const DAMP_ABOVE_GROUND = 0.08;
/** 足裏の摩擦係数: 接地中の脚ごとに法線力×μの水平ブレーキ力を適用 */
const FOOT_FRICTION_MU = 0.8;
/**
 * 足裏ピボット係数: 接地中に水平衝撃を下方向に変換する強さ
 *
 * 足が支点となり、水平方向の運動量が回転（=下方向への沈み込み）に変換される。
 * 値が大きいほど、衝撃を受けたとき足元に引き込まれるように沈む。
 */
const FOOT_PIVOT_FACTOR = 0.4;

/**
 * 転倒復帰トルクの強さ（毎秒あたり、deltaTimeでスケーリング）
 *
 * 脚バネが主な復帰力を生むが、追加トルクで安定化を補助する。
 * ※ applyAngularImpulse は impulse = torque × dt で使用すること。
 */
const UPRIGHT_TORQUE = 30;
/**
 * 回転減衰: 復帰時の振動を抑制（毎秒あたり）
 *
 * トルクに対して十分な減衰がないと角振動が発生し、
 * 地面を支点としたテコの原理で体が打ち上げられる。
 */
const UPRIGHT_ANG_DAMPING = 8;

// ─── 部位別重量配分（分散重力用） ───
// 人体の平均的な質量比率（total = 1.0）
// 参考: Winter (2009), Biomechanics and Motor Control of Human Movement

/** コア（頭8.1% + 胴体43.0% + 腰6.7%）— boxMesh中心に適用 */
const MASS_FRAC_CORE = 0.578;
/** 上腕（1本あたり） */
const MASS_FRAC_UPPER_ARM = 0.028;
/** 前腕（1本あたり） */
const MASS_FRAC_FOREARM = 0.016;
/** 手（1本あたり） */
const MASS_FRAC_HAND = 0.006;
/** 大腿（1本あたり） */
const MASS_FRAC_THIGH = 0.100;
/** 下腿（1本あたり） */
const MASS_FRAC_SHANK = 0.047;
/** 足（1本あたり） */
const MASS_FRAC_FOOT = 0.014;

// ─── 脚バランスアニメーション ───

/** 脚の角位置: buildBoxedMarble の生成順序に一致 */
const LEG_CORNERS: [number, number][] = [[-1, 0], [1, 0]];
/** 傾きに対する脚の開き倍率 */
const BALANCE_GAIN = 2.5;
/** 荷重（沈み量）に対する脚の外開き倍率 */
const WEIGHT_SPLAY_GAIN = 3.0;
/** 脚の最大開き角度 (rad) */
const BALANCE_MAX_ANGLE = Math.PI / 5; // 36°
/**
 * 膝の吸収比率: 上腿回転のうち膝で吸収する割合(0〜1)
 *
 * 角度が大きいほど膝の分担が増える（progressive knee bend）。
 * 0 = 膝は曲がらない（全て足首で補正）
 * 1 = 全て膝で吸収（足首は box tilt のみ補正）
 */
const KNEE_FACTOR_MAX = 0.6;
/**
 * 膝の衝撃吸収角度: 脚バネ力に比例した追加膝曲げの最大角度
 *
 * 着地衝撃や動的荷重を膝の屈曲で吸収する。
 * 力が大きいほど深く膝を曲げて衝撃を和らげる。
 */
const KNEE_ABSORB_MAX = Math.PI / 8;  // 22.5°
/**
 * 股関節の吸収比率: box傾きのうち股関節で吸収する割合(0〜1)
 *
 * 傾きが大きいほど股関節の分担が増える（progressive hip bend）。
 * 0 = 股関節は動かない（全て膝と足首で補正）
 * 1 = box傾きを全て股関節で吸収
 */
const HIP_FACTOR_MAX = 0.3;
/**
 * 足裏変形: 荷重に対するY方向の最大圧縮率
 *
 * 0 = 変形なし, 1 = 完全に潰れる
 * 足裏が荷重を受けるとY方向に縮み、XZ方向に広がる（柔らかさの表現）
 */
const FOOT_DEFORM_COMPRESS = 0.4;
/** 足裏変形: 荷重に対するXZ方向の最大拡張率 */
const FOOT_DEFORM_EXPAND = 0.25;

// ─── 関節衝撃吸収 ───

/**
 * 関節衝撃吸収: 関節角速度(rad/s)に対する減衰係数
 *
 * 衝撃を受けて関節（股関節・膝・足首）が動くと、その動きの速さに応じて
 * ボディの水平速度を減衰させる。関節が激しく動くほど多くのエネルギーを吸収する。
 */
const JOINT_ABSORPTION_GAIN = 1.0;
/** 関節衝撃吸収: 減衰係数の上限（過剰な減衰を防ぐ） */
const JOINT_ABSORPTION_MAX = 20;

// ─── 転倒復帰 ───

/** 転倒判定の閾値: uprightness がこの値以下で転倒とみなす */
const FALLEN_THRESHOLD = 0.15;
/** 転倒から復帰開始までの待機時間(秒) */
const FALLEN_DELAY = 0.3;
/** 転倒状態での待機時間(秒) — この後 GETTING_UP に遷移 */
const RECOVERY_WAIT = 0.5;
/** 復帰完了判定: uprightness がこの値以上で復帰完了 */
const RECOVERED_THRESHOLD = 0.6;
/**
 * 腕支持力: 傾きに比例した能動的な押し上げ力（1本あたり）
 *
 * バネ反発ではなく、腕が地面を押して体を回転させる「筋力」に相当する。
 * 手の接地位置に力を加えることで、手を支点とした自然なトルクが発生する。
 */
const ARM_SUPPORT_FORCE = 3;
/** 腕支持: 地面貫通に対する位置補正（穏やかな値でめり込み防止のみ） */
const ARM_PUSH_K = 5;
/** 腕支持: 双方向速度減衰（上下どちらの動きも吸収しバウンスを完全に防ぐ） */
const ARM_PUSH_D = 40;
/** 復帰中の腕の伸ばし角度（前方に伸ばして地面を押す） */
const RECOVERY_ARM_EXTEND = Math.PI * 0.4;

/** 転倒復帰の状態遷移: NORMAL(通常) → FALLEN(転倒) → GETTING_UP(起き上がり中) → NORMAL */
enum RecoveryState {
  /** 通常状態: 直立している */
  NORMAL,
  /** 転倒状態: 倒れて待機中 */
  FALLEN,
  /** 起き上がり中: 腕で地面を押して復帰中 */
  GETTING_UP,
}

// ─── 頭部接地制約 ───

/**
 * 四肢接地: 位置補正バネ定数
 *
 * 意図的に弱い値: 一点では体重(≈5N)を支えられない → ピボット防止。
 * Havokの箱体衝突が地面に到達してから分散支持される。
 */
const EXTREMITY_GROUND_K = 5;
/** 四肢接地: 下方向速度の減衰定数（弱い値でバウンス防止のみ） */
const EXTREMITY_GROUND_D = 2;

// ─── ビー玉落下（衝撃吸収） ───

/**
 * ビー玉落下: 接地時の復帰速度（ratio/秒）
 *
 * 衝撃を受けるとビー玉が足元へ落下し、接地中にゆっくり元の位置に戻る。
 * 値が大きいほど素早く復帰する。
 */
const MARBLE_DROP_RECOVERY = 1.2;
/** ビー玉落下: 非接地時の落下速度（ratio/秒） — 足裏が地面に面していないとき下降 */
const MARBLE_DROP_FALL_RATE = 2.0;

// ─── 直線コース ───

/** 直線コースの各ビー玉の進行フェーズ */
enum StraightPhase {
  /** レース中: ゴールに向かって加速 */
  RACING,
  /** ブレーキ中: ゴール到達後に減速 */
  BRAKE,
  /** 完了: 停止済み */
  FINISHED,
}

/**
 * 直線コースのコントローラー
 *
 * 各ビー玉をZ方向に加速し、ゴール到達後にブレーキ、全員停止後にリセット
 */
class StraightController {
  /** 制御対象のビー玉エントリ配列 */
  private entries: MarbleEntry[];
  /** 直線コースの設定 */
  private config: StraightConfig;
  /** ビー玉の半径(m) */
  private radius: number;
  /** リセット時に呼ばれるコールバック */
  private onReset: () => void;
  /** 各ビー玉の現在のフェーズ */
  private phases: StraightPhase[];
  /** 全員完了フラグ */
  private allFinished = false;
  /** 全員完了後の待機タイマー(秒) */
  private waitTimer = 0;

  /**
   * @param entries - 制御対象のビー玉配列
   * @param config - 直線コースの設定
   * @param radius - ビー玉の半径
   * @param onReset - リセット時のコールバック
   */
  constructor(entries: MarbleEntry[], config: StraightConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.phases = entries.map(() => StraightPhase.RACING);
  }

  /**
   * 毎フレーム更新: 各ビー玉のフェーズに応じて力を適用
   * @param deltaTime - 前フレームからの経過時間(秒)
   */
  update(deltaTime: number): void {
    // 全員完了後: 待機タイマーを進め、時間が来たらリセット
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      // ビー玉の物理ボディの重心ワールド座標を取得
      const center = entry.aggregate.body.getObjectCenterWorld();
      // 現在の速度ベクトルを取得
      const velocity = entry.aggregate.body.getLinearVelocity();
      // 速度の大きさ(スカラー)
      const speed = velocity.length();

      switch (this.phases[i]) {
        case StraightPhase.RACING:
          // ゴール到達判定: Z位置がゴール距離を超えたらブレーキへ
          if (entry.mesh.position.z >= this.config.goalDistance) {
            this.phases[i] = StraightPhase.BRAKE;
            break;
          }
          // 接地中のみ加速（空中では加速不可）
          if (speed < entry.preset.maxSpeed && isGrounded(entry, this.radius)) {
            entry.aggregate.body.applyForce(new Vector3(0, 0, entry.preset.accelerationPower), center);
          }
          break;

        case StraightPhase.BRAKE:
          // 停止判定: 速度が閾値以下で完了へ
          if (speed < STOP_THRESHOLD) {
            this.phases[i] = StraightPhase.FINISHED;
            break;
          }
          // 進行方向と逆向きにブレーキ力を適用
          entry.aggregate.body.applyForce(velocity.normalize().scale(-entry.preset.brakePower), center);
          break;

        case StraightPhase.FINISHED:
          // 完了カウントを増やす
          finishedCount++;
          break;
      }
    }

    // 全員完了したら待機フェーズに移行
    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  /** 全ビー玉のフェーズをRACINGに戻し、タイマーをリセット */
  reset(): void {
    this.phases = this.entries.map(() => StraightPhase.RACING);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── 反復横跳びコース ───

/** 反復横跳びコースの各ビー玉の進行フェーズ */
enum ShuttlePhase {
  /** シャトル中: 左右のターゲット間を往復 */
  SHUTTLING,
  /** 完了: 全往復を終えて停止 */
  FINISHED,
}

/**
 * 反復横跳びコースのコントローラー
 *
 * 各ビー玉を左右のターゲットX座標間で往復させる
 */
class LateralShuttleController {
  /** 制御対象のビー玉エントリ配列 */
  private entries: MarbleEntry[];
  /** 反復横跳びコースの設定 */
  private config: LateralShuttleConfig;
  /** リセット時に呼ばれるコールバック */
  private onReset: () => void;
  /** 各ビー玉の現在のフェーズ */
  private phases: ShuttlePhase[];
  /** 各ビー玉の現在のターゲットX座標リスト（左右交互） */
  private targets: number[][];
  /** 各ビー玉の現在のターゲットインデックス */
  private targetIndices: number[];
  /** 全員完了フラグ */
  private allFinished = false;
  /** 全員完了後の待機タイマー(秒) */
  private waitTimer = 0;

  /** Z方向のドリフトを抑制する力 */
  private static readonly Z_DAMPING = 10;
  /** ターゲットX到達判定距離 */
  private static readonly ARRIVE_THRESHOLD = 0.8;
  /** 横方向の速度ダンピング（ターゲット近くでオーバーシュート防止） */
  private static readonly X_DAMPING = 5;

  /** ビー玉の半径(m) */
  private radius: number;

  constructor(entries: MarbleEntry[], config: LateralShuttleConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.phases = entries.map(() => ShuttlePhase.SHUTTLING);
    this.targets = entries.map(e => this.generateTargets(e.laneX));
    this.targetIndices = entries.map(() => 0);
  }

  /**
   * ターゲットX座標リストを生成（左右交互 + 最後に中央）
   * @param laneX - レーンの中心X座標
   * @returns ターゲットX座標の配列
   */
  private generateTargets(laneX: number): number[] {
    const left = laneX - this.config.shuttleWidth;
    const right = laneX + this.config.shuttleWidth;
    const list: number[] = [];
    for (let r = 0; r < this.config.roundTrips; r++) {
      list.push(left, right);
    }
    list.push(laneX); // 最後に中央に戻る
    return list;
  }

  update(deltaTime: number): void {
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const center = entry.aggregate.body.getObjectCenterWorld();
      const velocity = entry.aggregate.body.getLinearVelocity();

      switch (this.phases[i]) {
        case ShuttlePhase.SHUTTLING: {
          const ti = this.targetIndices[i];
          if (ti >= this.targets[i].length) {
            this.phases[i] = ShuttlePhase.FINISHED;
            break;
          }

          const targetX = this.targets[i][ti];
          const errorX = targetX - entry.mesh.position.x;

          // ターゲット到達判定
          if (Math.abs(errorX) < LateralShuttleController.ARRIVE_THRESHOLD) {
            this.targetIndices[i]++;
            break;
          }

          // 接地中のみ横方向の力（空中では加速不可）
          if (!isGrounded(entry, this.radius)) break;
          const xForce = Math.sign(errorX) * entry.preset.accelerationPower;
          entry.aggregate.body.applyForce(new Vector3(xForce, 0, 0), center);

          // X方向オーバーシュート抑制
          entry.aggregate.body.applyForce(
            new Vector3(-velocity.x * LateralShuttleController.X_DAMPING, 0, 0), center
          );

          // Z方向ドリフト抑制
          entry.aggregate.body.applyForce(
            new Vector3(0, 0, -velocity.z * LateralShuttleController.Z_DAMPING), center
          );
          break;
        }

        case ShuttlePhase.FINISHED:
          finishedCount++;
          break;
      }
    }

    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  /** 全ビー玉のフェーズをSHUTTLINGに戻し、ターゲットとタイマーをリセット */
  reset(): void {
    this.phases = this.entries.map(() => ShuttlePhase.SHUTTLING);
    this.targetIndices = this.entries.map(() => 0);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── 衝突実験コース ───

/** 衝突実験コースの各ビー玉の進行フェーズ */
enum CollisionPhase {
  /** 加速中: 中央の衝突ポイントに向かって加速 */
  ACCEL,
  /** コースト中: 衝突後に減速待ち */
  COAST,
  /** 完了: 停止済み */
  FINISHED,
}

/**
 * 衝突実験コースのコントローラー
 *
 * 対向配置のビー玉を中央に向かって加速させ、衝突後に停止を待つ
 */
class CollisionController {
  /** 制御対象のビー玉エントリ配列 */
  private entries: MarbleEntry[];
  /** 衝突実験コースの設定 */
  private config: CollisionConfig;
  /** リセット時に呼ばれるコールバック */
  private onReset: () => void;
  /** 各ビー玉の現在のフェーズ */
  private phases: CollisionPhase[];
  /** 衝突ポイントのZ座標（対向距離の中間点） */
  private midZ: number;
  /** 全員完了フラグ */
  private allFinished = false;
  /** 全員完了後の待機タイマー(秒) */
  private waitTimer = 0;

  /** ビー玉の半径(m) */
  private radius: number;

  constructor(entries: MarbleEntry[], config: CollisionConfig, radius: number, onReset: () => void) {
    this.entries = entries;
    this.config = config;
    this.radius = radius;
    this.onReset = onReset;
    this.midZ = config.startDistance / 2;
    this.phases = entries.map(() => CollisionPhase.ACCEL);
  }

  update(deltaTime: number): void {
    if (this.allFinished) {
      this.waitTimer += deltaTime;
      if (this.waitTimer >= this.config.waitDuration) {
        this.reset();
        this.onReset();
      }
      return;
    }

    let finishedCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const center = entry.aggregate.body.getObjectCenterWorld();
      const velocity = entry.aggregate.body.getLinearVelocity();
      const speed = velocity.length();

      // 手前 (startZ=0) → +Z方向、奥 (startZ>0) → -Z方向
      const direction = entry.startZ < this.midZ ? 1 : -1;

      switch (this.phases[i]) {
        case CollisionPhase.ACCEL: {
          // 中央を通過したらコースト
          const passedMid = direction > 0
            ? entry.mesh.position.z >= this.midZ
            : entry.mesh.position.z <= this.midZ;
          if (passedMid) {
            this.phases[i] = CollisionPhase.COAST;
            break;
          }

          // 接地中のみ加速（空中では加速不可）
          if (speed < entry.preset.maxSpeed && isGrounded(entry, this.radius)) {
            entry.aggregate.body.applyForce(
              new Vector3(0, 0, direction * entry.preset.accelerationPower), center
            );
          }
          break;
        }

        case CollisionPhase.COAST:
          if (speed < STOP_THRESHOLD) {
            this.phases[i] = CollisionPhase.FINISHED;
          }
          break;

        case CollisionPhase.FINISHED:
          finishedCount++;
          break;
      }
    }

    if (finishedCount >= this.entries.length) {
      this.allFinished = true;
      this.waitTimer = 0;
    }
  }

  /** 全ビー玉のフェーズをACCELに戻し、タイマーをリセット */
  reset(): void {
    this.phases = this.entries.map(() => CollisionPhase.ACCEL);
    this.allFinished = false;
    this.waitTimer = 0;
  }
}

// ─── ランダム移動コース（中央目標） ───

/**
 * 全ビー玉がフィールド中央(0,0)を目指して移動するコントローラー
 *
 * 挙動:
 *   1. 中央へ向かう力を常に受ける（距離に比例）
 *   2. 中央付近でぶつかり合い、弾かれて外へ
 *   3. 離れるほど引き戻す力が強まり、再び中央へ突進
 *   4. ランダムな横方向の揺らぎで毎回異なる角度から衝突
 */
class RandomController {
  /** 制御対象のビー玉エントリ配列 */
  private entries: MarbleEntry[];
  /** ビー玉の半径(m) */
  private radius: number;
  /** 各ビー玉のランダム揺らぎ方向 */
  private jitterAngles: number[];
  /** 揺らぎ方向の更新タイマー */
  private jitterTimers: number[];
  /** 各ビー玉がよろめき中（回転安定待ち）かどうか */
  private staggering: boolean[];

  /** 中央引力の強さ（距離×この値の力が掛かる） */
  private static readonly PULL_STRENGTH = 8;
  /** ランダム揺らぎの力（まっすぐ中央ではなく少しずれた角度で突っ込む） */
  private static readonly JITTER_FORCE = 15;
  /** 揺らぎ方向の更新間隔の最小値(秒) */
  private static readonly JITTER_MIN = 0.8;
  /** 揺らぎ方向の更新間隔の最大値(秒) */
  private static readonly JITTER_MAX = 2.0;

  /** この角速度を超えたらよろめき状態に入る (rad/s) */
  private static readonly STAGGER_ENTER_THRESHOLD = 1.5;
  /** この角速度以下になったらよろめき状態から復帰 (rad/s) */
  private static readonly STAGGER_EXIT_THRESHOLD = 0.4;
  /** よろめき中の水平ブレーキ力 */
  private static readonly STAGGER_BRAKE = 20;

  constructor(entries: MarbleEntry[], _config: RandomConfig, radius: number) {
    this.entries = entries;
    this.radius = radius;
    this.jitterAngles = entries.map(() => Math.random() * Math.PI * 2);
    this.jitterTimers = entries.map(() => this.randomJitterInterval());
    this.staggering = entries.map(() => false);
  }

  /** ランダムな揺らぎ方向更新間隔を生成(JITTER_MIN〜JITTER_MAX秒) */
  private randomJitterInterval(): number {
    return RandomController.JITTER_MIN
      + Math.random() * (RandomController.JITTER_MAX - RandomController.JITTER_MIN);
  }

  update(deltaTime: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!isGrounded(entry, this.radius)) continue;

      const center = entry.aggregate.body.getObjectCenterWorld();

      // ── よろめき判定（角速度ベース、ヒステリシス付き） ──
      if (entry.innerMesh) {
        const angSpeed = entry.aggregate.body.getAngularVelocity().length();
        if (!this.staggering[i] && angSpeed > RandomController.STAGGER_ENTER_THRESHOLD) {
          this.staggering[i] = true;
        } else if (this.staggering[i] && angSpeed < RandomController.STAGGER_EXIT_THRESHOLD) {
          this.staggering[i] = false;
        }
      }

      // よろめき中: 移動力を停止し、水平ブレーキで停止させる
      if (this.staggering[i]) {
        const vel = entry.aggregate.body.getLinearVelocity();
        entry.aggregate.body.applyForce(
          new Vector3(
            -vel.x * RandomController.STAGGER_BRAKE,
            0,
            -vel.z * RandomController.STAGGER_BRAKE,
          ),
          center,
        );
        continue;
      }

      // ── 通常移動 ──
      const pos = entry.mesh.position;

      // 中央(0,0)への引力: 距離に比例
      const toCenterX = -pos.x;
      const toCenterZ = -pos.z;
      entry.aggregate.body.applyForce(
        new Vector3(
          toCenterX * RandomController.PULL_STRENGTH,
          0,
          toCenterZ * RandomController.PULL_STRENGTH,
        ),
        center,
      );

      // ランダム揺らぎ: 毎回異なる角度から中央へ突っ込む
      this.jitterTimers[i] -= deltaTime;
      if (this.jitterTimers[i] <= 0) {
        this.jitterAngles[i] = Math.random() * Math.PI * 2;
        this.jitterTimers[i] = this.randomJitterInterval();
      }
      const ja = this.jitterAngles[i];
      entry.aggregate.body.applyForce(
        new Vector3(
          Math.cos(ja) * RandomController.JITTER_FORCE,
          0,
          Math.sin(ja) * RandomController.JITTER_FORCE,
        ),
        center,
      );
    }
  }

  /** 全ビー玉の揺らぎ・よろめき状態をリセット */
  reset(): void {
    this.jitterAngles = this.entries.map(() => Math.random() * Math.PI * 2);
    this.jitterTimers = this.entries.map(() => this.randomJitterInterval());
    this.staggering = this.entries.map(() => false);
  }
}

// ─── ヒップリコイル（衝撃吸収） ───

/** リコイルがピークに達するまでの時間(秒) */
const RECOIL_PEAK_TIME = 0.08;
/** リコイルが元に戻るまでの時間(秒) */
const RECOIL_RETURN_TIME = 0.35;
/** リコイル全体の時間 */
const RECOIL_DURATION = RECOIL_PEAK_TIME + RECOIL_RETURN_TIME;
/** ヒップの最大移動量（boxSize に対する倍率） */
const RECOIL_MAX_OFFSET = 0.3;

interface HipRecoil {
  /** リコイル方向（ローカル空間、正規化済み、XZ平面） */
  dirX: number;
  dirZ: number;
  /** アニメーション経過時間 */
  timer: number;
  /** 衝撃の強さ(0〜1) */
  intensity: number;
}

// ─── プッシュシステム ───

/** プッシュ発動の射程距離(m): この距離以内に他のビー玉がいるとプッシュを開始 */
const PUSH_RANGE = 2.5;
/** プッシュのクールダウン時間(秒): プッシュ完了後、次のプッシュまでの待機時間 */
const PUSH_COOLDOWN = 2.5;
/** ワインドアップ（振りかぶり）の所要時間(秒) */
const PUSH_WINDUP_DUR = 0.15;
/** ストライク（打撃）の所要時間(秒) */
const PUSH_STRIKE_DUR = 0.08;
/** リターン（腕を戻す）の所要時間(秒) */
const PUSH_RETURN_DUR = 0.3;

/** 腕の休息角度(rad): 自然に下ろした状態 */
const ARM_REST_ANGLE = 0.15;
/** 腕のワインドアップ角度(rad): 後方に引いた状態 */
const ARM_WINDUP_ANGLE = -0.5;
/** 腕のストライク角度(rad): 前方に突き出した状態 */
const ARM_STRIKE_ANGLE = 1.4;

/** プッシュアクションのフェーズ */
enum PushPhase {
  /** 待機中: クールダウン消化・ターゲット探索 */
  IDLE,
  /** 振りかぶり中: 腕を後方に引く */
  WINDUP,
  /** 打撃中: 腕を前方に突き出し、相手にインパルスを適用 */
  STRIKE,
  /** 復帰中: 腕を休息位置に戻す */
  RETURN,
}

// ─── 公開クラス: コースタイプに応じて内部コントローラーを切り替え ───

/**
 * 力の統合制御クラス
 *
 * コースタイプに応じた移動力・衝突エフェクト・ヒューマノイド物理
 * （脚バネ・バランス・転倒復帰・プッシュ・分散重力）を統合管理する
 */
export class ForceController {
  /** コースタイプ別の内部コントローラー（updateメソッドを持つ） */
  private controller: { update(dt: number): void };
  /** 制御対象のビー玉エントリ配列 */
  private entries: MarbleEntry[];
  /** ビー玉の半径(m) */
  private radius: number;
  /** ビー玉の反発係数（プッシュのインパルス計算に使用） */
  private restitution: number;
  /** Babylon.jsシーンへの参照 */
  private scene: Scene;

  /** ビー玉PhysicsBody → MarbleEntry のマップ（衝突判定用） */
  private bodyToEntry: Map<PhysicsBody, MarbleEntry> = new Map();
  /** 衝突エフェクトのリスト */
  private collisionEffects: CollisionFx[] = [];
  /** エフェクト用共有マテリアル */
  private fxMaterial: StandardMaterial;
  /** 衝突Observable購読の参照（dispose用） */
  private collisionObservers: { entry: MarbleEntry; observer: Observer<unknown> }[] = [];

  /** プッシュ状態（箱ビー玉のみ使用）: 各ビー玉の現在のプッシュフェーズ */
  private pushPhases: PushPhase[];
  /** プッシュタイマー: 各フェーズの経過時間(秒) */
  private pushTimers: number[];
  /** プッシュクールダウン: 次のプッシュまでの残り時間(秒) */
  private pushCooldowns: number[];
  /** プッシュターゲット: プッシュ対象のビー玉インデックス(-1=なし) */
  private pushTargets: number[];

  /** ヒップリコイル状態（ヒューマノイドのみ） */
  private hipRecoils: (HipRecoil | null)[];
  /** hipsメッシュの休息ローカルY座標 */
  private hipsRestY: number[];
  /** ビー玉落下率（0=休息位置, 1=足元） */
  private marbleDrops: number[];
  /** 関節角度の合計（前フレーム）: 角速度計算用 */
  private prevJointSum: number[];
  /** 転倒復帰の状態 */
  private recoveryStates: RecoveryState[];
  /** 転倒復帰タイマー */
  private recoveryTimers: number[];

  constructor(
    entries: MarbleEntry[],
    config: SimulationConfig,
    scene: Scene,
    onReset: () => void,
  ) {
    this.entries = entries;
    this.radius = config.marble.radius;
    this.restitution = config.marble.restitution;
    this.scene = scene;

    // エフェクト用マテリアル（白く光る球）
    this.fxMaterial = new StandardMaterial("collisionFxMat", scene);
    this.fxMaterial.diffuseColor = new Color3(1, 1, 1);
    this.fxMaterial.emissiveColor = new Color3(1, 0.9, 0.5);
    this.fxMaterial.alpha = 0.8;

    // PhysicsBody → MarbleEntry マップ構築
    for (const entry of entries) {
      this.bodyToEntry.set(entry.aggregate.body, entry);
    }

    // 各ビー玉の衝突Observableを購読
    this.subscribeCollisionEvents();

    // プッシュ状態初期化（cooldownをランダムにずらして同時プッシュを防ぐ）
    this.pushPhases = entries.map(() => PushPhase.IDLE);
    this.pushTimers = entries.map(() => 0);
    this.pushCooldowns = entries.map(() => Math.random() * PUSH_COOLDOWN);
    this.pushTargets = entries.map(() => -1);

    // ヒューマノイドの重力を無効化（分散重力で置き換え）
    for (const entry of entries) {
      if (entry.innerMesh) {
        entry.aggregate.body.setGravityFactor(0);
      }
    }

    // ヒップリコイル状態初期化
    this.hipRecoils = entries.map(() => null);
    this.hipsRestY = entries.map(e => e.hips ? e.hips.position.y : 0);
    // ビー玉落下率初期化
    this.marbleDrops = entries.map(() => 0);
    // 関節角度合計初期化
    this.prevJointSum = entries.map(() => 0);
    // 転倒復帰状態初期化
    this.recoveryStates = entries.map(() => RecoveryState.NORMAL);
    this.recoveryTimers = entries.map(() => 0);

    switch (config.courseType) {
      case CourseType.STRAIGHT:
        this.controller = new StraightController(entries, config.straight, this.radius, onReset);
        break;
      case CourseType.LATERAL_SHUTTLE:
        this.controller = new LateralShuttleController(entries, config.lateralShuttle, this.radius, onReset);
        break;
      case CourseType.COLLISION:
        this.controller = new CollisionController(entries, config.collision, this.radius, onReset);
        break;
      case CourseType.RANDOM:
        this.controller = new RandomController(entries, config.random, this.radius);
        break;
    }
  }

  /** Havok衝突イベントを購読してビー玉同士の衝突を検出 */
  private subscribeCollisionEvents(): void {
    for (const entry of this.entries) {
      const body = entry.aggregate.body;
      const observable = body.getCollisionObservable();

      const observer = observable.add((event) => {
        // 衝突開始時のみ処理
        if (event.type !== PhysicsEventType.COLLISION_STARTED) return;

        // 相手がビー玉かどうか確認
        const otherEntry = this.bodyToEntry.get(event.collidedAgainst);
        if (!otherEntry) return;

        const myIdx = this.entries.indexOf(entry);
        const otherIdx = this.entries.indexOf(otherEntry);

        // ヒップリコイル（各ボディの observer で自分のリコイルを処理）
        this.triggerHipRecoil(myIdx, otherEntry);

        // 重複防止: 小さいindexのビー玉側でのみエフェクト生成
        if (myIdx > otherIdx) return;

        // 衝突点にエフェクト生成（pointがnullの場合は2体の中間点を使用）
        const contactPoint = event.point
          ?? Vector3.Center(entry.mesh.position, otherEntry.mesh.position);
        this.spawnCollisionEffect(contactPoint);
      });

      this.collisionObservers.push({ entry, observer: observer as Observer<unknown> });
    }
  }

  /** 衝突点にエフェクト(光る球)を生成 */
  private spawnCollisionEffect(point: Vector3): void {
    const mesh = MeshBuilder.CreateSphere(
      `collisionFx_${Date.now()}`,
      { diameter: this.radius * 1.5, segments: 8 },
      this.scene,
    );
    mesh.position = point.clone();
    mesh.material = this.fxMaterial;

    this.collisionEffects.push({ mesh, age: 0 });
  }

  /** 衝突エフェクトの更新(拡大＋フェードアウト) */
  private updateCollisionEffects(deltaTime: number): void {
    for (let i = this.collisionEffects.length - 1; i >= 0; i--) {
      const fx = this.collisionEffects[i];
      fx.age += deltaTime;

      if (fx.age >= COLLISION_FX_DURATION) {
        fx.mesh.dispose();
        this.collisionEffects.splice(i, 1);
        continue;
      }

      const progress = fx.age / COLLISION_FX_DURATION;
      // スケール: 1 → MAX_SCALE
      const scale = 1 + (COLLISION_FX_MAX_SCALE - 1) * progress;
      fx.mesh.scaling.setAll(scale);
      // フェードアウト
      (fx.mesh.material as StandardMaterial).alpha = 0.8 * (1 - progress);
    }
  }

  /** 衝突時にヒップリコイルを開始 */
  private triggerHipRecoil(idx: number, other: MarbleEntry): void {
    const entry = this.entries[idx];
    if (!entry.hips) return;

    // 衝撃方向: 相手 → 自分（自分が逃げる方向）
    const dx = entry.mesh.position.x - other.mesh.position.x;
    const dz = entry.mesh.position.z - other.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return;

    // 相対速度から衝撃の強さを推定(0〜1にクランプ)
    const selfVel = entry.aggregate.body.getLinearVelocity();
    const otherVel = other.aggregate.body.getLinearVelocity();
    const relSpeed = Math.sqrt(
      (selfVel.x - otherVel.x) ** 2 + (selfVel.z - otherVel.z) ** 2,
    );
    const intensity = Math.min(1, relSpeed / 8);

    // 既存のリコイルより強ければ上書き
    const current = this.hipRecoils[idx];
    if (current && current.timer < RECOIL_PEAK_TIME && current.intensity >= intensity) return;

    this.hipRecoils[idx] = {
      dirX: dx / dist,
      dirZ: dz / dist,
      timer: 0,
      intensity,
    };

    // ビー玉落下: 衝撃の強さに応じて足元へ落下（既存値より大きければ上書き）
    if (entry.innerMesh && intensity > this.marbleDrops[idx]) {
      this.marbleDrops[idx] = intensity;
    }
  }

  /** ヒップリコイルアニメーション更新 */
  private updateHipRecoil(deltaTime: number): void {
    const boxSize = this.radius * 2.4;
    const maxOffset = boxSize * RECOIL_MAX_OFFSET;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry.hips) continue;

      const recoil = this.hipRecoils[i];
      if (!recoil) {
        // リコイルなし: 休息位置を維持
        entry.hips.position.x = 0;
        entry.hips.position.z = 0;
        entry.hips.position.y = this.hipsRestY[i];
        continue;
      }

      recoil.timer += deltaTime;

      if (recoil.timer >= RECOIL_DURATION) {
        // 終了: 休息位置に戻す
        entry.hips.position.x = 0;
        entry.hips.position.z = 0;
        entry.hips.position.y = this.hipsRestY[i];
        this.hipRecoils[i] = null;
        continue;
      }

      // オフセット量を計算: ピークまで急速に移動、ゆっくり戻る
      let factor: number;
      if (recoil.timer < RECOIL_PEAK_TIME) {
        // 急速にピークへ（ease-out）
        const t = recoil.timer / RECOIL_PEAK_TIME;
        factor = 1 - (1 - t) * (1 - t);
      } else {
        // ゆっくり戻る（ease-in-out）
        const t = (recoil.timer - RECOIL_PEAK_TIME) / RECOIL_RETURN_TIME;
        factor = 1 - t * t;
      }

      const offset = maxOffset * recoil.intensity * factor;
      entry.hips.position.x = recoil.dirX * offset;
      entry.hips.position.z = recoil.dirZ * offset;
      entry.hips.position.y = this.hipsRestY[i];
    }
  }

  /** 腕の角度を設定（両腕同時、横回転もリセット） */
  private setArmAngle(entry: MarbleEntry, angle: number): void {
    for (const arm of entry.arms) {
      arm.rotation.x = angle;
      arm.rotation.z = 0;
    }
  }

  /** 線形補間 */
  private static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(1, Math.max(0, t));
  }

  /**
   * 分散重力: 各パーツの位置に質量比率に応じた重力を適用
   *
   * 通常の重力（重心に一括適用）を無効化し、代わりに頭・胴体・腕・脚
   * それぞれの位置に重力を分散適用する。
   * 腕を伸ばした時や片足が上がった時に自然なトルクが発生する。
   */
  private applyDistributedGravity(): void {
    const g = -9.81;
    const zero = Vector3.Zero();

    for (let ei = 0; ei < this.entries.length; ei++) {
      const entry = this.entries[ei];
      if (!entry.innerMesh) continue;

      const mass = entry.preset.mass;
      const body = entry.aggregate.body;
      const center = body.getObjectCenterWorld();

      // コア（頭 + 胴体 + 腰）: boxMesh中心に適用
      body.applyForce(new Vector3(0, mass * MASS_FRAC_CORE * g, 0), center);

      // 腕（上腕 + 前腕 + 手）
      for (const arm of entry.arms) {
        arm.computeWorldMatrix(true);
        const armPos = Vector3.TransformCoordinates(zero, arm.getWorldMatrix());
        body.applyForce(new Vector3(0, mass * MASS_FRAC_UPPER_ARM * g, 0), armPos);

        const forearm = arm.getChildren()[0] as Mesh | undefined;
        if (forearm) {
          forearm.computeWorldMatrix(true);
          const forearmPos = Vector3.TransformCoordinates(zero, forearm.getWorldMatrix());
          body.applyForce(new Vector3(0, mass * MASS_FRAC_FOREARM * g, 0), forearmPos);

          const hand = forearm.getChildren()[0] as Mesh | undefined;
          if (hand) {
            hand.computeWorldMatrix(true);
            const handPos = Vector3.TransformCoordinates(zero, hand.getWorldMatrix());
            body.applyForce(new Vector3(0, mass * MASS_FRAC_HAND * g, 0), handPos);
          }
        }
      }

      // 脚（大腿 + 下腿 + 足）
      for (const leg of entry.legs) {
        leg.computeWorldMatrix(true);
        const legPos = Vector3.TransformCoordinates(zero, leg.getWorldMatrix());
        body.applyForce(new Vector3(0, mass * MASS_FRAC_THIGH * g, 0), legPos);

        const lowerLeg = leg.getChildren()[0] as Mesh | undefined;
        if (lowerLeg) {
          lowerLeg.computeWorldMatrix(true);
          const lowerLegPos = Vector3.TransformCoordinates(zero, lowerLeg.getWorldMatrix());
          body.applyForce(new Vector3(0, mass * MASS_FRAC_SHANK * g, 0), lowerLegPos);

          const foot = lowerLeg.getChildren()[0] as Mesh | undefined;
          if (foot) {
            foot.computeWorldMatrix(true);
            const footPos = Vector3.TransformCoordinates(zero, foot.getWorldMatrix());
            body.applyForce(new Vector3(0, mass * MASS_FRAC_FOOT * g, 0), footPos);
          }
        }
      }
    }
  }

  /**
   * 腕先の地面めり込み防止
   *
   * 全状態（NORMAL/FALLEN/GETTING_UP）で手底が地面以下にならないよう
   * 腕の回転角度を二分探索で制約し、非復帰状態では接地力も適用する。
   * rotation.x（前後）と rotation.z（横方向）の両方を考慮する。
   */
  private constrainArmsToGround(): void {
    const boxSize = this.radius * 2.4;
    // 肩ピボットから手底までの全長: armH(0.48) + forearmH(0.37) + handH(0.10)
    const totalLen = boxSize * 0.95;
    const pivotY = boxSize * 0.2;

    for (let ei = 0; ei < this.entries.length; ei++) {
      const entry = this.entries[ei];
      if (!entry.innerMesh || entry.arms.length === 0) continue;

      const worldMatrix = entry.mesh.getWorldMatrix();
      const m = worldMatrix.m;
      const center = entry.aggregate.body.getObjectCenterWorld();
      const bodyVel = entry.aggregate.body.getLinearVelocity();
      const bodyAngVel = entry.aggregate.body.getAngularVelocity();

      for (const arm of entry.arms) {
        const targetAlpha = arm.rotation.x;
        const targetBeta = arm.rotation.z;

        // 手底ワールドY座標の計算（rotation.x + rotation.z 両方考慮）
        // Rx(α)*Rz(β) 回転: (0,-d,0) → (d*sinβ, -d*cosβ*cosα, d*cosβ*sinα)
        const computeHandWorldY = (alpha: number, beta: number): number => {
          const lx = arm.position.x + totalLen * Math.sin(beta);
          const ly = pivotY - totalLen * Math.cos(beta) * Math.cos(alpha);
          const lz = totalLen * Math.cos(beta) * Math.sin(alpha);
          return m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        };

        const handWorldY = computeHandWorldY(targetAlpha, targetBeta);
        if (handWorldY >= LEG_GROUND_Y) continue;

        // ── 角度制約: スケール係数 t (0〜1) を二分探索 ──
        // t=0: 腕を降ろした状態、t=1: 目標角度
        const yAtZero = computeHandWorldY(0, 0);
        if (yAtZero >= LEG_GROUND_Y) {
          // 二分探索で手底が地面レベルになる t を求める
          let lo = 0, hi = 1;
          for (let iter = 0; iter < 6; iter++) {
            const mid = (lo + hi) / 2;
            if (computeHandWorldY(targetAlpha * mid, targetBeta * mid) < LEG_GROUND_Y) {
              hi = mid;
            } else {
              lo = mid;
            }
          }
          const t = lo; // 安全側（地面より上）を使用
          arm.rotation.x = targetAlpha * t;
          arm.rotation.z = targetBeta * t;
        }
        // yAtZero < LEG_GROUND_Y の場合: 腕を降ろしても地面以下 → 角度では解決不能

        // ── 接地力: 復帰中以外は腕にも地面反力を適用 ──
        if (this.recoveryStates[ei] !== RecoveryState.GETTING_UP) {
          const alpha = arm.rotation.x;
          const beta = arm.rotation.z;
          const lx = arm.position.x + totalLen * Math.sin(beta);
          const ly = pivotY - totalLen * Math.cos(beta) * Math.cos(alpha);
          const lz = totalLen * Math.cos(beta) * Math.sin(alpha);
          const handWorld = Vector3.TransformCoordinates(
            new Vector3(lx, ly, lz), worldMatrix,
          );
          const pen = LEG_GROUND_Y - handWorld.y;
          if (pen > 0) {
            const hRx = handWorld.x - center.x;
            const hRz = handWorld.z - center.z;
            const handVelY = bodyVel.y + bodyAngVel.z * hRx - bodyAngVel.x * hRz;
            const force = pen * EXTREMITY_GROUND_K
              + (handVelY < 0 ? -handVelY * EXTREMITY_GROUND_D : 0);
            if (force > 0) {
              entry.aggregate.body.applyForce(
                new Vector3(0, force, 0), handWorld,
              );
            }
          }
        }
      }
    }
  }

  /** プッシュ判定・アニメーション・力の適用 */
  private updatePush(deltaTime: number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      // 腕がないビー玉 or 復帰中 or キック中はスキップ
      if (entry.arms.length === 0) continue;
      if (this.recoveryStates[i] !== RecoveryState.NORMAL) continue;
      switch (this.pushPhases[i]) {
        case PushPhase.IDLE: {
          // 待機: 腕を休息角度に維持
          this.setArmAngle(entry, ARM_REST_ANGLE);

          // クールダウン消化
          this.pushCooldowns[i] -= deltaTime;
          if (this.pushCooldowns[i] > 0) break;

          // 範囲内の最近ビー玉を探す
          const pos = entry.mesh.position;
          let closestDist = PUSH_RANGE;
          let closestIdx = -1;
          for (let j = 0; j < this.entries.length; j++) {
            if (j === i) continue;
            const dx = this.entries[j].mesh.position.x - pos.x;
            const dz = this.entries[j].mesh.position.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = j;
            }
          }

          if (closestIdx >= 0) {
            this.pushTargets[i] = closestIdx;
            this.pushPhases[i] = PushPhase.WINDUP;
            this.pushTimers[i] = 0;
          }
          break;
        }

        case PushPhase.WINDUP: {
          this.pushTimers[i] += deltaTime;
          const t = this.pushTimers[i] / PUSH_WINDUP_DUR;
          this.setArmAngle(entry, ForceController.lerp(ARM_REST_ANGLE, ARM_WINDUP_ANGLE, t));

          if (this.pushTimers[i] >= PUSH_WINDUP_DUR) {
            this.pushPhases[i] = PushPhase.STRIKE;
            this.pushTimers[i] = 0;
          }
          break;
        }

        case PushPhase.STRIKE: {
          const wasStart = this.pushTimers[i] === 0;
          this.pushTimers[i] += deltaTime;
          const t = this.pushTimers[i] / PUSH_STRIKE_DUR;
          this.setArmAngle(entry, ForceController.lerp(ARM_WINDUP_ANGLE, ARM_STRIKE_ANGLE, t));

          // 開始フレームで衝突と同等のインパルスを適用
          // J = (1 + e) * v_eff * m1*m2 / (m1+m2)
          // v_eff = 体の相対速度 + 腕先端のスイング速度
          if (wasStart) {
            const targetIdx = this.pushTargets[i];
            if (targetIdx >= 0 && targetIdx < this.entries.length) {
              const target = this.entries[targetIdx];
              const dx = target.mesh.position.x - entry.mesh.position.x;
              const dz = target.mesh.position.z - entry.mesh.position.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist > 0.01) {
                const nx = dx / dist;
                const nz = dz / dist;

                // 体の相対速度（法線方向成分）
                const selfVel = entry.aggregate.body.getLinearVelocity();
                const targetVel = target.aggregate.body.getLinearVelocity();
                const bodyRelVel = (selfVel.x - targetVel.x) * nx
                                 + (selfVel.z - targetVel.z) * nz;

                // 腕先端のスイング速度: 角速度 × 腕の長さ
                const armSwingAngle = ARM_STRIKE_ANGLE - ARM_WINDUP_ANGLE;
                const armAngularRate = armSwingAngle / PUSH_STRIKE_DUR;
                const armLength = this.radius * 2.4; // boxSize * 1.0
                const armTipSpeed = armAngularRate * armLength;

                // 有効衝突速度 = 体の接近速度 + 腕のスイング速度
                const effectiveVel = Math.max(0, bodyRelVel) + armTipSpeed
                const m1 = entry.preset.mass;
                const m2 = target.preset.mass;
                const impulse = (1 + this.restitution) * effectiveVel * (m1 * m2) / (m1 + m2) * 2;

                // ターゲットにプッシュ（衝突と同じ）
                const targetCenter = target.aggregate.body.getObjectCenterWorld();
                target.aggregate.body.applyImpulse(
                  new Vector3(nx * impulse, 0, nz * impulse),
                  targetCenter,
                );
                // 自身に反動（作用反作用: 同じ大きさ逆方向）
                const selfCenter = entry.aggregate.body.getObjectCenterWorld();
                entry.aggregate.body.applyImpulse(
                  new Vector3(-nx * impulse, 0, -nz * impulse),
                  selfCenter,
                );
              }
            }
          }

          if (this.pushTimers[i] >= PUSH_STRIKE_DUR) {
            this.pushPhases[i] = PushPhase.RETURN;
            this.pushTimers[i] = 0;
          }
          break;
        }

        case PushPhase.RETURN: {
          this.pushTimers[i] += deltaTime;
          const t = this.pushTimers[i] / PUSH_RETURN_DUR;
          this.setArmAngle(entry, ForceController.lerp(ARM_STRIKE_ANGLE, ARM_REST_ANGLE, t));

          if (this.pushTimers[i] >= PUSH_RETURN_DUR) {
            this.pushPhases[i] = PushPhase.IDLE;
            this.pushCooldowns[i] = PUSH_COOLDOWN;
            this.pushTargets[i] = -1;
          }
          break;
        }
      }
    }
  }


  /**
   * メインの物理更新ループ
   *
   * 毎フレーム呼ばれ、以下を順番に処理:
   * 1. ヒューマノイドの脚バネ・バランス・転倒復帰
   * 2. 通常ビー玉のバウンス処理
   * 3. 分散重力の適用
   * 4. コース固有の移動力
   * 5. プッシュシステム
   * 6. 腕の地面めり込み防止
   * 7. 衝突エフェクト更新
   * 8. ヒップリコイル更新
   *
   * @param deltaTime - 前フレームからの経過時間(秒)
   */
  update(deltaTime: number): void {
    // 全ビー玉を順番に処理
    for (let ei = 0; ei < this.entries.length; ei++) {
      const entry = this.entries[ei];
      // ヒューマノイドビー玉の場合（innerMeshが存在）
      if (entry.innerMesh) {
        // BOXメッシュのワールド変換行列を取得
        const worldMatrix = entry.mesh.getWorldMatrix();
        // 物理ボディの重心ワールド座標
        const center = entry.aggregate.body.getObjectCenterWorld();
        // 現在の並進速度
        const bodyVel = entry.aggregate.body.getLinearVelocity();
        // 現在の角速度
        const bodyAngVel = entry.aggregate.body.getAngularVelocity();

        const boxHalfSize = this.radius * 1.2;   // BOXの半分のサイズ (boxSize / 2)
        const legH = this.radius * 2.14;          // 脚の全高 (legHeight + footH)
        const legInset = this.radius * 0.72;     // BOX中心からの脚のオフセット (boxSize * 0.3)
        const upperLegH = this.radius * 1.0;     // 上腿の長さ（膝IK用）
        const lowerLegH = this.radius * 1.0;     // 下腿の長さ（膝IK用）
        const footIKH = this.radius * 0.14;      // 足の高さ（膝IK用）

        // ローカルUp方向をワールド座標に変換（バランスアニメで使用）
        const localUp = Vector3.TransformNormal(Vector3.Up(), worldMatrix);

        // 直立度(0〜1): 1=完全直立, 0=横倒し/反転
        const uprightness = Math.max(0, localUp.y);

        // 脚支持スケール: 直立度0.2〜0.5の範囲で0→1に変化（傾くと脚の支持力が弱まる）
        const legScale = Math.min(1, Math.max(0, (uprightness - 0.2) / 0.3));
        // トルクスケール: 直立度0.15〜0.7の範囲で0→1に変化（傾くとトルクが弱まる）
        const torqueScale = Math.min(1, Math.max(0, (uprightness - 0.15) / 0.55));
        // 転倒復帰トルクの強さ
        const torqueStrength = UPRIGHT_TORQUE;

        // ── 転倒復帰状態管理 ──
        switch (this.recoveryStates[ei]) {
          case RecoveryState.NORMAL:
            if (uprightness < FALLEN_THRESHOLD) {
              this.recoveryTimers[ei] += deltaTime;
              if (this.recoveryTimers[ei] > FALLEN_DELAY) {
                this.recoveryStates[ei] = RecoveryState.FALLEN;
                this.recoveryTimers[ei] = 0;
              }
            } else {
              this.recoveryTimers[ei] = 0;
            }
            break;
          case RecoveryState.FALLEN:
            this.recoveryTimers[ei] += deltaTime;
            if (this.recoveryTimers[ei] > RECOVERY_WAIT) {
              this.recoveryStates[ei] = RecoveryState.GETTING_UP;
              this.recoveryTimers[ei] = 0;
            }
            break;
          case RecoveryState.GETTING_UP: {
            // ── 腕の物理支持のみで回転（人工トルク・脚補助の上書きなし） ──
            // legScale, torqueScale は自然値のまま:
            //   横倒し時は両方≈0 → 脚もトルクも作用しない
            //   腕が体を回転させて uprightness が上がるにつれ自然に増加

            // ── 倒れた方向に応じて腕を伸ばす ──
            const tiltX = localUp.x;
            const tiltZ = localUp.z;
            const tiltMag = Math.sqrt(tiltX * tiltX + tiltZ * tiltZ);
            const armDirX = tiltMag > 0.01 ? tiltX / tiltMag : 0;
            const armDirZ = tiltMag > 0.01 ? tiltZ / tiltMag : 1;

            const boxSize = this.radius * 2.4;
            const totalArmLen = boxSize * 0.9;
            const pivotY = boxSize * 0.2;
            const tiltAmount = 1 - uprightness; // 1=横倒し, 0=直立

            for (const arm of entry.arms) {
              const side = Math.sign(arm.position.x) || 1;

              // 前後成分: 傾き方向のZ成分に比例
              // 正面が地面 → 両手前方, 背中が地面 → 両手後方
              arm.rotation.x = RECOVERY_ARM_EXTEND * armDirZ;
              // 横成分: 地面側の腕のみ外側に伸ばす
              // 右側が地面 → 右手を右へ, 左側が地面 → 左手を左へ
              const sideFactor = Math.max(0, armDirX * side);
              arm.rotation.z = side * RECOVERY_ARM_EXTEND * sideFactor;

              // 手先のローカル座標（rotation.x + rotation.z 両方考慮）
              const alpha = arm.rotation.x;
              const beta = arm.rotation.z;
              const handLocal = new Vector3(
                arm.position.x + totalArmLen * Math.sin(beta),
                pivotY - totalArmLen * Math.cos(beta) * Math.cos(alpha),
                totalArmLen * Math.cos(beta) * Math.sin(alpha),
              );
              const handWorld = Vector3.TransformCoordinates(handLocal, worldMatrix);

              if (handWorld.y < LEG_GROUND_Y) {
                const pen = LEG_GROUND_Y - handWorld.y;
                const hRx = handWorld.x - center.x;
                const hRz = handWorld.z - center.z;
                const handVelY = bodyVel.y + bodyAngVel.z * hRx - bodyAngVel.x * hRz;

                // 支持力: 傾きに比例した能動的な押し上げ
                //        + 穏やかな位置補正（めり込み防止）
                //        + 双方向減衰（上下どちらの動きも吸収 → バウンスなし）
                const pushForce = ARM_SUPPORT_FORCE * tiltAmount
                  + pen * ARM_PUSH_K
                  - handVelY * ARM_PUSH_D;
                if (pushForce > 0) {
                  entry.aggregate.body.applyForce(
                    new Vector3(0, pushForce, 0), handWorld,
                  );
                }
              }
            }

            if (uprightness > RECOVERED_THRESHOLD) {
              this.recoveryStates[ei] = RecoveryState.NORMAL;
              this.recoveryTimers[ei] = 0;
              this.setArmAngle(entry, ARM_REST_ANGLE);
            }
            break;
          }
        }

        // ── 脚ごとの接地バネ ──
        // 足が地面に接している脚のみ支持力を発生させる。
        // 足が浮いている脚は力を出さない → 箱はその側に沈む。
        // 直立度が低い → 脚で支えられない → 力を出さない → 倒れる

        const legForces: number[] = [0, 0];
        for (let li = 0; li < LEG_CORNERS.length; li++) {
          const [sx, sz] = LEG_CORNERS[li];
          // 足先のローカル座標 → ワールド座標
          const localFoot = new Vector3(
            sx * legInset, -boxHalfSize - legH, sz * legInset,
          );
          const worldFoot = Vector3.TransformCoordinates(localFoot, worldMatrix);

          if (worldFoot.y < LEG_GROUND_Y) {
            // 地面への貫通量（上限あり: 深く埋まっても力が頭打ち）
            const penetration = Math.min(LEG_GROUND_Y - worldFoot.y, LEG_MAX_PENETRATION);
            // 足先での垂直速度: v_foot.y = v_body.y + (ω × r).y
            const rx = worldFoot.x - center.x;
            const rz = worldFoot.z - center.z;
            const footVelY = bodyVel.y + bodyAngVel.z * rx - bodyAngVel.x * rz;

            // (A) 脚バネ（直立時）: 体重を支持、摩擦・ピボット効果
            if (legScale > 0) {
              // 減衰力を浸透深度に比例: 表面付近では弱く、深いほど強く
              // → 初回接触時に減衰力だけで打ち上げるのを防ぐ
              const penRatio = Math.min(1, penetration / DAMP_FULL_PEN);
              const force = (penetration * LEG_SPRING_K - footVelY * LEG_DAMPING_K * penRatio) * legScale;
              if (force > 0) {
                legForces[li] = force;
                entry.aggregate.body.applyForce(
                  new Vector3(0, force, 0), worldFoot,
                );

                // 足裏摩擦: 法線力(=バネ力)に比例した水平ブレーキ力
                const footVelX = bodyVel.x + bodyAngVel.y * rz - bodyAngVel.z * 0;
                const footVelZ = bodyVel.z + bodyAngVel.x * 0 - bodyAngVel.y * rx;
                const horizSpeed = Math.sqrt(footVelX * footVelX + footVelZ * footVelZ);
                if (horizSpeed > 0.01) {
                  const maxFriction = force * FOOT_FRICTION_MU;
                  const frictionMag = Math.min(maxFriction, horizSpeed * 20);
                  entry.aggregate.body.applyForce(
                    new Vector3(
                      -footVelX / horizSpeed * frictionMag,
                      0,
                      -footVelZ / horizSpeed * frictionMag,
                    ),
                    worldFoot,
                  );

                  // 足裏ピボット効果
                  const pivotDown = horizSpeed * FOOT_PIVOT_FACTOR * (force / LEG_SPRING_K);
                  entry.aggregate.body.applyForce(
                    new Vector3(0, -pivotDown, 0), center,
                  );
                }
              }
            }

            // (B) 足裏接地制約（常時有効）: めり込み防止
            // legScale=1 では脚バネが十分に支持するため不要、legScale<1 で補完
            const groundScale = 1 - legScale;
            if (groundScale > 0.01) {
              const gForce = penetration * EXTREMITY_GROUND_K * groundScale
                + (footVelY < 0 ? -footVelY * EXTREMITY_GROUND_D * groundScale : 0);
              if (gForce > 0) {
                entry.aggregate.body.applyForce(
                  new Vector3(0, gForce, 0), worldFoot,
                );
              }
            }
          } else if (worldFoot.y < LEG_GROUND_Y + DAMP_ABOVE_GROUND && legScale > 0) {
            // 接地面上部の減衰ゾーン: 足が地面を離れた直後の上昇速度を減衰
            // バネ力がゼロになった後のオーバーシュート（跳ね返り）を防止
            const rx = worldFoot.x - center.x;
            const rz = worldFoot.z - center.z;
            const footVelY = bodyVel.y + bodyAngVel.z * rx - bodyAngVel.x * rz;
            if (footVelY > 0) {
              const fadeout = 1 - (worldFoot.y - LEG_GROUND_Y) / DAMP_ABOVE_GROUND;
              const dampForce = -footVelY * LEG_DAMPING_K * legScale * fadeout;
              entry.aggregate.body.applyForce(
                new Vector3(0, dampForce, 0), worldFoot,
              );
            }
          }
        }

        // ── 頭部接地制約: 頭が地面にめり込まない ──
        {
          const headRadius = this.radius * 0.444;   // boxSize * 0.37 / 2
          const headLocalPos = new Vector3(0, boxHalfSize + headRadius, 0);
          const headWorldPos = Vector3.TransformCoordinates(headLocalPos, worldMatrix);
          if (headWorldPos.y < headRadius) {
            const headPen = headRadius - headWorldPos.y;
            // 頭位置での垂直速度
            const hRx = headWorldPos.x - center.x;
            const hRz = headWorldPos.z - center.z;
            const headVelY = bodyVel.y + bodyAngVel.z * hRx - bodyAngVel.x * hRz;
            // 位置補正 + 下方向速度のみ吸収（上方向は阻害しない）
            const headForce = headPen * EXTREMITY_GROUND_K
              + (headVelY < 0 ? -headVelY * EXTREMITY_GROUND_D : 0);
            if (headForce > 0) {
              entry.aggregate.body.applyForce(
                new Vector3(0, headForce, 0), headWorldPos,
              );
            }
          }
        }

        // 転倒復帰トルク + 回転減衰（deltaTimeスケーリングで framerate-independent）
        if (torqueScale > 0) {
          const correction = Vector3.Cross(localUp, Vector3.Up());
          entry.aggregate.body.applyAngularImpulse(
            correction.scale(torqueStrength * torqueScale * deltaTime),
          );
          entry.aggregate.body.applyAngularImpulse(
            bodyAngVel.scale(-UPRIGHT_ANG_DAMPING * torqueScale * deltaTime),
          );
        }

        // ── 脚バランス＋荷重アニメーション ──
        if (entry.legs.length > 0) {
          const tiltX = localUp.x;
          const tiltZ = localUp.z;

          // boxMeshの傾き角度（ループ前に1回計算）
          const boxTiltX = Math.asin(Math.max(-1, Math.min(1, tiltZ)));
          const boxTiltZ = Math.asin(Math.max(-1, Math.min(1, -tiltX)));

          // 股関節の吸収率: 傾きが大きいほど股関節の分担を増やす（progressive）
          const boxTiltMag = Math.sqrt(boxTiltX * boxTiltX + boxTiltZ * boxTiltZ);
          const hipFactor = Math.min(1, boxTiltMag / BALANCE_MAX_ANGLE) * HIP_FACTOR_MAX;

          // 股関節回転: box傾きの一部を吸収（視覚的に腰が傾きを受け止める）
          if (entry.hips) {
            entry.hips.rotation.x = boxTiltX * hipFactor;
            entry.hips.rotation.z = boxTiltZ * hipFactor;
          }

          // 荷重による脚の開き: ターゲットYからの沈み量に比例
          const sagY = boxedTargetY(this.radius) - entry.mesh.position.y;
          const weightSplay = Math.max(0, sagY) * WEIGHT_SPLAY_GAIN;

          for (let li = 0; li < entry.legs.length; li++) {
            const [sx] = LEG_CORNERS[li];

            // 後方傾き: 両脚を後方へ傾けてバランス（前方は変更なし）
            const backwardTilt = Math.max(0, -tiltZ);
            let clampX = backwardTilt * BALANCE_GAIN;

            // 横傾き: 傾いた側の脚のみ傾ける
            // 右傾き→右Hip起点で右脚を右方向、左傾き→左Hip起点で左脚を左方向
            const sameSideTilt = Math.max(0, tiltX * sx);
            let clampZ = sameSideTilt * sx * BALANCE_GAIN + sx * weightSplay;
            clampX = Math.max(-BALANCE_MAX_ANGLE, Math.min(BALANCE_MAX_ANGLE, clampX));
            clampZ = Math.max(-BALANCE_MAX_ANGLE, Math.min(BALANCE_MAX_ANGLE, clampZ));

            // 足先が地面以下にならないよう回転を制限
            const combinedAngle = Math.sqrt(clampX * clampX + clampZ * clampZ);
            const footLocalY = -boxHalfSize - legH * Math.cos(Math.min(combinedAngle, Math.PI / 2));
            const footWorldY = entry.mesh.position.y + footLocalY;
            if (footWorldY < 0 && combinedAngle > 0.001) {
              const targetCos = Math.max(0, (entry.mesh.position.y - boxHalfSize) / legH);
              const maxAngle = Math.acos(Math.min(1, targetCos));
              if (combinedAngle > maxAngle) {
                const scale = maxAngle / combinedAngle;
                clampX *= scale;
                clampZ *= scale;
              }
            }

            entry.legs[li].rotation.x = clampX;
            entry.legs[li].rotation.z = clampZ;

            // 膝曲げ + 足首補正の分配
            // 角度が大きいほど膝の分担を増やす（progressive）
            const combinedClamp = Math.sqrt(clampX * clampX + clampZ * clampZ);
            const kneeFactor = Math.min(1, combinedClamp / BALANCE_MAX_ANGLE) * KNEE_FACTOR_MAX;

            const lowerLeg = entry.legs[li].getChildren()[0] as Mesh | undefined;
            if (lowerLeg) {
              // 膝: 上腿回転の一部を逆方向に吸収
              lowerLeg.rotation.x = -clampX * kneeFactor;
              lowerLeg.rotation.z = -clampZ * kneeFactor;

              const foot = lowerLeg.getChildren()[0] as Mesh | undefined;
              if (foot) {
                // 足首: 残りの回転 + box傾き(股関節吸収分を差し引き)を打ち消す
                foot.rotation.x = -(clampX * (1 - kneeFactor) + boxTiltX * (1 - hipFactor));
                foot.rotation.z = -(clampZ * (1 - kneeFactor) + boxTiltZ * (1 - hipFactor));

                // ── 膝IK: 後方屈曲で足裏を接地 + 衝撃吸収 ──
                // 各脚の股関節ワールドYから地面までの距離でIK角度を算出し、
                // 脚バネ力に比例した追加屈曲で動的荷重（衝撃）を吸収する。
                // 上腿後傾 + 下腿前傾（膝が後ろに折れる自然な屈曲方向）。
                {
                  const [slx, slz] = LEG_CORNERS[li];
                  const hipLocal = new Vector3(
                    slx * legInset, -boxHalfSize, slz * legInset,
                  );
                  const hipWorld = Vector3.TransformCoordinates(hipLocal, worldMatrix);

                  // 股関節から地面までの垂直距離
                  const targetReach = hipWorld.y - LEG_GROUND_Y;
                  const maxReach = upperLegH + lowerLegH + footIKH;

                  // ── 位置ベースIK: 足裏を地面に合わせる膝角度 ──
                  let kneeAngle = 0;
                  if (targetReach > 0 && targetReach < maxReach) {
                    const neededLowerVert = targetReach - upperLegH - footIKH;
                    if (neededLowerVert > 0 && neededLowerVert < lowerLegH) {
                      kneeAngle = Math.acos(neededLowerVert / lowerLegH);
                    }
                  }

                  // ── 衝撃吸収: 脚バネ力に比例した追加屈曲 ──
                  const forceRatio = Math.min(1, legForces[li] / (LEG_SPRING_K * 0.3));
                  kneeAngle += forceRatio * KNEE_ABSORB_MAX;

                  // 直立度によるブレンド（倒れかけの時は無効）
                  const kneeBlend = Math.min(1, Math.max(0, (uprightness - 0.3) / 0.4));
                  kneeAngle *= kneeBlend;

                  if (kneeAngle > 0.01) {
                    const halfBend = kneeAngle * 0.5;
                    entry.legs[li].rotation.x -= halfBend;  // 上腿を後傾
                    lowerLeg.rotation.x += halfBend;        // 下腿を前傾（脛を垂直に保持）
                    // 上下の回転が打ち消し合うため足首の角度変化なし
                  }
                }

                // 足裏の柔らかさ: 荷重に比例して圧縮(Y)・拡張(XZ)で衝撃吸収を表現
                const normalizedForce = Math.min(1, legForces[li] / (LEG_SPRING_K * 0.3));
                foot.scaling.y = 1 - normalizedForce * FOOT_DEFORM_COMPRESS;
                foot.scaling.x = 1 + normalizedForce * FOOT_DEFORM_EXPAND;
                foot.scaling.z = 1 + normalizedForce * FOOT_DEFORM_EXPAND;
              }
            }
          }
        }

        // ── 関節衝撃吸収: 関節の動きに応じた運動エネルギー吸収 ──
        {
          // 全関節の角度合計を算出
          let jointSum = 0;
          // 股関節
          if (entry.hips) {
            jointSum += Math.abs(entry.hips.rotation.x) + Math.abs(entry.hips.rotation.z);
          }
          // 脚関節（上腿 + 膝 + 足首）
          for (const leg of entry.legs) {
            jointSum += Math.abs(leg.rotation.x) + Math.abs(leg.rotation.z);
            const ll = leg.getChildren()[0] as Mesh | undefined;
            if (ll) {
              jointSum += Math.abs(ll.rotation.x) + Math.abs(ll.rotation.z);
              const ft = ll.getChildren()[0] as Mesh | undefined;
              if (ft) {
                jointSum += Math.abs(ft.rotation.x) + Math.abs(ft.rotation.z);
              }
            }
          }

          // 前フレームとの差分 → 関節角速度
          const jointDelta = Math.abs(jointSum - this.prevJointSum[ei]);
          this.prevJointSum[ei] = jointSum;

          if (jointDelta > 0.001 && deltaTime > 0) {
            const jointAngVel = jointDelta / deltaTime;
            // 関節角速度に比例した減衰係数（上限あり）
            const dampCoeff = Math.min(
              jointAngVel * JOINT_ABSORPTION_GAIN,
              JOINT_ABSORPTION_MAX,
            );
            // 水平速度を減衰（関節が衝撃を吸収）
            entry.aggregate.body.applyForce(
              new Vector3(-bodyVel.x * dampCoeff, 0, -bodyVel.z * dampCoeff),
              center,
            );
          }
        }

        // ── ビー玉位置: 衝撃で足元へ落下、接地で休息位置へ復帰 ──
        {
          const bSize = this.radius * 2.4;
          const lHeight = this.radius * 2;
          const restY = -bSize * 0.35;                  // hips位置（休息）
          const lowestY = -bSize / 2 - lHeight;         // 足元位置（最大落下）

          // 足裏が地面に面しているか: 脚バネ力あり = 接地中
          const grounded = legForces[0] > 0 || legForces[1] > 0;
          if (grounded && this.marbleDrops[ei] > 0) {
            // 接地中: ビー玉が元の位置へ復帰
            this.marbleDrops[ei] = Math.max(
              0, this.marbleDrops[ei] - MARBLE_DROP_RECOVERY * deltaTime,
            );
          } else if (!grounded && this.marbleDrops[ei] < 1) {
            // 非接地: ビー玉が足元へ下降（視覚のみ）
            this.marbleDrops[ei] = Math.min(
              1, this.marbleDrops[ei] + MARBLE_DROP_FALL_RATE * deltaTime,
            );
          }

          // ビー玉位置を補間: rest(0) → lowest(1)（視覚のみ、物理力なし）
          entry.innerMesh.position.y = restY + this.marbleDrops[ei] * (lowestY - restY);
        }
      } else {
        // 通常ビー玉: バウンス処理（jumpPower > 0 のビー玉が着地したら上に跳ねる）
        if (entry.preset.jumpPower <= 0) continue;
        const nearGround = entry.mesh.position.y <= this.radius + 0.15;
        const vy = entry.aggregate.body.getLinearVelocity().y;
        if (nearGround && vy <= 0.1) {
          const center = entry.aggregate.body.getObjectCenterWorld();
          entry.aggregate.body.applyImpulse(
            new Vector3(0, entry.preset.jumpPower, 0), center,
          );
        }
      }
    }

    // 分散重力（バランスアニメ・プッシュで腕脚角度が確定した後に適用）
    this.applyDistributedGravity();

    // コース固有の力
    this.controller.update(deltaTime);

    // プッシュシステム更新
    this.updatePush(deltaTime);

    // 腕の地面めり込み防止（プッシュ・復帰で腕角度が確定した後に適用）
    this.constrainArmsToGround();

    // 衝突エフェクト更新
    this.updateCollisionEffects(deltaTime);

    // ヒップリコイル更新
    this.updateHipRecoil(deltaTime);
  }

  /**
   * 全リソースを破棄してメモリを解放
   *
   * 衝突イベント購読・エフェクト・マテリアルを破棄する
   */
  dispose(): void {
    // 衝突Observable購読を解除
    for (const { entry, observer } of this.collisionObservers) {
      entry.aggregate.body.getCollisionObservable().remove(observer as never);
    }
    this.collisionObservers = [];

    // 衝突エフェクトのメッシュを破棄
    for (const fx of this.collisionEffects) {
      fx.mesh.dispose();
    }
    this.collisionEffects = [];

    // エフェクト用マテリアルを破棄
    this.fxMaterial.dispose();
  }
}
