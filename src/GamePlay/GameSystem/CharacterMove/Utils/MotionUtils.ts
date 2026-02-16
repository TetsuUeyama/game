import { Keyframe, KeyframeJoints, PositionOffset } from "@/GamePlay/GameSystem/CharacterMove/Types/MotionTypes";

/**
 * アニメーションデータからキーフレーム配列を生成する共通関数
 * @param jointAnimations 関節のアニメーションデータ (軸ごとの時間-値マップ)
 * @param positionAnimations 位置のアニメーションデータ (オプショナル)
 * @returns キーフレーム配列
 */
export function buildKeyframes(
  jointAnimations: Record<string, Record<number, number>>,
  positionAnimations?: Record<string, Record<number, number>>
): Keyframe[] {
  // 全てのタイムスタンプを収集
  const times = new Set<number>();
  Object.values(jointAnimations).forEach((timeline) => {
    Object.keys(timeline).forEach((time) => times.add(parseFloat(time)));
  });

  // タイムスタンプをソート
  const sortedTimes = Array.from(times).sort((a, b) => a - b);

  // 各タイムスタンプに対してキーフレームを生成
  return sortedTimes.map((time) => {
    const joints: KeyframeJoints = {
      upperBody: {
        x: jointAnimations.upperBodyX?.[time] ?? 0,
        y: jointAnimations.upperBodyY?.[time] ?? 0,
        z: jointAnimations.upperBodyZ?.[time] ?? 0,
      },
      lowerBody: {
        x: jointAnimations.lowerBodyX?.[time] ?? 0,
        y: jointAnimations.lowerBodyY?.[time] ?? 0,
        z: jointAnimations.lowerBodyZ?.[time] ?? 0,
      },
      head: {
        x: jointAnimations.headX?.[time] ?? 0,
        y: jointAnimations.headY?.[time] ?? 0,
        z: jointAnimations.headZ?.[time] ?? 0,
      },
      leftShoulder: {
        x: jointAnimations.leftShoulderX?.[time] ?? 0,
        y: jointAnimations.leftShoulderY?.[time] ?? 0,
        z: jointAnimations.leftShoulderZ?.[time] ?? 0,
      },
      rightShoulder: {
        x: jointAnimations.rightShoulderX?.[time] ?? 0,
        y: jointAnimations.rightShoulderY?.[time] ?? 0,
        z: jointAnimations.rightShoulderZ?.[time] ?? 0,
      },
      leftElbow: {
        x: jointAnimations.leftElbowX?.[time] ?? 0,
        y: jointAnimations.leftElbowY?.[time] ?? 0,
        z: jointAnimations.leftElbowZ?.[time] ?? 0,
      },
      rightElbow: {
        x: jointAnimations.rightElbowX?.[time] ?? 0,
        y: jointAnimations.rightElbowY?.[time] ?? 0,
        z: jointAnimations.rightElbowZ?.[time] ?? 0,
      },
      leftHip: {
        x: jointAnimations.leftHipX?.[time] ?? 0,
        y: jointAnimations.leftHipY?.[time] ?? 0,
        z: jointAnimations.leftHipZ?.[time] ?? 0,
      },
      rightHip: {
        x: jointAnimations.rightHipX?.[time] ?? 0,
        y: jointAnimations.rightHipY?.[time] ?? 0,
        z: jointAnimations.rightHipZ?.[time] ?? 0,
      },
      leftKnee: {
        x: jointAnimations.leftKneeX?.[time] ?? 0,
        y: jointAnimations.leftKneeY?.[time] ?? 0,
        z: jointAnimations.leftKneeZ?.[time] ?? 0,
      },
      rightKnee: {
        x: jointAnimations.rightKneeX?.[time] ?? 0,
        y: jointAnimations.rightKneeY?.[time] ?? 0,
        z: jointAnimations.rightKneeZ?.[time] ?? 0,
      },
    };

    // 位置アニメーションがある場合は追加
    const position: PositionOffset | undefined = positionAnimations
      ? {
          x: positionAnimations.x?.[time] ?? 0,
          y: positionAnimations.y?.[time] ?? 0,
          z: positionAnimations.z?.[time] ?? 0,
        }
      : undefined;

    return position ? { time, joints, position } : { time, joints };
  });
}

/**
 * ベースモーションに追加値を加算する
 * @param baseMotion ベースとなるモーションデータ
 * @param additions 追加する値のマップ (jointName => {time => additionalValue})
 * @returns 加算された新しいモーションデータ
 */
export function addToMotion(
  baseMotion: Record<string, Record<number, number>>,
  additions: Record<string, Record<number, number>>
): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};

  // ベースモーションの全関節をコピー
  for (const jointName in baseMotion) {
    result[jointName] = { ...baseMotion[jointName] };
  }

  // 追加値を加算
  for (const jointName in additions) {
    if (!result[jointName]) {
      result[jointName] = {};
    }
    for (const timeStr in additions[jointName]) {
      const time = parseFloat(timeStr);
      const baseValue = baseMotion[jointName]?.[time] ?? 0;
      const addValue = additions[jointName][time];
      result[jointName][time] = baseValue + addValue;
    }
  }

  return result;
}

/**
 * ベースモーションから派生モーションを作成する
 * 配列形式の追加値を使用して、ベースモーションの時間軸を新しい時間軸にマッピングしながら値を加算
 * @param baseMotion ベースとなるモーションデータ
 * @param baseTimes ベースモーションの時間配列
 * @param newTimes 新しいモーションの時間配列
 * @param additions 追加する値の配列マップ (jointName => [値1, 値2, ...])
 * @returns 派生モーションデータ
 */
export function createDerivedMotion(
  baseMotion: Record<string, Record<number, number>>,
  baseTimes: number[],
  newTimes: number[],
  additions: Record<string, number[]>
): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};

  // まずベースモーションの全関節を新しい時間軸でコピー
  for (const jointName in baseMotion) {
    result[jointName] = {};
    for (let i = 0; i < newTimes.length; i++) {
      const baseValue = baseMotion[jointName]?.[baseTimes[i]] ?? 0;
      result[jointName][newTimes[i]] = baseValue;
    }
  }

  // 追加値を適用
  for (const jointName in additions) {
    if (!result[jointName]) {
      result[jointName] = {};
    }
    for (let i = 0; i < newTimes.length; i++) {
      const baseValue = baseMotion[jointName]?.[baseTimes[i]] ?? 0;
      const addValue = additions[jointName][i] ?? 0;
      result[jointName][newTimes[i]] = baseValue + addValue;
    }
  }

  return result;
}
