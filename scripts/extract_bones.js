/**
 * Extract bone/skeleton hierarchy from GLB files.
 * Parses the GLB binary to extract the JSON chunk, then prints
 * all nodes with their parent-child relationships.
 */

const fs = require('fs');
const path = require('path');

function parseGLB(filePath) {
  const buf = fs.readFileSync(filePath);

  // GLB header: magic(4) + version(4) + length(4)
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) { // 'glTF'
    throw new Error('Not a valid GLB file');
  }
  const version = buf.readUInt32LE(4);
  console.log(`GLB version: ${version}`);

  // First chunk should be JSON
  const chunk0Length = buf.readUInt32LE(12);
  const chunk0Type = buf.readUInt32LE(16);
  if (chunk0Type !== 0x4E4F534A) { // 'JSON'
    throw new Error('First chunk is not JSON');
  }

  const jsonStr = buf.toString('utf8', 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

function printHierarchy(nodes, nodeIndex, indent = 0) {
  const node = nodes[nodeIndex];
  const prefix = '  '.repeat(indent);
  let info = `${prefix}[${nodeIndex}] ${node.name || '(unnamed)'}`;

  if (node.translation) info += `  pos:[${node.translation.map(v => v.toFixed(3)).join(', ')}]`;
  if (node.rotation) info += `  rot:[${node.rotation.map(v => v.toFixed(3)).join(', ')}]`;
  if (node.skin !== undefined) info += `  skin:${node.skin}`;
  if (node.mesh !== undefined) info += `  mesh:${node.mesh}`;

  console.log(info);

  if (node.children) {
    for (const childIdx of node.children) {
      printHierarchy(nodes, childIdx, indent + 1);
    }
  }
}

function extractBones(filePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`File: ${path.basename(filePath)}`);
  console.log('='.repeat(60));

  const gltf = parseGLB(filePath);
  const nodes = gltf.nodes || [];

  // Find which nodes are referenced by skins (these are the actual bones)
  const skinJoints = new Set();
  const skins = gltf.skins || [];
  console.log(`\nSkins: ${skins.length}`);
  for (let i = 0; i < skins.length; i++) {
    const skin = skins[i];
    console.log(`  Skin ${i}: "${skin.name || '(unnamed)'}", skeleton root: ${skin.skeleton}, joints: ${skin.joints.length}`);
    for (const j of skin.joints) {
      skinJoints.add(j);
    }
  }

  // Build parent map
  const parentMap = {};
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].children) {
      for (const c of nodes[i].children) {
        parentMap[c] = i;
      }
    }
  }

  // Find root nodes (no parent)
  const roots = [];
  for (let i = 0; i < nodes.length; i++) {
    if (parentMap[i] === undefined) {
      roots.push(i);
    }
  }

  // Print full hierarchy
  console.log(`\nTotal nodes: ${nodes.length}`);
  console.log(`Bone/joint nodes: ${skinJoints.size}`);
  console.log(`\n--- Full Node Hierarchy ---`);
  for (const root of roots) {
    printHierarchy(nodes, root, 0);
  }

  // Print bone-only list
  console.log(`\n--- Bone Names (from skin joints) ---`);
  const boneNames = [];
  for (const idx of skinJoints) {
    boneNames.push({ index: idx, name: nodes[idx].name || '(unnamed)' });
  }
  boneNames.sort((a, b) => a.index - b.index);
  for (const b of boneNames) {
    console.log(`  [${b.index}] ${b.name}`);
  }
}

// Process files
const files = [
  'public/dribble.glb',
  'public/rigged_clothed_body.glb',
];

const baseDir = path.resolve(__dirname, '..');

for (const f of files) {
  const fullPath = path.join(baseDir, f);
  if (fs.existsSync(fullPath)) {
    extractBones(fullPath);
  } else {
    console.log(`File not found: ${fullPath}`);
  }
}
