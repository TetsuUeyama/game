import Player from "./player.js";
import Com from "./com.js";
import Card from "./card.js";
import Pair from "./pair.js";
import Util from "./util.js";
import {Character, character_set}from "./select.js";
import {initializegame,initialize,initializegamerechoice} from "./game_turn_start.js";
// import initialize from "./game_turn_start.js";
import changeCommond1 from "./buttun_click_event.js";
// import pAttack from "./attack_diffence.js";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Game クラス export defaultでadd.jsにGame class を渡している
 *  */
export default class Game {
    /**
     * プロパティ オブジェクトの属性
     */
    #you;//プレイヤー
    #com;//コンピューター
    #cards;//山札
    #isRunning;//ゲームの実行状態(true:実行中,false:終了)
    #playerTurn;
    #comTurn;
    
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    /**
     * コンストラクタ　オブジェクトをインスタンス化するための関数
     */
    constructor() {
        //プロパティの初期化
        this.#you = null;
        this.#com = null;
        this.#cards = [];
        this.#isRunning = false;
        this.#playerTurn = false;
        this.#comTurn = false;

        //イベントハンドラを登録する
        this.#setupEvents();
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //ゲームの実行
    run() {
        //ゲームの状態の初期化
        this.#gamestart();
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     
    #gamestart(){
        initializegame();
        // プレイヤーを生成する
        this.#you = new Player(".card.you");
        this.#com = new Com(".card.com");

        // 山札のカードを生成する
        this.#cards = [];
        [...Array(52)].map((_, index) => {
        //インデックス番号を持つカードを生成して山札に追加
        this.#cards.push(new Card(index + 1));
        });

        // 山札のカードをシャッフルする
        this.#shuffleCard();

        //山札のカードをそれぞれ5枚プレイヤーとCOMに配る
        this.#dealCard(this.#you, 5);
        this.#dealCard(this.#com, 5);

        //ゲーム実行状況を更新
        this.#isRunning = true;

        //山札の描画を更新する
        this.#updateView();

        // this.#discardsTurn();
    }
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     
#initializegamerechoice(){
    initializegamerechoice();
    // プレイヤーを生成する
    this.#you = new Player(".card.you");
    this.#com = new Com(".card.com");

    // 山札のカードを生成する
    this.#cards = [];
    [...Array(52)].map((_, index) => {
    //インデックス番号を持つカードを生成して山札に追加
    this.#cards.push(new Card(index + 1));
    });

    // 山札のカードをシャッフルする
    this.#shuffleCard();

    //山札のカードをそれぞれ5枚プレイヤーとCOMに配る
    this.#dealCard(this.#you, 5);
    this.#dealCard(this.#com, 5);

    //ゲーム実行状況を更新
    this.#isRunning = true;

    //山札の描画を更新する
    this.#updateView();

    // this.#discardsTurn();
}
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //ターンの状態を初期化する
    #turnreset(){
        initialize();
        this.#buttonGuardreset();
        // プレイヤーを生成する
        this.#you = new Player(".card.you");
        this.#com = new Com(".card.com");

        // 山札のカードを生成する
        this.#cards = [];
        [...Array(52)].map((_, index) => {
        //インデックス番号を持つカードを生成して山札に追加
        this.#cards.push(new Card(index + 1));
        });

        // 山札のカードをシャッフルする
        this.#shuffleCard();

        //山札のカードを5枚ずつプレイヤーとComに配る
        this.#dealCard(this.#you, 5);
        this.#dealCard(this.#com, 5);

        //ゲーム実行状況を更新
        this.#isRunning = true;

        //山札の描画を更新する
        this.#updateView();

