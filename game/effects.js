import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const CAPACITY = Object.freeze({ hot: 288, smoke: 160, tracer: 24, burst: 16, ring: 14, debris: 36, voices: 24 });
const finitePosition = pos => !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z);

const pointVertex = /* glsl */`
  attribute vec3 tint;
  attribute float opacity;
  attribute float size;
  attribute float angle;
  attribute float shape;
  uniform float pixelRatio;
  varying vec3 vTint;
  varying float vOpacity;
  varying float vAngle;
  varying float vShape;
  void main() {
    vTint = tint;
    vOpacity = opacity;
    vAngle = angle;
    vShape = shape;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * pixelRatio * 260.0 / max(1.0, -viewPosition.z), 1.0, 96.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const hotFragment = /* glsl */`
  varying vec3 vTint;
  varying float vOpacity;
  varying float vAngle;
  varying float vShape;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float c = cos(vAngle), s = sin(vAngle);
    uv = mat2(c, -s, s, c) * uv;
    float radius = length(uv);
    float alpha = pow(max(0.0, 1.0 - radius), 1.7);
    float core = smoothstep(0.40, 0.0, radius);
    if (vShape > 1.5) {
      float crossShape = min(max(abs(uv.x) * 3.2, abs(uv.y)), max(abs(uv.x), abs(uv.y) * 3.2));
      alpha = smoothstep(0.94, 0.72, crossShape);
      core = 0.20;
    } else if (vShape > 0.5) {
      float streak = length(uv * vec2(3.4, 0.86));
      alpha = pow(max(0.0, 1.0 - streak), 1.25);
      core = smoothstep(0.4, 0.0, streak);
    }
    if (alpha * vOpacity < 0.005) discard;
    gl_FragColor = vec4(mix(vTint, vec3(1.0), core * 0.72), alpha * vOpacity);
    #include <colorspace_fragment>
  }
`;

const smokeFragment = /* glsl */`
  varying vec3 vTint;
  varying float vOpacity;
  varying float vAngle;
  varying float vShape;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float c = cos(vAngle), s = sin(vAngle);
    uv = mat2(c, -s, s, c) * uv;
    float d = length(uv * vec2(0.93, 1.06));
    float cloud = 0.80 + 0.12 * sin(uv.x * 7.0 + sin(uv.y * 9.0)) + 0.08 * cos(uv.y * 11.0 + uv.x * 3.0);
    float alpha = smoothstep(1.0, 0.05, d) * cloud * vOpacity;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(vTint, alpha);
    #include <colorspace_fragment>
  }
