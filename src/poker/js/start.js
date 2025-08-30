window.onload = function() {
    Particles.init({
      selector: '.background',
      sizeVariations: 30,
      color: [
        '#0bd', 'rgba(0,187,221,.5)', 'rgba(0,187,221,.2)'
      ]
    });

    let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);
  
    let bodyfont = document.getElementById("tbody").style;
    bodyfont.fontSize = (reSizeFont) + "px";
  };
  
  function changeVisual() {
    let change = document.getElementById("mainvisual1").id;
    document.getElementById("visual").src = "images/" + change + ".jpg";
    let visual = document.getElementById("visual")
    visual.classList.add("item1");
}

window.onresize = function() {
  let reSizeFont = 16 * (window.innerWidth / 1280).toFixed(2);
  
  let bodyfont = document.getElementById("tbody").style;
  bodyfont.fontSize = (reSizeFont) + "px";
}


let c = document.querySelector("#mainvisual1");
c.addEventListener("mousemove", changeVisual);

function changeVisua2() {
    let change = document.getElementById("mainvisual2").id;
    document.getElementById("visual").src = "images/" + change + ".jpg";
    let visual = document.getElementById("visual")
    visual.classList.add("item1");
}

let d = document.querySelector("#mainvisual2");
d.addEventListener("mousemove", changeVisua2);

function changeVisua3() {
    let change = document.getElementById("mainvisual3").id;
    document.getElementById("visual").src = "images/" + change + ".jpg";
    
}

let e = document.querySelector("#mainvisual3");
e.addEventListener("mousemove", changeVisua3);

function changeVisua4() {
    let change = document.getElementById("mainvisual4").id;
    document.getElementById("visual").src = "images/" + change + ".jpg";
}

let f = document.querySelector("#mainvisual4");
f.addEventListener("mousemove", changeVisua4);

function changeVisua5() {
    let change = document.getElementById("mainvisual5").id;
    document.getElementById("visual").src = "images/" + change + ".jpg";
}

let g = document.querySelector("#mainvisual5");
g.addEventListener("mousemove", changeVisua5);