# 関節軸方向補正ガイド

## 概要

モーションデータの角度値（度数）がボーンのローカル軸と一致しない場合、
パイプライン内で符号を反転して補正する。

**補正が必要な理由**: 右側ボーン（特に rightElbow）はローカル Z 軸の方向が
左側と物理的に逆のため、同じ正の値を入れても逆方向に曲がる。

## 補正箇所（2箇所、必ず両方修正すること）

### 1. AnimationFactory.ts — `motionToEulerKeys()`

**パイプライン**: MotionData → motionDataToDefinition → createSingleMotionPoseData → **motionToEulerKeys** → eulerKeysToQuatKeys → MotionPlayer

MotionController が使用するメインパイプライン。全モーション（Walk, Dash, Idle 等）はここを通る。

```ts
const zJointS = (isHip || isFoot || isRightElbow) ? -1 : 1;
```

同関数内に Rigify 調整セクションにも同じパターンがあるため、2箇所とも修正が必要。

### 2. SkeletonAdapter.ts — `applyFKRotationByJoint()`

**パイプライン**: setBoneAnimationRotation → **applyFKRotationByJoint**

JumpBallSystem 等が直接ボーン回転を書き込む際に使用する別パス。

```ts
const zRaw = (isHip || isFoot || isRightElbow) ? -offsetEulerRad.z : offsetEulerRad.z;
```

## 現在の軸補正一覧

| ジョイント | X | Y | Z |
|---|---|---|---|
| leftShoulder / rightShoulder | 反転 (`xS = -1`) | - | - |
| leftHip / rightHip | - | - | 反転 (`zJointS = -1`) |
| leftFoot / rightFoot | - | 反転 (`yFootS = -1`) | 反転 (`zJointS = -1`) |
| rightElbow | - | - | 反転 (`zJointS = -1`) |

## 注意事項

- **MotionController は applyFKRotationByJoint を使わない**。motionToEulerKeys が正しい修正箇所。
- 新しい軸補正を追加する場合、必ず AnimationFactory と SkeletonAdapter の両方を修正すること。
- モーションデータ側の値は変更しない。符号補正はパイプライン側で行う。
