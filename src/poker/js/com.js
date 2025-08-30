import Player from "./player.js";
import Pair from "./pair.js";
/**
 * Comクラス
 */

export default class Com extends Player {
    /**
     * コンストラクタ
     */
    constructor(selector) {
        super(selector);
    }
    /**
     * 交換するカードを選択する
     */
    selectCard() {
        let flash  = [this.cards[0].suit, this.cards[1].suit, this.cards[2].suit, this.cards[3].suit, this.cards[4].suit]
        let straight  = [this.cards[0].rank, this.cards[1].rank, this.cards[2].rank, this.cards[3].rank, this.cards[4].rank]
        console.log(straight)
        straight.sort(function(first, second){return first - second;});
        console.log(flash)
        console.log(straight)

         //交換する前に成立している役の強さを調べる
        const strength = Pair.judge(this.cards).strength;
        
        //役が成立していない場合
        if (strength === 0) {
            this.cards.forEach((card, index) => {
                //インデックス番目と同じ絵柄のカードの枚数を調べる
              const sameSuitCards = this.cards.filter((e) => e.suit === card.suit);

              //インデックス番目と同じ絵柄が2枚以下の場合
              if (sameSuitCards.length <= 2) {
                //フラッシュの可能性は低いので選択
                super.selectCard(this.nodes[index]);
            } else{
            //手札を全て選択する
            this.nodes.forEach((node) => super.selectCard(node));
            }

            });


        }
        //ワンペア・ツーペア・スリーカードが成立している場合
        else if (1 <= strength && strength <= 3) {
            //手札のループ
            this.cards.forEach((card, index) => {
                //インデックス番目と同じランクのカードの枚数を調べる
              const sameRankCards = this.cards.filter((e) => e.rank === card.rank);
              //インデックス番目と同じらんくが1枚しかない場合
              if (sameRankCards.length === 1) {
                //インデックス番号のカードはペアを持たないので選択
                super.selectCard(this.nodes[index]);
            }
            });
        }
    }

}