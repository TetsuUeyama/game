/**
 * Calculate optimal voxel marker positions that produce bone directions
 * matching the FBX bind pose as closely as possible.
 *
 * Markers: Chin, Groin, LeftWrist, LeftElbow, LeftKnee
 * From these, calculateAllBones derives all 41 bone positions.
 *
 * Key relationships:
 * - Hips = Groin position
 * - Neck = Chin with z-4
 * - Spine chain = lerp(Hips, Neck)
 * - LeftUpLeg = Hips + offset from LeftKnee
 * - LeftLeg = LeftKnee
 * - LeftFoot = LeftKnee with adjusted y, z=2
 * - LeftShoulder = Spine2 + offset from LeftElbow
 * - LeftArm = lerp(LeftShoulder, LeftElbow, 0.3)
 * - LeftForeArm = LeftElbow
 * - LeftHand = LeftWrist
 */

const d = require('../public/models/character-motion/Hip Hop Dancing.motion.json');
const bwp = d.bindWorldPositions;

// FBX bind positions in viewer space, centered on Hips
// viewer = (-Three_x, Three_y, Three_z)
const hips = bwp['Hips'];
const SCALE = 0.125; // from vox-parser

function fbxToVoxel(boneName, cx, cy) {
  const bp = bwp[boneName];
  if (!bp) return null;
  const relX = bp[0] - hips[0];
  const relY = bp[1] - hips[1];
  const relZ = bp[2] - hips[2];
  // viewer = (-relX, relY, relZ) * scale + voxelHips
  // voxelHips viewer: ((hipsVoxX - cx)*S, hipsVoxZ*S, -(hipsVoxY-cy)*S)
  // But we need voxel coords directly.
  // viewer_x = (vx - cx) * S = voxelHips_viewerX + (-relX)*scaleFactor
  // We want voxel coords that match FBX bone proportions.

  // FBX body height (Hips→Head Y)
  const fbxBodyHeight = bwp['Head'][1] - hips[1];

  // For simplicity, let's compute bone positions relative to Hips in voxel space.
  // voxel_x maps to viewer_x = (vx - cx) * S → depth/left-right
  // voxel_z maps to viewer_y = vz * S → up/down (height)
  // voxel_y maps to viewer_z = -(vy - cy) * S → front/back

  // FBX Three.js → viewer: (-relX, relY, relZ)
  // viewer → voxel: vx = viewer_x/S + cx, vy = cy - viewer_z/S, vz = viewer_y/S

  // So:
  // voxel_x_rel = (-relX) * scaleFactor / S  → but scaleFactor = voxelBodyHeight / fbxBodyHeight
  // We need to know the voxel body height to compute scaleFactor...
  // Let's just compute relative to Hips voxel position
  return { relX, relY, relZ, fbxBodyHeight };
}

// We know the current default: centerX=35, Groin z=31, Chin z=82
// voxelBodyHeight = (headZ - hipsZ) * SCALE = (90 - 31) * 0.125 = 7.375
// FBX body height ≈ 2.854
// scaleFactor = 7.375 / 2.854 ≈ 2.584

const cx = 35, cy = 13;
const groinZ = 31; // Hips Z in voxel
const fbxBodyHeight = bwp['Head'][1] - hips[1];
const headZ_voxel = groinZ + (bwp['Head'][1] - hips[1]) / fbxBodyHeight * (82 + 8 - groinZ);
// Actually let's just compute target voxel positions for the key markers

// Approach: keep Groin at z=31, compute marker positions to match FBX proportions
// scaleFactor relates FBX world units to voxel viewer units
// We need to find marker positions such that calculateAllBones produces correct bone directions

// Let's compute what calculateAllBones would produce and compare with FBX
// Then adjust markers

function computeBonesFromMarkers(chin, groin, lWrist, lElbow, lKnee) {
  const lerp3 = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  const hips = { ...groin };
  const neck = { x: chin.x, y: chin.y, z: chin.z - 4 };
  const head = { x: chin.x, y: chin.y, z: Math.min(chin.z + 8, 103) };
  const spine2 = lerp3(hips, neck, 0.75);

  const lShoulderOffset = (lElbow.x - spine2.x) * 0.35;
  const lShoulder = { x: spine2.x + lShoulderOffset, y: spine2.y, z: spine2.z + 2 };

  const lLegOffsetX = (lKnee.x - groin.x) * 0.8;
  const lUpLeg = { x: groin.x + lLegOffsetX, y: groin.y, z: groin.z };

  return { hips, neck, head, spine2, lShoulder, lUpLeg };
}

