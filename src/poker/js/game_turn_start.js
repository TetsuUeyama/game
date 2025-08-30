// import Player from "./player.js";
// import Com from "./com.js";
// import Card from "./card.js";
// import Pair from "./pair.js";
// import Util from "./util.js";
// import Character from "./select.js";
import {Character,character_set}  from "./select.js";

export  function initializegame() {

    window.onload = function(){

      // 本番はこちらを反映

        const url = new URL(window.location.href);
        const params = url.searchParams;
        const papaplayer = params.get("player");
        const papacom = params.get("com");
        const spanplayer =document.getElementById("character-type2")
        const spancom =document.getElementById("character-type3")
        spanplayer.innerText = papaplayer;
        spancom.innerText = papacom;
        window.papaplayer =papaplayer;
        window.papacom = papacom; 

      // 本番用ここまで


      // 作成時はこちらを使用
      // let papaplayer = document.getElementById("character-type2").innerText
      // let papacom = document.getElementById("character-type3").innerText
    
       // 作成時用ここまで

        document.getElementById("playerimg").src = character_set [papaplayer].img
        document.getElementById("resultplayerimg").src =  character_set [papaplayer].img
        document.getElementById("player-name").innerText = character_set [papaplayer].name
        document.getElementById("player-type").innerText = character_set [papaplayer].type
        document.getElementById("player-parsonality").innerText = character_set [papaplayer].parsonality

        document.getElementById("player-attack").innerText = character_set [papaplayer].attack
        document.getElementById("player-diffence").innerText = character_set [papaplayer].difence
        document.getElementById("player-speed").innerText = character_set [papaplayer].speed
        document.getElementById("player-intelogence").innerText = character_set [papaplayer].intelogence

        let playerHp = character_set [papaplayer].hp
        if(character_set [papaplayer].hp == "A"){
            playerHp = 150
        }else if(character_set [papaplayer].hp == "B"){
            playerHp = 125
            }else{
            playerHp = 100
        }

        document.getElementById("plifeNow").innerText = playerHp
        document.getElementById("pmaxHp").innerText = playerHp
        
        document.getElementById("comimg").src = character_set [papacom].img
        document.getElementById("resultcomimg").src =  character_set [papacom].img
        document.getElementById("com-name").innerText = character_set [papacom].name
        document.getElementById("com-type").innerText = character_set [papacom].type
        document.getElementById("com-parsonality").innerText = character_set [papacom].parsonality
        document.getElementById("com-attack").innerText = character_set [papacom].attack
        document.getElementById("com-diffence").innerText = character_set [papacom].difence
        document.getElementById("com-speed").innerText = character_set [papacom].speed
        document.getElementById("com-intelogence").innerText = character_set [papacom].intelogence
        
        let comHp = character_set [papacom].hp
        if(character_set [papacom].hp == "A"){
            comHp = 150
        }else if(character_set [papacom].hp == "B"){
            comHp = 125
            }else{
            comHp = 100
        }
        document.getElementById("elifeNow").innerText = comHp
        document.getElementById("emaxHp").innerText = comHp

    }  
    
    document.getElementById("change-count").innerText = '1回目';
    document.getElementById('text1').innerText = "　";
    document.getElementById('text2').innerText = "　";
    document.getElementById('text3').innerText = "　";
    document.getElementById('text4').innerText = "　";
    document.getElementById("draw1").removeAttribute("disabled");
    document.getElementById("choice").setAttribute("disabled", true);
    document.getElementById("textGo").setAttribute("disabled", true);
    let first = document.querySelector("#retry");
    first.classList.add("bihind");

    let log2 = document.querySelector("#log");
    log2.classList.add("bihind");

    document.getElementById("player-character-condicion").innerText = "ニヤニヤ"
    document.getElementById("com-character-condicion").innerText = "ニヤニヤ"
    document.getElementById("elifeNow").innerText = document.getElementById("emaxHp").innerText;
    document.getElementById("plifeNow").innerText = document.getElementById("pmaxHp").innerText;
    window.document.getElementById("life-mark-player").style.width = (100 +"%");
    window.document.getElementById("life-mark-enemy").style.width = (100 +"%");
    let count1 =document.querySelector("#enemey-first");
    count1.classList.remove("display");
    count1.classList.add("shiny");
    let count2 =document.querySelector("#player-first");
    count2.classList.remove("display");
    count2.classList.add("shiny");
    let count3 =document.querySelector("#enemey-second");
    count3.classList.remove("display");
    count3.classList.add("shiny");
    let count4 =document.querySelector("#player-second");
    count4.classList.remove("display");
    count4.classList.add("shiny");
    let count5 =document.querySelector("#enemey-third");
    count5.classList.remove("display");
    count5.classList.add("shiny");
    let count6 =document.querySelector("#player-third");
    count6.classList.remove("display");
    count6.classList.add("shiny");
    let logroleE = document.querySelector(".Erole");
    logroleE.classList.add("bihind");
    let logroleP =document.querySelector(".Prole");
    logroleP.classList.add("bihind");


    let bl = document.getElementById("settlement")
    bl.innerText = "勝負に勝ちました！"

    let bs = document.getElementById("winorlose")
    bs.src = "images/pose_win_boy.png"


    let guard = document.getElementById("button-guard")
    let turn = document.getElementById("player-third")
    guard.classList.add("bihind");

    let rest = document.querySelectorAll(".discard")
    for (let i = 0; i < rest.length; i++){ 
       rest2[i].classList.remove("discard");
     };      
 
     let rest2 = document.querySelectorAll(".discard2")
     for (let i = 0; i < rest2.length; i++){
       rest2[i].classList.remove("discard2");
     };      
 
 
 let rest3 = document.querySelectorAll(".comcardfirst")
 for (let i = 0; i < rest3.length; i++){ 
   rest3[i].src = "images/red.png";
 }; 
 
 let rest4 = document.querySelectorAll(".comcardsecond")
 for (let i = 0; i < rest3.length; i++){ 
     rest4[i].src = "images/red.png";
   }; 
 
 let rest5 = document.querySelectorAll(".comcardthird")
 for (let i = 0; i < rest3.length; i++){ 
     rest5[i].src = "images/red.png";
   }; 
 
   let rest6 = document.querySelectorAll(".playercardfirst")
   for (let i = 0; i < rest3.length; i++){ 
       rest6[i].src = "images/blue.png";
     }; 
 
     let rest7 = document.querySelectorAll(".playercardsecond")
     for (let i = 0; i < rest3.length; i++){ 
         rest7[i].src = "images/blue.png";
       }; 
 
       let rest8 = document.querySelectorAll(".playercardthird")
       for (let i = 0; i < rest3.length; i++){ 
           rest8[i].src = "images/blue.png";
         }; 

    let restwin = document.querySelectorAll(".container")
    for (let i = 0; i < restwin.length; i++){
        restwin[i].classList.remove("container");
    };     

    let restwin2 = document.querySelectorAll(".confetti")
    for (let i = 0; i < restwin2.length; i++){ 
        restwin2[i].classList.remove("confetti");
    };     

    let restlose = document.querySelectorAll(".lose")
    for (let i = 0; i < restlose.length; i++){
        restlose[i].classList.remove("lose");
    };     
}



