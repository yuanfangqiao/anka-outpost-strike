import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A deliberately small shared asset palette. Removing an instance from a scene
// must not dispose these geometries/materials: other instances still use them.
const geometries = new Map();
const materials = new Map();
const C = {
  armour: 0x65717a, light: 0xb6c0c1, edge: 0xd8ddd6, dark: 0x27313a,
  rubber: 0x1b2229, panel: 0x414d56, red: 0xba493b, orange: 0xd99043,
  gold: 0xd7ad60, sand: 0x918572, cyan: 0x57d9ee, blue: 0x5797e8,
  glow: 0xff5335, white: 0xe9e9dc, green: 0x748849,
};

function geometry(key, factory) {
  if (!geometries.has(key)) geometries.set(key, factory());
  return geometries.get(key);
}

function material(color, roughness = 0.63, metalness = 0.32, emission = 0, opacity = 1) {
  const key = `${color}/${roughness}/${metalness}/${emission}/${opacity}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    emissive: emission ? color : 0x000000,
    emissiveIntensity: emission,
    transparent: opacity < 1, opacity,
    depthWrite: opacity >= 1,
  }));
  return materials.get(key);
}

function piece(parent, shape, position, scale, color, options = {}) {
  const g = shape === 'box'
    ? geometry('bevelbox', () => new RoundedBoxGeometry(1, 1, 1, 1, 0.10))
    : shape === 'sphere'
      ? geometry('sphere', () => new THREE.SphereGeometry(1, 16, 10))
      : shape === 'ico'
        ? geometry('ico', () => new THREE.IcosahedronGeometry(1, 1))
        : shape === 'cone'
          ? geometry('cone', () => new THREE.ConeGeometry(1, 1, 10))
          : shape === 'hex'
            ? geometry('hex', () => new THREE.CylinderGeometry(1, 1, 1, 6))
            : geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 16));
  const mesh = new THREE.Mesh(g, material(color, options.roughness, options.metalness, options.glow, options.opacity));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.shadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, position, scale, color, options) {
  return piece(parent, 'box', position, scale, color, options);
}

function sphere(parent, position, scale, color, options) {
  return piece(parent, 'sphere', position, scale, color, options);
}

function cylinder(parent, position, radius, length, color, options = {}) {
  return piece(parent, 'cylinder', position, [radius, length, radius], color, options);
}

function barrel(parent, position, radius, length, color, options = {}) {
  return cylinder(parent, position, radius, length, color, {
    ...options, rotation: [Math.PI / 2, 0, 0],
  });
}

function ring(parent, position, radius, thickness, color, options = {}) {
  const key = `ring/${radius}/${thickness}/${options.segments || 20}`;
  const mesh = new THREE.Mesh(geometry(key, () => new THREE.TorusGeometry(radius, thickness, 6, options.segments || 20)),
    material(color, options.roughness, options.metalness, options.glow, options.opacity));
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.shadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function bolt(parent, position, radius = 0.016) {
  return sphere(parent, position, [radius, radius, radius], C.light, { metalness: 0.75, roughness: 0.38 });
}

// Merge static pieces by material at each articulated node. Each limb, eye/core
// group and rotor keeps its own transform; repeated instances reuse the merged
// geometry as well. This is much cheaper than one draw call per bolt.
function compact(group, modelKey, path = 'root') {
  for (const [index, child] of [...group.children].entries()) {
    if (child.isGroup) compact(child, modelKey, `${path}/${child.name || index}`);
  }
  const byMaterial = new Map();
  for (const child of group.children) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    const list = byMaterial.get(child.material) || [];
    list.push(child); byMaterial.set(child.material, list);
  }
  for (const [mat, list] of byMaterial) {
    if (list.length < 2) continue;
    const key = `merged/${modelKey}/${path}/${mat.uuid}`;
    const merged = geometry(key, () => {
      const parts = list.map(mesh => {
        mesh.updateMatrix();
        const data = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        return data.index ? data.toNonIndexed() : data;
      });
      const result = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      return result;
    });
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `${group.name || 'Part'}_${mat.color.getHexString()}`;
    mesh.castShadow = list.some(m => m.castShadow);
    mesh.receiveShadow = list.some(m => m.receiveShadow);
    group.remove(...list); group.add(mesh);
  }
  return group;
}

function gunBody(group, accent, { length = 0.36, stock = true, magazine = true } = {}) {
  box(group, [0, 0.105, 0.12], [0.12, 0.145, length], C.dark);
  box(group, [0, 0.135, 0.13], [0.135, 0.083, length * 0.84], accent);
  for (const sign of [-1, 1]) {
    box(group, [sign * 0.071, 0.105, 0.12], [0.017, 0.058, length * 0.56], C.edge, { metalness: 0.55 });
    bolt(group, [sign * 0.083, 0.125, 0.035], 0.009);
    bolt(group, [sign * 0.083, 0.125, 0.205], 0.009);
  }
  // Grip's centre is the public hand attachment origin.
  box(group, [0, -0.011, -0.015], [0.072, 0.17, 0.08], C.rubber, { rotation: [-0.17, 0, 0], metalness: 0 });
  if (magazine) box(group, [0, -0.045, 0.12], [0.075, 0.18, 0.10], C.panel, { rotation: [-0.12, 0, 0] });
  if (stock) {
    box(group, [0, 0.09, -0.15], [0.067, 0.064, 0.17], C.panel);
    box(group, [0, 0.073, -0.254], [0.107, 0.16, 0.065], accent);
    box(group, [0, 0.073, -0.287], [0.112, 0.165, 0.018], C.rubber);
  }
  for (let i = 0; i < 4; i++) box(group, [0, 0.192, 0.025 + i * 0.061], [0.076, 0.022, 0.026], C.panel);
  box(group, [0, -0.03, 0.033], [0.09, 0.018, 0.10], C.dark);
}

/** Right-hand origin, +Z barrel; sizes are stylized world metres. */
export function createWeapon(type = 'rifle', accent = 0xe65c45) {
  const aliases = { assault: 'rifle', launcher: 'rocket', 'grenade-launcher': 'grenadeLauncher', grenadelauncher: 'grenadeLauncher' };
  type = aliases[type] || type;
  if (!['rifle', 'sniper', 'shotgun', 'smg', 'rocket', 'grenadeLauncher', 'energy'].includes(type)) type = 'rifle';
  const group = new THREE.Group();
  group.name = `Weapon_${type}`;
  let muzzle = new THREE.Vector3(0, 0.11, 0.51);
  let support = new THREE.Vector3(0, 0.025, 0.25);
  if (type === 'rocket') {
    gunBody(group, accent, { length: 0.23, stock: false, magazine: false });
    barrel(group, [0, 0.16, 0.12], 0.12, 0.68, C.panel);
    barrel(group, [0, 0.16, 0.10], 0.124, 0.39, accent);
    ring(group, [0, 0.16, 0.465], 0.119, 0.021, C.edge);
    barrel(group, [0, 0.16, 0.46], 0.083, 0.022, C.rubber);
    ring(group, [0, 0.16, -0.23], 0.117, 0.019, C.dark);
    for (const sign of [-1, 1]) box(group, [sign * 0.13, 0.18, -0.14], [0.024, 0.19, 0.13], C.gold);
    box(group, [0.10, 0.325, 0.04], [0.06, 0.06, 0.14], C.dark);
    muzzle.set(0, 0.16, 0.49); support.set(0, 0.02, 0.24);
  } else if (type === 'energy') {
    gunBody(group, accent, { length: 0.35 });
    box(group, [0, 0.13, 0.34], [0.16, 0.15, 0.24], C.dark);
    for (const sign of [-1, 1]) {
      box(group, [sign * 0.09, 0.13, 0.36], [0.045, 0.105, 0.25], C.light);
      box(group, [sign * 0.115, 0.13, 0.36], [0.015, 0.025, 0.185], C.cyan, { glow: 1.4 });
    }
    barrel(group, [0, 0.13, 0.45], 0.065, 0.035, C.rubber);
    ring(group, [0, 0.13, 0.475], 0.046, 0.012, C.cyan, { glow: 1.5 });
    for (let i = 0; i < 3; i++) ring(group, [0, 0.13, 0.25 + i * 0.054], 0.060, 0.009, C.cyan, { glow: 1.0 });
    box(group, [0, -0.055, 0.13], [0.045, 0.12, 0.07], C.cyan, { glow: 0.5 });
    muzzle.set(0, 0.13, 0.49);
  } else if (type === 'grenadeLauncher') {
    gunBody(group, accent, { length: 0.30, magazine: false });
    // Oversized rotary drum makes this read differently from the shotgun.
    cylinder(group, [0, 0.015, 0.16], 0.105, 0.15, C.panel, { rotation: [0, 0, Math.PI / 2] });
    for (const sign of [-1, 1]) {
      cylinder(group, [sign * 0.084, 0.015, 0.16], 0.080, 0.022, C.gold, { rotation: [0, 0, Math.PI / 2] });
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        sphere(group, [sign * 0.097, 0.015 + Math.sin(a) * 0.056, 0.16 + Math.cos(a) * 0.056], [0.007, 0.016, 0.016], C.dark);
      }
    }
    barrel(group, [0, 0.13, 0.37], 0.078, 0.25, C.dark);
    ring(group, [0, 0.13, 0.50], 0.066, 0.015, C.light);
    barrel(group, [0, 0.13, 0.505], 0.043, 0.012, C.rubber);
    muzzle.set(0, 0.13, 0.515); support.set(0, -0.02, 0.30);
  } else {
    const short = type === 'smg';
    gunBody(group, accent, { length: short ? 0.29 : 0.37, stock: !short });
    if (short) {
      box(group, [0.075, 0.06, -0.15], [0.032, 0.05, 0.23], C.panel);
      box(group, [0.075, 0.03, -0.25], [0.042, 0.14, 0.028], C.rubber);
      barrel(group, [0, 0.115, 0.33], 0.033, 0.15, C.panel);
      ring(group, [0, 0.115, 0.412], 0.030, 0.009, C.light);
      muzzle.set(0, 0.115, 0.423); support.set(0, 0.025, 0.19);
    } else if (type === 'sniper') {
      barrel(group, [0, 0.117, 0.47], 0.026, 0.49, C.panel);
      barrel(group, [0, 0.117, 0.66], 0.043, 0.12, C.dark);
      ring(group, [0, 0.117, 0.726], 0.035, 0.009, C.light);
      box(group, [0, 0.205, 0.07], [0.055, 0.055, 0.19], C.panel);
      barrel(group, [0, 0.26, 0.09], 0.052, 0.26, C.dark);
      barrel(group, [0, 0.26, 0.228], 0.046, 0.012, C.cyan, { glow: 0.3, roughness: 0.2 });
      ring(group, [0, 0.26, 0.235], 0.048, 0.009, C.light);
      for (const sign of [-1, 1]) box(group, [sign * 0.043, 0.034, 0.36], [0.018, 0.12, 0.025], C.light, { rotation: [0, 0, sign * 0.18] });
      muzzle.set(0, 0.117, 0.74); support.set(0, 0.018, 0.26);
    } else if (type === 'shotgun') {
      barrel(group, [0, 0.13, 0.40], 0.057, 0.31, C.dark);
      barrel(group, [0, 0.047, 0.37], 0.029, 0.27, C.light);
      box(group, [0, 0.07, 0.33], [0.13, 0.11, 0.15], accent);
      for (let i = 0; i < 4; i++) box(group, [0, 0.07, 0.282 + i * 0.031], [0.142, 0.015, 0.011], C.panel);
      ring(group, [0, 0.13, 0.565], 0.049, 0.013, C.light);
      barrel(group, [0, 0.13, 0.572], 0.031, 0.009, C.rubber);
      for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) barrel(group, [sign * 0.081, 0.11, 0.04 + i * 0.052], 0.013, 0.034, C.gold);
      muzzle.set(0, 0.13, 0.585); support.set(0, 0.005, 0.34);
    } else {
      barrel(group, [0, 0.115, 0.37], 0.031, 0.27, C.panel);
      box(group, [0, 0.115, 0.325], [0.105, 0.105, 0.16], C.light);
      for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) box(group, [sign * 0.058, 0.115, 0.282 + i * 0.041], [0.009, 0.041, 0.020], C.dark);
      barrel(group, [0, 0.115, 0.495], 0.044, 0.06, C.dark);
      ring(group, [0, 0.115, 0.53], 0.035, 0.010, C.light);
      box(group, [0, 0.215, 0.10], [0.055, 0.05, 0.07], C.dark);
      muzzle.set(0, 0.115, 0.545);
    }
  }
  const muzzleNode = new THREE.Object3D();
  muzzleNode.name = 'Muzzle'; muzzleNode.position.copy(muzzle); group.add(muzzleNode);
  const gripNode = new THREE.Object3D();
  gripNode.name = 'LeftGrip'; gripNode.position.copy(support); group.add(gripNode);
  group.userData = { type, muzzle, muzzleNode, leftGrip: support, leftGripNode: gripNode,
    handGrip: new THREE.Vector3(0, 0, 0), forward: new THREE.Vector3(0, 0, 1) };
  return compact(group, `weapon/${type}/${accent}`);
}

function eye(parent, x, y, z, radius = 0.051, color = C.glow) {
  barrel(parent, [x, y, z], radius * 1.42, 0.038, C.rubber);
  barrel(parent, [x, y, z + 0.023], radius, 0.015, color, { glow: 2.6, roughness: 0.26, metalness: 0.1 });
  sphere(parent, [x - radius * 0.25, y + radius * 0.28, z + 0.033], [radius * 0.22, radius * 0.22, 0.003], C.white, { glow: 0.8, shadow: false });
}

function core(parent, y, z, radius = 0.095, color = C.glow) {
  const node = new THREE.Group();
  node.name = 'ReactorCore'; node.position.set(0, y, z); parent.add(node);
  barrel(node, [0, 0, 0], radius * 1.45, 0.055, C.dark);
  ring(node, [0, 0, 0.035], radius * 1.13, radius * 0.16, C.gold);
  sphere(node, [0, 0, 0.037], [radius, radius, radius * 0.32], color, { glow: 1.9, metalness: 0.15 });
  return node;
}

function robotLeg(parent, sign, bulky) {
  const leg = new THREE.Group();
  leg.name = sign < 0 ? 'Leg_R' : 'Leg_L';
  leg.position.set(sign * 0.168, 0.47, 0);
  parent.add(leg);
  sphere(leg, [0, -0.025, 0], [0.089, 0.105, 0.091], C.rubber);
  box(leg, [0, -0.105, 0.002], [0.14, 0.15, 0.15], C.armour);
  sphere(leg, [0, -0.215, 0.018], [0.09, 0.07, 0.09], C.dark);
  box(leg, [0, -0.213, 0.088], [0.14, 0.105, 0.042], bulky ? C.red : C.light);
  box(leg, [0, -0.325, 0.005], [0.145, 0.17, 0.14], C.panel);
  box(leg, [0, -0.398, 0.071], [0.205, 0.14, 0.28], C.armour);
  box(leg, [0, -0.449, 0.071], [0.215, 0.034, 0.29], C.rubber);
  box(leg, [0, -0.389, 0.212], [0.15, 0.043, 0.015], C.gold);
  leg.userData.sign = sign;
  return leg;
}

function robotArm(parent, sign, type) {
  const arm = new THREE.Group();
  arm.name = sign < 0 ? 'Arm_R' : 'Arm_L';
  arm.position.set(sign * 0.328, 1.0, 0.005);
  parent.add(arm);
  sphere(arm, [0, 0, 0], [0.117, 0.12, 0.12], C.dark);
  sphere(arm, [sign * 0.024, 0.008, 0.015], [0.135, 0.125, 0.12], type === 'elite' || type === 'boss' ? C.red : C.armour);
  box(arm, [0, -0.145, 0.008], [0.14, 0.20, 0.15], C.panel);
  sphere(arm, [0, -0.25, 0.015], [0.081, 0.075, 0.085], C.rubber);
  box(arm, [0, -0.335, 0.026], [0.17, 0.17, 0.19], C.armour);
  box(arm, [0, -0.43, 0.042], [0.16, 0.082, 0.14], C.dark);
  for (let i = 0; i < 3; i++) box(arm, [-0.043 + i * 0.043, -0.435, 0.12], [0.027, 0.053, 0.04], C.light);
  arm.userData.sign = sign;
  return arm;
}

function armCannon(arm, large = false) {
  const z = large ? 0.20 : 0.15;
  box(arm, [0, -0.32, 0.10], [large ? 0.19 : 0.15, 0.15, 0.28], C.dark);
  barrel(arm, [0, -0.32, z], large ? 0.075 : 0.047, 0.25, C.panel);
  ring(arm, [0, -0.32, z + 0.137], large ? 0.063 : 0.039, 0.012, C.gold);
  barrel(arm, [0, -0.32, z + 0.14], large ? 0.036 : 0.022, 0.012, C.glow, { glow: 1.8 });
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.32, z + 0.16); arm.add(muzzle);
  return muzzle;
}

function biped(type) {
  const group = new THREE.Group();
  const visual = new THREE.Group(); group.add(visual);
  const bulky = type === 'elite' || type === 'boss';
  const torso = new THREE.Group(); torso.name = 'Torso'; visual.add(torso);
  sphere(torso, [0, 0.79, -0.01], [bulky ? 0.34 : 0.285, 0.31, 0.235], C.armour);
  box(torso, [0, 0.65, 0.03], [0.43, 0.15, 0.32], C.dark);
  for (const sign of [-1, 1]) {
    box(torso, [sign * 0.182, 0.85, 0.166], [0.14, 0.215, 0.105], bulky ? C.red : C.light, { rotation: [0, sign * 0.18, sign * 0.10] });
    bolt(torso, [sign * 0.197, 0.895, 0.225], 0.016);
    box(torso, [sign * 0.125, 0.59, 0.179], [0.063, 0.045, 0.023], C.gold);
  }
  const reactor = core(torso, 0.83, 0.224, bulky ? 0.115 : 0.087);
  box(torso, [0, 0.85, -0.238], [0.30, 0.28, 0.10], C.panel);
  for (const sign of [-1, 1]) cylinder(torso, [sign * 0.13, 0.88, -0.275], 0.052, 0.27, C.light);
  const head = new THREE.Group(); head.name = 'Head'; head.position.set(0, 1.167, 0.018); torso.add(head);
  box(head, [0, 0, 0], [0.39, 0.30, 0.33], C.dark);
  sphere(head, [0, 0.038, -0.012], [0.218, 0.178, 0.185], type === 'sniper' ? C.panel : C.armour);
  box(head, [0, -0.025, 0.137], [0.355, 0.15, 0.078], C.rubber);
  eye(head, -0.094, -0.015, 0.182, 0.047);
  eye(head, 0.094, -0.015, 0.182, 0.047);
  box(head, [0, -0.11, 0.14], [0.125, 0.05, 0.07], C.light);
  for (let i = 0; i < 3; i++) box(head, [-0.035 + i * 0.035, -0.113, 0.179], [0.009, 0.024, 0.012], C.dark);
  cylinder(head, [0, 0.213, 0], 0.017, 0.10, C.dark);
  sphere(head, [0, 0.270, 0], [0.035, 0.035, 0.035], C.red, { glow: 0.4 });
  const legs = [-1, 1].map(sign => robotLeg(visual, sign, bulky));
  const arms = [-1, 1].map(sign => robotArm(torso, sign, type));
  let muzzle = armCannon(arms[0], bulky);
  if (type === 'sniper') {
    barrel(arms[0], [0, -0.32, 0.36], 0.028, 0.35, C.dark);
    ring(arms[0], [0, -0.32, 0.545], 0.030, 0.009, C.red);
    muzzle.position.z = 0.56;
    barrel(head, [0.095, 0.082, 0.165], 0.051, 0.075, C.dark);
    barrel(head, [0.095, 0.082, 0.207], 0.031, 0.010, C.cyan, { glow: 1.3 });
    cylinder(torso, [0.17, 1.18, -0.25], 0.009, 0.36, C.dark);
  }
  if (type === 'shield') {
    const shield = new THREE.Group(); shield.name = 'Shield';
    shield.position.set(-0.16, -0.24, 0.24); arms[1].add(shield);
    box(shield, [0, 0, 0], [0.44, 0.61, 0.09], C.dark);
    box(shield, [0, 0, 0.053], [0.37, 0.53, 0.035], C.blue, { metalness: 0.35, roughness: 0.28 });
    box(shield, [0, 0, 0.079], [0.29, 0.43, 0.012], C.cyan, { glow: 0.3, opacity: 0.5 });
    for (const sign of [-1, 1]) box(shield, [sign * 0.19, 0, 0.057], [0.025, 0.53, 0.025], C.gold);
    box(shield, [0, 0, 0.09], [0.028, 0.49, 0.015], C.cyan, { glow: 1.0 });
    group.userData.shield = shield;
  }
  if (bulky) {
    for (const sign of [-1, 1]) {
      box(torso, [sign * 0.34, 1.078, 0], [0.24, 0.20, 0.30], C.red, { rotation: [0, 0, sign * -0.10] });
      box(torso, [sign * 0.35, 1.085, 0.155], [0.17, 0.058, 0.014], C.light);
      cylinder(torso, [sign * 0.24, 1.15, -0.21], 0.068, 0.26, C.dark);
      piece(torso, 'cone', [sign * 0.24, 1.305, -0.21], [0.068, 0.08, 0.068], C.orange);
    }
    armCannon(arms[1], true);
  }
  if (type === 'boss') {
    group.scale.setScalar(2.25);
    for (const sign of [-1, 1]) {
      box(torso, [sign * 0.26, 0.78, 0.12], [0.14, 0.30, 0.18], C.light, { rotation: [0, 0, sign * 0.22] });
      box(head, [sign * 0.16, 0.13, 0], [0.11, 0.105, 0.25], C.red, { rotation: [0, 0, sign * -0.15] });
    }
  }
  const size = type === 'boss' ? 2.25 : 0.94;
  group.scale.setScalar(size);
  group.userData = { ...group.userData, type, visual, torso, head, core: reactor, legs, arms, muzzle,
    radius: (bulky ? 0.52 : 0.44) * size, aimHeight: 0.84 * size,
    hover: false, height: 1.47 * size, phase: Math.random() * Math.PI * 2 };
  return group;
}

function bomber() {
  const group = new THREE.Group();
  const visual = new THREE.Group(); group.add(visual);
  sphere(visual, [0, 0.57, 0], [0.40, 0.39, 0.36], C.red);
  sphere(visual, [0, 0.57, -0.02], [0.33, 0.35, 0.37], C.panel);
  for (const sign of [-1, 1]) box(visual, [sign * 0.285, 0.60, 0], [0.065, 0.42, 0.50], C.orange, { rotation: [0, 0, sign * -0.12] });
  const reactor = core(visual, 0.54, 0.335, 0.14);
  eye(visual, -0.13, 0.74, 0.28, 0.046);
  eye(visual, 0.13, 0.74, 0.28, 0.046);
  cylinder(visual, [0, 1.0, 0], 0.026, 0.12, C.dark);
  sphere(visual, [0, 1.085, 0], [0.06, 0.05, 0.06], C.glow, { glow: 1.4 });
  const legs = [];
  for (const sign of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sign * 0.19, 0.245, 0); visual.add(leg);
    sphere(leg, [0, 0, 0], [0.09, 0.09, 0.09], C.dark);
    box(leg, [0, -0.09, 0], [0.11, 0.15, 0.11], C.armour);
    box(leg, [0, -0.205, 0.07], [0.19, 0.08, 0.25], C.dark);
    leg.userData.sign = sign; legs.push(leg);
  }
  group.userData = { type: 'bomber', visual, core: reactor, legs, arms: [], hover: false,
    radius: 0.45, aimHeight: 0.59, height: 1.14, phase: Math.random() * Math.PI * 2 };
  return group;
}

function drone() {
  const group = new THREE.Group();
  const visual = new THREE.Group(); group.add(visual);
  sphere(visual, [0, 0.37, 0], [0.27, 0.165, 0.245], C.armour);
  box(visual, [0, 0.39, 0.14], [0.33, 0.15, 0.21], C.dark);
  eye(visual, -0.073, 0.39, 0.255, 0.038);
  eye(visual, 0.073, 0.39, 0.255, 0.038);
  const reactor = core(visual, 0.28, 0.18, 0.067);
  const rotors = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const px = x * 0.36, pz = z * 0.25;
    box(visual, [px * 0.56, 0.39, pz * 0.56], [0.32, 0.046, 0.045], C.panel, { rotation: [0, -Math.atan2(pz, px), 0] });
    ring(visual, [px, 0.44, pz], 0.147, 0.024, C.dark, { rotation: [Math.PI / 2, 0, 0] });
    cylinder(visual, [px, 0.44, pz], 0.038, 0.085, C.red);
    const rotor = new THREE.Group(); rotor.position.set(px, 0.456, pz); visual.add(rotor);
    box(rotor, [0, 0, 0], [0.235, 0.012, 0.032], C.light);
    box(rotor, [0, 0, 0], [0.032, 0.012, 0.235], C.light);
    rotors.push(rotor);
  }
  for (const sign of [-1, 1]) {
    barrel(visual, [sign * 0.22, 0.17, 0.05], 0.042, 0.27, C.dark);
    ring(visual, [sign * 0.22, 0.17, 0.20], 0.038, 0.009, C.orange);
    piece(visual, 'cone', [sign * 0.15, 0.65, -0.05], [0.035, 0.28, 0.10], C.red, { rotation: [0, 0, sign * -0.25] });
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.22, 0.28); visual.add(muzzle);
  group.userData = { type: 'drone', visual, core: reactor, legs: [], arms: [], rotors, muzzle,
    hover: true, radius: 0.56, aimHeight: 0.37, height: 0.72, phase: Math.random() * Math.PI * 2 };
  return group;
}

export function createRobot(type = 'walker') {
  if (!['walker', 'sniper', 'drone', 'bomber', 'shield', 'elite', 'boss'].includes(type)) type = 'walker';
  const robot = type === 'drone' ? drone() : type === 'bomber' ? bomber() : biped(type);
  robot.name = `Robot_${type}`;
  return compact(robot, `robot/${type}`);
}

/** Local joints only. Enemy navigation remains entirely in the game controller. */
export function animateRobot(robot, time, speed = 0) {
  const d = robot.userData;
  const phase = time * (d.type === 'boss' ? 4.8 : 7.3) + d.phase;
  const move = THREE.MathUtils.clamp(Math.abs(speed) / 3.2, 0, 1);
  if (d.hover) {
    d.visual.position.y = Math.sin(time * 2.3 + d.phase) * 0.055;
    d.visual.rotation.z = Math.sin(time * 1.7 + d.phase) * 0.035;
    for (const [i, rotor] of d.rotors.entries()) rotor.rotation.y = time * 30 * (i % 2 ? 1 : -1);
  } else {
    d.visual.position.y = Math.abs(Math.sin(phase)) * 0.020 * move;
    for (const leg of d.legs) leg.rotation.x = Math.sin(phase + (leg.userData.sign > 0 ? Math.PI : 0)) * 0.48 * move;
    for (const arm of d.arms) {
      const rest = d.isShooting && arm.userData.sign < 0 ? -0.65 : 0;
      arm.rotation.x = rest + Math.sin(phase + (arm.userData.sign < 0 ? Math.PI : 0)) * 0.25 * move;
    }
    if (d.head) d.head.rotation.y = Math.sin(time * 1.05 + d.phase) * 0.025 * (1 - move);
  }
  const pulse = d.type === 'bomber' ? 1 + Math.sin(time * 9) * 0.04 : 1 + Math.sin(time * 2.5 + d.phase) * 0.025;
  d.core.scale.setScalar(pulse);
}

export function createGrenade(kind = 'grenade') {
  const group = new THREE.Group(); group.name = `Grenade_${kind}`;
  const color = kind === 'energy' ? C.blue : kind === 'smoke' ? C.sand : C.green;
  sphere(group, [0, 0, 0], [0.10, 0.12, 0.10], color, { metalness: 0.4 });
  for (const y of [-0.066, 0, 0.066]) ring(group, [0, y, 0], y ? 0.085 : 0.101, 0.007, C.dark, { rotation: [Math.PI / 2, 0, 0] });
  cylinder(group, [0, 0.128, 0], 0.04, 0.065, C.dark);
  box(group, [0.04, 0.12, 0], [0.025, 0.17, 0.04], C.light, { rotation: [0, 0, -0.3] });
  ring(group, [-0.034, 0.168, 0], 0.029, 0.006, C.gold);
  if (kind === 'energy') sphere(group, [0, 0, 0.09], [0.033, 0.06, 0.023], C.cyan, { glow: 1.4 });
  group.userData = { type: kind, radius: 0.12 };
  return compact(group, `grenade/${kind}`);
}

export function createPickup(kind = 'health') {
  if (!['health', 'ammo', 'shield', 'grenade'].includes(kind)) kind = 'health';
  const group = new THREE.Group(); group.name = `Pickup_${kind}`;
  const visual = new THREE.Group(); visual.position.y = 0.34; group.add(visual);
  const color = { health: 0x66bf80, ammo: C.gold, shield: C.cyan, grenade: C.green }[kind];
  ring(group, [0, 0.016, 0], 0.24, 0.013, color, { rotation: [Math.PI / 2, 0, 0], glow: 0.5, shadow: false });
  if (kind === 'health') {
    box(visual, [0, 0, 0], [0.36, 0.29, 0.22], C.white, { metalness: 0.06 });
    box(visual, [0, 0.15, 0], [0.28, 0.04, 0.24], C.red);
    box(visual, [0, 0.196, 0], [0.15, 0.052, 0.065], C.dark);
    for (const sign of [-1, 1]) {
      box(visual, [0, 0, sign * 0.118], [0.071, 0.195, 0.014], C.red, { metalness: 0.05 });
      box(visual, [0, 0, sign * 0.122], [0.195, 0.068, 0.015], C.red, { metalness: 0.05 });
    }
  } else if (kind === 'ammo') {
    box(visual, [0, -0.03, 0], [0.36, 0.25, 0.25], C.panel);
    box(visual, [0, 0.10, 0], [0.38, 0.055, 0.27], C.gold);
    box(visual, [0, -0.03, 0.133], [0.20, 0.08, 0.012], C.gold);
    for (let i = 0; i < 3; i++) {
      cylinder(visual, [-0.095 + i * 0.095, 0.19, 0], 0.027, 0.14, C.gold);
      piece(visual, 'cone', [-0.095 + i * 0.095, 0.275, 0], [0.027, 0.04, 0.027], C.light);
    }
  } else if (kind === 'shield') {
    piece(visual, 'hex', [0, 0, 0], [0.22, 0.065, 0.22], C.dark, { rotation: [Math.PI / 2, 0, 0] });
    piece(visual, 'hex', [0, 0, 0.043], [0.18, 0.022, 0.18], C.blue, { rotation: [Math.PI / 2, 0, 0] });
    piece(visual, 'hex', [0, 0, 0.057], [0.13, 0.008, 0.13], C.cyan, { rotation: [Math.PI / 2, 0, 0], glow: 0.75 });
    box(visual, [0, 0, 0.068], [0.029, 0.23, 0.009], C.white, { glow: 0.3 });
  } else {
    visual.add(createGrenade());
    visual.rotation.z = -0.18;
  }
  group.userData = { type: kind, kind, visual, radius: 0.38, floatHeight: 0.34 };
  return compact(group, `pickup/${kind}`);
}

export function animatePickup(pickup, time) {
  pickup.userData.visual.position.y = pickup.userData.floatHeight + Math.sin(time * 2.1) * 0.065;
  pickup.userData.visual.rotation.y = time * 0.75;
}

/** Call once only after all combat asset instances have left the scene. */
export function disposeSharedCombatAssets() {
  for (const geometry of geometries.values()) geometry.dispose();
  for (const material of materials.values()) material.dispose();
  geometries.clear(); materials.clear();
}
