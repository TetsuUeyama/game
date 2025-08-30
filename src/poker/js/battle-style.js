import {Character, character_set} from "./select.js";
// import {character_set} from "./select.js";
// console.log( character_set[2] );
// console.log(Character);

function  resizeWindow(event){
  // let size = document.getElementById("nowWidthsize")
  // size.innerText = window.innerWidth
  // let size2 = document.getElementById("nowWidthsize2")

  let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);

  let bodyfont = document.getElementById("tbody").style;
  bodyfont.fontSize = (reSizeFont) + "px";

  // size2.innerText = bodyfont.fontSize;

  let button = document.getElementById("link").style;
  console.log(button.fontSize)

  let rootfont = document.querySelector(":root").style;
console.log(rootfont.fontSize)
}

window.addEventListener('resize', resizeWindow);

function loadFinished(){
  let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);

  let bodyfont = document.getElementById("tbody").style;
  bodyfont.fontSize = (reSizeFont) + "px";

  let button = document.getElementById("link").style;
  console.log(button.fontSize)

  let rootfont = document.querySelector(":root").style;
console.log(rootfont.fontSize)

}

window.onload = loadFinished





window.choose = choose
function choose(ele) {
  let attr1 = ele.getAttribute("id");
  let attr = attr1.slice(1);
  document.getElementById("playerMain").src = character_set [attr].img
  // document.getElementById("playerMainMirror").src = character_set [attr].img
  document.getElementById("playerName").innerText = character_set [attr].name
  // document.getElementById("playerNameMirror").innerText = character_set [attr].name
  document.getElementById("PlayerParsonality").innerText = character_set [attr].parsonality
  document.getElementById("playerType").innerText = character_set [attr].type
  document.getElementById("playerHp").innerText = character_set [attr].hp
  document.getElementById("playerAttack").innerText = character_set [attr].attack
  document.getElementById("playerDiffence").innerText = character_set [attr].difence
  document.getElementById("playerSpeed").innerText = character_set [attr].speed
  document.getElementById("playerIntelogence").innerText = character_set [attr].intelogence
}

window.buttonClick = buttonClick
function buttonClick(ele){
  let choice = ele.getAttribute("id");
  let playerchoice = choice.slice(1);
  document.getElementById("playernumber").innerText  = character_set [playerchoice].number
  // console.log(playerchoice)
  let choice1 = document.getElementById(choice);
  choice1.classList.add("shiny");
  let dicision = document.getElementById("cover")
  dicision.classList.remove("display");
  let enemyChoiceNamber = Math.floor(Math.random()*31);
  document.getElementById("enemyMain").src = character_set [ enemyChoiceNamber].img
  // document.getElementById("enemyMainMirror").src = character_set [ enemyChoiceNamber].img
  document.getElementById("enemyName").innerText = character_set [ enemyChoiceNamber].name
  // document.getElementById("enemyNameMirror").innerText = character_set [ enemyChoiceNamber].name
  document.getElementById("enemyParsonality").innerText = character_set [ enemyChoiceNamber].parsonality
  document.getElementById("enemyType").innerText = character_set [ enemyChoiceNamber].type
  document.getElementById("enemyHp").innerText = character_set [ enemyChoiceNamber].hp
  document.getElementById("enemyAttack").innerText = character_set [ enemyChoiceNamber].attack
  document.getElementById("enemyDiffence").innerText = character_set [ enemyChoiceNamber].difence
  document.getElementById("enemySpeed").innerText = character_set [ enemyChoiceNamber].speed
  document.getElementById("enemyIntelogence").innerText = character_set [ enemyChoiceNamber].intelogence
  document.getElementById("comnumber").innerText =  character_set [ enemyChoiceNamber].number
  // console.log(document.getElementById("comnumber").innerText)
  let enemyshiny = document.getElementById( "a" + enemyChoiceNamber)
  enemyshiny.classList.add("shiny");

    
  let link = document.getElementById("link")
  link.classList.add("shiny");

  let redicision = document.getElementById("redicision")
  redicision.classList.add("shiny");
    
  let pToP =  document.getElementById("playernumber").innerText
  let eToE =  document.getElementById("comnumber").innerText
  // console.log( eToE)

  let link2 = `http://sharkteeth.xsrv.jp/poker/index.html?player=${pToP}&com=${eToE}`
  // let link2 = `http://localhost/poker/index.html?player=${pToP}&com=${eToE}`
  link.href = link2
  window.link2 = link2

  // let reDicision =document.getElementById("redicision")

  // reDicision.addEventListener("click", function(){
  // choice1.classList.remove("shiny");
  // dicision.classList.add("display");
  // enemyshiny.classList.remove("shiny");
  // let link = document.getElementById("link")
  // link.classList.remove("shiny");
  // let redicision = document.getElementById("redicision")
  // redicision.classList.remove("shiny");


  // })

}

