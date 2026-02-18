import { Scalar, Vector3, Space } from "@babylonjs/core";
import {Character} from "@/GamePlay/Object/Entities/Character";
import {MotionData, MotionState, MotionConfig, Keyframe, KeyframeJoints, JointRotation, JointPriority, PositionOffset, JumpPhysics} from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";
import { MOTION_BLEND_CONFIG, MOTION_SPEED_CONFIG, MOTION_POSITION_CONFIG } from "@/GamePlay/GameSystem/CharacterMove/Config/MotionConfig";

/**
 * モーションコントローラー
 * キーフレームアニメーションの実行とモーションの登録・管理を統合
 */
export class MotionController {
  private character: Character;
  private state: MotionState;

  // モーション管理用
  private motions: Map<string, MotionConfig> = new Map();
  private defaultMotionName: string | null = null;

  // 関節角度スケール（ダッシュ加速中のモーション強度調整用、1.0 = フル適用）
  private _jointScale: number = 1.0;

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
    // 既にモーションが再生中の場合は、ブレンドを開始
    if (this.state.isPlaying && this.state.currentMotion) {
      // 現在の関節状態を保存
      const currentJoints = this.interpolateKeyframes(this.state.currentMotion.keyframes, this.state.currentTime);
      this.state.previousJoints = currentJoints;
      this.state.nextMotion = motion;
      this.state.isBlending = true;
      this.state.blendTime = 0;
      this.state.blendDuration = blendDuration;
      // lastAppliedPositionは保持（新しいモーションのオフセットとの差分を取るため）
      // 位置スケールをリセット
      this.state.positionScale = MOTION_POSITION_CONFIG.DEFAULT_POSITION_SCALE;
    } else {
      // 新規再生
      this.state.currentMotion = motion;
      this.state.currentTime = 0;
      this.state.isPlaying = true;
      this.state.speed = speed;
      this.state.isBlending = false;
      this.state.previousJoints = null;
      this.state.previousPosition = null;
      this.state.nextMotion = null;
      // 初回のみ位置オフセットをリセット
      this.state.lastAppliedPosition = null;
      // 位置スケールをリセット
      this.state.positionScale = MOTION_POSITION_CONFIG.DEFAULT_POSITION_SCALE;
    }
  }

  /**
   * モーションを位置オフセットのスケール付きで再生
   * ジャンプの高さを変えるなど、位置オフセットをスケールする場合に使用
   */
  public playWithScale(motion: MotionData, positionScale: number, speed: number = MOTION_SPEED_CONFIG.DEFAULT_SPEED, blendDuration: number = MOTION_BLEND_CONFIG.DEFAULT_BLEND_DURATION): void {
    // 既にモーションが再生中の場合は、ブレンドを開始
    if (this.state.isPlaying && this.state.currentMotion) {
      // 現在の関節状態を保存
      const currentJoints = this.interpolateKeyframes(this.state.currentMotion.keyframes, this.state.currentTime);
      this.state.previousJoints = currentJoints;
      this.state.nextMotion = motion;
      this.state.isBlending = true;
      this.state.blendTime = 0;
      this.state.blendDuration = blendDuration;
      // lastAppliedPositionは保持（新しいモーションのオフセットとの差分を取るため）
      // 位置スケールを設定
      this.state.positionScale = positionScale;
    } else {
      // 新規再生
      this.state.currentMotion = motion;
      this.state.currentTime = 0;
      this.state.isPlaying = true;
      this.state.speed = speed;
      this.state.isBlending = false;
      this.state.previousJoints = null;
      this.state.previousPosition = null;
      this.state.nextMotion = null;
      // 初回のみ位置オフセットをリセット
      this.state.lastAppliedPosition = null;
      // 位置スケールを設定
      this.state.positionScale = positionScale;
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

    // 時間をモーションの範囲内にクランプ
    this.state.currentTime = Math.max(0, Math.min(time, this.state.currentMotion.duration));

    // 現在の時間に対応する関節の状態を計算して適用
    const currentJoints = this.interpolateKeyframes(this.state.currentMotion.keyframes, this.state.currentTime);
    this.applyJointsWithPriority(currentJoints, this.state.currentMotion.priorities);

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
    if (this.state.isBlending && this.state.nextMotion && this.state.previousJoints) {
      this.state.blendTime += deltaTime;

      // ブレンド完了チェック
      if (this.state.blendTime >= this.state.blendDuration) {
        // ブレンド完了: 次のモーションに切り替え
        this.state.currentMotion = this.state.nextMotion;
        this.state.currentTime = 0;
        this.state.isBlending = false;
        this.state.previousJoints = null;
        this.state.previousPosition = null;
        this.state.nextMotion = null;
        this.state.blendTime = 0;
      } else {
        // ブレンド中: 前のモーションと次のモーションを補間
        const blendRatio = this.state.blendTime / this.state.blendDuration;

        // 次のモーションの現在の状態を取得
        const nextJoints = this.interpolateKeyframes(
          this.state.nextMotion.keyframes,
          0, // 次のモーションは最初から
        );

        // 前の状態と次の状態をブレンド
        const blendedJoints = this.blendJoints(this.state.previousJoints, nextJoints, blendRatio);

        // ブレンドした関節を適用
        const priorities = this.state.nextMotion.priorities || this.state.currentMotion?.priorities;
        this.applyJointsWithPriority(blendedJoints, priorities);

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

    // 現在の時間に対応する関節の状態を計算
    const currentJoints = this.interpolateKeyframes(motion.keyframes, this.state.currentTime);

    // 優先度順に関節を適用
    this.applyJointsWithPriority(currentJoints, motion.priorities);

    // 位置オフセット + 自動接地を適用
    const currentPosition = this.interpolatePosition(motion.keyframes, this.state.currentTime, motion.jumpPhysics);
    this.applyPositionOffset(currentPosition);
  }

  /**
   * キーフレーム間を補間して現在の関節状態を取得
   */
  private interpolateKeyframes(keyframes: Keyframe[], currentTime: number): KeyframeJoints {
    // キーフレームが1つ以下の場合
    if (keyframes.length === 0) {
      return {};
    }
    if (keyframes.length === 1) {
      return keyframes[0].joints;
    }

    // 現在の時間を挟む2つのキーフレームを見つける
    let prevKeyframe: Keyframe = keyframes[0];
    let nextKeyframe: Keyframe = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].time <= currentTime && currentTime <= keyframes[i + 1].time) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }

    // 補間率を計算
    const timeDiff = nextKeyframe.time - prevKeyframe.time;
    const t = timeDiff > 0 ? (currentTime - prevKeyframe.time) / timeDiff : 0;

    // 各関節を補間
    const interpolatedJoints: KeyframeJoints = {};
    const jointNames: (keyof KeyframeJoints)[] = ["upperBody", "lowerBody", "head", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHip", "rightHip", "leftKnee", "rightKnee"];

    for (const jointName of jointNames) {
      const prevRotation = prevKeyframe.joints[jointName];
      const nextRotation = nextKeyframe.joints[jointName];

      if (prevRotation && nextRotation) {
        interpolatedJoints[jointName] = this.lerpRotation(prevRotation, nextRotation, t);
      } else if (prevRotation) {
        interpolatedJoints[jointName] = {...prevRotation};
      } else if (nextRotation) {
        interpolatedJoints[jointName] = {...nextRotation};
      }
    }

    return interpolatedJoints;
  }

  /**
   * 2つの回転を線形補間（Babylon.js Scalar API使用）
   */
  private lerpRotation(from: JointRotation, to: JointRotation, t: number): JointRotation {
    return {
      x: Scalar.Lerp(from.x, to.x, t),
      y: Scalar.Lerp(from.y, to.y, t),
      z: Scalar.Lerp(from.z, to.z, t),
    };
  }

  /**
   * 線形補間（Babylon.js Scalar API使用）
   */
  private lerp(from: number, to: number, t: number): number {
    return Scalar.Lerp(from, to, t);
  }

  /**
   * キーフレーム間を補間して現在の位置オフセットを取得
   * jumpPhysics が指定されている場合、Y軸のみ放物線で計算する
   */
  private interpolatePosition(keyframes: Keyframe[], currentTime: number, jumpPhysics?: JumpPhysics): PositionOffset | null {
    // 位置オフセットを持つキーフレームを見つける
    const framesWithPosition = keyframes.filter((kf) => kf.position);

    if (framesWithPosition.length === 0) {
      return null; // 位置オフセットがない
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
      x: this.lerp(prevPos.x, nextPos.x, t),
      y: jumpPhysics ? this.computePhysicsY(currentTime, jumpPhysics) : this.lerp(prevPos.y, nextPos.y, t),
      z: this.lerp(prevPos.z, nextPos.z, t),
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

  /**
   * 2つの関節状態をブレンド
   */
  private blendJoints(fromJoints: KeyframeJoints, toJoints: KeyframeJoints, blendRatio: number): KeyframeJoints {
    const blendedJoints: KeyframeJoints = {};
    const jointNames: (keyof KeyframeJoints)[] = ["upperBody", "lowerBody", "head", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHip", "rightHip", "leftKnee", "rightKnee"];

    for (const jointName of jointNames) {
      const fromRotation = fromJoints[jointName];
      const toRotation = toJoints[jointName];

      if (fromRotation && toRotation) {
        // 両方の状態がある場合はブレンド
        blendedJoints[jointName] = this.lerpRotation(fromRotation, toRotation, blendRatio);
      } else if (fromRotation) {
        // fromのみの場合
        blendedJoints[jointName] = {...fromRotation};
      } else if (toRotation) {
        // toのみの場合
        blendedJoints[jointName] = {...toRotation};
      }
    }

    return blendedJoints;
  }

  /**
   * 優先度に基づいて関節を適用
   */
  private applyJointsWithPriority(joints: KeyframeJoints, priorities?: JointPriority[]): void {
    // 優先度が指定されている場合は、優先度順にソート
    const jointNames: (keyof KeyframeJoints)[] = Object.keys(joints) as (keyof KeyframeJoints)[];

    if (priorities && priorities.length > 0) {
      // 優先度マップを作成
      const priorityMap = new Map<keyof KeyframeJoints, number>();
      for (const priority of priorities) {
        priorityMap.set(priority.jointName, priority.priority);
      }

      // 優先度順にソート（優先度が高い順）
      jointNames.sort((a, b) => {
        const priorityA = priorityMap.get(a) ?? 0;
        const priorityB = priorityMap.get(b) ?? 0;
        return priorityB - priorityA; // 降順
      });
    }

    // 優先度順に関節を適用
    for (const jointName of jointNames) {
      const rotation = joints[jointName];
      if (rotation) {
        this.applyJointRotation(jointName, rotation);
      }
    }
  }

  /**
   * 関節に回転を適用（スケルトンボーンに書き込み）
   */
  private applyJointRotation(jointName: keyof KeyframeJoints, rotation: JointRotation): void {
    const bone = this.character.getBoneForJoint(jointName);
    if (bone) {
      const s = this._jointScale;
      let ry = (rotation.y * s * Math.PI) / 180;
      if (jointName === 'upperBody') {
        ry += this.character.getUpperBodyYawOffset();
      }
      bone.setRotation(new Vector3(
        (rotation.x * s * Math.PI) / 180,
        ry,
        (rotation.z * s * Math.PI) / 180
      ), Space.LOCAL);
    }
  }

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
    // ブレンド中の場合は、ブレンド先のモーション名を返す
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