        // this.#discardsTurn() 
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //山札のカードをシャッフルする 
    #shuffleCard() {
    //100回繰り返す
     [...Array(100)].forEach(() => {
    
     //山札から2枚のカードをランダムに選んで交換
     const j = Math.floor(Math.random() * this.#cards.length);
     const k = Math.floor(Math.random() * this.#cards.length);
     [this.#cards[j], this.#cards[k]] = [this.#cards[k], this.#cards[j]];
     });
    }
   
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // 山札のカードをプレイヤーに配る
    #dealCard(player, n) {
     //n回繰り返す
     [...Array(n)].map(() => {
     //山札からカードを1枚取り出してプレイヤーに配る
     player.addCard(this.#cards.pop());
     });
    }

    
 /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////   

    // 画面の描画を更新
    #updateView1() {
    //プレイヤーのカードを描画する
    this.#you.displayCard(true);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // 画面の描画を更新
    #updateView() {
       //プレイヤーのカードを描画する
       this.#you.displayCard(true);
       //Comのカードを描画する
       this.#com.displayCard(!this.#isRunning);
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
 
    // カード交換後のボタン(回数)を更新
    #cangecomamd(){
       changeCommond1();
    }
 
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //攻撃結果をバーに表示する
    #judgement(){
        // テキストバーの表示
        document.getElementById("textGo").removeAttribute("disabled");

        const youResult = Pair.judge(this.#you.cards);
        const comResult = Pair.judge(this.#com.cards);
        let whichD = document.getElementById("which2");
        let ewhichD = document.getElementById("ewhich2");
        let whichA = document.getElementById("which");
        let ewhichA = document.getElementById("ewhich");

        // 自分の表示バーに自分の役の表示
        document.getElementById("player-role").innerText = youResult.hand;

        if(whichA.value== "0"){
            document.getElementById("player-attack-action").innerText = "バランス　攻撃力 ± 0　被ダメージ ± 0";
        }else if(whichA.value == "1"){
            document.getElementById("player-attack-action").innerText = "全力攻撃　攻撃力UP　守備力DOWN";
        }else{
            document.getElementById("player-attack-action").innerText = "牽制攻撃　攻撃力DOWN　守備力UP";
        }

        if(whichD.value == "10"){
            document.getElementById("player-diffence-action").innerText = "守備行動　バランス";
        }else{
            let whichD2 = document.getElementById("which2").value
            let whichD3 = whichD[10 - whichD2].innerText
            document.getElementById("player-diffence-action").innerText ="守備行動　" + whichD3 + "読み";
        }

        //非表示状態の自分の表示バーを表示
        let logroleP =document.querySelector(".Prole");
        logroleP.classList.remove("bihind");

        //相手の表示バーに相手の役を表示
        document.getElementById("com-role").innerText = comResult.hand;
        if(ewhichA.value == "0"){
            document.getElementById("com-attack-action").innerText =  "バランス　攻撃力 ± 0　被ダメージ ± 0";
        }else if(ewhichA.value == "1"){
            document.getElementById("com-attack-action").innerText = "全力攻撃　攻撃力UP　守備力DOWN";
        }else{
            document.getElementById("com-attack-action").innerText = "牽制攻撃　攻撃力DOWN　守備力UP";
        }

        if(ewhichD.value == "10"){
            document.getElementById("com-diffence-action").innerText = "守備行動　バランス";
        }else{
            let ewhichD2 = document.getElementById("ewhich2").value
            let ewhichD3 = ewhichD[10 - ewhichD2].innerText
            document.getElementById("com-diffence-action").innerText = "守備行動　" + ewhichD3 + "読み";
        }

        //非表示状態の相手の表示バーを表示
        let logroleE = document.querySelector(".Erole");
        logroleE.classList.remove("bihind");
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    //攻撃を決定
    #Attack(e) {
        let ready = character_set[e]

        let attackCoefficient 
        if(ready.attack == "A"){
            attackCoefficient = 1.25
        }else if(ready.attack == "B"){
            attackCoefficient = 1.0
        }else{
            attackCoefficient = 0.75
        }

        let log1
        let magnification
        let which
        if(this.#playerTurn){
            which = document.getElementById("which").value

            }else if(this.#comTurn){
            which = document.getElementById("ewhich").value

            }else{}

            if(which == "0"){
               log1 = `${ready.name}は攻守のバランスを考えながら攻撃した！`
               magnification = 1
            }else if (which == "1"){
               log1 = `${ready.name}は全力で攻撃した！`
               magnification = 2
            }else{
               log1= `${ready.name}は相手の攻撃を牽制しつつ攻撃した！`
               magnification= 0.75
            }

        window.log1 = log1
        //自分と相手の役の成否判定
        const youResult = Pair.judge(this.#you.cards);
        const comResult = Pair.judge(this.#com.cards);

        let totalDamege
        if(this.#playerTurn){
        totalDamege =Math.floor(youResult.damege *attackCoefficient*magnification*magnificationDiffence*whichDiffenceAction*((Math.random()*0.4)+0.8));
 
        }else if(this.#comTurn){
        totalDamege = Math.floor(comResult.damege *attackCoefficient*magnification*magnificationDiffence*whichDiffenceAction*((Math.random()*0.4)+0.8));

        }else{   }
        window.totalDamege =  totalDamege

    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    #Diffence(e) {
        const youResult = Pair.judge(this.#you.cards);
        const comResult = Pair.judge(this.#com.cards);

        let ready = character_set[e]

        let diffenceCoefficient 
        if(ready.difence == "A"){
            diffenceCoefficient  = 1.25
        }else if(ready.difence == "B"){
            diffenceCoefficient  = 1.0
        }else{
            diffenceCoefficient  = 0.75
        }

        let log3
        let magnificationDiffence
        let which
        if(this.#playerTurn){
            which = document.getElementById("ewhich").value
            }else if(!this.#playerTurn){
            which = document.getElementById("which").value
            }else{}

        let whichDiffenceAction
        if(this.#playerTurn){
        let whichD = document.getElementById("ewhich2").value
        let whichD2 = youResult.strength

        if(whichD == "0"){
            whichDiffenceAction =0.75
          }else if (!whichD == "0" &&  whichD == whichD2){
            whichDiffenceAction =0.25
        }else{ 
            whichDiffenceAction =1.0
         }

        }else if(!this.#playerTurn){
            let whichD = document.getElementById("which2").value
            let whichD2 = comResult.strength

            if(whichD == "0"){
                whichDiffenceAction =0.75
            }else if (!whichD == "0" &&  whichD == whichD2){
                whichDiffenceAction =0.25
            }else{
                whichDiffenceAction =1.0
              }
        }

        if(which == "0"){
            log3 = "は攻撃を受けた！";
            magnificationDiffence = 1
          }else if (which == "1"){
            log3 =  "はまともに攻撃を受けた！";
            magnificationDiffence = 2
        }else{
            log3= "は攻撃に備えていた！";
            magnificationDiffence = 0.75
        }

        window.whichDiffenceAction = whichDiffenceAction
        window.magnificationDiffence = magnificationDiffence
        window.log3 = log3
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    #comTextBoard(e){
        const comResult = Pair.judge(this.#com.cards);
        const youResult= Pair.judge(this.#you.cards);
        let ready = character_set[e]
        let name = document.getElementById("player-name").innerText

    document.getElementById('text1').innerHTML = log1;
    document.getElementById('text2').innerHTML = `${ready.name}の${comResult.hand}アタック！`;

    let whichD = document.getElementById("which2").value
    let whichD2 = comResult.strength
    if(whichD == whichD2) {
        document.getElementById('text3').innerHTML = name  + "は相手の攻撃を読み切った！"
    }else{document.getElementById('text3').innerHTML = name + log3;}
        document.getElementById('text4').innerHTML = name + `に${totalDamege}のダメージ！\n`;
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    #playerTextBoard(e){
        const youResult = Pair.judge(this.#you.cards);
        const comResult = Pair.judge(this.#com.cards);
        let ready = character_set[e]
        let name = document.getElementById("com-name").innerText

    document.getElementById('text1').innerHTML = log1;
    document.getElementById('text2').innerHTML = `${ready.name}の${youResult.hand}アタック！`;
    let whichD = document.getElementById("ewhich2").value
    let whichD2 = youResult.strength
    if(whichD == whichD2) {
        document.getElementById('text3').innerHTML = name  + "は相手の攻撃を読み切った！"
    }else{document.getElementById('text3').innerHTML = name + log3;}
    document.getElementById('text4').innerHTML = name + `に${totalDamege}のダメージ！\n`;
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    #lifearAction(){
        if(this.#comTurn){
            let plifeNow = document.getElementById("plifeNow").innerText;
            let plifeMark = window.document.getElementById('life-mark-player').style.width;
            let pmaxHp = document.getElementById("pmaxHp").innerText;
            window.plifeNow = plifeNow
            plifeNow = (plifeNow - totalDamege);

            if(plifeNow <= 0) {
                let log2 = document.querySelector("#log");
                log2.classList.add("bihind");
                let el = document.querySelector("#retry");
                el.classList.remove("bihind");

                let bl = document.getElementById("settlement")
                bl.innerText = "勝負に負けました…"

                let bs = document.getElementById("winorlose")
                bs.src = "images/pose_lose_boy.png"
                plifeNow =0

                let comwineffect1 = document.getElementById("resultcom")
                comwineffect1.classList.add("container")
                let comwineffect2 = document.getElementById("resultcomeffect")
                comwineffect2.classList.add("confetti")

                let playerloseeffect = document.getElementById("resultplayer")
                playerloseeffect.classList.add("lose")

                }else{}
            window.document.getElementById("plifeNow").innerText = plifeNow;


            plifeMark = (plifeNow / pmaxHp * 100);
            window.plifeMark = plifeMark

            window.document.getElementById("life-mark-player").style.width = (plifeMark +"%");

            if( plifeMark <= 40){

                let ss = document.getElementById("player-character-condicion")

                ss.innerText = "焦 り"
            }else if( plifeMark <= 70){ 

                let ss = document.getElementById("player-character-condicion")

                ss.innerText = "真 剣"
            }else{}

        }else if(this.#playerTurn){
            let elifeNow = document.getElementById("elifeNow").innerText;
            let elifeMark = window.document.getElementById('life-mark-enemy').style.width;
            let emaxHp = document.getElementById("emaxHp").innerText;
            window.elifeNow = elifeNow

            elifeNow = (elifeNow - totalDamege); 
            if(elifeNow <= 0) {
                let log2 = document.querySelector("#log");
                log2.classList.add("bihind");
                let el = document.querySelector("#retry");
                el.classList.remove("bihind");

                
                let pleyerwineffect1 = document.getElementById("resultplayer")
                pleyerwineffect1.classList.add("container")
                let pleyerwineffect2 = document.getElementById("resultplayereffect")
                pleyerwineffect2.classList.add("confetti")

                let comloseeffect = document.getElementById("resultcom")
                comloseeffect.classList.add("lose")


                elifeNow =0}
                else{}
            window.document.getElementById("elifeNow").innerText = elifeNow;


            elifeMark = (elifeNow / emaxHp * 100);
            window.elifeMark = elifeMark
            window.document.getElementById("life-mark-enemy").style.width = (elifeMark +"%")

            if( elifeMark <= 40 ){

                let ss = document.getElementById("com-character-condicion")
                ss.innerText = "焦 り"
            }else if( elifeMark <= 70){ 

                let ss = document.getElementById("com-character-condicion")
                ss.innerText = "真 剣"
            }else{}

        }else{   }
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#comCoiceAttackLogReset(){
let comCoiceAttackLog = document.getElementById("ewhich")
comCoiceAttackLog[0].selected = true
comCoiceAttackLog[1].innerText="バランス"
comCoiceAttackLog[2].innerText="全力攻撃"
comCoiceAttackLog[3].innerText="牽制攻撃"
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#comThinkingA(e) {
    const youResult = Pair.judge(this.#you.cards);
    const comResult = Pair.judge(this.#com.cards);
    let comCoiceAttackLog = document.getElementById("ewhich")

    let ready = character_set[e]

    let comIntelligence 
    if(ready.intelogence == "A"){
        comIntelligence = 1.25
    }else if(ready.intelogence == "B"){
        comIntelligence = 1.0
    }else{
        comIntelligence = 0.75
    }
    
    let attackIntention
    if(ready.type ==="攻撃型"){
        attackIntention = 1.25
    }else if(ready.type ==="バランス型"){
        attackIntention = 1.00
    }else{
        attackIntention = 0.75
    }

    let attackIndex  = comResult.damege *((Math.random()*0.4)+0.8) * attackIntention
    let calmIndex = Math.floor(Math.random()*50) / attackIntention

    let playerSeeThrough = document.getElementById("player-intelogence").innerText
    if(playerSeeThrough ==="A"){
        playerSeeThrough = 90
    }else if(playerSeeThrough ==="B"){
        playerSeeThrough = 50
    }else{
        playerSeeThrough = 25
    }

    let randomThinking =  Math.floor(Math.random()*100)
    // let comCoiceAttack = document.getElementById("ewhich").value
    // let comCoiceAttackLog = document.getElementById("ewhich")
    if(attackIndex > calmIndex){
        // comCoiceAttack = 1
        comCoiceAttackLog[2].selected = true

        if( playerSeeThrough>=randomThinking){
  
        }else{           
            comCoiceAttackLog[2].innerText="？？？"}

    }else if(attackIndex*1.25 > calmIndex){
        // comCoiceAttack = 0
        comCoiceAttackLog[1].selected = true

        if( playerSeeThrough>=randomThinking){
  
        }else{           
            comCoiceAttackLog[1].innerText="？？？"}
    }else{
        // comCoiceAttack = "2"
        comCoiceAttackLog[3].selected = true

        if( playerSeeThrough>=randomThinking){
  
        }else{           
            comCoiceAttackLog[3].innerText="？？？"}
    }

}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#comThinkingD(e) {

    const youResult = Pair.judge(this.#you.cards);
    let comCoiceDiffenceLog = document.getElementById("ewhich2")
    console.log(comCoiceDiffenceLog[0])

    let comJudgment1 = 5 - document.querySelectorAll(".playercardfirst.discard2").length
    let comJudgment2 = 5 - document.querySelectorAll(".playercardsecond.discard2").length
    let comJudgment3 = 5 - document.querySelectorAll(".playercardthird.discard2").length

    let comJudgment4 = comJudgment1*1 + comJudgment2*2 + comJudgment3*3

    let comThinkingtrue = Math.floor(Math.random()*100)

    let ready = character_set[e]

    let comtinkingJustD 
    if(ready.intelogence == "A"){
        comtinkingJustD  = 40
    }else if(ready.intelogence == "B"){
        comtinkingJustD  = 20
    }else{
        comtinkingJustD  = 10
    }

    let comtinkingbalanceD
    if(ready.intelogence == "A"){
        comtinkingbalanceD  = 30
    }else if(ready.intelogence == "B"){
        comtinkingbalanceD  = 40
    }else{
        comtinkingbalanceD  = 45
    }

let comJudgment5 = comtinkingJustD + comJudgment4
let comJudgment6 = comJudgment5 + comtinkingbalanceD
    
if(comThinkingtrue < comJudgment5){
        comCoiceDiffenceLog[10 - youResult.strength].selected = true
        console.log("ジャスト判断")
    
    }else if(comThinkingtrue < comJudgment6){
        comCoiceDiffenceLog[0].selected = true
        console.log("安全策")
        
    }else{
        let turn = document.getElementById("change-count").innerText;
        let comThinkingtrue2 = Math.floor(Math.random()*3) +1
        console.log(comThinkingtrue2)
        if(turn ==  '1回目'){

            if(comJudgment1 == 5){
                comCoiceDiffenceLog[10].selected = true
            }else if(comJudgment1 == 4){

                if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[9].selected = true
                }else{}

            }else if(comJudgment1 == 3){

                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[7].selected = true
                }else{}
                
            }else if(comJudgment1 == 2){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[8].selected = true
                }else{}
                
            }else if(comJudgment1 == 1){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[8].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }else{
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[6].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[5].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }
                

        }else if(turn ==  '2回目'){
            
            if(comJudgment2 == 5){
                comCoiceDiffenceLog[0].selected = true
            }else if(comJudgment2 == 4){

                if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[9].selected = true
                }else{}

            }else if(comJudgment2 == 3){

                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[7].selected = true
                }else{}
                
            }else if(comJudgment2 == 2){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[8].selected = true
                }else{}
                
            }else if(comJudgment2 == 1){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[8].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }else{
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[6].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[5].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }

        }else{
            
            if(comJudgment3 == 5){
                comCoiceDiffenceLog[0].selected = true
            }else if(comJudgment1 == 4){

                if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[9].selected = true
                }else{}

            }else if(comJudgment3 == 3){

                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[7].selected = true
                }else{}
                
            }else if(comJudgment3 == 2){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[9].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[8].selected = true
                }else{}
                
            }else if(comJudgment3 == 1){
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[10].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[8].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }else{
                if(comThinkingtrue2 <= 1){
                    comCoiceDiffenceLog[6].selected = true
                }else if(comThinkingtrue2 <= 2){
                    comCoiceDiffenceLog[5].selected = true
                }else if(comThinkingtrue2 <= 3){
                    comCoiceDiffenceLog[4].selected = true
                }else{}
            }

            console.log("判断ミス！")
            console.log(comThinkingtrue2)
            console.log(comJudgment1)
            console.log(comJudgment2)
            console.log(comJudgment3)
        }

    }

    // if(comCoiceDiffenceLog[0].selected = true){
    //     if(comJudgment3 == 5){
    //         comCoiceDiffenceLog[0].selected = true
    //     }else if(comJudgment3 == 4){
    //         comCoiceDiffenceLog[0].selected = true
    //     }
    // }
    
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
#discardsTurn() {
let turn = document.getElementById("change-count").innerText;
           if(turn == '1回目'&& this.#comTurn == !true) {
        let first = document.querySelectorAll(".playercardfirst")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard");

///////////////////////////////////////////////////////////////////////////
    } else if(turn == '1回目'&& this.#playerTurn == !true){

 
        let first = document.querySelectorAll(".comcardfirst")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard");    
            
/////////////////////////////////////////////////////////////////////////////
    } else if(turn == '2回目'&& this.#comTurn == !true){
        let first = document.querySelectorAll(".playercardsecond")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard"); 
                
//////////////////////////////////////////////////////////////////////////////
    } else if(turn == '2回目'&& this.#playerTurn == !true){
        let first = document.querySelectorAll(".comcardsecond")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard");

////////////////////////////////////////////////////////////////////////////////
    }else if(turn == '最終'&& this.#comTurn == !true){
        let first = document.querySelectorAll(".playercardthird")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard");

////////////////////////////////////////////////////////////////////////////////////
    }else if(turn == '最終'&& this.#playerTurn == !true){
        let first = document.querySelectorAll(".comcardthird")

        first[0].classList.add("discard");
        first[1].classList.add("discard");
        first[2].classList.add("discard");
        first[3].classList.add("discard");
        first[4].classList.add("discard");

    }

}



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
#discardsTurnReset() {
        let rest2 = document.querySelectorAll(".discard")

        for (let i = 0; i < rest2.length; i++){  
          rest2[i].classList.remove("discard");
          rest2[i].classList.add("discard2");
        };      

    }
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
#buttonGuard(){

    let guard = document.getElementById("button-guard")
    guard.classList.remove("bihind");
}

#buttonGuardreset(){
    let guard = document.getElementById("button-guard")
    let turn = document.getElementById("player-third")

    if(turn.classList == "box display"){

    }else{
        guard.classList.add("bihind");}
}

///
///ゲーム進行
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //手札のクリックイベントハンドラ
    #onClickCard(event) {
        //ゲーム実行中のみクリックを受け付ける
        if (this.#isRunning) {
            //プレイヤーにカードを選択させる
            this.#you.selectCard(event.target);
        }
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Drawボタンのクリックイベントハンドラ カード交換を3回繰り返す
    async #onDraw1(event) {
        this.#buttonGuard()