// FBX bone positions in voxel space (relative to hips, using scaleFactor)
const voxelBodyHeight = (82 - 4 + 8 - groinZ); // approximate head - hips in voxel z
const scaleFactor_approx = voxelBodyHeight * SCALE / fbxBodyHeight;

console.log('FBX body height:', fbxBodyHeight.toFixed(3));
console.log('Voxel body height (z units):', voxelBodyHeight);
console.log('Scale factor approx:', scaleFactor_approx.toFixed(3));
console.log();

// Convert FBX positions to voxel space
// viewer = (-relX * sf, relY * sf, relZ * sf) relative to voxelHips
// voxel_x = viewer_x / S + cx = (-relX * sf) / S + cx
// voxel_y = cy - viewer_z / S = cy - (relZ * sf) / S
// voxel_z = viewer_y / S = (relY * sf) / S
function fbxBoneToVoxel(boneName, sf) {
  const bp = bwp[boneName];
  if (!bp) return null;
  const relX = bp[0] - hips[0];
  const relY = bp[1] - hips[1];
  const relZ = bp[2] - hips[2];
  return {
    x: Math.round((-relX * sf) / SCALE + cx),
    y: Math.round(cy - (relZ * sf) / SCALE),
    z: Math.round((relY * sf) / SCALE + groinZ),
  };
}

// Compute actual scaleFactor from the voxel setup
// voxelBodyHeight in viewer = (headZ - hipsZ) * SCALE
// But headZ depends on Chin marker... let's iterate
// Current: Chin z=82 → head z=90 → bodyHeight = (90-31)*0.125 = 7.375
const actualBodyHeightViewer = (82 - 4 + 8 - groinZ) * SCALE; // (chin.z-4 is neck, but head = chin.z+8)
// head.z = chin.z + 8, hips.z = groin.z
// bodyHeight = (chin.z + 8 - groin.z) * SCALE
// We want this to match FBX: bodyHeight = fbxBodyHeight * scaleFactor... circular

// Let's just pick a scaleFactor that preserves the current body height
const sf = actualBodyHeightViewer / fbxBodyHeight;
console.log('Scale factor:', sf.toFixed(4));
console.log();

// Key bones in voxel space
const keyBones = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

console.log('=== FBX bones converted to voxel space ===');
console.log('Bone                | Voxel (x, y, z)');
console.log('-'.repeat(50));
for (const name of keyBones) {
  const v = fbxBoneToVoxel(name, sf);
  if (v) console.log(name.padEnd(20) + '| x=' + String(v.x).padStart(3) + ' y=' + String(v.y).padStart(3) + ' z=' + String(v.z).padStart(3));
}

// Now find optimal markers
// Markers → bones mapping:
// Groin → Hips (directly)
// Chin.z → Neck.z + 4, Head.z = Chin.z + 8
// LeftWrist → LeftHand
// LeftElbow → LeftForeArm
// LeftKnee → LeftLeg

const fbxLeftHand = fbxBoneToVoxel('LeftHand', sf);
const fbxLeftForeArm = fbxBoneToVoxel('LeftForeArm', sf);
const fbxLeftLeg = fbxBoneToVoxel('LeftLeg', sf);
const fbxNeck = fbxBoneToVoxel('Neck', sf);
const fbxHips = fbxBoneToVoxel('Hips', sf);

console.log();
console.log('=== OPTIMAL MARKER POSITIONS ===');
console.log('(Derived from FBX bind pose)');
console.log();
// Chin: neck.z + 4 = chin.z, so chin.z = fbxNeck.z + 4
const optChin = { x: cx, y: fbxNeck.y, z: fbxNeck.z + 4 };
const optGroin = { x: cx, y: fbxHips.y, z: fbxHips.z };
console.log('Chin:      ', JSON.stringify(optChin));
console.log('Groin:     ', JSON.stringify(optGroin));
console.log('LeftWrist: ', JSON.stringify(fbxLeftHand));
console.log('LeftElbow: ', JSON.stringify(fbxLeftForeArm));
console.log('LeftKnee:  ', JSON.stringify(fbxLeftLeg));

// Verify: compute bones from these markers and check directions
console.log();
console.log('=== VERIFICATION ===');
const bones = computeBonesFromMarkers(optChin, optGroin, fbxLeftHand, fbxLeftForeArm, fbxLeftLeg);
const fbxUpLeg = fbxBoneToVoxel('LeftUpLeg', sf);
const fbxShoulder = fbxBoneToVoxel('LeftShoulder', sf);
console.log('LeftUpLeg from markers:', JSON.stringify(bones.lUpLeg), '  FBX:', JSON.stringify(fbxUpLeg));
console.log('LeftShoulder from markers:', JSON.stringify(bones.lShoulder), '  FBX:', JSON.stringify(fbxShoulder));
