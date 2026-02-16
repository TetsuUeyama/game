import { Vector3 } from "@babylonjs/core";
import type { Character } from "@/GamePlay/Object/Entities/Character";

/**
 * パスレーン上のディフェンダー位置を分析し、最適なカーブ方向を返す
 *
 * @param passer パスを出すキャラクター
 * @param receiver パスを受けるキャラクター
 * @param opponents 相手チームの全キャラクター
 * @returns -1（左カーブ）、0（直線）、+1（右カーブ）
 */
export function determineCurveDirection(
  passer: Character,
  receiver: Character,
  opponents: Character[]
): number {
  const passerPos = passer.getPosition();
  const receiverPos = receiver.getPosition();

  // パス方向の水平ベクトル
  const passVec = new Vector3(
    receiverPos.x - passerPos.x, 0,
    receiverPos.z - passerPos.z
  );
  const passDistance = passVec.length();
  if (passDistance < 0.01) return 0;

  const passDir = passVec.normalize();

  // 横方向（右手法則: passDir × Y_up）
  const lateralDir = new Vector3(passDir.z, 0, -passDir.x);

  // パスライン付近のディフェンダーを検出し、横オフセットを集計
  const LANE_WIDTH = 2.0; // パスラインからの検出幅（m）
  let weightedOffset = 0;
  let hasBlocker = false;

  for (const opponent of opponents) {
    const opponentPos = opponent.getPosition();
    const toOpponent = new Vector3(
      opponentPos.x - passerPos.x, 0,
      opponentPos.z - passerPos.z
    );

    // パス方向への射影（前方距離）
    const forwardDist = Vector3.Dot(toOpponent, passDir);

    // パサーとレシーバーの間にいるか確認（少しマージンを持たせる）
    if (forwardDist < 0.5 || forwardDist > passDistance - 0.5) continue;

    // パスラインからの横方向距離
    const lateralDist = Vector3.Dot(toOpponent, lateralDir);

    // パスライン付近にいるか確認
    if (Math.abs(lateralDist) > LANE_WIDTH) continue;

    hasBlocker = true;

    // 近いディフェンダーほど重みを大きくする（パスラインに近いほど重要）
    const proximityWeight = 1.0 - Math.abs(lateralDist) / LANE_WIDTH;
    weightedOffset += lateralDist * proximityWeight;
  }

  if (!hasBlocker) return 0;

  // ディフェンダーが右寄りなら左にカーブ（-1）、左寄りなら右にカーブ（+1）
  return weightedOffset > 0 ? -1 : 1;
}

/**
 * パスレーン上にディフェンダーが直接立ちはだかっているか判定
 * determineCurveDirectionより厳しい判定（幅1.0m以内）で、
 * チェストパスが通らないレベルのブロックを検出する。
 *
 * @param passer パスを出すキャラクター
 * @param receiver パスを受けるキャラクター
 * @param opponents 相手チームの全キャラクター
 * @returns true: パスレーンがブロックされている
 */
export function isPassLaneBlocked(
  passer: Character,
  receiver: Character,
  opponents: Character[]
): boolean {
  const passerPos = passer.getPosition();
  const receiverPos = receiver.getPosition();

  const passVec = new Vector3(
    receiverPos.x - passerPos.x, 0,
    receiverPos.z - passerPos.z
  );
  const passDistance = passVec.length();
  if (passDistance < 0.01) return false;

  const passDir = passVec.normalize();
  const lateralDir = new Vector3(passDir.z, 0, -passDir.x);

  const BLOCK_WIDTH = 1.0; // ブロック判定幅（m）

  for (const opponent of opponents) {
    const opponentPos = opponent.getPosition();
    const toOpponent = new Vector3(
      opponentPos.x - passerPos.x, 0,
      opponentPos.z - passerPos.z
    );

    // パサーとレシーバーの間にいるか確認
    const forwardDist = Vector3.Dot(toOpponent, passDir);
    if (forwardDist < 0.5 || forwardDist > passDistance - 0.5) continue;

    // パスラインからの横方向距離
    const lateralDist = Math.abs(Vector3.Dot(toOpponent, lateralDir));

    if (lateralDist <= BLOCK_WIDTH) {
      return true;
    }
  }

  return false;
}
