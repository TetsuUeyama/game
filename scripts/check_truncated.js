const fs = require('fs');
const path = require('path');

const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;
const VS = 0.007;

const truncated = [];

for (const cat of fs.readdirSync(BASE).sort()) {
  const catPath = path.join(BASE, cat);
  if (!fs.statSync(catPath).isDirectory()) continue;

  for (const weapon of fs.readdirSync(catPath).sort()) {
    const wPath = path.join(catPath, weapon);
    if (!fs.statSync(wPath).isDirectory()) continue;

    const gridFile = path.join(wPath, 'grid.json');
    if (!fs.existsSync(gridFile)) continue;

    const g = JSON.parse(fs.readFileSync(gridFile, 'utf8'));

    // Check if any axis hit 256 (truncated)
    const axes = [];
    if (g.gx >= 256) axes.push('X');
    if (g.gy >= 256) axes.push('Y');
    if (g.gz >= 256) axes.push('Z');

    if (axes.length > 0) {
      // Calculate actual model size from bounding box
      const actual_w = (g.bb_max[0] - g.bb_min[0]);
      const actual_d = (g.bb_max[1] - g.bb_min[1]);
      const actual_h = (g.bb_max[2] - g.bb_min[2]);
      // What grid size would be needed without clamping
      const needed_gx = Math.ceil(actual_w / VS) + 2;
      const needed_gy = Math.ceil(actual_d / VS) + 2;
      const needed_gz = Math.ceil(actual_h / VS) + 2;

      truncated.push({
        cat, weapon,
        grid: `${g.gx}x${g.gy}x${g.gz}`,
        actual_cm: `${(actual_w*100).toFixed(1)} x ${(actual_d*100).toFixed(1)} x ${(actual_h*100).toFixed(1)}`,
        needed: `${needed_gx}x${needed_gy}x${needed_gz}`,
        truncAxes: axes.join(','),
        actual_h_m: actual_h,
        max_dim: Math.max(actual_w, actual_d, actual_h),
      });
    }
  }
}

if (truncated.length === 0) {
  console.log('No truncated weapons found.');
} else {
  console.log(`=== ${truncated.length} weapons hitting 256 voxel limit (TRUNCATED) ===\n`);
  console.log('Category'.padEnd(15) + 'Weapon'.padEnd(40) + 'Current Grid'.padEnd(16) + 'Needed Grid'.padEnd(16) + 'Actual Size (cm)'.padEnd(35) + 'Cut Axis');
  console.log('-'.repeat(130));

  for (const t of truncated) {
    console.log(
      t.cat.padEnd(15) +
      t.weapon.padEnd(40) +
      t.grid.padEnd(16) +
      t.needed.padEnd(16) +
      t.actual_cm.padEnd(35) +
      t.truncAxes
    );
  }

  console.log(`\nWith voxel_size=0.007, max representable length = 256 * 0.007 = 1.792m`);
  console.log(`\nLongest actual weapon: ${(Math.max(...truncated.map(t=>t.max_dim))*100).toFixed(1)}cm`);
  console.log(`\nTo fix: either increase voxel_size for these weapons, or split into parts.`);
}
