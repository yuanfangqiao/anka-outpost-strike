import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The same combat lanes support all four biomes; every solid obstacle is authored
// with its collider so theme changes cannot leave invisible walls behind.
const THEMES = {
  desert: {
    title: '砂岩前哨', sky: 0x9fd7f3, fog: 0xd8b899, ground: 0xd8ac6b, key: 0xffe4ba,
    wall: 0xc18b50, wallLight: 0xdfb47a, wallDark: 0x93643c, roof: 0xa97642,
    stone: 0xad7648, stoneLight: 0xc7935c, stoneDark: 0x86563b,
    wood: 0x91603b, woodLight: 0xb77d42, metal: 0x475563, dark: 0x293844,
    accent: 0xc86f40, fabric: 0xb66e3d, glass: 0x41727d, glow: 0x71d6cf,
    plant: 0x789751, plantLight: 0x9baf5b, plantDark: 0x456546, dust: 0xecd0a0,
  },
  jungle: {
    title: '雨林遗迹', sky: 0xb1d9c5, fog: 0x8baf97, ground: 0x7a8d59, key: 0xe7f0c6,
    wall: 0x80916f, wallLight: 0xb5b493, wallDark: 0x586b59, roof: 0x627d58,
    stone: 0x697b64, stoneLight: 0x9ba080, stoneDark: 0x485e51,
    wood: 0x70563b, woodLight: 0x99804c, metal: 0x4b6767, dark: 0x243f3d,
    accent: 0xd6a74f, fabric: 0x79864b, glass: 0x486f71, glow: 0x89e5c3,
    plant: 0x386e47, plantLight: 0x6d9a4f, plantDark: 0x24513d, dust: 0xb0b57b,
  },
  snow: {
    title: '霜原要塞', sky: 0xc4e1f2, fog: 0xc7dce9, ground: 0xe3edf0, key: 0xe7f2ff,
    wall: 0x899fb1, wallLight: 0xc0d2dc, wallDark: 0x5c748d, roof: 0xdbe7eb,
    stone: 0x879dad, stoneLight: 0xb9cfda, stoneDark: 0x617b90,
    wood: 0x747f85, woodLight: 0xa3b2b8, metal: 0x53677d, dark: 0x2c3e56,
    accent: 0xc48551, fabric: 0x7b9da8, glass: 0x395f79, glow: 0x85dfee,
    plant: 0x486b6b, plantLight: 0xaec9c7, plantDark: 0x345559, dust: 0xf4f7f5,
  },
  city: {
    title: '霓虹禁区', sky: 0x17253b, fog: 0x26354d, ground: 0x3b4658, key: 0xa8c8f2,
    wall: 0x47566e, wallLight: 0x71829a, wallDark: 0x303d52, roof: 0x35435b,
    stone: 0x3a4960, stoneLight: 0x586981, stoneDark: 0x26344b,
    wood: 0x58606b, woodLight: 0x7e8795, metal: 0x647b91, dark: 0x1b2a40,
    accent: 0xe18cb3, fabric: 0x4c7f9b, glass: 0x30677d, glow: 0x6ae3e9,
    plant: 0x4c8a89, plantLight: 0x7dc3b0, plantDark: 0x2d6768, dust: 0x71829b,
  },
};

export const WORLD_THEMES = Object.freeze(Object.keys(THEMES));

