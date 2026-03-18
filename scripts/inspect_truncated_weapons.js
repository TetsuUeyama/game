const { execSync } = require('child_process');
const path = require('path');

const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\inspect_weapon_structure.py`;
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;

const weapons = [
  "Adventurer's Halberd",
  "Adventurer's Spear",
  "Ash Spear",
  "Claymore",
  "Crossed Spear",
  "CurvKatana",
  "Giant Great Ax of the Fallen",
  "Imperial GreatSword",
  "Jagged Spear",
  "LongKatana",
  "Spear of the Fang",
  "Straight Sword",
  "Wyvern's Thorn",
];

for (const name of weapons) {
  const glb = path.join(SRC_DIR, name + '.glb');
  try {
    const out = execSync(`"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}"`, {
      timeout: 60000, encoding: 'utf8'
    });
    // Extract only our output (after ===)
    const lines = out.split('\n');
    let capture = false;
    for (const line of lines) {
      if (line.includes('====')) capture = true;
      if (capture) console.log(line);
    }
    console.log('');
  } catch(e) {
    console.log(`ERROR: ${name}: ${e.message.slice(0,200)}`);
  }
}
