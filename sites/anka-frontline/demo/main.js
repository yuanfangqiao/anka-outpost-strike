import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadCharacter } from './characters.js';

const container = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '可旋转的男女角色三维模型');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a2938, 0.055);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
camera.position.set(2.6, 2.15, 6.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.60, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2.6;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.51;
controls.autoRotateSpeed = 0.65;
controls.enablePan = false;

scene.add(new THREE.HemisphereLight(0xdceaff, 0x464048, 2.0));
const key = new THREE.DirectionalLight(0xffe8d4, 3.0);
key.position.set(-3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 15;
key.shadow.normalBias = 0.015;
key.shadow.bias = -0.0001;
key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xd5e8ff, 1.1);
fill.position.set(4, 3, 3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x93d3ff, 3.0);
rim.position.set(0, 4, -4);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.3 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.075;
ground.receiveShadow = true;
scene.add(ground);
const plinths = [-0.73, 0.70].map((x, i) => {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.61, 0.63, 0.07, 80), new THREE.MeshStandardMaterial({ color: 0x314556, metalness: 0.35, roughness: 0.53 }));
  top.position.y = -0.039;
  top.receiveShadow = true;
  top.castShadow = true;
  group.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.607, 0.006, 8, 96), new THREE.MeshStandardMaterial({ color: i ? 0xf083ae : 0xe7a455, emissive: i ? 0x933b61 : 0x805025, emissiveIntensity: 0.55, roughness: 0.4 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.013;
  group.add(ring);
  group.position.x = x;
  scene.add(group);
  return group;
});

const characters = await Promise.all([loadCharacter('male'), loadCharacter('female')]).catch(error => {
  document.querySelector('#load-status').textContent = '模型加载失败';
  document.querySelector('#loading p').textContent = error.message;
  throw error;
});
characters.forEach((c, i) => { c.model.position.x = plinths[i].position.x; scene.add(c.model); });
document.querySelector('#load-status').textContent = '全部资产已就绪';
document.querySelector('#loading').classList.add('hidden');document.querySelector('#loading').hidden=true;
const counts = characters.map(c => {
  let bones=0,materials=new Set();
  c.model.traverse(o => { if (o.isBone) bones++; if (o.isMesh) [].concat(o.material).forEach(m => materials.add(m)); });
  return {bones,materials:materials.size};
});
document.querySelector('#bone-count').textContent = counts.map(c => c.bones).every(n => n === counts[0].bones) ? counts[0].bones : counts.map(c => c.bones).join(' / ');
document.querySelector('#material-count').textContent = counts.map(c => c.materials).every(n => n === counts[0].materials) ? counts[0].materials : counts.map(c => c.materials).join(' / ');

let paused = false;
let currentClip = 'Idle';
let currentCharacter = 'duo';
document.querySelectorAll('[data-clip]').forEach(button => button.addEventListener('click', () => {
  currentClip = button.dataset.clip;
  characters.forEach(c => c.play(currentClip));
  document.querySelectorAll('[data-clip]').forEach(b => b.classList.toggle('is-active', b === button));
}));
document.querySelector('#extra-clips').addEventListener('change',event=>{if(!event.target.value)return;currentClip=event.target.value;characters.forEach(c=>c.play(currentClip));document.querySelectorAll('[data-clip]').forEach(b=>b.classList.remove('is-active'));});
document.querySelector('#pause').addEventListener('click', event => {
  paused = !paused;
  event.currentTarget.textContent = paused ? '▷' : 'Ⅱ';
  event.currentTarget.setAttribute('aria-label', paused ? '继续动画' : '暂停动画');
});

document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => {
  currentCharacter = button.dataset.character;
  document.querySelectorAll('[data-character]').forEach(b => b.classList.toggle('is-active', b === button));
  characters.forEach((c, i) => {
    const visible = currentCharacter === 'duo' || currentCharacter === (i === 0 ? 'male' : 'female');
    c.model.visible = visible;
    plinths[i].visible = visible;
    c.model.position.x = currentCharacter === 'duo' ? [-0.73, 0.70][i] : 0;
    plinths[i].position.x = c.model.position.x;
  });
  document.querySelector('.male-name').style.display = currentCharacter === 'female' ? 'none' : '';
  document.querySelector('.female-name').style.display = currentCharacter === 'male' ? 'none' : '';
  document.querySelectorAll('.nameplate').forEach(el => {
    if (currentCharacter !== 'duo') el.style.left = '43%';
    else el.style.left = '';
  });
  camera.position.set(currentCharacter === 'duo' ? 2.6 : 1.9, 2.15, currentCharacter === 'duo' ? 6.8 : 5.2);
  controls.target.set(0,0.60,0);
}));

const presets = { 'three-quarter': [2.6,2.15,6.8], front: [0,1.6,7.2], back: [-2.5,2.0,-6.8] };
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  camera.position.fromArray(presets[button.dataset.view]);
  controls.target.set(0,0.60,0);
  controls.update();
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('is-active', b === button));
}));
document.querySelector('#wireframe').addEventListener('click', event => {
  const active = event.currentTarget.classList.toggle('is-active');
  characters.forEach(c => c.model.traverse(object => {
    if (object.isMesh) [].concat(object.material).forEach(mat => { mat.wireframe = active; });
  }));
});
document.querySelector('#auto-rotate').addEventListener('click', event => {
  controls.autoRotate = event.currentTarget.classList.toggle('is-active');
});

new ResizeObserver(() => {
  const { width, height } = container.getBoundingClientRect();
  renderer.setSize(width,height);
  camera.aspect = width/height;
  camera.updateProjectionMatrix();
}).observe(container);

let last = performance.now();
renderer.setAnimationLoop(now => {
  const delta = (now-last)/1000;
  last = now;
  if (!paused) characters.forEach(c => c.update(delta));
  controls.update();
  renderer.render(scene,camera);
  document.querySelector('#render-stats').textContent = `${renderer.info.render.triangles.toLocaleString()} TRIS · ${renderer.info.render.calls} DRAW CALLS · ${currentClip.toUpperCase()}`;
});

// Read-only diagnostics used to verify loading, skinning, and clip names.
window.ankaDiagnostics = () => ({
  ready: true, currentClip, currentCharacter,
  characters: characters.map(c => ({
    name: c.model.name,
    clips: Object.keys(c.actions),
    bones: (() => { let n=0; c.model.traverse(o => { if (o.isBone) n++; }); return n; })(),
    skinnedMeshes: (() => { let n=0; c.model.traverse(o => { if (o.isSkinnedMesh) n++; }); return n; })(),
    socketFound: !!c.weaponSocket,
    bounds: new THREE.Box3().setFromObject(c.model).getSize(new THREE.Vector3()).toArray(),
  })),
  renderer: { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls },
});