`;

class ParticlePool {
  constructor(capacity, smoke = false) {
    this.capacity = capacity;
    this.smoke = smoke;
    this.cursor = 0;
    this.liveCount = 0;
    this.colorDirty = false;
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lives = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.baseSizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.baseAlphas = new Float32Array(capacity);
    this.angles = new Float32Array(capacity);
    this.shapes = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.color = new THREE.Color();
    const geometry = new THREE.BufferGeometry();
    for (const [name, values, stride] of [
      ['position', this.positions, 3], ['tint', this.colors, 3], ['opacity', this.alphas, 1],
      ['size', this.sizes, 1], ['angle', this.angles, 1], ['shape', this.shapes, 1],
    ]) geometry.setAttribute(name, new THREE.BufferAttribute(values, stride).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader: pointVertex,
      fragmentShader: smoke ? smokeFragment : hotFragment,
      uniforms: { pixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 2) } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = smoke ? 'pooled-smoke-and-dust' : 'pooled-sparks-and-energy';
    this.points.frustumCulled = false;
    this.points.renderOrder = smoke ? 31 : 32;
  }

  spawn(pos, vx, vy, vz, life, size, color, alpha = 1, gravity = 0, drag = 1, shape = 0) {
    const i = this.cursor++ % this.capacity, k = i * 3;
    this.positions[k] = pos.x; this.positions[k + 1] = pos.y; this.positions[k + 2] = pos.z;
    this.velocities[k] = vx; this.velocities[k + 1] = vy; this.velocities[k + 2] = vz;
    this.color.set(color);
    this.colors[k] = this.color.r; this.colors[k + 1] = this.color.g; this.colors[k + 2] = this.color.b;
    this.lives[i] = Math.max(0.015, Math.min(life, 4));
    this.ages[i] = 0;
    this.baseSizes[i] = this.sizes[i] = Math.max(0.015, size);
    this.baseAlphas[i] = this.alphas[i] = alpha;
    this.angles[i] = Math.random() * Math.PI * 2;
    this.shapes[i] = shape;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.colorDirty = true;
  }

  update(delta, physicsDelta) {
    let alive = 0, changed = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.lives[i] <= 0) continue;
      this.ages[i] += delta;
      changed = true;
      if (this.ages[i] >= this.lives[i]) {
        this.lives[i] = this.alphas[i] = this.sizes[i] = 0;
        continue;
      }
      alive++;
      const k = i * 3, t = this.ages[i] / this.lives[i];
      const friction = Math.exp(-this.drag[i] * physicsDelta);
      this.velocities[k] *= friction;
      this.velocities[k + 1] = this.velocities[k + 1] * friction + this.gravity[i] * physicsDelta;
      this.velocities[k + 2] *= friction;
      this.positions[k] += this.velocities[k] * physicsDelta;
      this.positions[k + 1] += this.velocities[k + 1] * physicsDelta;
      this.positions[k + 2] += this.velocities[k + 2] * physicsDelta;
      this.sizes[i] = this.baseSizes[i] * (this.smoke ? 1 + t * 2.4 : 1 - t * 0.35);
      this.alphas[i] = this.baseAlphas[i] * Math.pow(1 - t, this.smoke ? 1.45 : 1.1);
      if (this.smoke) this.alphas[i] *= Math.min(1, t * 12 + 0.25);
    }
    this.liveCount = alive;
    if (changed || this.colorDirty) {
      for (const name of ['position', 'opacity', 'size']) this.geometry.attributes[name].needsUpdate = true;
    }
    if (this.colorDirty) {
      for (const name of ['tint', 'angle', 'shape']) this.geometry.attributes[name].needsUpdate = true;
      this.colorDirty = false;
    }
  }

  dispose() {
    this.geometry.dispose(); this.material.dispose(); this.points.removeFromParent();
  }
}

/** Bounded visual pools and gesture-unlocked, synthesized Web Audio combat cues. */
export class CombatEffects {
  constructor(scene, { muted = false } = {}) {
    if (!scene?.add) throw new TypeError('CombatEffects requires a Three.js Scene or Group');
    this.group = new THREE.Group();
    this.group.name = 'combat-effects';
    scene.add(this.group);
    this.muted = !!muted;
    this.disposed = false;
    this.damagePulse = 0;
    this._audio = null;
    this._master = null;
    this._noiseBuffer = null;
    this._voices = new Set();
    this._point = new THREE.Vector3();
    this._direction = new THREE.Vector3();
    this._hot = new ParticlePool(CAPACITY.hot);
    this._smoke = new ParticlePool(CAPACITY.smoke, true);
    this.group.add(this._hot.points, this._smoke.points);
    this._geometry = {
      tracer: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
      burst: new THREE.IcosahedronGeometry(1, 1),
      shield: new THREE.SphereGeometry(1, 16, 10),
      ring: new THREE.RingGeometry(0.83, 1, 48),
      debris: new THREE.BoxGeometry(1, 1, 1),
    };
    this._tracers = this._meshPool(CAPACITY.tracer, 'tracer');
    this._bursts = this._meshPool(CAPACITY.burst, 'burst');
    this._rings = this._meshPool(CAPACITY.ring, 'ring');
    this._debris = this._meshPool(CAPACITY.debris, 'debris', false);
  }

  _meshPool(count, geometry, additive = true) {
    const pool = { cursor: 0, slots: [] };
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: geometry === 'ring' ? THREE.DoubleSide : THREE.FrontSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this._geometry[geometry], material);
      mesh.name = `pooled-${geometry}-${i}`;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = additive ? 30 : 10;
      this.group.add(mesh);
      pool.slots.push({ mesh, age: 0, life: 0, radius: 1, alpha: 1, kind: geometry, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    return pool;
  }

  _slot(pool, pos, life, color, alpha = 1) {
    const slot = pool.slots[pool.cursor++ % pool.slots.length];
    slot.age = 0; slot.life = life; slot.alpha = alpha;
    slot.mesh.position.copy(pos);
    slot.mesh.rotation.set(0, 0, 0);
    slot.mesh.scale.setScalar(1);
    slot.mesh.material.color.set(color);
    slot.mesh.material.opacity = alpha;
    slot.mesh.material.wireframe = false;
    slot.mesh.visible = true;
    return slot;
  }

  _ring(pos, radius, color, life = 0.5, alpha = 0.75) {
    const ring = this._slot(this._rings, pos, life, color, alpha);
    ring.mesh.rotation.x = -Math.PI / 2;
    ring.mesh.position.y += 0.045;
    ring.radius = radius;
    ring.mesh.scale.setScalar(0.08);
    return ring;
  }

  fire(from, to, { color = 0xffd275, heavy = false, player = false } = {}) {
    if (this.disposed || !finitePosition(from) || !finitePosition(to)) return;
    this._direction.subVectors(to, from);
    const length = this._direction.length();
    if (length < 0.0001) return;
    this._direction.multiplyScalar(1 / length);
    const distance = Math.min(length, 120);
    const life = player ? Math.min(.26, .11 + distance / 550) : heavy ? .12 : .075;
    const tracer = this._slot(this._tracers, from, life, color, player ? 1 : .84);
    tracer.travel = player;tracer.distance = distance;tracer.radius = heavy ? .045 : player ? .028 : .013;
    tracer.velocity.copy(this._direction);tracer.start = (tracer.start || new THREE.Vector3()).copy(from);
    tracer.segment = player ? Math.min(distance, Math.max(1.4, distance * .22)) : distance;
    if(player)tracer.mesh.material.color.lerp(new THREE.Color(0xfff4d2),.7);
    tracer.mesh.position.addScaledVector(this._direction, tracer.segment / 2);
    tracer.mesh.quaternion.setFromUnitVectors(UP, this._direction);
    tracer.mesh.scale.set(tracer.radius, tracer.segment, tracer.radius);
    if(player){
      // A short afterimage keeps the near-camera part readable between shots.
      const trail=this._slot(this._tracers,from,.12,color,.65);
      trail.travel=false;trail.mesh.position.addScaledVector(this._direction,distance/2);
      trail.mesh.quaternion.copy(tracer.mesh.quaternion);trail.mesh.scale.set(.018,distance,.018);
    }
    const flash = this._slot(this._bursts, from, heavy ? 0.095 : 0.055, color, 0.95);
    flash.kind = 'muzzle';
    flash.radius = player ? .07 : heavy ? 0.24 : 0.14;
    flash.mesh.geometry = this._geometry.burst;
    flash.mesh.quaternion.setFromUnitVectors(UP, this._direction);
    flash.mesh.scale.set(flash.radius, flash.radius * 1.65, flash.radius);
    for (let i = 0; i < (heavy ? 6 : 3); i++) {
      const velocity = 0.3 + Math.random() * 1.2;
      this._hot.spawn(from, this._direction.x * velocity + (Math.random() - 0.5) * 0.6,
        this._direction.y * velocity + (Math.random() - 0.5) * 0.6,
        this._direction.z * velocity + (Math.random() - 0.5) * 0.6,
        0.06 + Math.random() * 0.07, heavy ? 0.45 : 0.3, color, 1, 0, 4);
    }
    this._shotAudio(heavy);
  }

  impact(pos, { color = 0xffc681, metal = true } = {}) {
    if (this.disposed || !finitePosition(pos)) return;
    const count = metal ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 1.5 + Math.random() * 3.5;
      this._hot.spawn(pos, Math.cos(angle) * speed, 0.6 + Math.random() * 2.7, Math.sin(angle) * speed,
        0.14 + Math.random() * 0.23, 0.08 + Math.random() * 0.07, color, 0.95, -7, 1.6, 1);
    }
    this._smoke.spawn(pos, (Math.random() - 0.5) * 0.6, 0.7, (Math.random() - 0.5) * 0.6,
      0.45, metal ? 0.22 : 0.4, metal ? 0x98a4ab : 0xc5a47d, 0.2, 0, 1.5);
    this._impactAudio(metal);
  }

  explosion(pos, { radius = 3, color = 0xff8c34 } = {}) {
    if (this.disposed || !finitePosition(pos)) return;
    radius = Number.isFinite(radius) ? THREE.MathUtils.clamp(radius, 0.4, 12) : 3;
    const core = this._slot(this._bursts, pos, 0.23, 0xffe9ac, 0.95);
    core.kind = 'explosion'; core.radius = radius * 0.64;
    core.mesh.geometry = this._geometry.burst;
    core.mesh.scale.setScalar(radius * 0.16);
    this._ring(pos, radius * 1.4, color, 0.54, 0.85);
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const up = -0.2 + Math.random() * 1.3;
      const speed = radius * (1.0 + Math.random() * 2.2);
      this._hot.spawn(pos, Math.cos(angle) * speed, up * speed + 1.5, Math.sin(angle) * speed,
        0.25 + Math.random() * 0.55, radius * (0.045 + Math.random() * 0.075), i % 3 ? color : 0xffe5a0, 1, -7.5, 1.4, i % 2);
    }
    for (let i = 0; i < 14; i++) {
      const angle = i / 14 * Math.PI * 2;
      this._point.copy(pos).addScaledVector(this._direction.set(Math.cos(angle), 0.25, Math.sin(angle)), radius * Math.random() * 0.28);
      this._smoke.spawn(this._point, Math.cos(angle) * radius * 0.45, 0.65 + Math.random() * 1.3,
        Math.sin(angle) * radius * 0.45, 1.0 + Math.random() * 1.4,
        radius * (0.2 + Math.random() * 0.18), i % 3 ? 0x756c64 : 0xd2aa79, 0.35, 0.12, 0.6);
    }
    for (let i = 0; i < 9; i++) {
      const chunk = this._slot(this._debris, pos, 0.5 + Math.random() * 0.7, i % 3 ? 0x67666a : 0xab8c63, 1);
      chunk.radius = radius * (0.025 + Math.random() * 0.03);
      chunk.mesh.scale.set(chunk.radius, chunk.radius * 0.5, chunk.radius * 1.8);
      chunk.velocity.set((Math.random() - 0.5) * radius * 4, 2.0 + Math.random() * radius * 1.5, (Math.random() - 0.5) * radius * 4);
      chunk.spin.set(Math.random() * 8, Math.random() * 9, Math.random() * 7);
    }
    this._explosionAudio();
  }

  heal(pos) {
    if (this.disposed || !finitePosition(pos)) return;
    this._ring(pos, 1.35, 0x71f5a5, 0.7, 0.55);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      this._point.copy(pos).add(this._direction.set(Math.cos(angle) * 0.5, 0.1 + Math.random() * 0.8, Math.sin(angle) * 0.5));
      this._hot.spawn(this._point, Math.cos(angle) * 0.15, 0.8 + Math.random() * 0.8, Math.sin(angle) * 0.15,
        0.6 + Math.random() * 0.5, i % 3 ? 0.15 : 0.46, 0x6aef9b, 0.8, 0, 0.5, i % 3 ? 0 : 2);
    }
    const voice = this._voice(0.45, 0.16);
    if (voice) for (const [i, note] of [523.25, 659.25, 783.99].entries()) this._tone(voice, note, note, 'sine', i * 0.075, 0.23, 0.8);
  }

  damage() {
    if (this.disposed) return;
    this.damagePulse = 1;
    const voice = this._voice(0.22, 0.34);
    if (voice) {
      this._tone(voice, 165, 65, 'triangle', 0, 0.19, 0.6);
      this._noise(voice, 1000, 'lowpass', 0, 0.15, 0.7);
    }
  }

  reload() {
    if (this.disposed) return;
    const voice = this._voice(0.52, 0.18);
    if (voice) {
      this._noise(voice, 1800, 'highpass', 0, 0.055, 0.45);
      this._noise(voice, 900, 'bandpass', 0.17, 0.075, 0.65);
      this._noise(voice, 2500, 'highpass', 0.36, 0.065, 0.75);
      this._tone(voice, 340, 190, 'triangle', 0.36, 0.12, 0.22);
    }
  }

  shield(pos) {
    if (this.disposed || !finitePosition(pos)) return;
    this._point.copy(pos).add(this._direction.set(0, 1.0, 0));
    const bubble = this._slot(this._bursts, this._point, 0.95, 0x70d9ff, 0.37);
    bubble.kind = 'shield'; bubble.radius = 1.35;
    bubble.mesh.geometry = this._geometry.shield;
    bubble.mesh.material.wireframe = true;
    bubble.mesh.scale.setScalar(0.6);
    this._ring(pos, 1.5, 0x58cdfa, 0.65, 0.65);
    for (let i = 0; i < 14; i++) {
      const angle = i / 14 * Math.PI * 2;
      this._point.copy(pos).add(this._direction.set(Math.cos(angle) * 0.9, 0.25 + Math.random() * 1.4, Math.sin(angle) * 0.9));
      this._hot.spawn(this._point, 0, 0.4, 0, 0.4 + Math.random() * 0.4, 0.2, 0x9aeaff, 0.8, 0, 0.4);
    }
    const voice = this._voice(0.4, 0.18);
    if (voice) {
      this._tone(voice, 160, 620, 'sine', 0, 0.38, 0.6);
      this._tone(voice, 320, 1240, 'triangle', 0.04, 0.30, 0.23);
    }
  }

  async unlockAudio() {
    if (this.disposed) return false;
    try {
      if (!this._audio) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return false;
        this._audio = new AudioContextClass({ latencyHint: 'interactive' });
        this._master = this._audio.createGain();
        this._master.gain.value = this.muted ? 0 : 0.14;
        this._master.connect(this._audio.destination);
        this._noiseBuffer = this._audio.createBuffer(1, this._audio.sampleRate, this._audio.sampleRate);
        const noise = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      }
      if (this._audio.state === 'suspended') await this._audio.resume();
      return this._audio.state === 'running';
    } catch {
      return false;
    }
  }

  setMuted(value) {
    this.muted = !!value;
    if (this._master && this._audio?.state !== 'closed') this._master.gain.setTargetAtTime(this.muted ? 0 : 0.14, this._audio.currentTime, 0.025);
  }

  _voice(duration, level) {
    if (!this._audio || !this._master || this.muted || this._audio.state !== 'running' || this.disposed) return null;
    if (this._voices.size >= CAPACITY.voices) this._releaseVoice(this._voices.values().next().value);
    const now = this._audio.currentTime;
    const gain = this._audio.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, level), now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(this._master);
    const voice = { start: now, end: now + duration, gain, sources: [], nodes: [gain], pending: 0 };
    this._voices.add(voice);
    return voice;
  }

  _trackSource(voice, source, start, duration) {
    voice.sources.push(source);
    voice.pending++;
    source.onended = () => {
      voice.pending--;
      if (voice.pending <= 0) this._releaseVoice(voice);
    };
    source.start(start);
    source.stop(start + duration);
  }

  _tone(voice, frequency, endFrequency, type, delay, duration, level = 1) {
    const osc = this._audio.createOscillator(), gain = this._audio.createGain();
    const start = voice.start + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(10, frequency), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFrequency), start + duration);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain); gain.connect(voice.gain);
    voice.nodes.push(osc, gain);
    this._trackSource(voice, osc, start, duration);
  }

  _noise(voice, frequency, type, delay, duration, level = 1) {
    const source = this._audio.createBufferSource(), filter = this._audio.createBiquadFilter(), gain = this._audio.createGain();
    const start = voice.start + delay;
    source.buffer = this._noiseBuffer;
    filter.type = type; filter.frequency.setValueAtTime(frequency, start); filter.Q.value = 0.8;
    gain.gain.setValueAtTime(level, start); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(voice.gain);
    voice.nodes.push(source, filter, gain);
    this._trackSource(voice, source, start, duration);
  }

  _shotAudio(heavy) {
    const voice = this._voice(heavy ? 0.26 : 0.135, heavy ? 0.44 : 0.25);
    if (!voice) return;
    this._noise(voice, heavy ? 1600 : 2800, 'lowpass', 0, heavy ? 0.22 : 0.1, 0.8);
    this._tone(voice, heavy ? 180 : 360, heavy ? 42 : 95, 'triangle', 0, heavy ? 0.24 : 0.12, 0.5);
    this._tone(voice, heavy ? 520 : 880, heavy ? 180 : 380, 'sine', 0, heavy ? 0.10 : 0.065, 0.14);
  }

  _impactAudio(metal) {
    const voice = this._voice(metal ? 0.11 : 0.09, 0.10);
    if (!voice) return;
    this._noise(voice, metal ? 4400 : 1200, metal ? 'bandpass' : 'lowpass', 0, 0.08, 0.5);
    if (metal) this._tone(voice, 1750, 980, 'sine', 0, 0.1, 0.17);
  }

  _explosionAudio() {
    const voice = this._voice(0.95, 0.65);
    if (!voice) return;
    this._noise(voice, 420, 'lowpass', 0, 0.9, 0.95);
    this._noise(voice, 1900, 'bandpass', 0, 0.22, 0.45);
    this._tone(voice, 85, 24, 'sine', 0, 0.75, 0.75);
  }

  _releaseVoice(voice) {
    if (!voice || !this._voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* A source can already have ended. */ }
    }
    for (const node of voice.nodes) {
      try { node.disconnect(); } catch { /* Already disconnected during teardown. */ }
    }
  }

  update(delta) {
    if (this.disposed) return;
    delta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const physicsDelta = Math.min(delta, 0.1);
    this.damagePulse = Math.max(0, this.damagePulse - delta * 3.2);
    this._hot.update(delta, physicsDelta); this._smoke.update(delta, physicsDelta);
    for (const pool of [this._tracers, this._bursts, this._rings, this._debris]) {
      for (const slot of pool.slots) {
        if (slot.life <= 0) continue;
        slot.age += delta;
        if (slot.age >= slot.life) {
          slot.life = 0; slot.mesh.visible = false;
          continue;
        }
        const t = slot.age / slot.life;
        slot.mesh.material.opacity = slot.alpha * Math.pow(1 - t, slot.kind === 'debris' ? 0.5 : 1.4);
        if(pool === this._tracers && slot.travel){
          const head=slot.segment+(slot.distance-slot.segment)*t,tail=Math.max(0,head-slot.segment);
          slot.mesh.position.copy(slot.start).addScaledVector(slot.velocity,(head+tail)/2);
          slot.mesh.material.opacity=slot.alpha*(1-Math.max(0,(t-.65)/.35));
        }
        if (pool === this._rings) slot.mesh.scale.setScalar(slot.radius * (0.1 + 0.9 * Math.sqrt(t)));
        else if (pool === this._bursts) {
          if (slot.kind === 'muzzle') slot.mesh.scale.set(slot.radius * (1 + t), slot.radius * (1.7 + t), slot.radius * (1 + t));
          else if (slot.kind === 'shield') slot.mesh.scale.setScalar(slot.radius * (0.5 + 0.5 * Math.min(1, t * 3)));
          else slot.mesh.scale.setScalar(slot.radius * (0.2 + 1.3 * Math.sqrt(t)));
        } else if (pool === this._debris) {
          slot.velocity.y -= 8.5 * physicsDelta;
          slot.mesh.position.addScaledVector(slot.velocity, physicsDelta);
          slot.mesh.rotation.x += slot.spin.x * physicsDelta;
          slot.mesh.rotation.y += slot.spin.y * physicsDelta;
          slot.mesh.rotation.z += slot.spin.z * physicsDelta;
          if (slot.mesh.position.y < 0.045) {
            slot.mesh.position.y = 0.045; slot.velocity.y = Math.abs(slot.velocity.y) * 0.22;
            slot.velocity.x *= 0.7; slot.velocity.z *= 0.7;
          }
        }
      }
    }
    if (this._audio) for (const voice of this._voices) if (this._audio.currentTime > voice.end + 0.05) this._releaseVoice(voice);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._hot.dispose(); this._smoke.dispose();
    for (const pool of [this._tracers, this._bursts, this._rings, this._debris]) {
      for (const slot of pool.slots) slot.mesh.material.dispose();
    }
    for (const geometry of Object.values(this._geometry)) geometry.dispose();
    for (const voice of this._voices) this._releaseVoice(voice);
    this._master?.disconnect();
    const audio = this._audio;
    this._audio = this._master = this._noiseBuffer = null;
    if (audio && audio.state !== 'closed') {
      try { const closing = audio.close(); closing?.catch?.(() => {}); } catch { /* Browser is tearing down its audio device. */ }
    }
    this.group.removeFromParent();
    this.group.clear();
  }
}
