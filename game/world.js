import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { THEMES, WORLD_THEMES, randomGenerator } from './world-themes.js';
import { worldProps } from './world-props.js';
import { addDuelCover, DUEL_SCALE, spawnPoints } from './arena-layout.js';
export { WORLD_THEMES } from './world-themes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The same combat lanes support all four biomes; every solid obstacle is authored
// with its collider so theme changes cannot leave invisible walls behind.
export function createWorld(theme = 'desert', {duel=false}={}) {
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

  const props=worldProps({box,cylinder,pole,collider,shadowPatch,geometry,cached,rockShape,theme,random,materials,group,animated});
  const {crate,barrel,sandbags,barracks,watchtower,palm,evergreen,jungleTree,neonMast,cliff}=props;

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

  if(duel)addDuelCover({box,collider});

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
  const scale=duel?DUEL_SCALE:1;
  if(duel){
    group.scale.setScalar(scale);
    for(const c of colliders)for(const key of ['minX','maxX','minZ','maxZ','height'])c[key]*=scale;
    for(const key of Object.keys(bounds))bounds[key]*=scale;
    for(const p of enemySpawns)p.multiplyScalar(scale);
    for(const zone of zones){zone.center.multiplyScalar(scale);zone.radius*=scale;}
    playerSpawn.copy(spawnPoints(scale)[0]);
  }
  group.userData = {
    theme, title: palette.title, footprint: duel?'59.4m × 51.3m':'44m × 38m', centerReserve:duel?'分段掩体 / 双侧绕行':'20m × 16m',
    staticBatches: batches.size, colliders: colliders.length,
    entrances: [{ side: 'south', center: [0, 0, 18], width: 9.8 }, { side: 'north', center: [0, 0, -18], width: 9.8 }],
    bridgeClearance: 3.88,
  };

  return {
    group, colliders, bounds, playerSpawn, enemySpawns, zones, duel, duelSpawns:duel?spawnPoints(scale):null,
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
