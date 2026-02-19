import { Bone, Quaternion, Space, TransformNode } from "@babylonjs/core";

/**
 * 単一モーション再生用のポーズデータ
 */
export interface SingleMotionPoseData {
  bones: { bone: Bone; keys: { frame: number; quat: Quaternion }[] }[];
  frameCount: number;
  duration: number;
}

interface MotionBoneTarget {
  bone: Bone;
  node: TransformNode | null;
  keys: { frame: number; quat: Quaternion }[];
}

/**
 * 単一モーションプレイヤー
 *
 * 1つの MotionDefinition をループ再生する。
 * PoseBlender と同じ GLTF/非GLTF 対応ロジックを持つ。
 * setData() でモーションデータをホットスワップ可能。
 *
 * デルタモーション（isDelta=true）の場合:
 *   setBaseData() で idle のベースデータを設定し、
 *   update() で idle + delta を合成して再生する。
 *
 * seekTo() で任意の時刻に移動し、ボーンを即座に評価できる。
 * MotionController 統合時に外部から時間管理する場合に使用。
 */
export class MotionPlayer {
  // メインモーション（絶対 or デルタ）
  private _targets: MotionBoneTarget[];
  private _frameCount: number;
  private _duration: number;
  private _time = 0;
  private _loop = true;
  private _finished = false;

  // ベースモーション（idle、デルタモード用）
  private _baseMap: Map<Bone, { keys: { frame: number; quat: Quaternion }[] }> | null = null;
  private _baseFrameCount = 0;
  private _baseDuration = 0;
  private _baseTime = 0;

  private _baseQ = new Quaternion();
  private _deltaQ = new Quaternion();
  private _resultQ = new Quaternion();

  constructor(data: SingleMotionPoseData) {
    this._frameCount = data.frameCount;
    this._duration = data.duration;
    this._targets = this._buildTargets(data);
  }

  private _buildTargets(data: SingleMotionPoseData): MotionBoneTarget[] {
    return data.bones.map((bd) => {
      const node = bd.bone.getTransformNode();
      if (node && !node.rotationQuaternion) {
        node.rotationQuaternion = Quaternion.Identity();
      }
      return { bone: bd.bone, node, keys: bd.keys };
    });
  }

  /** 現在の再生時刻（秒） */
  get currentTime(): number {
    return this._time;
  }

  /** モーションの長さ（秒） */
  get duration(): number {
    return this._duration;
  }

  /** ループ設定 */
  get loop(): boolean {
    return this._loop;
  }

  /** 非ループモーションが終了したか */
  get isFinished(): boolean {
    return this._finished;
  }

  /** ループ設定を変更 */
  setLoop(loop: boolean): void {
    this._loop = loop;
    if (loop) this._finished = false;
  }

  /** メインモーションデータをホットスワップ（キーフレーム編集時） */
  setData(data: SingleMotionPoseData): void {
    this._frameCount = data.frameCount;
    this._duration = data.duration;
    this._targets = this._buildTargets(data);
    this._finished = false;
  }

  /**
   * ベースモーション（idle）を設定する。
   * 設定すると、メインモーションはデルタとして扱われ、
   * update() で base * delta の合成結果が適用される。
   * null を渡すとベースを解除し、メインを絶対モードに戻す。
   */
  setBaseData(baseData: SingleMotionPoseData | null): void {
    if (!baseData) {
      this._baseMap = null;
      this._baseDuration = 0;
      this._baseFrameCount = 0;
      this._baseTime = 0;
      return;
    }
    this._baseDuration = baseData.duration;
    this._baseFrameCount = baseData.frameCount;
    this._baseTime = 0;
    const map = new Map<Bone, { keys: { frame: number; quat: Quaternion }[] }>();
    for (const bd of baseData.bones) {
      map.set(bd.bone, { keys: bd.keys });
    }
    this._baseMap = map;
  }

  /**
   * 指定時刻に移動し、ボーンの回転を即座に評価・書き込む。
   * MotionController 統合用: 外部で時間管理し、MotionPlayer は評価のみ行う。
   */
  seekTo(time: number): void {
    if (this._duration <= 0) return;

    this._time = Math.max(0, Math.min(time, this._duration));
    this._applyAtCurrentTime();
  }

