/**
 * Cardクラス
 */
export default class Card {
      /**
     * プロパティ
     */
 #rank;//2-14まで、Aを14とする
 #suit;//絵柄(1:スペード、2:クローバー、3:ダイヤ、4:ハート)
 #index;//インデックス番号(1―52)

 /**
  * カードの数字
  */
 get rank() {
    return this.#rank;
 }

 set rank(rank) {
    this.#rank = rank;
 }

 /**
 * カードの絵柄
 */
 get suit() {
    return this.#suit;
 }

 set suit(suit) {
    this.#suit = suit;
 }

 /**
 * カードのインデックス番号
 */
 get index() {
    return this.#index;
 }

 set index(index) {
    this.#index = index;
 }

 /**
 * コンストラクタ
 */
 constructor(index) {
 this.rank = ((index - 1) % 13) + 1;
 //Aは14とする
 if (this.rank === 1) {
 this.rank = 14;
 }
 this.suit = Math.floor((index - 1) / 13) + 1;
 this.index = index;
}
}