function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createWorld(theme = 'desert') {
  if (!THEMES[theme]) theme = 'desert';
  const palette = THEMES[theme];
  const random = randomGenerator(8713 + WORLD_THEMES.indexOf(theme) * 1337);
  const group = new THREE.Group();
  group.name = `world_${theme}`;
  const colliders = [];
  const batches = new Map();
  const cachedGeometries = new Map();
  const animated = [];
  const materials = {};
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const geometryKeys = [];

  for (const [name, color] of Object.entries(palette)) {
    if (typeof color !== 'number') continue;
    const metallic = ['metal', 'dark', 'glass'].includes(name);
    materials[name] = new THREE.MeshStandardMaterial({
      color,
      roughness: name === 'glass' ? 0.35 : metallic ? 0.62 : 0.94,
      metalness: name === 'metal' ? 0.42 : name === 'dark' ? 0.15 : 0,
    });
    materials[name].name = `world_${theme}_${name}`;
  }
  materials.glow.emissive.set(palette.glow);
  materials.glow.emissiveIntensity = theme === 'city' ? 1.6 : 0.5;
  materials.signal = new THREE.MeshStandardMaterial({
    color: theme === 'city' ? 0xf4b782 : 0xecd18a,
    emissive: theme === 'city' ? 0xee8554 : 0xc17b2c,
    emissiveIntensity: theme === 'city' ? 1.0 : 0.24, roughness: 0.72,
  });

  function cached(key, make) {
    if (!cachedGeometries.has(key)) {
      cachedGeometries.set(key, make());
      geometryKeys.push(key);
    }
    return cachedGeometries.get(key);
  }

  const unitBox = cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  const softBox = cached('soft-box', () => new RoundedBoxGeometry(1, 1, 1, 1, 0.075));
  const cylinderShape = cached('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 12));
  const rockShape = cached('rock', () => new THREE.IcosahedronGeometry(1, 0));
  const pebbleShape = cached('pebble', () => new THREE.DodecahedronGeometry(1, 0));

  function geometry(geom, mat, xyz, scaling = [1, 1, 1], rotation = [0, 0, 0]) {
    let copy = geom.clone();
    if (copy.index) {
      const expanded = copy.toNonIndexed();
      copy.dispose();
      copy = expanded;
    }
    for (const name of Object.keys(copy.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
    }
    if (!copy.attributes.normal) copy.computeVertexNormals();
    if (!copy.attributes.uv) copy.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(copy.attributes.position.count * 2), 2));
    position.fromArray(xyz); scaleVector.fromArray(scaling);
    quaternion.setFromEuler(euler.set(...rotation));
    matrix.compose(position, quaternion, scaleVector);
    copy.applyMatrix4(matrix);
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(copy);
  }

  function box(x, y, z, width, height, depth, material = 'wall', soften = false, rotationY = 0) {
    geometry(soften ? softBox : unitBox, material, [x, y, z], [width, height, depth], [0, rotationY, 0]);
  }

  function cylinder(x, y, z, radius, height, material = 'metal', rotation = [0, 0, 0]) {
    geometry(cylinderShape, material, [x, y, z], [radius, height, radius], rotation);
  }

  function pole(a, b, radius, material = 'metal') {
    const delta = new THREE.Vector3().subVectors(b, a);
    const middle = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
    const angles = new THREE.Euler().setFromQuaternion(rotation);
    geometry(cylinderShape, material, middle.toArray(), [radius, delta.length(), radius], angles.toArray().slice(0, 3));
  }

  function collider(x, z, width, depth, height, label) {
    colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height, label });
  }

  function shadowPatch(x, z, width, depth) {
    box(x, 0.014, z, width, 0.018, depth, 'wallDark', true);
  }

  function crate(x, z, size = 1.45, height = size, angle = 0, painted = false) {
    box(x, height / 2, z, size, height, size, painted ? 'fabric' : 'wood', true, angle);
    const c = Math.cos(angle), s = Math.sin(angle);
    const local = (dx, dy, dz, w, h, d, mat) => box(x + dx * c + dz * s, dy, z - dx * s + dz * c, w, h, d, mat, false, angle);
    const strip = Math.max(0.08, size * 0.09);
    for (const side of [-1, 1]) {
      for (const edge of [-1, 1]) {
        local(side * (size / 2 - strip / 2), height / 2, edge * (size / 2 + 0.012), strip, height, 0.055, 'woodLight');
        local(edge * (size / 2 + 0.012), height / 2, side * (size / 2 - strip / 2), 0.055, height, strip, 'woodLight');
      }
      local(0, height - strip / 2, side * (size / 2 + 0.02), size, strip, 0.07, 'woodLight');
      local(0, strip / 2, side * (size / 2 + 0.02), size, strip, 0.07, 'woodLight');
      local(0, height / 2, side * (size / 2 + 0.025), size * 0.85, strip * 0.65, 0.05, 'metal');
      local(side * (size / 2 - strip / 2), height + 0.024, 0, strip, 0.05, size, 'metal');
    }
    const extent = Math.abs(c) * size + Math.abs(s) * size;
    collider(x, z, extent, extent, height, 'cargo-crate');
  }

  function barrel(x, z, red = false) {
    cylinder(x, 0.57, z, 0.43, 1.12, red ? 'accent' : 'metal');
    for (const y of [0.11, 0.92, 1.12]) cylinder(x, y, z, 0.447, 0.065, 'dark');
    cylinder(x, 1.149, z, 0.36, 0.018, red ? 'accent' : 'wallLight');
    cylinder(x + 0.18, 1.166, z + 0.08, 0.057, 0.025, 'dark');
    box(x, 0.63, z + 0.435, 0.31, 0.32, 0.016, 'signal', true);
    collider(x, z, 0.9, 0.9, 1.16, 'barrel');
  }

  function sandbags(x, z, length = 4.7, turn = false) {
    const columns = Math.round(length / 0.78);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < columns; i++) {
        const offset = (i - (columns - 1) / 2) * 0.75 + (row % 2) * 0.21;
        box(x + (turn ? 0 : offset), 0.25 + row * 0.39, z + (turn ? offset : 0), turn ? 0.72 : 0.88, 0.44, turn ? 0.88 : 0.72, i % 3 ? 'wallLight' : 'wall', true);
      }
    }
    collider(x + (turn ? 0 : 0.1), z + (turn ? 0.1 : 0), turn ? 0.9 : length + 0.2, turn ? length + 0.2 : 0.9, 0.9, 'sandbag-cover');
  }

  function facadeDoor(x, z, height, width = 1.5) {
    box(x, height / 2, z, width + 0.3, height + 0.15, 0.09, 'wallDark');
    box(x, height / 2, z + 0.065, width, height, 0.06, theme === 'city' ? 'metal' : 'wood');
    for (const side of [-1, 1]) box(x + side * width * 0.38, height / 2, z + 0.106, 0.055, height * 0.92, 0.025, 'dark');
    for (const y of [0.35, height - 0.4]) box(x, y, z + 0.11, width * 0.95, 0.13, 0.04, 'metal');
    box(x + width * 0.25, height * 0.48, z + 0.15, 0.09, 0.12, 0.08, 'signal', true);
    box(x, height + 0.18, z + 0.08, width + 0.45, 0.2, 0.22, 'wallLight');
  }

  function window(x, y, z, width = 1.15, height = 0.8) {
    box(x, y, z, width + 0.22, height + 0.22, 0.12, 'wallDark');
    box(x, y, z + 0.075, width, height, 0.04, 'glass');
    box(x, y, z + 0.105, 0.075, height, 0.035, 'metal');
    box(x, y, z + 0.107, width, 0.075, 0.035, 'metal');
    box(x - width * 0.22, y + height * 0.22, z + 0.11, width * 0.22, 0.035, 0.016, 'wallLight');
    box(x, y - height / 2 - 0.12, z + 0.14, width + 0.42, 0.16, 0.25, 'wallLight');
  }

  function barracks(x, z, width, depth, height, variant = 0) {
    shadowPatch(x, z, width + 0.25, depth + 0.25);
    box(x, height / 2, z, width, height, depth, variant % 2 ? 'wallLight' : 'wall', true);
    box(x, 0.23, z, width + 0.18, 0.46, depth + 0.18, 'wallDark', true);
    box(x, height - 0.16, z, width + 0.35, 0.28, depth + 0.35, 'wallDark');
    box(x, height + 0.08, z, width + 0.5, 0.28, depth + 0.5, 'roof', true);
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.floor(width / 1.15); i++) {
        const dx = (i - (Math.floor(width / 1.15) - 1) / 2) * 1.15;
        box(x + dx, height + 0.47, z + side * (depth / 2 - 0.12), 0.65, 0.65, 0.48, theme === 'snow' ? 'dust' : 'wallLight', true);
      }
      box(x + side * (width / 2 - 0.12), height + 0.42, z, 0.46, 0.54, depth, 'wallLight');
    }
    const face = z + depth / 2 + 0.025;
    facadeDoor(x - width * 0.15, face, 2.05);
    window(x + width * 0.29, 2.1, face, width > 7 ? 1.6 : 1.05, 0.85);
    box(x + width * 0.29, 2.95, face + 0.1, 1.45, 0.16, 0.1, 'accent');
    // Accent panels and roof equipment break up large facade masses.
    box(x - width * 0.34, 2.32, face + 0.09, 0.45, 0.85, 0.12, 'fabric', true);
    box(x + width * 0.2, height + 0.47, z - depth * 0.12, 1.1, 0.7, 1.0, 'metal', true);
    for (let i = 0; i < 4; i++) box(x + width * 0.2 - 0.34 + i * 0.23, height + 0.47, z - depth * 0.12 + 0.515, 0.075, 0.4, 0.015, 'dark');
    pole(new THREE.Vector3(x - width * 0.27, height + 0.2, z - 0.7), new THREE.Vector3(x - width * 0.27, height + 2.0, z - 0.7), 0.045, 'metal');
    cylinder(x - width * 0.27, height + 1.85, z - 0.7, 0.11, 0.26, 'signal');
    for (const side of [-1, 1]) {
      box(x + side * (width / 2 - 0.2), height * 0.48, face + 0.05, 0.28, height * 0.9, 0.14, 'wallDark');
      box(x + side * (width / 2 - 0.2), height * 0.53, face + 0.14, 0.12, height * 0.7, 0.08, 'wallLight');
    }
    if (theme === 'snow') box(x, height + 0.25, z, width + 0.42, 0.13, depth + 0.42, 'dust', true);
    if (theme === 'city') {
      box(x, height - 0.32, face + 0.2, width * 0.88, 0.065, 0.05, 'glow');
      for (let i = 0; i < 3; i++) box(x + width * 0.29, 1.8 + i * 0.24, face + 0.14, 1.25, 0.03, 0.03, 'glow');
    }
    collider(x, z, width + 0.1, depth + 0.1, height + 0.65, 'barracks');
  }

  function flag(x, y, z, sign = 1) {
    pole(new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3(x, y + 1.5, z), 0.045, 'metal');
    const clothGeometry = new THREE.PlaneGeometry(1.15, 0.6, 6, 2);
    const points = clothGeometry.attributes.position;
    for (let i = 0; i < points.count; i++) points.setZ(i, Math.sin(points.getX(i) * 5) * 0.09);
    clothGeometry.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeometry, materials.accent);
    cloth.material.side = THREE.DoubleSide;
    cloth.position.set(x + sign * 0.58, y + 1.07, z);
    cloth.rotation.y = sign * 0.2;
    cloth.castShadow = true;
    cloth.name = 'wind-banner';
    group.add(cloth);
    animated.push({ object: cloth, type: 'flag', phase: x * 0.7 + z, base: cloth.rotation.y });
  }

  function watchtower(x, z, sign) {
    box(x, 0.17, z, 3.4, 0.34, 3.5, 'wallDark', true);
    box(x, 1.9, z, 2.8, 3.45, 2.7, 'wall', true);
    box(x, 3.52, z, 3.5, 0.35, 3.4, 'wallLight');
    box(x, 4.0, z, 3.25, 0.65, 3.1, 'wallDark');
    for (const dx of [-1.45, 1.45]) {
      for (const dz of [-1.35, 1.35]) box(x + dx, 4.66, z + dz, 0.18, 1.65, 0.18, 'wood');
    }
    for (const side of [-1, 1]) {
      box(x, 4.28, z + side * 1.48, 3.35, 0.14, 0.15, 'metal');
      box(x + side * 1.56, 4.28, z, 0.15, 0.14, 3.1, 'metal');
    }
    const canopy = cached('tower-canopy', () => new THREE.ConeGeometry(2.65, 0.8, 4, 1, false, Math.PI / 4));
    geometry(canopy, theme === 'snow' ? 'dust' : 'fabric', [x, 5.37, z], [1, 1, 0.95]);
    box(x, 4.72, z - 0.24, 1.48, 0.31, 0.55, 'dark', true);
    box(x, 4.83, z - 0.55, 0.58, 0.13, 0.28, 'metal');
    window(x, 2.5, z + 1.39, 0.75, 0.42);
    for (let i = 0; i < 8; i++) box(x + sign * 1.43, 0.35 + i * 0.37, z, 0.06, 0.07, 0.66, 'woodLight');
    for (const dz of [-0.35, 0.35]) box(x + sign * 1.43, 1.65, z + dz, 0.1, 3.05, 0.08, 'wood');
    flag(x + sign * 1.0, 5.3, z - 0.75, sign);
    collider(x, z, 3.0, 2.95, 5.8, 'watchtower');
  }

  function palm(x, z, height = 5.0) {
    const bend = 0.38;
    const stem = cached('palm-trunk', () => new THREE.CylinderGeometry(0.72, 1.0, 1, 7, 4));
    geometry(stem, 'wood', [x + bend / 2, height / 2, z], [0.23, height, 0.23], [0, 0, -bend / height]);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + x;
      const points = [
        [0, 0, 0], [Math.cos(angle) * 1.05, 0.22, Math.sin(angle) * 1.05],
        [Math.cos(angle) * 2.0, -0.22, Math.sin(angle) * 2.0], [Math.cos(angle) * 2.65, -0.95, Math.sin(angle) * 2.65],
      ];
      const verts = [];
      for (let j = 0; j < points.length; j++) {
        const width = [0.04, 0.43, 0.32, 0.005][j];
        const p = points[j];
        verts.push(p[0] + Math.sin(angle) * width, p[1], p[2] - Math.cos(angle) * width);
        verts.push(p[0] - Math.sin(angle) * width, p[1] - 0.08, p[2] + Math.cos(angle) * width);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6]);
      geo.computeVertexNormals();
      geometry(geo, i % 2 ? 'plant' : 'plantLight', [x + bend, height, z]);
      geometry(geo, 'plantDark', [x + bend, height - 0.02, z], [1, -1, 1]);
      geo.dispose();
    }
    geometry(rockShape, 'plantDark', [x + bend, height, z], [0.37, 0.27, 0.36]);
    collider(x, z, 0.5, 0.5, height, 'palm-trunk');
  }

  function evergreen(x, z, height = 5.6) {
    cylinder(x, height * 0.42, z, 0.19, height * 0.84, 'wood');
    const cone = cached('pine-cone', () => new THREE.ConeGeometry(1, 1, 7));
    for (let i = 0; i < 3; i++) {
      const radius = 1.5 - i * 0.32;
      geometry(cone, i % 2 ? 'plantDark' : 'plant', [x, height * (0.34 + i * 0.23), z], [radius, height * 0.52, radius]);
      geometry(cone, 'dust', [x, height * (0.42 + i * 0.23), z], [radius * 0.81, height * 0.35, radius * 0.81]);
    }
    collider(x, z, 0.5, 0.5, height, 'pine-trunk');
  }

  function jungleTree(x, z, height = 6.5) {
    cylinder(x, height * 0.4, z, 0.36, height * 0.8, 'wood');
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + x;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      pole(new THREE.Vector3(x, height * 0.65, z), new THREE.Vector3(x + dx * 1.5, height * 0.85, z + dz * 1.5), 0.16, 'wood');
      geometry(rockShape, i % 2 ? 'plant' : 'plantLight', [x + dx, height * 0.9, z + dz], [2.0, 1.25, 2.0], [0, angle, 0]);
      pole(new THREE.Vector3(x + dx * 0.18, 0.65, z + dz * 0.18), new THREE.Vector3(x + dx * 1.05, 0.08, z + dz * 1.05), 0.1, 'wood');
    }
    geometry(rockShape, 'plantDark', [x, height * 1.02, z], [2.1, 1.2, 2.1]);
    collider(x, z, 0.85, 0.85, height, 'jungle-tree-trunk');
  }

  function neonMast(x, z, height = 5.3) {
    box(x, height / 2, z, 0.3, height, 0.3, 'metal', true);
    box(x, 0.23, z, 0.8, 0.46, 0.8, 'dark', true);
    box(x - 0.42, height, z, 1.35, 0.18, 0.36, 'metal', true);
    box(x - 0.7, height - 0.12, z, 0.65, 0.07, 0.3, 'glow');
    box(x + 0.2, height * 0.67, z, 0.06, height * 0.42, 0.36, 'glow');
    collider(x, z, 0.6, 0.6, height, 'street-mast');
  }

  function cliff(x, z, width, height, depth, rotation = 0) {
    const vertices = [], faces = [];
    const sides = 7;
    const phase = random() * 2;
    const layers = [0, 0.27, 0.53, 0.74, 1];
    for (let layer = 0; layer < layers.length; layer++) {
      for (let side = 0; side < sides; side++) {
        const angle = phase + side * Math.PI * 2 / sides;
        const taper = 1 - layers[layer] * 0.38;
        const jitter = 0.91 + random() * 0.16;
        vertices.push(Math.cos(angle) * taper * jitter, layers[layer], Math.sin(angle) * taper * jitter);
      }
    }
    for (let layer = 0; layer < layers.length - 1; layer++) {
      for (let side = 0; side < sides; side++) {
        const a = layer * sides + side, b = layer * sides + (side + 1) % sides;
        faces.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    for (let i = 1; i < sides - 1; i++) faces.push(4 * sides, 4 * sides + i, 4 * sides + i + 1);
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    shape.setIndex(faces); shape.computeVertexNormals();
    geometry(shape, 'stone', [x, -0.12, z], [width, height, depth], [0, rotation, 0]);
    shape.dispose();
    for (let layer = 0; layer < 3; layer++) {
      geometry(rockShape, layer % 2 ? 'stoneLight' : 'stoneDark', [x, height * (0.17 + layer * 0.22), z], [width * (0.97 - layer * 0.12), 0.24 + height * 0.035, depth * (0.97 - layer * 0.12)], [0, rotation + phase, 0]);
    }
    if (theme === 'snow') geometry(rockShape, 'dust', [x, height * 0.94, z], [width * 0.6, 0.24, depth * 0.6], [0, rotation, 0]);
  }

  // Sand/snow/concrete remains a real, continuous receiving surface.
  box(0, -0.16, 0, 220, 0.3, 220, 'ground');
  if (theme === 'city') {
    for (let i = -5; i <= 5; i++) {
      box(i * 4.0, 0.005, 0, 0.035, 0.012, 37, 'wallDark');
      box(0, 0.005, i * 3.5, 43, 0.012, 0.035, 'wallDark');
    }
    for (let i = -3; i <= 3; i++) box(0, 0.012, i * 3.4, 0.14, 0.018, 1.5, 'signal');
  } else {
    // Low, widely distributed chips and ripples add scale without collisions.
    for (let i = 0; i < 175; i++) {
      const x = (random() - 0.5) * 43, z = (random() - 0.5) * 37;
      const radius = 0.025 + random() * 0.095;
      geometry(pebbleShape, i % 4 ? 'dust' : 'stoneLight', [x, 0.025, z], [radius * 1.5, radius * 0.38, radius], [0, random() * Math.PI, 0]);
    }
    for (let i = 0; i < 16; i++) {
      const x = (random() - 0.5) * 35, z = (random() - 0.5) * 32;
      box(x, 0.004, z, 1.3 + random() * 2.1, 0.008, 0.035, 'dust', false, -0.18);
    }
  }

  // Four masses frame the play space; the 20 × 16 m center stays unobstructed.
  barracks(-16.5, -12.2, 7.5, 5.7, 3.6, 0);
  barracks(16.5, -12.4, 7.5, 5.7, 4.3, 1);
  barracks(-16.5, 13.1, 7.2, 5.7, 3.3, 1);
  barracks(16.5, 13.1, 7.2, 5.7, 3.7, 0);
  watchtower(-7.0, -15.1, -1);
  watchtower(7.0, -15.1, 1);

  // This bridge is an actual open passage: 3.8m clearance beneath its deck.
  box(0, 4.03, -15.1, 11.1, 0.3, 2.05, 'wood');
  for (const side of [-1, 1]) {
    box(0, 4.63, -15.1 + side * 0.96, 11.2, 0.12, 0.12, 'metal');
    box(0, 4.25, -15.1 + side * 0.96, 11.2, 0.09, 0.12, 'woodLight');
    for (let i = -5; i <= 5; i++) box(i, 4.42, -15.1 + side * 0.96, 0.1, 0.86, 0.11, 'wood');
  }
  for (let i = -5; i <= 5; i++) box(i, 4.2, -15.1, 0.035, 0.025, 1.88, 'wallDark');
  box(0, 4.31, -13.98, 2.5, 0.48, 0.09, 'accent');
  box(0, 4.31, -13.92, 1.7, 0.08, 0.035, 'signal');

  // Low perimeter and buttresses contain the field without boxing in the camera.
  for (const side of [-1, 1]) {
    box(side * 21.2, 0.95, 0, 0.65, 1.9, 36.7, 'wall', true);
    collider(side * 21.2, 0, 0.75, 36.7, 2.0, 'perimeter-wall');
    for (let z = -17; z <= 17; z += 4.25) {
      box(side * 20.88, 1.22, z, 1.1, 2.45, 0.84, 'wallLight', true);
      collider(side * 20.88, z, 1.1, 0.84, 2.45, 'wall-buttress');
    }
    for (const z of [-18.0, 18.0]) {
      box(side * 13.35, 1.0, z, 15.7, 2.0, 0.65, 'wall', true);
      collider(side * 13.35, z, 15.7, 0.75, 2.1, 'outer-wall');
      box(side * 5.3, 1.3, z, 0.8, 2.6, 1.0, 'wallLight', true);
      collider(side * 5.3, z, 0.8, 1.0, 2.6, 'gate-post');
    }
  }

  // Edge cover leaves the broad center and both side approaches readable.
  sandbags(-11.4, -3.1, 4.6, true);
  sandbags(11.4, 3.9, 4.6, true);
  sandbags(-5.7, 9.1, 4.2, false);
  sandbags(5.7, -9.1, 4.2, false);
  crate(-13.5, 4.5, 1.65, 1.65, 0.06);
  crate(-15.2, 4.1, 1.3, 1.15, -0.07, true);
  crate(13.5, -4.2, 1.55, 1.6, -0.08, true);
  crate(15.25, -4.45, 1.35, 1.15, 0.08);
  crate(-7.1, -10.4, 1.25, 1.1, 0.04);
  crate(8.2, 10.2, 1.7, 1.45, -0.08);
  for (const [x, z, red] of [[-13.9, 1.8, false], [-15.0, 1.9, true], [13.8, 6.5, true], [15.0, 6.7, false], [-10.5, -11.3, false], [10.9, 11.0, false]]) barrel(x, z, red);

  // A shaded supply corner; the canopy does not obstruct ground traversal.
  const canopyX = -15.6, canopyZ = -3.0;
  box(canopyX, 3.1, canopyZ, 5.2, 0.13, 3.6, 'fabric', false, 0.02);
  for (const dx of [-2.35, 2.35]) {
    for (const dz of [-1.55, 1.55]) {
      cylinder(canopyX + dx, 1.55, canopyZ + dz, 0.065, 3.1, 'wood');
      collider(canopyX + dx, canopyZ + dz, 0.22, 0.22, 3.1, 'awning-post');
    }
  }
  for (let i = -2; i <= 2; i++) box(canopyX + i * 0.83, 3.18, canopyZ, 0.37, 0.022, 3.6, 'wallLight', false, 0.02);

  // Flat mission pad is a useful landmark, never a movement blocker.
  const circle = cached('mission-pad', () => new THREE.CylinderGeometry(1, 1, 1, 36));
  geometry(circle, 'wallDark', [0, 0.018, -1.1], [2.2, 0.035, 2.2]);
  const ring = cached('mission-ring', () => new THREE.TorusGeometry(1.95, 0.045, 5, 48));
  geometry(ring, 'glow', [0, 0.046, -1.1], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    box(side * 0.65, 0.045, -1.1, 0.1, 0.015, 1.65, 'wallLight');
    box(0, 0.045, -1.1 + side * 0.65, 1.4, 0.015, 0.1, 'wallLight');
  }

  // Frame every arrival angle with background masses, beyond the battle bounds.
  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * Math.PI * 2;
    const radius = 32 + random() * 6;
    const x = Math.sin(angle) * radius * 1.12, z = Math.cos(angle) * radius;
    if (theme === 'city') {
      const h = 7 + random() * 12, width = 4 + random() * 4;
      box(x, h / 2 - 0.3, z, width, h, width * 0.75, i % 2 ? 'stone' : 'stoneDark');
      box(x, h + 0.05, z, width * 0.8, 0.4, width * 0.6, 'metal');
      for (let row = 1; row < h / 1.5; row++) {
        box(x, row * 1.5, z - width * 0.38 - 0.02, width * 0.7, 0.18, 0.05, row % 3 ? 'glow' : 'accent');
      }
    } else cliff(x, z, 5 + random() * 5, 5 + random() * 8, 4 + random() * 4, angle);
  }

  const foliagePositions = [[-19.3, -6.1, 5.3], [19.4, 0.5, 5.9], [-19.0, 7.0, 5.7], [19.1, 8.3, 5.0], [-9.8, 16.2, 4.8], [10.0, -16.8, 5.0]];
  for (const [x, z, height] of foliagePositions) {
    if (theme === 'snow') evergreen(x, z, height);
    else if (theme === 'jungle') jungleTree(x, z, height * 1.2);
    else if (theme === 'city') neonMast(x, z, height);
    else palm(x, z, height);
  }
  for (let i = 0; i < 24; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (22.8 + random() * 2.2), z = -18 + random() * 36;
    const r = 0.4 + random() * 0.75;
    geometry(rockShape, i % 3 ? 'stone' : 'stoneLight', [x, r * 0.4, z], [r * 1.3, r * 0.65, r], [0, random() * 3, 0]);
    if (theme === 'jungle') geometry(rockShape, 'plant', [x + 0.2, r * 0.8, z], [r, r * 0.4, r]);
    if (theme === 'snow') geometry(rockShape, 'dust', [x, r * 0.85, z], [r * 1.1, r * 0.17, r]);
  }

  // One draw call per static material, instead of one per trim, bag or leaf.
  for (const [key, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Unable to merge world material ${key}`);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.name = `world_batch_${key}`;
    mesh.castShadow = !['ground', 'dust', 'glow'].includes(key);
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geo => geo.dispose());
  }
  for (const geom of cachedGeometries.values()) geom.dispose();

  const bounds = { minX: -22, maxX: 22, minZ: -19, maxZ: 19 };
  const playerSpawn = new THREE.Vector3(0, 0, 11);
  const enemySpawns = [
    new THREE.Vector3(-17.0, 0, -6.7), new THREE.Vector3(17.3, 0, -7.0),
    new THREE.Vector3(-18.1, 0, 7.7), new THREE.Vector3(18.1, 0, 8.0),
    new THREE.Vector3(-2.8, 0, -16.0), new THREE.Vector3(2.8, 0, -16.0),
    new THREE.Vector3(-10.3, 0, -13.1), new THREE.Vector3(10.2, 0, -13.0),
  ];
  const zones = [
    { id: 'courtyard', name: '中央集结区', center: new THREE.Vector3(0, 0, -1.1), radius: 8, color: palette.glow },
    { id: 'north-gate', name: '北侧哨桥', center: new THREE.Vector3(0, 0, -13.0), radius: 4.5, color: palette.accent },
    { id: 'supply', name: '西侧补给区', center: new THREE.Vector3(-15.6, 0, -3.0), radius: 3.3, color: palette.woodLight },
  ];
  group.userData = {
    theme, title: palette.title, footprint: '44m × 38m', centerReserve: '20m × 16m',
    staticBatches: batches.size, colliders: colliders.length,
    entrances: [{ side: 'south', center: [0, 0, 18], width: 9.8 }, { side: 'north', center: [0, 0, -18], width: 9.8 }],
    bridgeClearance: 3.88,
  };

  return {
    group, colliders, bounds, playerSpawn, enemySpawns, zones,
    lighting: { sky: palette.sky, fog: palette.fog, ground: palette.ground, key: palette.key },
    update(dt, time) {
      for (const entry of animated) {
        entry.object.rotation.y = entry.base + Math.sin(time * 1.9 + entry.phase) * 0.09;
        entry.object.rotation.z = Math.sin(time * 1.4 + entry.phase) * 0.025;
      }
    },
    dispose() {
      const geoms = new Set(), mats = new Set();
      group.traverse(object => {
        if (object.geometry) geoms.add(object.geometry);
        if (object.material) [].concat(object.material).forEach(mat => mats.add(mat));
      });
      geoms.forEach(geo => geo.dispose());
      mats.forEach(mat => mat.dispose());
      group.removeFromParent();
    },
  };
}
