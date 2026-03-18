const fs = require('fs');
const path = require('path');

const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;
const VS_CM = 0.7; // 0.007m = 0.7cm
const CHAR_HEIGHT_CM = 256 * VS_CM; // ~179.2cm

const results = [];

for (const cat of fs.readdirSync(BASE).sort()) {
  const catPath = path.join(BASE, cat);
  if (!fs.statSync(catPath).isDirectory()) continue;

  for (const weapon of fs.readdirSync(catPath).sort()) {
    const wPath = path.join(catPath, weapon);
    if (!fs.statSync(wPath).isDirectory()) continue;

    const gridFile = path.join(wPath, 'grid.json');
    if (!fs.existsSync(gridFile)) continue;

    const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));
    const w_cm = (g.gx * VS_CM).toFixed(1);
    const d_cm = (g.gy * VS_CM).toFixed(1);
    const h_cm = (g.gz * VS_CM).toFixed(1);

    results.push({ cat, weapon, gx: g.gx, gy: g.gy, gz: g.gz, w_cm, d_cm, h_cm, voxels: g.voxel_count || 0 });
  }
}

// Print header
console.log('Category'.padEnd(15) + 'Weapon'.padEnd(45) + 'Grid (WxDxH)'.padEnd(16) + 'Size (WxDxH cm)'.padEnd(30) + 'Voxels');
console.log('-'.repeat(115));

for (const r of results) {
  const grid = `${r.gx}x${r.gy}x${r.gz}`;
  const size = `${r.w_cm} x ${r.d_cm} x ${r.h_cm}`;
  console.log(r.cat.padEnd(15) + r.weapon.padEnd(45) + grid.padEnd(16) + size.padEnd(30) + r.voxels);
}

// Summary by category
console.log('\n=== Size Summary by Category ===');
console.log('(Height = weapon length along longest axis, compared to character ~179cm)\n');

const cats = {};
for (const r of results) {
  if (!cats[r.cat]) cats[r.cat] = [];
  cats[r.cat].push(r);
}

for (const [cat, items] of Object.entries(cats).sort()) {
  const heights = items.map(i => parseFloat(i.h_cm));
  const widths = items.map(i => parseFloat(i.w_cm));
  const minH = Math.min(...heights).toFixed(1);
  const maxH = Math.max(...heights).toFixed(1);
  const avgH = (heights.reduce((a,b)=>a+b,0) / heights.length).toFixed(1);
  console.log(`${cat.padEnd(15)} ${items.length} items | height: ${minH}~${maxH}cm (avg ${avgH}cm) | vs char: ${(avgH/179.2*100).toFixed(0)}%`);
}

console.log(`\nCharacter reference height: ${CHAR_HEIGHT_CM.toFixed(1)}cm (256 voxels x 0.7cm)`);
console.log(`Total weapons: ${results.length}`);
