// import Character from "./select.js";

// function Attack(e){
    // let playerType = document.getElementById("character-type2").innerText
    // let comType = document.getElementById("character-type3").innerText
    // let e = character_set[e]

//     let damege
//     if(e.attack == "A"){
//         damege = 1.25;
//     }else if(e.attack == "B"){
//         damege = 1.0;
//     }else{
//         damege = 0.75;
//     }
//     console.log(damege)
//     return damege
// }


export  function pAttack(elw){
    character_set[elw]

    let damege
    if(elw.attack == "A"){
        damege = 1.25;
    }else if(elw.attack == "B"){
        damege = 1.0;
    }else{
        damege = 0.75;
    }
    // console.log(damege)


    let which = document.getElementById("which").value;
    let pAResult = null;

    if(which == "0"){
        pAResult = {
            log: playerName + "は攻守のバランスを考えながら攻撃した！",
            ptotalDamege: 1,
          };

    }else if (which == "1"){
        pAResult = {
        log: playerName + "は全力で攻撃した！",
        ptotalDamege: 2,
        };
    }
    else{
        pAResult = {
        log: playerName + "は相手の攻撃を牽制しつつ攻撃した！",
        ptotalDamege: 0.75,
        };
    }
    return pAResult.ptotalDamege *damege
   };


//    export function cAttack(e){
//     let comName = document.getElementById("com-name").innerText
//     let comAttackPower = document.getElementById("com-attack").innerText
//     let damege
//     if(comAttackPower == "A"){
//         damege = 1.25;
//     }else if(comAttackPower == "B"){
//         damege = 1.0;
//     }else{
//         damege = 0.75;
//     }
// console.log(damege)
//     let which = document.getElementById("which").value;
//     let cAResult = null;

//     if(which == "0"){
//         cAResult = {
//             log: comName + "は攻守のバランスを考えながら攻撃した！",
//             attackPattern:  1,
//           };

//     }else if (which == "1"){
//         cAResult = {
//         log: comName + "は全力で攻撃した！",
//         attackPattern:  2,
//         };
//     }
//     else{
//         cAResult = {
//         log: comName + "は相手の攻撃を牽制しつつ攻撃した！",
//         attackPattern: 0.75,
//         };
//     }
//     console.log(cAResult)
//     let ctotalDamege = damege * cAResult.attackPattern
//     console.log(ctotalDamege)
//    };
