const d = require('../public/models/character-motion/Hip Hop Dancing.motion.json');
const bwp = d.bindWorldPositions;

const hierarchy = {
  'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1',
  'Neck': 'Spine2', 'Head': 'Neck',
  'LeftShoulder': 'Spine2', 'LeftArm': 'LeftShoulder', 'LeftForeArm': 'LeftArm', 'LeftHand': 'LeftForeArm',
  'RightShoulder': 'Spine2', 'RightArm': 'RightShoulder', 'RightForeArm': 'RightArm', 'RightHand': 'RightForeArm',
  'LeftUpLeg': 'Hips', 'LeftLeg': 'LeftUpLeg', 'LeftFoot': 'LeftLeg', 'LeftToeBase': 'LeftFoot',
  'RightUpLeg': 'Hips', 'RightLeg': 'RightUpLeg', 'RightFoot': 'RightLeg', 'RightToeBase': 'RightFoot',
};

const r = v => Math.round(v * 100) / 100;
const norm = (x, y, z) => { const l = Math.sqrt(x*x + y*y + z*z) || 1; return [x/l, y/l, z/l]; };

// Voxel bone positions (from calculateAllBones defaults)
// These are approximate - reading from the code defaults
const cx = 35, cy = 13;
const voxelBones = {
  'Hips': { x: 35, y: 13, z: 31 },
  'Spine': { x: 35, y: 13, z: 43.75 },
  'Spine1': { x: 35, y: 13, z: 56.5 },
  'Spine2': { x: 35, y: 13, z: 69.25 },
  'Neck': { x: 35, y: 13, z: 78 },
  'Head': { x: 35, y: 13, z: 90 },
  'LeftShoulder': { x: 27.25, y: 13, z: 71.25 },
  'LeftArm': { x: 21.95, y: 13, z: 63.75 },
  'LeftForeArm': { x: 14, y: 13, z: 48 },
  'LeftHand': { x: 10, y: 13, z: 34 },
  'RightShoulder': { x: 42.75, y: 13, z: 71.25 },
  'RightArm': { x: 48.05, y: 13, z: 63.75 },
  'RightForeArm': { x: 56, y: 13, z: 48 },
  'RightHand': { x: 60, y: 13, z: 34 },
  'LeftUpLeg': { x: 26.2, y: 13, z: 31 },
  'LeftLeg': { x: 24, y: 13, z: 17 },
  'LeftFoot': { x: 24, y: 9, z: 2 },
  'LeftToeBase': { x: 24, y: 6, z: 1 },
  'RightUpLeg': { x: 43.8, y: 13, z: 31 },
  'RightLeg': { x: 46, y: 13, z: 17 },
  'RightFoot': { x: 46, y: 9, z: 2 },
  'RightToeBase': { x: 46, y: 6, z: 1 },
};

// Convert voxel to viewer direction: (dx_voxel, dy_voxel, dz_voxel) → viewer direction
// viewer_x = (vx - cx) * S, viewer_y = vz * S, viewer_z = -(vy - cy) * S
function voxelDirToViewer(dx, dy, dz) {
  return [dx, dz, -dy]; // simplified (scale cancels in normalization)
}

// FBX to viewer direction: (-x, y, z)
function fbxDirToViewer(dx, dy, dz) {
  return [-dx, dy, dz];
}

console.log('=== BONE DIRECTION COMPARISON: Voxel vs FBX (in viewer space) ===');
console.log('Bone                | Voxel dir (viewer)          | FBX dir (viewer)            | Angle diff');
console.log('-'.repeat(100));

for (const [child, parent] of Object.entries(hierarchy)) {
  const vc = voxelBones[child], vp = voxelBones[parent];
  const fc = bwp[child], fp = bwp[parent];
  if (!vc || !vp || !fc || !fp) continue;

  // Voxel direction in viewer space
  const vdx = vc.x - vp.x, vdy = vc.y - vp.y, vdz = vc.z - vp.z;
  const [vvx, vvy, vvz] = norm(...voxelDirToViewer(vdx, vdy, vdz));

  // FBX direction in viewer space
  const fdx = fc[0] - fp[0], fdy = fc[1] - fp[1], fdz = fc[2] - fp[2];
  const [fvx, fvy, fvz] = norm(...fbxDirToViewer(fdx, fdy, fdz));

  const dot = Math.min(1, Math.max(-1, vvx*fvx + vvy*fvy + vvz*fvz));
  const angleDeg = r(Math.acos(dot) * 180 / Math.PI);

  console.log(
    child.padEnd(20) +
    '| (' + r(vvx).toString().padStart(6) + ', ' + r(vvy).toString().padStart(6) + ', ' + r(vvz).toString().padStart(6) + ')' +
    '  | (' + r(fvx).toString().padStart(6) + ', ' + r(fvy).toString().padStart(6) + ', ' + r(fvz).toString().padStart(6) + ')' +
    '  | ' + angleDeg + '°' +
    (angleDeg > 10 ? ' *** LARGE' : '')
  );
}