  /**
   * 指定時刻でボーン回転を評価し、結果を Map で返す（ボーンには書き込まない）。
   * MotionController のブレンド / ポスト処理用。
   */
  evaluateToMap(time: number): Map<Bone, Quaternion> {
    const result = new Map<Bone, Quaternion>();
    if (this._duration <= 0) return result;

    const t = Math.max(0, Math.min(time, this._duration));
    const mainFrame = (t / this._duration) * this._frameCount;

    let baseFrame = 0;
    if (this._baseMap && this._baseDuration > 0) {
      baseFrame = (this._baseTime / this._baseDuration) * this._baseFrameCount;
    }

    const tmpQ = new Quaternion();
    for (const tgt of this._targets) {
      if (this._baseMap) {
        const baseBone = this._baseMap.get(tgt.bone);
        if (baseBone) {
          this._evaluateTo(baseBone.keys, baseFrame, this._baseFrameCount, this._baseQ);
          this._evaluateTo(tgt.keys, mainFrame, this._frameCount, this._deltaQ);
          this._baseQ.multiplyToRef(this._deltaQ, tmpQ);
          result.set(tgt.bone, tmpQ.clone());
        } else {
          this._evaluateTo(tgt.keys, mainFrame, this._frameCount, tmpQ);
          result.set(tgt.bone, tmpQ.clone());
        }
      } else {
        this._evaluateTo(tgt.keys, mainFrame, this._frameCount, tmpQ);
        result.set(tgt.bone, tmpQ.clone());
      }
    }

    return result;
  }

  /** 再生時刻をリセットする */
  reset(): void {
    this._time = 0;
    this._baseTime = 0;
    this._finished = false;
  }

  /** 毎フレーム呼び出し。dt=0 で一時停止（現在のポーズを維持） */
  update(dt: number): void {
    if (this._duration <= 0) return;
    if (this._finished) return;

    // メインモーション時間を進行
    this._time += dt;
    if (this._loop) {
      this._time = this._time % this._duration;
    } else if (this._time >= this._duration) {
      this._time = this._duration;
      this._finished = true;
    }

    // ベースモーション時間を進行（独立したサイクル）
    if (this._baseMap && this._baseDuration > 0) {
      this._baseTime = (this._baseTime + dt) % this._baseDuration;
    }

    this._applyAtCurrentTime();
  }

  /** 現在の _time でボーン回転を評価・書き込む */
  private _applyAtCurrentTime(): void {
    const mainFrame = (this._time / this._duration) * this._frameCount;

    let baseFrame = 0;
    if (this._baseMap && this._baseDuration > 0) {
      baseFrame = (this._baseTime / this._baseDuration) * this._baseFrameCount;
    }

    for (const tgt of this._targets) {
      if (this._baseMap) {
        const baseBone = this._baseMap.get(tgt.bone);
        if (baseBone) {
          this._evaluateTo(baseBone.keys, baseFrame, this._baseFrameCount, this._baseQ);
          this._evaluateTo(tgt.keys, mainFrame, this._frameCount, this._deltaQ);
          this._baseQ.multiplyToRef(this._deltaQ, this._resultQ);
        } else {
          this._evaluateTo(tgt.keys, mainFrame, this._frameCount, this._resultQ);
        }
      } else {
        this._evaluateTo(tgt.keys, mainFrame, this._frameCount, this._resultQ);
      }

      if (tgt.node && tgt.node.rotationQuaternion) {
        tgt.node.rotationQuaternion.copyFrom(this._resultQ);
      } else {
        tgt.bone.setRotationQuaternion(this._resultQ, Space.LOCAL);
      }
    }
  }

  private _evaluateTo(
    keys: { frame: number; quat: Quaternion }[],
    frame: number,
    totalFrames: number,
    out: Quaternion
  ): void {
    if (keys.length === 0) {
      out.copyFrom(Quaternion.Identity());
      return;
    }
    if (keys.length === 1) {
      out.copyFrom(keys[0].quat);
      return;
    }

    const lastKey = keys[keys.length - 1];
    if (frame >= lastKey.frame) {
      const remaining = totalFrames - lastKey.frame;
      if (remaining > 0) {
        const localT = (frame - lastKey.frame) / remaining;
        Quaternion.SlerpToRef(lastKey.quat, keys[0].quat, localT, out);
      } else {
        out.copyFrom(lastKey.quat);
      }
      return;
    }

    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].frame <= frame) i++;

    if (i >= keys.length - 1) {
      out.copyFrom(keys[keys.length - 1].quat);
      return;
    }

    const k0 = keys[i];
    const k1 = keys[i + 1];
    const span = k1.frame - k0.frame;
    const localT = span > 0 ? (frame - k0.frame) / span : 0;
    Quaternion.SlerpToRef(k0.quat, k1.quat, localT, out);
  }

  dispose(): void {
    this._targets = [];
    this._baseMap = null;
  }
}
