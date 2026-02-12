import { Bone, Quaternion, Space, TransformNode } from "@babylonjs/core";
import { BlendInput, CharacterMotionConfig } from "../types/CharacterMotionConfig";

/**
 * ボーンごとのポーズデータ
 * idle/walk の回転キーフレームを Quaternion で保持
 */
export interface PoseBoneData {
  bone: Bone;
  idleKeys: { frame: number; quat: Quaternion }[];
  walkKeys: { frame: number; quat: Quaternion }[];
}

/**
 * ポーズデータ全体
 */
export interface PoseData {
  bones: PoseBoneData[];
  idleFrameCount: number;
  walkFrameCount: number;
}

const FPS = 30;

/**
 * ボーンの回転適用先を表す。
 * GLTF/GLB ボーンには linkedTransformNode があり、
 * Bone API (setRotationQuaternion) ではなく TransformNode の
 * rotationQuaternion を直接変更する必要がある。
 */
interface BoneTarget {
  bone: Bone;
  /** GLTF の場合: linked TransformNode。null なら Bone API を使う */
  node: TransformNode | null;
  idleKeys: { frame: number; quat: Quaternion }[];
  walkKeys: { frame: number; quat: Quaternion }[];
}

/**
 * 手動ポーズブレンダー
 *
 * AnimationGroup の weight 制御では GLB ボーンに正しく反映されないため、
 * 毎フレーム Quaternion を補間して直接適用する。
 *
 * GLTF ボーンの場合:
 *   bone.getTransformNode() が返す TransformNode の rotationQuaternion を設定。
 *   Bone._localMatrix は linkedTransformNode 経由で無視されるため、
 *   bone.setRotationQuaternion() では効かない。
 *
 * 非GLTF ボーンの場合:
 *   bone.setRotationQuaternion(q, Space.LOCAL) を使用。
 */
export class PoseBlender {
  private _targets: BoneTarget[];
  private _config: CharacterMotionConfig;
  private _idleFrameCount: number;
  private _walkFrameCount: number;

  private _walkWeight = 0;
  private _idleTime = 0;
  private _walkTime = 0;

  private _idleQ = new Quaternion();
  private _walkQ = new Quaternion();
  private _resultQ = new Quaternion();

  constructor(data: PoseData, config: CharacterMotionConfig) {
    this._config = config;
    this._idleFrameCount = data.idleFrameCount;
    this._walkFrameCount = data.walkFrameCount;

    // 初期化時に linked TransformNode を解決してキャッシュ
    this._targets = data.bones.map((bd) => {
      const node = bd.bone.getTransformNode();
      // GLTF ノードに rotationQuaternion が未設定なら初期化
      if (node && !node.rotationQuaternion) {
        node.rotationQuaternion = Quaternion.Identity();
      }
      return {
        bone: bd.bone,
        node,
        idleKeys: bd.idleKeys,
        walkKeys: bd.walkKeys,
      };
    });
  }

  update(input: BlendInput, dt: number): void {
    // ── ブレンドウェイト更新 ──
    const targetWalk = Math.min(Math.max(input.speed, 0), 1);
    const t = 1 - Math.exp(-this._config.blendSharpness * dt);
    this._walkWeight += (targetWalk - this._walkWeight) * t;

    // デッドゾーン
    const w =
      this._walkWeight > 0.99
        ? 1.0
        : this._walkWeight < 0.01
          ? 0.0
          : this._walkWeight;

    // ── フェーズ進行 ──
    const idleDuration = this._idleFrameCount / FPS;
    this._idleTime = (this._idleTime + dt) % idleDuration;

    if (w > 0) {
      const walkDuration = this._walkFrameCount / FPS;
      const speedRatio = Math.max(input.speed, 0.1);
      this._walkTime = (this._walkTime + dt * speedRatio) % walkDuration;
    }

    // ── 現在フレーム計算 ──
    const idleFrame = (this._idleTime / idleDuration) * this._idleFrameCount;
    const walkFrame = (this._walkTime / (this._walkFrameCount / FPS)) * this._walkFrameCount;

    // ── 各ボーンに適用 ──
    for (const tgt of this._targets) {
      this._evaluateTo(tgt.idleKeys, idleFrame, this._idleFrameCount, this._idleQ);

      if (w < 0.01) {
        this._applyRotation(tgt, this._idleQ);
      } else {
        this._evaluateTo(tgt.walkKeys, walkFrame, this._walkFrameCount, this._walkQ);
        Quaternion.SlerpToRef(this._idleQ, this._walkQ, w, this._resultQ);
        this._applyRotation(tgt, this._resultQ);
      }
    }
  }

  /**
   * ボーンに回転を適用する。
   * GLTF: linked TransformNode の rotationQuaternion を直接変更。
   * 非GLTF: bone.setRotationQuaternion() を使用。
   */
  private _applyRotation(tgt: BoneTarget, quat: Quaternion): void {
    if (tgt.node && tgt.node.rotationQuaternion) {
      // GLTF ボーン: TransformNode を直接制御
      tgt.node.rotationQuaternion.copyFrom(quat);
    } else {
      // 非GLTF ボーン: Bone API
      tgt.bone.setRotationQuaternion(quat, Space.LOCAL);
    }
  }

  /**
   * キーフレーム配列からフレーム位置を補間して Quaternion を算出
   */
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

    // ループ: frame が最後のキー以降なら最初のキーへ補間
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

    // 通常の2キー間補間
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
  }
}