export  function initializegamerechoice() {
  let papaplayer = document.getElementById("character-type2").innerText  


  let playerHp = character_set [papaplayer].hp
  if(character_set [papaplayer].hp == "A"){
      playerHp = 150
  }else if(character_set [papaplayer].hp == "B"){
      playerHp = 125
      }else{
      playerHp = 100
  }
  document.getElementById("plifeNow").innerText = playerHp
  document.getElementById("pmaxHp").innerText = playerHp



    let newenemy = Math.floor(Math.random()*32)
        let papacom = document.getElementById("character-type3").innerText
        papacom = newenemy
            
      document.getElementById("comimg").src = character_set [papacom].img
      document.getElementById("resultcomimg").src =  character_set [papacom].img
      document.getElementById("com-name").innerText = character_set [papacom].name
      document.getElementById("com-type").innerText = character_set [papacom].type
      document.getElementById("com-parsonality").innerText = character_set [papacom].parsonality
      document.getElementById("com-attack").innerText = character_set [papacom].attack
      document.getElementById("com-diffence").innerText = character_set [papacom].difence
      document.getElementById("com-speed").innerText = character_set [papacom].speed
      document.getElementById("com-intelogence").innerText = character_set [papacom].intelogence
      
      let comHp = character_set [papacom].hp
      if(character_set [papacom].hp == "A"){
          comHp = 150
      }else if(character_set [papacom].hp == "B"){
          comHp = 125
          }else{
          comHp = 100
      }
      document.getElementById("elifeNow").innerText = comHp
      document.getElementById("emaxHp").innerText = comHp

  
  
  document.getElementById("change-count").innerText = '1回目';
  document.getElementById('text1').innerText = "　";
  document.getElementById('text2').innerText = "　";
  document.getElementById('text3').innerText = "　";
  document.getElementById('text4').innerText = "　";
  document.getElementById("draw1").removeAttribute("disabled");
  document.getElementById("choice").setAttribute("disabled", true);
  document.getElementById("textGo").setAttribute("disabled", true);
  let first = document.querySelector("#retry");
  first.classList.add("bihind");

  let log2 = document.querySelector("#log");
  log2.classList.add("bihind");

  document.getElementById("player-character-condicion").innerText = "ニヤニヤ"
  document.getElementById("com-character-condicion").innerText = "ニヤニヤ"
  document.getElementById("elifeNow").innerText = document.getElementById("emaxHp").innerText;
  document.getElementById("plifeNow").innerText = document.getElementById("pmaxHp").innerText;
  window.document.getElementById("life-mark-player").style.width = (100 +"%");
  window.document.getElementById("life-mark-enemy").style.width = (100 +"%");
  let count1 =document.querySelector("#enemey-first");
  count1.classList.remove("display");
  count1.classList.add("shiny");
  let count2 =document.querySelector("#player-first");
  count2.classList.remove("display");
  count2.classList.add("shiny");
  let count3 =document.querySelector("#enemey-second");
  count3.classList.remove("display");
  count3.classList.add("shiny");
  let count4 =document.querySelector("#player-second");
  count4.classList.remove("display");
  count4.classList.add("shiny");
  let count5 =document.querySelector("#enemey-third");
  count5.classList.remove("display");
  count5.classList.add("shiny");
  let count6 =document.querySelector("#player-third");
  count6.classList.remove("display");
  count6.classList.add("shiny");
  let logroleE = document.querySelector(".Erole");
  logroleE.classList.add("bihind");
  let logroleP =document.querySelector(".Prole");
  logroleP.classList.add("bihind");

  let guard = document.getElementById("button-guard")
  let turn = document.getElementById("player-third")
  guard.classList.add("bihind");

  let bl = document.getElementById("settlement")
  bl.innerText = "勝負に勝ちました！"

  let bs = document.getElementById("winorlose")
  bs.src = "images/pose_win_boy.png"

  let rest = document.querySelectorAll(".discard")
  for (let i = 0; i < rest.length; i++){ 
     rest2[i].classList.remove("discard");
   };      

   let rest2 = document.querySelectorAll(".discard2")
   for (let i = 0; i < rest2.length; i++){
     rest2[i].classList.remove("discard2");
   };      


let rest3 = document.querySelectorAll(".comcardfirst")
for (let i = 0; i < rest3.length; i++){ 
 rest3[i].src = "images/red.png";
}; 

let rest4 = document.querySelectorAll(".comcardsecond")
for (let i = 0; i < rest3.length; i++){ 
   rest4[i].src = "images/red.png";
 }; 

let rest5 = document.querySelectorAll(".comcardthird")
for (let i = 0; i < rest3.length; i++){ 
   rest5[i].src = "images/red.png";
 }; 

 let rest6 = document.querySelectorAll(".playercardfirst")
 for (let i = 0; i < rest3.length; i++){ 
     rest6[i].src = "images/blue.png";
   }; 

   let rest7 = document.querySelectorAll(".playercardsecond")
   for (let i = 0; i < rest3.length; i++){ 
       rest7[i].src = "images/blue.png";
     }; 

     let rest8 = document.querySelectorAll(".playercardthird")
     for (let i = 0; i < rest3.length; i++){ 
         rest8[i].src = "images/blue.png";
       }; 

  let restwin = document.querySelectorAll(".container")
  for (let i = 0; i < restwin.length; i++){  
      restwin[i].classList.remove("container");
  };     

  let restwin2 = document.querySelectorAll(".confetti")
  for (let i = 0; i < restwin2.length; i++){   
      restwin2[i].classList.remove("confetti");
  };     

  let restlose = document.querySelectorAll(".lose")
  for (let i = 0; i < restlose.length; i++){   
      restlose[i].classList.remove("lose");
  };     
}







