const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BLENDER = String.raw`C:\Program Files\Blender Foundation\Blender 5.0\blender.exe`;
const SCRIPT = String.raw`C:\Users\user\developsecond\contactform\scripts\voxelize_weapon.py`;
const SRC_DIR = String.raw`C:\Users\user\Downloads\uploads_files_5754997_+100+Fantasy+Weapons+Basemesh+Pack+V1\+100 Fantasy Weapons Basemesh Pack V1\GLB`;
const OUT_BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;
const SCALE = "0.5";

// Categories to rescale
const CATEGORIES = ["swords", "shields", "rapiers", "katanas", "hammers", "greatswords", "daggers"];

// Build weapon list from existing directories
const weapons = [];
for (const cat of CATEGORIES) {
  const catDir = path.join(OUT_BASE, cat);
  if (!fs.existsSync(catDir)) continue;
  for (const weapon of fs.readdirSync(catDir)) {
    const wDir = path.join(catDir, weapon);
    if (!fs.statSync(wDir).isDirectory()) continue;

    // Find the original GLB name from grid.json or parts.json
    let sourceName = weapon.replace(/_/g, ' ');
    const gridFile = path.join(wDir, 'grid.json');
    if (fs.existsSync(gridFile)) {
      const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
      if (g.source) sourceName = g.source;
    }
    const partsFile = path.join(wDir, 'parts.json');
    if (fs.existsSync(partsFile)) {
      try {
        const p = JSON.parse(fs.readFileSync(partsFile, 'utf8'));
        if (p.source) sourceName = p.source;
      } catch(e) {}
    }

    weapons.push({ cat, safeName: weapon, sourceName, outDir: wDir });
  }
}

console.log(`=== Rescaling ${weapons.length} weapons at scale=${SCALE} ===`);
console.log(`Categories: ${CATEGORIES.join(', ')}\n`);

let success = 0;
let fail = 0;

for (const { cat, safeName, sourceName, outDir } of weapons) {
  const glb = path.join(SRC_DIR, sourceName + '.glb');

  if (!fs.existsSync(glb)) {
    console.log(`[${success+fail+1}] SKIP (no GLB): ${sourceName}`);
    fail++;
    continue;
  }

  // Clean old files
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.vox') || f.endsWith('.json')) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }

  console.log(`[${success+fail+1}/${weapons.length}] ${cat}/${safeName}`);

  try {
    const cmd = `"${BLENDER}" --background --python "${SCRIPT}" -- "${glb}" "${outDir}" 0.007 ${SCALE}`;
    const out = execSync(cmd, { timeout: 120000, encoding: 'utf8' });

    const lines = out.split('\n').filter(l =>
      l.includes('Grid:') || l.includes('Generated') || l.includes('Written')
    );
    lines.forEach(l => console.log('  ' + l.trim()));

    const voxFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.vox'));
    if (voxFiles.length > 0) {
      success++;
    } else {
      console.log('  FAILED - no vox');
      fail++;
    }
  } catch(e) {
    console.log(`  ERROR: ${e.message.slice(0, 200)}`);
    fail++;
  }
}

console.log(`\n=== Done! Success: ${success}, Failed: ${fail} ===`);
