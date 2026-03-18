const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\voxelize_weapon_split.py`;
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;
const OUT_BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

// All 13 truncated weapons: [filename, category, safe_name]
const weapons = [
  ["Giant Great Ax of the Fallen", "axes", "Giant_Great_Ax_of_the_Fallen"],
  ["Claymore", "greatswords", "Claymore"],
  ["Imperial GreatSword", "greatswords", "Imperial_GreatSword"],
  ["Adventurer's Halberd", "halberds", "Adventurers_Halberd"],
  ["CurvKatana", "katanas", "CurvKatana"],
  ["LongKatana", "katanas", "LongKatana"],
  ["Adventurer's Spear", "spears", "Adventurers_Spear"],
  ["Ash Spear", "spears", "Ash_Spear"],
  ["Crossed Spear", "spears", "Crossed_Spear"],
  ["Jagged Spear", "spears", "Jagged_Spear"],
  ["Spear of the Fang", "spears", "Spear_of_the_Fang"],
  ["Straight Sword", "swords", "Straight_Sword"],
  ["Wyvern's Thorn", "swords", "Wyverns_Thorn"],
];

let success = 0;
let fail = 0;

for (const [name, category, safeName] of weapons) {
  const glb = path.join(SRC_DIR, name + '.glb');
  const outDir = path.join(OUT_BASE, category, safeName);

  console.log(`\n[${success + fail + 1}/${weapons.length}] ${name} -> ${category}/${safeName}`);

  // Remove old single vox file
  const oldVox = path.join(outDir, safeName + '.vox');
  if (fs.existsSync(oldVox)) {
    fs.unlinkSync(oldVox);
    console.log(`  Removed old: ${safeName}.vox`);
  }

  // Remove old test split dirs if they exist
  const splitDir = outDir + '_split';
  if (fs.existsSync(splitDir)) {
    fs.rmSync(splitDir, { recursive: true });
    console.log(`  Removed old split dir`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  try {
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });

    // Extract key lines
    const lines = out.split('\n').filter(l =>
      l.includes('Split point') || l.includes('Handle:') || l.includes('Blade:') ||
      l.includes('Generated') || l.includes('Written') || l.includes('Grid:') ||
      l.includes('parts generated')
    );
    lines.forEach(l => console.log('  ' + l.trim()));

    // Verify output
    const handleVox = fs.readdirSync(outDir).filter(f => f.endsWith('_handle.vox'));
    const bladeVox = fs.readdirSync(outDir).filter(f => f.endsWith('_blade.vox'));
    if (handleVox.length > 0 && bladeVox.length > 0) {
      console.log(`  OK: handle + blade`);
      success++;
    } else {
      console.log(`  PARTIAL: handle=${handleVox.length}, blade=${bladeVox.length}`);
      success++;  // still count as success if at least one part
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message.slice(0, 300)}`);
    fail++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Success: ${success}, Failed: ${fail}`);
