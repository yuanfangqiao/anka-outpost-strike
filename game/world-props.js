import * as THREE from 'three';

export function worldProps({box,cylinder,pole,collider,shadowPatch,geometry,cached,rockShape,theme,random,materials,group,animated}){
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

  return {crate,barrel,sandbags,barracks,watchtower,palm,evergreen,jungleTree,neonMast,cliff};
}
