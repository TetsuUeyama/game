import { Scalar, Quaternion, Bone, Space } from "@babylonjs/core";
import { Character } from "@/GamePlay/Object/Entities/Character";
import { MotionData, MotionState, MotionConfig, Keyframe, PositionOffset, JumpPhysics } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { MOTION_BLEND_CONFIG, MOTION_SPEED_CONFIG, MOTION_POSITION_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/MotionConfig";
import { MotionPlayer } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionPlayer";
import { createSingleMotionPoseData } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/AnimationFactory";
import { motionDataToDefinition } from "@/GamePlay/GameSystem/CharacterMove/MotionEngine/MotionDataConverter";
import { SkeletonAdapter } from "@/GamePlay/GameSystem/CharacterModel/Character/SkeletonAdapter";

/**
 * モーションコントローラー
 *
 * FK パイプライン:
 *   MotionData → MotionDefinition → SingleMotionPoseData → MotionPlayer
 *   → evaluateToMap() で Quaternion 評価 → ポスト処理（JointScale / UpperBodyYaw）→ ボーン書き込み
 *
 * テストシーン（AnimationFactory / MotionPlayer）と同一の Quaternion パイプラインを使用。
 * SkeletonAdapter が restQ × corrQ × eq(offset) × corrQ⁻¹ をベイクし、
 * MotionPlayer が Quaternion Slerp で補間する。
 *
 * 位置オフセット（ジャンプ高さ等）は MotionData の keyframes から直接線形補間する。
 */
export class MotionController {
  private character: Character;
  private state: MotionState;

  // モーション管理用
  private motions: Map<string, MotionConfig> = new Map();
  private defaultMotionName: string | null = null;

  // 関節角度スケール（ダッシュ加速中のモーション強度調整用、1.0 = フル適用）
  private _jointScale: number = 1.0;

  // Quaternion FK パイプライン
  private _adapter: SkeletonAdapter | null = null;
  private _player: MotionPlayer | null = null;
  private _prevBoneQuats: Map<Bone, Quaternion> | null = null;
  private _lastBoneQuats: Map<Bone, Quaternion> = new Map();

  constructor(character: Character) {
    this.character = character;
    this.state = {
      isPlaying: false,
      currentTime: 0,
      currentMotion: null,
      speed: MOTION_SPEED_CONFIG.DEFAULT_SPEED,
      isBlending: false,
      blendTime: 0,
      blendDuration: MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION,
      previousJoints: null,
      previousPosition: null,
      nextMotion: null,
      lastAppliedPosition: null,
      basePosition: null,
      positionScale: MOTION_POSITION_CONFIG.DEFAULT_POSITION_SCALE,
    };
  }

  // ========================================
  // モーション登録・管理機能
  // ========================================

  /**
   * モーションを登録
   */
  public registerMotion(config: MotionConfig): void {
    const name = config.motionData.name;
    this.motions.set(name, config);

    // デフォルトモーションとして設定されている場合
    if (config.isDefault) {
      this.defaultMotionName = name;
    }
  }

  /**
   * 複数のモーションを一括登録
   */
  public registerMotions(configs: MotionConfig[]): void {
    for (const config of configs) {
      this.registerMotion(config);
    }
  }

  /**
   * 名前でモーションを再生
   * @param motionName モーション名
   * @param force 強制的に再生するか（現在のモーションが中断不可でも上書き）
   */
  public playByName(motionName: string, force: boolean = false): boolean {
    const config = this.motions.get(motionName);
    if (!config) {
      console.warn(`[MotionController] モーション "${motionName}" が見つかりません`);
      return false;
    }

    const currentMotion = this.getCurrentMotionName();

    // 既に同じモーションが再生中の場合は何もしない
    if (currentMotion === motionName) {
      return true;
    }

    // モーションが再生中の場合のみ中断不可チェックを行う
    const isCurrentlyPlaying = this.isPlaying();

    if (!force && currentMotion && isCurrentlyPlaying) {
      // 現在のモーションが中断不可で、forceがfalseの場合は切り替えない
      const currentConfig = this.motions.get(currentMotion);
      if (currentConfig && currentConfig.interruptible === false) {
        return false;
      }
    }

    // ブレンド時間を取得
    const blendDuration = config.blendDuration ?? MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION;

    // モーションを再生
    this.play(config.motionData, 1.0, blendDuration);
    return true;
  }

  /**
   * デフォルトモーションに戻る
   */
  public playDefault(): boolean {
    if (!this.defaultMotionName) {
      console.warn("[MotionController] デフォルトモーションが設定されていません");
      return false;
    }

    return this.playByName(this.defaultMotionName);
  }

  /**
   * 位置オフセットをスケールして名前でモーションを再生
   * @param motionName モーション名
   * @param positionScale 位置オフセットのスケール（1.0が標準）
   */
  public playByNameWithPositionScale(motionName: string, positionScale: number): boolean {
    const config = this.motions.get(motionName);
    if (!config) {
      console.warn(`[MotionController] モーション "${motionName}" が見つかりません`);
      return false;
    }

    const currentMotion = this.getCurrentMotionName();

    // 既に同じモーションが再生中の場合は何もしない
    if (currentMotion === motionName) {
      return true;
    }

    // モーションが再生中の場合のみ中断不可チェックを行う
    const isCurrentlyPlaying = this.isPlaying();

    if (currentMotion && isCurrentlyPlaying) {
      const currentConfig = this.motions.get(currentMotion);
      if (currentConfig && currentConfig.interruptible === false) {
        return false;
      }
    }

    // ブレンド時間を取得
    const blendDuration = config.blendDuration ?? MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION;

    // モーションを再生（スケール付き）
    this.playWithScale(config.motionData, positionScale, MOTION_SPEED_CONFIG.DEFAULT_SPEED, blendDuration);
    return true;
  }

  /**
   * デフォルトモーション名を取得
   */
  public getDefaultMotionName(): string | null {
    return this.defaultMotionName;
  }

  /**
   * モーションが登録されているかチェック
   */
  public hasMotion(motionName: string): boolean {
    return this.motions.has(motionName);
  }

  /**
   * 関節角度スケールを設定
   * ダッシュ加速中など、モーションの関節角度を比率で縮小する場合に使用
   * @param scale スケール値（0.0〜1.0、1.0 = フル適用）
   */
  public setJointScale(scale: number): void {
    this._jointScale = Math.max(0, Math.min(1, scale));
  }

  /**
   * 現在の関節角度スケールを取得
   */
  public getJointScale(): number {
    return this._jointScale;
  }

  /**
   * 登録されているすべてのモーション名を取得
   */
  public getMotionNames(): string[] {
    return Array.from(this.motions.keys());
  }

  /**
   * モーション設定を取得
   */
  public getMotionConfig(motionName: string): MotionConfig | undefined {
    return this.motions.get(motionName);
  }

  /**
   * モーション管理の更新処理
   * loop: falseのモーションが終了したら自動的にデフォルトモーションに戻る
   */
  public updateMotionManager(): void {
    // アクション実行中はデフォルトモーションへの復帰をスキップ
    const actionController = this.character.getActionController();
    if (actionController && actionController.getCurrentAction() !== null) {
      return;
    }

    // モーションが終了していて、デフォルトモーションが設定されている場合
    if (!this.isPlaying()) {
      const currentMotionName = this.getCurrentMotionName();
      // デフォルトモーション以外が終了した場合、デフォルトモーションに戻る
      if (currentMotionName !== this.defaultMotionName && this.defaultMotionName) {
        this.playDefault();
      }
    }
  }

  // ========================================
  // 低レベルモーション再生機能
  // ========================================

  /**
   * モーションを再生開始
   * 既にモーションが再生中の場合は、ブレンドして遷移する
   */
  public play(motion: MotionData, speed: number = MOTION_SPEED_CONFIG.DEFAULT_SPEED, blendDuration: number = MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION): void {
    if (this.state.isPlaying && this.state.currentMotion) {
      // ブレンド開始: 現在のボーン Quaternion をスナップショット
      this._prevBoneQuats = this._cloneBoneQuats(this._lastBoneQuats);
      this._player = this._createPlayer(motion);
      this.state.nextMotion = motion;
      this.state.isBlending = true;
      this.state.blendTime = 0;
      this.state.blendDuration = blendDuration;
      this.state.previousJoints = null;
      this.state.positionScale = MOTION_POSITION_CONFIG.DEFAULT_POSITION_SCALE;
    } else {
      // 新規再生
      this._player = this._createPlayer(motion);
      this.state.currentMotion = motion;
      this.state.currentTime = 0;
      this.state.isPlaying = true;
      this.state.speed = speed;
      this.state.isBlending = false;
      this.state.previousJoints = null;
      this.state.previousPosition = null;
      this.state.nextMotion = null;
      this.state.lastAppliedPosition = null;
      this.state.positionScale = MOTION_POSITION_CONFIG.DEFAULT_POSITION_SCALE;
      this._prevBoneQuats = null;
    }
  }

  /**
   * モーションを位置オフセットのスケール付きで再生
   * ジャンプの高さを変えるなど、位置オフセットをスケールする場合に使用
   */
  public playWithScale(motion: MotionData, positionScale: number, speed: number = MOTION_SPEED_CONFIG.DEFAULT_SPEED, blendDuration: number = MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION): void {
    if (this.state.isPlaying && this.state.currentMotion) {
      // ブレンド開始: 現在のボーン Quaternion をスナップショット
      this._prevBoneQuats = this._cloneBoneQuats(this._lastBoneQuats);
      this._player = this._createPlayer(motion);
      this.state.nextMotion = motion;
      this.state.isBlending = true;
      this.state.blendTime = 0;
      this.state.blendDuration = blendDuration;
      this.state.previousJoints = null;
      this.state.positionScale = positionScale;
    } else {
      // 新規再生
      this._player = this._createPlayer(motion);
      this.state.currentMotion = motion;
      this.state.currentTime = 0;
      this.state.isPlaying = true;
      this.state.speed = speed;
      this.state.isBlending = false;
      this.state.previousJoints = null;
      this.state.previousPosition = null;
      this.state.nextMotion = null;
      this.state.lastAppliedPosition = null;
      this.state.positionScale = positionScale;
      this._prevBoneQuats = null;
    }
  }

  /**
   * モーションを停止
   */
  public stop(): void {
    this.state.isPlaying = false;
    this.state.currentTime = 0;
  }

  /**
   * モーションを一時停止
   */
  public pause(): void {
    this.state.isPlaying = false;
  }

  /**
   * モーションを再開
   */
  public resume(): void {
    this.state.isPlaying = true;
  }

  /**
   * モーションの再生時間を直接設定
   * しゃがみ込みモーションなどで、ボタン押下時間に応じて姿勢を変える場合に使用
   * @param time 設定する時間（秒）
   */
  public setCurrentTime(time: number): void {
    if (!this.state.currentMotion) {
      return;
    }

    this.state.currentTime = Math.max(0, Math.min(time, this.state.currentMotion.duration));

    // MotionPlayer で FK 評価
    this._applyFK(this.state.currentTime);

    // 位置オフセット + 自動接地を適用
    const currentPosition = this.interpolatePosition(this.state.currentMotion.keyframes, this.state.currentTime, this.state.currentMotion.jumpPhysics);
    this.applyPositionOffset(currentPosition);
  }

  /**
   * 更新処理（毎フレーム呼び出す）
   */
  public update(deltaTime: number): void {
    if (!this.state.isPlaying) {
      return;
    }

    // ブレンド中の処理
    if (this.state.isBlending && this.state.nextMotion && this._prevBoneQuats) {
      this.state.blendTime += deltaTime;

      if (this.state.blendTime >= this.state.blendDuration) {
        // ブレンド完了: 次のモーションに切り替え
        this.state.currentMotion = this.state.nextMotion;
        this.state.currentTime = 0;
        this.state.isBlending = false;
        this.state.previousJoints = null;
        this.state.previousPosition = null;
        this.state.nextMotion = null;
        this.state.blendTime = 0;
        this._prevBoneQuats = null;
      } else {
        // ブレンド中: 前のボーン状態と新モーション t=0 を Quaternion Slerp
        const blendRatio = this.state.blendTime / this.state.blendDuration;
        this._applyBlendedFK(blendRatio);

        // ブレンド中も位置オフセット + 自動接地を適用
        const currentPosition = this.interpolatePosition(this.state.nextMotion.keyframes, 0, this.state.nextMotion.jumpPhysics);
        this.applyPositionOffset(currentPosition);
        return;
      }
    }

    // 通常のモーション再生
    if (!this.state.currentMotion) {
      return;
    }

    const motion = this.state.currentMotion;

    // 時間を進める
    this.state.currentTime += deltaTime * this.state.speed;

    // ループ処理
    if (this.state.currentTime >= motion.duration) {
      if (motion.loop) {
        this.state.currentTime = this.state.currentTime % motion.duration;
      } else {
        this.state.currentTime = motion.duration;
        this.state.isPlaying = false;
      }
    }

    // MotionPlayer で FK 評価 + ポスト処理
    this._applyFK(this.state.currentTime);

    // 位置オフセット + 自動接地を適用
    const currentPosition = this.interpolatePosition(motion.keyframes, this.state.currentTime, motion.jumpPhysics);
    this.applyPositionOffset(currentPosition);
  }

  // ========================================
  // Quaternion FK パイプライン
  // ========================================

  /** SkeletonAdapter を遅延取得 */
  private _getAdapter(): SkeletonAdapter {
    if (!this._adapter) {
      this._adapter = this.character.getSkeletonAdapter();
    }
    return this._adapter;
  }

  /** MotionData → MotionPlayer を生成 */
  private _createPlayer(motion: MotionData): MotionPlayer | null {
    const adapter = this._getAdapter();
    const def = motionDataToDefinition(motion);
    const poseData = createSingleMotionPoseData(
      adapter.skeleton, def, adapter.getRestPoseCache(),
    );
    if (!poseData) return null;
    return new MotionPlayer(poseData);
  }

  /**
   * 指定時刻で FK を評価し、ポスト処理後にボーンに書き込む。
   *
   * パイプライン:
   *   MotionPlayer.evaluateToMap(time) → Quaternion Map
   *   → JointScale: Slerp(restQ, animQ, scale)
   *   → UpperBodyYaw: conjugated yaw rotation on spine2
   *   → bone.setRotationQuaternion()
   */
  private _applyFK(time: number): void {
    if (!this._player) return;

    const boneQuats = this._player.evaluateToMap(time);
    this._postProcess(boneQuats);
    this._writeBoneQuats(boneQuats);
    this._lastBoneQuats = boneQuats;
  }

  /**
   * ブレンド中の FK 評価。
   * 前のボーン状態と新モーション t=0 を Quaternion Slerp で補間。
   */
  private _applyBlendedFK(blendRatio: number): void {
    if (!this._player || !this._prevBoneQuats) return;

    // 新モーションを t=0 で評価
    const newQuats = this._player.evaluateToMap(0);
    this._postProcess(newQuats);

    // 前のボーン状態と Slerp
    const blended = new Map<Bone, Quaternion>();
    for (const [bone, newQ] of newQuats) {
      const prevQ = this._prevBoneQuats.get(bone);
      if (prevQ) {
        blended.set(bone, Quaternion.Slerp(prevQ, newQ, blendRatio));
      } else {
        blended.set(bone, newQ.clone());
      }
    }

    this._writeBoneQuats(blended);
    this._lastBoneQuats = blended;
  }

  /** JointScale + UpperBodyYaw のポスト処理 */
  private _postProcess(boneQuats: Map<Bone, Quaternion>): void {
    if (this._jointScale < 1.0) {
      this._applyJointScale(boneQuats);
    }
    const yaw = this.character.getUpperBodyYawOffset();
    if (yaw !== 0) {
      this._applyUpperBodyYaw(boneQuats, yaw);
    }
  }

  /**
   * 関節角度スケール: Slerp(restQ, animQ, scale)
   * scale=1.0 → フルアニメーション、scale=0.0 → レストポーズ
   */
  private _applyJointScale(boneQuats: Map<Bone, Quaternion>): void {
    const adapter = this._getAdapter();
    for (const [bone, animQ] of boneQuats) {
      const restQ = adapter.getRestQuaternion(bone);
      if (restQ) {
        boneQuats.set(bone, Quaternion.Slerp(restQ, animQ, this._jointScale));
      }
    }
  }

  /**
   * 上半身ヨー回転のポスト処理。
   *
   * Euler パイプラインでは offset.y += yaw だったが、
   * Quaternion パイプラインでは共役回転で等価な変換を行う:
   *   Q_final = (restQ × RotY(yaw) × restQ⁻¹) × Q_anim
   *
   * 数学的証明:
   *   Euler: restQ × RotYPR(ry + yaw, rx, rz)
   *        = restQ × RotY(yaw) × RotYPR(ry, rx, rz)
   *        = (restQ × RotY(yaw) × restQ⁻¹) × (restQ × RotYPR(ry, rx, rz))
   *        = conjugatedYaw × Q_anim
   */
  private _applyUpperBodyYaw(boneQuats: Map<Bone, Quaternion>, yaw: number): void {
    const adapter = this._getAdapter();
    const spine2Bone = adapter.findBone("spine2");
    if (!spine2Bone) return;

    const currentQ = boneQuats.get(spine2Bone);
    if (!currentQ) return;

    const restQ = adapter.getRestQuaternion(spine2Bone);
    if (!restQ) return;

    const yawQ = Quaternion.FromEulerAngles(0, yaw, 0);
    const restInv = Quaternion.Inverse(restQ);
    const conjugatedYaw = restQ.multiply(yawQ).multiply(restInv);
    boneQuats.set(spine2Bone, conjugatedYaw.multiply(currentQ));
  }

  /**
   * Quaternion Map をボーンに書き込む。
   * GLB: bone.getTransformNode().rotationQuaternion = q （dirty フラグを確実トリガー）
   * ProceduralHumanoid: bone.setRotationQuaternion(q, Space.LOCAL)
   * MotionPlayer._applyAtCurrentTime() と同一のデュアルパス。
   */
  private _writeBoneQuats(boneQuats: Map<Bone, Quaternion>): void {
    for (const [bone, q] of boneQuats) {
      const node = bone.getTransformNode();
      if (node) {
        node.rotationQuaternion = q.clone();
      } else {
        bone.setRotationQuaternion(q, Space.LOCAL);
      }
    }
  }

  /** Quaternion Map のディープクローン */
  private _cloneBoneQuats(source: Map<Bone, Quaternion>): Map<Bone, Quaternion> {
    const result = new Map<Bone, Quaternion>();
    for (const [bone, q] of source) {
      result.set(bone, q.clone());
    }
    return result;
  }

  // ========================================
  // 位置補間（MotionData keyframes から直接計算）
  // ========================================

  /**
   * キーフレーム間を補間して現在の位置オフセットを取得
   * jumpPhysics が指定されている場合、Y軸のみ放物線で計算する
   */
  private interpolatePosition(keyframes: Keyframe[], currentTime: number, jumpPhysics?: JumpPhysics): PositionOffset | null {
    const framesWithPosition = keyframes.filter((kf) => kf.position);

    if (framesWithPosition.length === 0) {
      return null;
    }

    if (framesWithPosition.length === 1) {
      const pos = framesWithPosition[0].position!;
      return {
        x: pos.x,
        y: jumpPhysics ? this.computePhysicsY(currentTime, jumpPhysics) : pos.y,
        z: pos.z,
      };
    }

    // 現在の時間を挟む2つのキーフレームを見つける
    let prevKeyframe: Keyframe | null = null;
    let nextKeyframe: Keyframe | null = null;

    for (let i = 0; i < framesWithPosition.length - 1; i++) {
      if (framesWithPosition[i].time <= currentTime && currentTime <= framesWithPosition[i + 1].time) {
        prevKeyframe = framesWithPosition[i];
        nextKeyframe = framesWithPosition[i + 1];
        break;
      }
    }

    // 範囲外の場合
    if (!prevKeyframe || !nextKeyframe) {
      if (currentTime < framesWithPosition[0].time) {
        const pos = framesWithPosition[0].position!;
        return {
          x: pos.x,
          y: jumpPhysics ? this.computePhysicsY(currentTime, jumpPhysics) : pos.y,
          z: pos.z,
        };
      } else {
        const pos = framesWithPosition[framesWithPosition.length - 1].position!;
        return {
          x: pos.x,
          y: jumpPhysics ? this.computePhysicsY(currentTime, jumpPhysics) : pos.y,
          z: pos.z,
        };
      }
    }

    // 補間率を計算
    const timeDiff = nextKeyframe.time - prevKeyframe.time;
    const t = timeDiff > 0 ? (currentTime - prevKeyframe.time) / timeDiff : 0;

    // 位置を補間（X, Z は線形、Y は物理 or 線形）
    const prevPos = prevKeyframe.position!;
    const nextPos = nextKeyframe.position!;

    return {
      x: Scalar.Lerp(prevPos.x, nextPos.x, t),
      y: jumpPhysics ? this.computePhysicsY(currentTime, jumpPhysics) : Scalar.Lerp(prevPos.y, nextPos.y, t),
      z: Scalar.Lerp(prevPos.z, nextPos.z, t),
    };
  }

  /**
   * 物理ベースのジャンプY位置を計算（2区間パラボラ）
   *
   * 上昇: y = h * (2p - p²)  速い立ち上がり → 頂点で速度0
   * 下降: y = h * (1 - p²)   頂点で速度0 → 加速しながら着地
   */
  private computePhysicsY(t: number, physics: JumpPhysics): number {
    const { liftoffTime, peakTime, landingTime, peakHeight } = physics;
    const hang = physics.hangTime ?? 0;

    if (t <= liftoffTime) return 0;
    if (t >= landingTime) return 0;

    // 実効的な下降開始時刻（peakTime + hangTime）
    const descentStart = Math.max(peakTime, liftoffTime) + hang;

    if (peakTime <= liftoffTime) {
      // 下降のみ（JumpShoot系: 頂点から開始）
      if (t <= descentStart) return peakHeight; // 頂点滞空
      const p = (t - descentStart) / (landingTime - descentStart);
      return peakHeight * (1 - p * p);
    }

    if (t <= peakTime) {
      // 上昇フェーズ
      const p = (t - liftoffTime) / (peakTime - liftoffTime);
      return peakHeight * (2 * p - p * p);
    } else if (t <= descentStart) {
      // 頂点滞空
      return peakHeight;
    } else {
      // 下降フェーズ
      const p = (t - descentStart) / (landingTime - descentStart);
      return peakHeight * (1 - p * p);
    }
  }

  /**
   * 位置オフセットをキャラクターに適用（自動接地付き）
   *
   * 自動接地: 関節回転適用後の足のY座標から、足が地面に着くための補正を自動計算。
   * position.y の負の値（しゃがみ補正）は自動接地が代替するため無視し、
   * 正の値（ジャンプ高度）のみ加算する。
   */
  private applyPositionOffset(offset: PositionOffset | null): void {
    // 自動接地オフセット（関節回転による足の浮きを補正）
    const autoGround = this.character.getAutoGroundOffset();

    // モーションの position.y: 正の値のみ高度として加算（負=しゃがみ補正は自動接地で代替）
    const scaledY = offset ? offset.y * this.state.positionScale : 0;
    const elevation = Math.max(0, scaledY);

    this.character.setMotionOffsetY(autoGround + elevation);

    // 今回のオフセットを保存
    this.state.lastAppliedPosition = offset
      ? {
          x: offset.x * this.state.positionScale,
          y: autoGround + elevation,
          z: offset.z * this.state.positionScale,
        }
      : { x: 0, y: autoGround, z: 0 };
  }

  // ========================================
  // 状態取得
  // ========================================

  /**
   * 現在のモーション状態を取得
   */
  public getState(): MotionState {
    return {...this.state};
  }

  /**
   * 再生中かどうかを取得
   */
  public isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * 現在再生中のモーション名を取得
   * ブレンド中の場合は、ブレンド先のモーション名を返す
   */
  public getCurrentMotionName(): string | null {
    if (this.state.isBlending && this.state.nextMotion) {
      return this.state.nextMotion.name;
    }
    return this.state.currentMotion?.name || null;
  }

  /**
   * 基準位置を更新（ジャンプ中の慣性移動などで使用）
   */
  public updateBasePosition(position: {x: number, y: number, z: number}): void {
    this.state.basePosition = {x: position.x, y: position.y, z: position.z};
  }
}
