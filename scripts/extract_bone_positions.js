/**
 * Extract bone 3D positions (local translations + computed world positions)
 * from dribble.glb for the 15 main Mixamo bones used in voxel body rigging.
 */

const fs = require('fs');
const path = require('path');

function parseGLB(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    throw new Error('Not a valid GLB file');
  }
  const chunk0Length = buf.readUInt32LE(12);
  const chunk0Type = buf.readUInt32LE(16);
  if (chunk0Type !== 0x4E4F534A) {
    throw new Error('First chunk is not JSON');
  }
  const jsonStr = buf.toString('utf8', 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

// Quaternion multiply: q1 * q2
function quatMul(q1, q2) {
  const [x1, y1, z1, w1] = q1;
  const [x2, y2, z2, w2] = q2;
  return [
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
  ];
}

// Rotate vector by quaternion
function quatRotateVec(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // q * v * q^-1  (for unit quaternion, q^-1 = conjugate)
  const vq = [vx, vy, vz, 0];
  const qConj = [-qx, -qy, -qz, qw];
  const tmp = quatMul(q, vq);
  const result = quatMul(tmp, qConj);
  return [result[0], result[1], result[2]];
}

// Decompose a 4x4 column-major matrix into translation, rotation (quaternion), scale
function decomposeMatrix(m) {
  // m is column-major: m[col*4+row]
  const translation = [m[12], m[13], m[14]];

  // Extract scale from column vectors
  const sx = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]);
  const sy = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]);
  const sz = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);
  const scale = [sx, sy, sz];

  // Normalized rotation matrix
  const r00 = m[0]/sx, r01 = m[4]/sy, r02 = m[8]/sz;
  const r10 = m[1]/sx, r11 = m[5]/sy, r12 = m[9]/sz;
  const r20 = m[2]/sx, r21 = m[6]/sy, r22 = m[10]/sz;

  // Rotation matrix to quaternion
  const trace = r00 + r11 + r22;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (r21 - r12) * s;
    qy = (r02 - r20) * s;
    qz = (r10 - r01) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
    qw = (r21 - r12) / s;
    qx = 0.25 * s;
    qy = (r01 + r10) / s;
    qz = (r02 + r20) / s;
  } else if (r11 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
    qw = (r02 - r20) / s;
    qx = (r01 + r10) / s;
    qy = 0.25 * s;
    qz = (r12 + r21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
    qw = (r10 - r01) / s;
    qx = (r02 + r20) / s;
    qy = (r12 + r21) / s;
    qz = 0.25 * s;
  }
  const rotation = [qx, qy, qz, qw];

  return { translation, rotation, scale };
}

// Get node's local TRS
function getNodeTRS(node) {
  if (node.matrix) {
    return decomposeMatrix(node.matrix);
  }
  return {
    translation: node.translation ? [...node.translation] : [0, 0, 0],
    rotation: node.rotation ? [...node.rotation] : [0, 0, 0, 1],
    scale: node.scale ? [...node.scale] : [1, 1, 1],
  };
}

// Target bones
const TARGET_BONES = [
  'mixamorig:Hips',
  'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:Neck', 'mixamorig:Head',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot',
];

function extractBonePositions(filePath) {
  const gltf = parseGLB(filePath);
  const nodes = gltf.nodes || [];

  // Build parent map
  const parentMap = {};
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].children) {
      for (const c of nodes[i].children) {
        parentMap[c] = i;
      }
    }
  }

  // Build name -> index map
  const nameToIndex = {};
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].name) {
      nameToIndex[nodes[i].name] = i;
    }
  }

  // Compute world position by walking up the parent chain
  // World = Parent_world_transform * local_transform
  // We accumulate: for each ancestor, rotate the accumulated offset by its rotation, then add its translation
  function computeWorldPosition(nodeIndex) {
    // Build chain from root to this node
    const chain = [];
    let idx = nodeIndex;
    while (idx !== undefined) {
      chain.unshift(idx);
      idx = parentMap[idx];
    }

    // Walk down the chain accumulating world position and rotation
    let worldPos = [0, 0, 0];
    let worldRot = [0, 0, 0, 1]; // identity quaternion
    let worldScale = [1, 1, 1];

    for (const ni of chain) {
      const trs = getNodeTRS(nodes[ni]);

      // Scale the local translation by parent's accumulated scale
      const scaledT = [
        trs.translation[0] * worldScale[0],
        trs.translation[1] * worldScale[1],
        trs.translation[2] * worldScale[2],
      ];

      // Rotate local translation by accumulated world rotation
      const rotatedT = quatRotateVec(worldRot, scaledT);

      // Add to world position
      worldPos = [
        worldPos[0] + rotatedT[0],
        worldPos[1] + rotatedT[1],
        worldPos[2] + rotatedT[2],
      ];

      // Accumulate rotation
      worldRot = quatMul(worldRot, trs.rotation);

      // Accumulate scale
      worldScale = [
        worldScale[0] * trs.scale[0],
        worldScale[1] * trs.scale[1],
        worldScale[2] * trs.scale[2],
      ];
    }

    return worldPos;
  }

  // Extract data for target bones
  const results = {};
  for (const boneName of TARGET_BONES) {
    const idx = nameToIndex[boneName];
    if (idx === undefined) {
      results[boneName] = { error: 'not found' };
      continue;
    }
    const node = nodes[idx];
    const trs = getNodeTRS(node);
    const worldPos = computeWorldPosition(idx);

    results[boneName] = {
      nodeIndex: idx,
      localTranslation: trs.translation.map(v => +v.toFixed(6)),
      localRotation: trs.rotation.map(v => +v.toFixed(6)),
      localScale: trs.scale.map(v => +v.toFixed(6)),
      worldPosition: worldPos.map(v => +v.toFixed(6)),
    };
  }

  // Also show the parent chain for context
  const hierarchy = {};
  for (const boneName of TARGET_BONES) {
    const idx = nameToIndex[boneName];
    if (idx === undefined) continue;
    const chain = [];
    let ci = idx;
    while (ci !== undefined) {
      chain.unshift(nodes[ci].name || `node_${ci}`);
      ci = parentMap[ci];
    }
    hierarchy[boneName] = chain;
  }

  return { bones: results, hierarchy };
}

// Run
const glbPath = path.resolve(__dirname, '..', 'public', 'dribble.glb');
if (!fs.existsSync(glbPath)) {
  console.error(`File not found: ${glbPath}`);
  process.exit(1);
}

console.log(`Extracting bone positions from: ${path.basename(glbPath)}\n`);
const data = extractBonePositions(glbPath);

console.log('=== BONE POSITIONS (rest pose / T-pose) ===\n');
console.log(JSON.stringify(data.bones, null, 2));

console.log('\n=== PARENT CHAINS ===\n');
console.log(JSON.stringify(data.hierarchy, null, 2));