        this.#playerTurn = true;
        this.#comTurn = false;

        /////////////////////////////////
        //1秒待つ
        await Util.sleep();
        this.#discardsTurn();

        //プレイヤーがカードを交換する
        this.#you.selectedNodes.forEach(() => {
            this.#cards.unshift(this.#you.drawCard(this.#cards.pop()));
        });

        //1秒待つ
        await Util.sleep();
        
         this.#discardsTurnReset();

     /////////////////////////////////

        //画面の描画を更新する
        this.#updateView1();
  
        //ゲーム実行状況を更新
        this.#isRunning = false;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        this.#playerTurn = false;
        this.#comTurn = true;
    
        //1秒待つ
        await Util.sleep();
    
        //相手が交換するカードを選ぶ
        this.#com.selectCard();
    
    /////////////////////////////////
        //1秒待つ
        await Util.sleep();
        this.#discardsTurn();
   
        //相手がカードを交換する
        this.#com.selectedNodes.forEach(() => {
            this.#cards.unshift(this.#com.drawCard(this.#cards.pop()));
        });

       //1秒待つ
       await Util.sleep();
       this.#discardsTurnReset();
    ///////////////////////////////////

        this.#comCoiceAttackLogReset(document.getElementById("character-type3").innerText)
        this.#comThinkingA(document.getElementById("character-type3").innerText)
        this.#comThinkingD(document.getElementById("character-type3").innerText)

      
        // ボタン切り替え(1から2、2から最終)
        this.#cangecomamd();
        
        //1秒待つ
        await Util.sleep();

        //ゲーム実行状況を更新
        this.#isRunning = true;
        this.#buttonGuardreset();
    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    //決定ボタンのクリックイベントハンドラ
    async #onDraw2(event) { 
    this.#isRunning = false;

    //画面の描画を更新する
    this.#updateView();
    
    //1秒待つ
    await Util.sleep();

    //勝敗を判定する
    this.#judgement();

    this.#playerTurn = true;
    this.#comTurn = false;

    //1秒待つ
    await Util.sleep();

    this.#Diffence(document.getElementById("character-type3").innerText);
    this.#Attack(document.getElementById("character-type2").innerText);

    this.#playerTextBoard(document.getElementById("character-type2").innerText);

    this.#lifearAction();

    //1秒待つ
    await Util.sleep();

    let log = document.querySelector("#log");
    log.classList.remove("bihind");
    this.#comTurn = true;
    this.#playerTurn = false;
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 相手の攻撃へ移る
async #textGo(event){
    if(this.#comTurn){
    this.#Diffence(document.getElementById("character-type2").innerText)
    this.#Attack(document.getElementById("character-type3").innerText);
    this.#comTextBoard(document.getElementById("character-type3").innerText);
    this.#lifearAction();
    this.#comTurn = false;
    }else{
    let log2 = document.querySelector("#log");
    log2.classList.add("bihind");
    this.#turnreset()
}
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

   //Replayボタンのクリックイベントハンドラ
    #onReplay(event) {
        //ゲームの状況を初期化する
        this.#gamestart(); 
    let log2 = document.querySelector("#log");
    log2.classList.add("bihind");

    }

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

   //reChoiceボタンのクリックイベントハンドラ
   #rechoice(event) {
    this.#initializegamerechoice(); 
