const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\voxelize_weapon.py`;
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;
const OUT_BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

const weapons = [
  ["Adventurer's Spear", "spears", "Adventurers_Spear"],
  ["Executioner's Great Machete", "greatswords", "Executioners_Great_Machete"],
  ["Falconer's White Bow", "bows", "Falconers_White_Bow"],
  ["Knight's Straight Sword", "swords", "Knights_Straight_Sword"],
  ["Knight's Sword", "swords", "Knights_Sword"],
  ["Miner's Pick", "axes", "Miners_Pick"],
  ["Ripper's Harpoon", "spears", "Rippers_Harpoon"],
  ["Ripper's Scythe", "scythes", "Rippers_Scythe"],
  ["Wyvern's Thorn", "swords", "Wyverns_Thorn"],
];

let success = 0;
let fail = 0;

for (const [name, category, safeName] of weapons) {
  const glb = path.join(SRC_DIR, name + '.glb');
  const outDir = path.join(OUT_BASE, category, safeName);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Processing: ${name} -> ${category}/${safeName}`);
  try {
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });
    const lines = out.split('\n').filter(l => l.includes('Generated') || l.includes('Written') || l.includes('Grid:'));
    lines.forEach(l => console.log('  ' + l.trim()));

    const voxFile = path.join(outDir, safeName + '.vox');
    if (fs.existsSync(voxFile)) {
      console.log('  OK');
      success++;
    } else {
      const files = fs.readdirSync(outDir).filter(f => f.endsWith('.vox'));
      if (files.length > 0) {
        fs.renameSync(path.join(outDir, files[0]), voxFile);
        console.log('  OK (renamed)');
        success++;
      } else {
        console.log('  FAILED - no vox file');
        fail++;
      }
    }
  } catch(e) {
    console.log('  ERROR: ' + e.message.slice(0, 300));
    fail++;
  }
}
console.log(`\nDone! Success: ${success}, Failed: ${fail}`);
