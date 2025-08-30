import Card from "./card.js";
/**
 * Playerクラス
 */
export default class Player {
/**
 * プロパティ
 */
#cards;//プレイヤーの手札
#nodes;//手札のノード
// #discards;
// #discardsnodes;

/**
 * プレイヤーの手札
 */
get cards() {
    return this.#cards;
}

/**
 * 手札のノード(リスト)
 */

get nodes() {
    return this.#nodes;
}

/**
 * 選択しているノード(リスト)
 */

get selectedNodes() {
    return this.nodes.filter((node) => node.classList.contains("selected"));
}

// get discards() {
//     return this.#discards;
// }

// /**
//  * 手札のノード(リスト)
//  */

// get discardsnodes() {
//     return this.#discardsnodes;
// }



/**
 * コンストラクタ
 */

constructor(selector) {
    //プロパティを初期化する
    this.#nodes = Array.from(
        document.querySelectorAll(selector));
    this.#cards = [];


}

/**
 * 手札を描画する
 */
displayCard(front) {
    //手札のループ
    this.cards.forEach((card,index) => {
        //表示する画像のファイル名
        let name = String(card.index).padStart(2,"0") + ".png";
        //裏面を表示する場合は画像を変更
        if (!front) {
            name = "red.png";
        }
        //カードの画像をセット
        this.nodes[index].setAttribute("src","images/" + name);
    });
}

/**
 * 新しいカードを手札に追加する
 */
addCard(newCard) {
    //新しいカードを手札の最後尾に追加
    this.cards.push(newCard);
    //最後尾のノードにカードのインデックス番号を書き込む
    this.nodes[this.cards.length - 1]
    .dataset.index = newCard.index;
}

/**
 * 交換するカードを選択する
 */
selectCard(node) {
    //選択状態を表すCSSクラス名を切り替える
    node.classList.toggle("selected");
}

/**
 * 山札からカードを引いて交換する
 */
drawCard(newCard) {
        //選択しているノードを先頭から1つ取り出す
        const node = this.selectedNodes.shift();
        //このノードに書き込まれたインデックス番号を取得する
        const index = parseInt(node.dataset.index);
        //このノードに置かれた手札の位置を検索する
        const pos = this.cards.findIndex((card) =>
           card.index === index);
        //手札を複製して退避しておく
        const oldCard = this.cards.slice(pos,pos + 1)[0];
        //この手札を新しいカードで置き換える
        this.cards[pos] = newCard;
        //このノードに新しいカードのインデックス番号を書き込む
        node.dataset.index = newCard.index;
        //このカードを未選択の状態に戻す
        node.classList.remove("selected");


        //退避したカードを返す
        // console.log(oldCard);
        // return oldCard;

        // let dCard =oldCard.rank
        let dIndex = oldCard.index
        // console.log(dCard)
        // console.log( dIndex )

        
    
        let dName = String(dIndex).padStart(2,"0") + ".png";
        // console.log(dName)
        
        let discard = document.querySelectorAll(".discard");
        // console.log(discard[0]);
        // console.log(discard[0].classList)
        discard[0].src = "images/" + dName;
        discard[0].classList.remove("discard");

        // return  dName



        

    }

}
