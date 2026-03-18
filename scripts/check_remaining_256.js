const fs = require('fs');
const path = require('path');

const BASE = String.raw`C:\Users\user\developsecond\game-assets\wapons`;

function findVoxFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findVoxFiles(full));
    else if (entry.name.endsWith('.vox')) results.push(full);
  }
  return results;
}

const voxFiles = findVoxFiles(BASE);
let truncCount = 0;

for (const f of voxFiles) {
  const buf = fs.readFileSync(f);
  let i = 8;
  while (i < buf.length - 12) {
    const id = buf.toString('ascii', i, i + 4);
    const contentSize = buf.readUInt32LE(i + 4);
    const childSize = buf.readUInt32LE(i + 8);
    if (id === 'SIZE') {
      const sx = buf.readUInt32LE(i + 12);
      const sy = buf.readUInt32LE(i + 16);
      const sz = buf.readUInt32LE(i + 20);
      if (sx >= 256 || sy >= 256 || sz >= 256) {
        const rel = path.relative(BASE, f);
        console.log(`TRUNCATED: ${rel}  ${sx}x${sy}x${sz}`);
        truncCount++;
      }
      break;
    }
    i += 12 + contentSize + childSize;
  }
}

if (truncCount === 0) console.log('All vox files are within 256 limit!');
else console.log(`\n${truncCount} file(s) still at 256 limit.`);
