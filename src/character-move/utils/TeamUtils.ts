/**
 * チームフィルタリングユーティリティ
 *
 * キャラクターのチーム分類を行う共通関数。
 * AI、可視化、分析など様々な場所で使用される。
 */

import { Character } from "../entities/Character";

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

/**
 * 味方キャラクターを取得（自分を含む）
 * @param allCharacters 全キャラクターリスト
 * @param self 自分自身
 * @returns 自分を含む味方キャラクターリスト
 */
export function getTeammatesIncludingSelf(allCharacters: Character[], self: Character): Character[] {
  return allCharacters.filter(c => c.team === self.team);
}

/**
 * チームでフィルタ（キャラクターを指定せずチーム名で直接フィルタ）
 * @param allCharacters 全キャラクターリスト
 * @param team チーム名
 * @returns 指定チームのキャラクターリスト
 */
export function getCharactersByTeam(allCharacters: Character[], team: 'ally' | 'enemy'): Character[] {
  return allCharacters.filter(c => c.team === team);
}