/**
 * ターンの状態を初期化する
 */
export function initialize() {
    document.getElementById("change-count").innerText = '1回目';
    document.getElementById('text1').innerText = "　";
    document.getElementById('text2').innerText = "　";
    document.getElementById('text3').innerText = "　";
    document.getElementById('text4').innerText = "　";
    document.getElementById("draw1").removeAttribute("disabled");
    document.getElementById("choice").setAttribute("disabled", true);
    document.getElementById("textGo").setAttribute("disabled", true);
    let first = document.querySelector("#retry");
    first.classList.add("bihind");
    let count1 =document.querySelector("#enemey-first");
    count1.classList.remove("display");
    count1.classList.add("shiny");
    let count2 =document.querySelector("#player-first");
    count2.classList.remove("display");
    count2.classList.add("shiny");
    let count3 =document.querySelector("#enemey-second");
    count3.classList.remove("display");
    count3.classList.add("shiny");
    let count4 =document.querySelector("#player-second");
    count4.classList.remove("display");
    count4.classList.add("shiny");
    let count5 =document.querySelector("#enemey-third");
    count5.classList.remove("display");
    count5.classList.add("shiny");
    let count6 =document.querySelector("#player-third");
    count6.classList.remove("display");
    count6.classList.add("shiny");
    let logroleE = document.querySelector(".Erole");
    logroleE.classList.add("bihind");
    let logroleP =document.querySelector(".Prole");
    logroleP.classList.add("bihind");

    let rest = document.querySelectorAll(".discard")
   for (let i = 0; i < rest.length; i++){
      rest2[i].classList.remove("discard");
    };      

    let rest2 = document.querySelectorAll(".discard2")
    for (let i = 0; i < rest2.length; i++){ 
      rest2[i].classList.remove("discard2");
    };      

let rest3 = document.querySelectorAll(".comcardfirst")
for (let i = 0; i < rest3.length; i++){ 
  rest3[i].src = "images/red.png";
}; 

let rest4 = document.querySelectorAll(".comcardsecond")
for (let i = 0; i < rest3.length; i++){ 
    rest4[i].src = "images/red.png";
  }; 

let rest5 = document.querySelectorAll(".comcardthird")
for (let i = 0; i < rest3.length; i++){ 
    rest5[i].src = "images/red.png";
  }; 

  let rest6 = document.querySelectorAll(".playercardfirst")
  for (let i = 0; i < rest3.length; i++){ 
      rest6[i].src = "images/blue.png";
    }; 

    let rest7 = document.querySelectorAll(".playercardsecond")
    for (let i = 0; i < rest3.length; i++){ 
        rest7[i].src = "images/blue.png";
      }; 

      let rest8 = document.querySelectorAll(".playercardthird")
      for (let i = 0; i < rest3.length; i++){ 
          rest8[i].src = "images/blue.png";
        }; 
  
}

