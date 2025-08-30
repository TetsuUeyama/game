// カード交換後のボタン(回数)を更新
export default function changeCommond1() {
    let D = document.querySelector("#enemey-first");
    let turnF =D.classList;
    let H = document.querySelector("#enemey-second");
    let turnS =H.classList;

    if(turnF == 'box shiny' && turnS == 'box shiny') {
        let count1 =document.querySelector("#enemey-first");
        count1.classList.add("display");
        count1.classList.remove("shiny");
        let count2 = document.querySelector("#player-first");
        count2.classList.add("display");
        count2.classList.remove("shiny");

    } else if(turnF == 'box shiny' || turnS == 'box shiny'){

        let count3 =document.querySelector("#enemey-second");
        count3.classList.add("display");
        count3.classList.remove("shiny");
        let count4 = document.querySelector("#player-second");
        count4.classList.add("display");
        count4.classList.remove("shiny");

    } else {
        let count5 =document.querySelector("#enemey-third");
        count5.classList.add("display");
        count5.classList.remove("shiny");
        let count6 = document.querySelector("#player-third");
        count6.classList.add("display");
        count6.classList.remove("shiny");
    }



    let count = document.getElementById("change-count").innerText;
    if(count == '1回目') {
    document.getElementById("change-count").innerText = '2回目';


    } else if(count == '2回目'){
        document.getElementById("change-count").innerText = '最終';
    } else {
        document.getElementById("draw1").setAttribute("disabled", true);
        document.getElementById("choice").removeAttribute("disabled");
    }
}