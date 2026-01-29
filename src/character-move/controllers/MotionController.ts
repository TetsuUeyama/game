import { Scalar } from "@babylonjs/core";
import {Character} from "../entities/Character";
import {MotionData, MotionState, MotionConfig, Keyframe, KeyframeJoints, JointRotation, JointPriority, PositionOffset} from "../types/MotionTypes";

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

  constructor(character: Character) {
    this.character = character;
    this.state = {
      isPlaying: false,
      currentTime: 0,
      currentMotion: null,
      speed: 1.0,
      isBlending: false,
      blendTime: 0,
      blendDuration: 0.3, // デフォルト0.3秒でブレンド
      previousJoints: null,
      previousPosition: null,
      nextMotion: null,
      lastAppliedPosition: null,
      basePosition: null,
      positionScale: 1.0,
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

    // ブレンド時間を取得（デフォルト: 0.3秒）
    const blendDuration = config.blendDuration ?? 0.3;

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
    const blendDuration = config.blendDuration ?? 0.3;

    // モーションを再生（スケール付き）
    this.playWithScale(config.motionData, positionScale, 1.0, blendDuration);
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
  public play(motion: MotionData, speed: number = 1.0, blendDuration: number = 0.3): void {
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
      this.state.positionScale = 1.0;
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
      this.state.positionScale = 1.0;
    }
  }

  /**
   * モーションを位置オフセットのスケール付きで再生
   * ジャンプの高さを変えるなど、位置オフセットをスケールする場合に使用
   */
  public playWithScale(motion: MotionData, positionScale: number, speed: number = 1.0, blendDuration: number = 0.3): void {
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

    // 位置オフセットも適用
    const currentPosition = this.interpolatePosition(this.state.currentMotion.keyframes, this.state.currentTime);
    if (currentPosition) {
      this.applyPositionOffset(currentPosition);
    }
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

        // ブレンド中も位置オフセットを適用
        const currentPosition = this.interpolatePosition(this.state.nextMotion.keyframes, 0);
        if (currentPosition) {
          this.applyPositionOffset(currentPosition);
        } else if (this.state.lastAppliedPosition) {
          // 位置オフセットがないモーションの場合、元の位置に戻す
          this.applyPositionOffset({x: 0, y: 0, z: 0});
        }
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

    // 位置オフセットを適用
    const currentPosition = this.interpolatePosition(motion.keyframes, this.state.currentTime);
    if (currentPosition) {
      this.applyPositionOffset(currentPosition);
    } else if (this.state.lastAppliedPosition) {
      // 位置オフセットがないモーションの場合、元の位置に戻す
      this.applyPositionOffset({x: 0, y: 0, z: 0});
    }
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
   */
  private interpolatePosition(keyframes: Keyframe[], currentTime: number): PositionOffset | null {
    // 位置オフセットを持つキーフレームを見つける
    const framesWithPosition = keyframes.filter((kf) => kf.position);

    if (framesWithPosition.length === 0) {
      return null; // 位置オフセットがない
    }

    if (framesWithPosition.length === 1) {
      return framesWithPosition[0].position!;
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
        return framesWithPosition[0].position!;
      } else {
        return framesWithPosition[framesWithPosition.length - 1].position!;
      }
    }

    // 補間率を計算
    const timeDiff = nextKeyframe.time - prevKeyframe.time;
    const t = timeDiff > 0 ? (currentTime - prevKeyframe.time) / timeDiff : 0;

    // 位置を補間
    const prevPos = prevKeyframe.position!;
    const nextPos = nextKeyframe.position!;

    return {
      x: this.lerp(prevPos.x, nextPos.x, t),
      y: this.lerp(prevPos.y, nextPos.y, t),
      z: this.lerp(prevPos.z, nextPos.z, t),
    };
  }

  /**
   * 位置オフセットをキャラクターに適用
   * Y軸オフセットはCharacterクラス内で管理し、setPosition()時に自動的に加算される
   */
  private applyPositionOffset(offset: PositionOffset): void {
    // 位置スケールを適用
    const scaledOffset = {
      x: offset.x * this.state.positionScale,
      y: offset.y * this.state.positionScale,
      z: offset.z * this.state.positionScale,
    };

    // Y軸オフセットをキャラクターに設定（clampの影響を受けない）
    this.character.setMotionOffsetY(scaledOffset.y);

    // 今回のオフセットを保存（スケール済み）
    this.state.lastAppliedPosition = {...scaledOffset};
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
   * 関節に回転を適用
   */
  private applyJointRotation(jointName: keyof KeyframeJoints, rotation: JointRotation): void {
    const joint = this.character.getJoint(jointName);
    if (joint) {
      // 度数法からラジアンに変換して適用
      joint.rotation.x = (rotation.x * Math.PI) / 180;
      joint.rotation.y = (rotation.y * Math.PI) / 180;
      joint.rotation.z = (rotation.z * Math.PI) / 180;
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
