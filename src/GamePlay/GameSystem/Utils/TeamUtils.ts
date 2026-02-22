/**
 * チームフィルタリングユーティリティ
 *
 * キャラクターのチーム分類を行う共通関数。
 * AI、可視化、分析など様々な場所で使用される。
 */

import { Character } from "@/GamePlay/Object/Entities/Character";

/**
 * 味方キャラクターを取得（自分を除く）
 * @param allCharacters 全キャラクターリスト
 * @param self 自分自身
 * @returns 自分以外の味方キャラクターリスト
 */
export function getTeammates(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team === self.team && c !== self);
}

/**
 * 敵キャラクターを取得
 * @param allCharacters 全キャラクターリスト
 * @param self 自分自身
 * @returns 敵チームのキャラクターリスト
 */
export function getOpponents(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team !== self.team);
}