let log2 = document.querySelector("#log");
log2.classList.add("bihind");

}



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#resizeWindow(event){

    // let size = document.getElementById("nowWidthsize")
    // size.innerText = window.innerWidth
    // let size2 = document.getElementById("nowWidthsize2")
  
    let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);
  
    let bodyfont = document.getElementById("tbody").style;
    bodyfont.fontSize = (reSizeFont) + "px";
  
    // size2.innerText = bodyfont.fontSize;
  
    // let button = document.getElementById("link").style;

  
    let rootfont = document.querySelector(":root").style;

  }
  
#loadFinished(event){
    let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);
  
    let bodyfont = document.getElementById("tbody").style;
    bodyfont.fontSize = (reSizeFont) + "px";
  
    // let button = document.getElementById("link").style;
  
    let rootfont = document.querySelector(":root").style; 
  }

  
  




/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //イベントハンドラを登録
    #setupEvents() {
    //手札のクリックイベント
    Util.addEventListener(".card.you", "click", this.#onClickCard.bind(this));
    //Drawボタン(1回目)のクリックイベント
    Util.addEventListener("#draw1", "click", this.#onDraw1.bind(this));
    //Choiceボタンのクリックイベント
    Util.addEventListener("#choice", "click", this.#onDraw2.bind(this));
    //Replayボタンのクリックイベント
    Util.addEventListener("#replay", "click", this.#onReplay.bind(this));
    //textGoボタンのクリックイベント
    Util.addEventListener("#textGo", "click", this.#textGo.bind(this));
    Util.addEventListener("#reChoice", "click", this.#rechoice.bind(this));
    
    window.addEventListener("resize", this.#resizeWindow.bind(this));
    window.addEventListener( "load", this.#loadFinished.bind(this));
    }
}
