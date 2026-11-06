// 天竜西遊 〜雲を越えて〜
// A small on-rails dragon shooter. Three.js only, no build step.
import * as THREE from './three.module.min.js';

// ============================================================
// Utilities
// ============================================================
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const params = new URLSearchParams(location.search);
const DEBUG_START = parseFloat(params.get('t') || '0') || 0; // ?t=88 jumps ahead
const GOD = params.has('god');                               // ?god = no damage
const COARSE = matchMedia('(pointer: coarse)').matches;

const $ = (id) => document.getElementById(id);
const glCanvas = $('gl');
const hud = $('hud');
const ctx = hud.getContext('2d');

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _w = new THREE.Vector3();

// Closest approach of segment a->b to point c. Returns {d2, t}.
function segPoint(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = clamp((acx * abx + acy * aby + acz * abz) / ab2, 0, 1);
  const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return { d2: dx * dx + dy * dy + dz * dz, t };
}

// ============================================================
// Renderer / scene
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const FOG_COLOR = 0xc6e6ff;
scene.fog = new THREE.Fog(FOG_COLOR, 90, 430);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);

let W = 1, H = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.fov = W < H ? 78 : 62;
  camera.updateProjectionMatrix();
  hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (input) { input.x = clamp(input.x, 0, W); input.y = clamp(input.y, 0, H); }
}

// Lights
scene.add(new THREE.HemisphereLight(0xe4f4ff, 0xf6dcb4, 1.7));
const sunLight = new THREE.DirectionalLight(0xfff0d2, 2.3);
sunLight.position.set(-60, 100, -50);
scene.add(sunLight);

// Sky dome
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d9cff) },
      mid: { value: new THREE.Color(FOG_COLOR) },
      bot: { value: new THREE.Color(0xfff2da) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bot, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
);
sky.renderOrder = -10;
scene.add(sky);

// Soft glow texture used for sun, bullets, explosions, trails
function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = makeGlowTex();
function glowSprite(color, scale, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(scale); return s;
}

const sunDir = new THREE.Vector3(-0.45, 0.32, -1).normalize();
const sunGlow = glowSprite(0xffe6a0, 380, 0.75);
const sunCore = glowSprite(0xffffff, 110, 1);
scene.add(sunGlow, sunCore);

// Material helpers
const toon = (c, extra = {}) => new THREE.MeshToonMaterial({ color: c, ...extra });
const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
const basic = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });

// Shared geometry
const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  lowSphere: new THREE.SphereGeometry(1, 9, 7),
  ico: new THREE.IcosahedronGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  torus: new THREE.TorusGeometry(1, 0.035, 6, 24),
  octa: new THREE.OctahedronGeometry(1, 0),
};

// ============================================================
// Rail (everything gameplay-related lives in rail-local space)
// ============================================================
const rail = new THREE.Group();
scene.add(rail);
rail.add(camera);
const SPEED = 34;
let dist = 0;
function railAt(s, out) {
  return out.set(Math.sin(s * 0.0042) * 42 + Math.sin(s * 0.0011) * 30, Math.sin(s * 0.0031) * 7, -s);
}

// ============================================================
// Scenery: sea of clouds, karst pillars, puffy clouds, gates
// ============================================================
const AHEAD = 480, BEHIND = 200, SPAN = AHEAD + BEHIND;

const seaFloor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), lam(0xfff3de));
seaFloor.rotation.x = -Math.PI / 2; seaFloor.position.y = -36;
scene.add(seaFloor);

const CLOUD_N = 240;
const cloudSea = new THREE.InstancedMesh(G.ico, lam(0xffffff), CLOUD_N);
cloudSea.frustumCulled = false;
scene.add(cloudSea);
const cloudD = [];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function setCloud(i) {
  const c = cloudD[i];
  _q.setFromEuler(_e.set(0, c.r, 0));
  _m4.compose(_v1.set(c.x, c.y, c.z), _q, _s.set(c.s, c.s * 0.42, c.s * 1.2));
  cloudSea.setMatrixAt(i, _m4);
}
for (let i = 0; i < CLOUD_N; i++) cloudD.push({ x: 0, y: 0, z: 0, s: 1, r: 0 });

const rockMat = lam(0xc9a57c), grassMat = lam(0x69c46b), treeMat = lam(0x3c9b58);
const pagodaMat = lam(0xd8432f), roofMat = lam(0x2e7a6e), goldMat = lam(0xf2c14e);
const puffMat = lam(0xffffff);

function makePagoda(levels) {
  const g = new THREE.Group(); let y = 0;
  for (let k = 0; k < levels; k++) {
    const w = 3.2 - k * 0.6;
    const b = new THREE.Mesh(G.box, pagodaMat); b.scale.set(w, 1.6, w); b.position.y = y + 0.8; g.add(b);
    const r = new THREE.Mesh(G.cone4, roofMat); r.scale.set(w * 1.05, 0.9, w * 1.05);
    r.position.y = y + 1.95; r.rotation.y = Math.PI / 4; g.add(r);
    y += 2.2;
  }
  const tip = new THREE.Mesh(G.cone, goldMat); tip.scale.set(0.25, 1.4, 0.25); tip.position.y = y + 0.6; g.add(tip);
  return g;
}

function makePillar() {
  const g = new THREE.Group();
  const h = rand(70, 130), r = rand(6, 13), seed = rand(0, 100);
  const geo = new THREE.CylinderGeometry(r * 0.72, r * 1.1, h, 9, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const f = 1 + 0.13 * Math.sin(a * 3 + y * 0.1 + seed) + 0.09 * Math.sin(y * 0.27 + seed * 2);
    pos.setXYZ(i, x * f, y, z * f);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, rockMat); rock.position.y = h / 2; g.add(rock);
  const cap = new THREE.Mesh(G.lowSphere, grassMat); cap.scale.set(r * 0.85, r * 0.45, r * 0.85); cap.position.y = h; g.add(cap);
  if (Math.random() < 0.35) {
    const p = makePagoda(2 + Math.floor(Math.random() * 3)); p.position.y = h + r * 0.3; g.add(p);
  } else {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t = new THREE.Mesh(G.cone, treeMat); const s = rand(1.5, 3);
      t.scale.set(s, s * 2.2, s); t.position.set(rand(-r * 0.5, r * 0.5), h + r * 0.3 + s, rand(-r * 0.5, r * 0.5)); g.add(t);
    }
  }
  return g;
}

function makePuff() {
  const g = new THREE.Group(); const n = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(G.ico, puffMat);
    const s = rand(3, 6.5); m.scale.set(s, s * 0.72, s);
    m.position.set(rand(-8, 8), rand(-1.5, 2.5), rand(-5, 5)); g.add(m);
  }
  g.scale.setScalar(rand(0.9, 2.1));
  return g;
}

function makeGate() {
  const g = new THREE.Group();
  const red = lam(0xd93a2b), teal = roofMat;
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(G.cyl, red); p.scale.set(0.9, 26, 0.9); p.position.set(sx * 13, 13, 0); g.add(p);
    const base = makePuff(); base.scale.setScalar(0.9); base.position.set(sx * 13, 0, 0); g.add(base);
  }
  const b1 = new THREE.Mesh(G.box, red); b1.scale.set(31, 1.4, 1.4); b1.position.y = 21; g.add(b1);
  const b2 = new THREE.Mesh(G.box, red); b2.scale.set(29, 1.0, 1.0); b2.position.y = 17.5; g.add(b2);
  const roof = new THREE.Mesh(G.box, teal); roof.scale.set(35, 0.7, 4.2); roof.position.y = 22.4; g.add(roof);
  const ridge = new THREE.Mesh(G.cone4, teal); ridge.scale.set(17, 2.4, 2.2); ridge.rotation.y = Math.PI / 4;
  ridge.scale.set(24, 2.4, 2.4); ridge.position.y = 23.8; g.add(ridge);
  const plaque = new THREE.Mesh(G.box, lam(0xf2c14e)); plaque.scale.set(5, 2.6, 0.5); plaque.position.y = 19.3; g.add(plaque);
  return g;
}

const pillars = [], puffs = [], gates = [];
for (let i = 0; i < 30; i++) { const o = makePillar(); scene.add(o); pillars.push({ obj: o, side: i % 2 ? 1 : -1 }); }
for (let i = 0; i < 26; i++) { const o = makePuff(); scene.add(o); puffs.push({ obj: o }); }
const GATE_GAP = 560;
for (let i = 0; i < 3; i++) { const o = makeGate(); scene.add(o); gates.push({ obj: o, s: 0 }); }

function placePillar(p, z) {
  railAt(-z, _v1);
  p.obj.position.set(_v1.x + p.side * rand(40, 230), rand(-100, -60), z);
  p.obj.rotation.y = rand(0, TAU);
}
function placePuff(p, z) {
  railAt(-z, _v1);
  const side = Math.random() < 0.5 ? -1 : 1;
  const high = Math.random() < 0.3;
  p.obj.position.set(_v1.x + side * (high ? rand(20, 60) : rand(38, 190)), high ? rand(42, 60) : rand(-14, 30), z);
}
function placeGate(g) {
  railAt(g.s, _v1);
  g.obj.position.set(_v1.x, _v1.y - 11, _v1.z);
}

function resetScenery() {
  const baseZ = -dist;
  for (let i = 0; i < CLOUD_N; i++) {
    const c = cloudD[i];
    c.z = baseZ + rand(-AHEAD, BEHIND); railAt(-c.z, _v1);
    c.x = _v1.x + rand(-280, 280); c.y = rand(-36, -27); c.s = rand(10, 26); c.r = rand(0, TAU);
    setCloud(i);
  }
  cloudSea.instanceMatrix.needsUpdate = true;
  pillars.forEach((p) => placePillar(p, baseZ + rand(-AHEAD, BEHIND)));
  puffs.forEach((p) => placePuff(p, baseZ + rand(-AHEAD, BEHIND)));
  gates.forEach((g, i) => { g.s = (Math.floor(dist / GATE_GAP) + i + 1) * GATE_GAP; placeGate(g); });
}

function updateScenery() {
  const baseZ = -dist;
  let dirty = false;
  for (let i = 0; i < CLOUD_N; i++) {
    const c = cloudD[i];
    if (c.z > baseZ + BEHIND) {
      c.z -= SPAN; railAt(-c.z, _v1); c.x = _v1.x + rand(-280, 280); setCloud(i); dirty = true;
    }
  }
  if (dirty) cloudSea.instanceMatrix.needsUpdate = true;
  for (const p of pillars) if (p.obj.position.z > baseZ + BEHIND) placePillar(p, p.obj.position.z - SPAN);
  for (const p of puffs) if (p.obj.position.z > baseZ + BEHIND) placePuff(p, p.obj.position.z - SPAN);
  for (const g of gates) if (g.s < dist - BEHIND) { g.s += gates.length * GATE_GAP; placeGate(g); }
  seaFloor.position.x = rail.position.x; seaFloor.position.z = rail.position.z;
}

// Wind streaks for a sense of speed (rail-local)
const STREAK_N = 70;
const streakPos = new Float32Array(STREAK_N * 6);
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streaks = new THREE.LineSegments(streakGeo,
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, fog: false }));
streaks.frustumCulled = false;
rail.add(streaks);
const streakD = [];
for (let i = 0; i < STREAK_N; i++) streakD.push({ x: rand(-40, 40), y: rand(-20, 20), z: rand(-90, 40) });
function updateStreaks(dt) {
  for (let i = 0; i < STREAK_N; i++) {
    const s = streakD[i];
    s.z += 120 * dt;
    if (s.z > 40) { s.z = -90; s.x = rand(-40, 40); s.y = rand(-20, 20); }
    streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z + 5], i * 6);
  }
  streakGeo.attributes.position.needsUpdate = true;
}

// ============================================================
// The dragon (wingless, serpentine) with its rider and pearl
// ============================================================
const DR = {
  group: new THREE.Group(), head: new THREE.Group(), segs: [], segPos: [], segR: [],
  N: 24, spacing: 0.62, offset: new THREE.Vector3(), vel: new THREE.Vector3(),
  headPos: new THREE.Vector3(), pearl: new THREE.Group(), rider: new THREE.Group(), whiskers: [],
};
rail.add(DR.group);
{
  const jade = toon(0x2bb38f), belly = toon(0xf6cf5a), mane = toon(0xff6a3d), horn = toon(0xfff0c8);
  const eyeW = basic(0xfff6a0), eyeB = basic(0x151515);
  const h = DR.head;
  const add = (geo, mat, sx, sy, sz, x, y, z, parent = h) => {
    const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
  };
  add(G.sphere, jade, 0.8, 0.68, 0.84, 0, 0, 0);
  add(G.box, jade, 1.0, 0.62, 1.5, 0, -0.08, 0.95);
  add(G.sphere, jade, 0.22, 0.22, 0.22, 0.25, 0.12, 1.66);
  add(G.sphere, jade, 0.22, 0.22, 0.22, -0.25, 0.12, 1.66);
  add(G.box, belly, 0.9, 0.22, 1.25, 0, -0.48, 0.85);
  for (const s of [-1, 1]) {
    add(G.box, belly, 0.35, 0.15, 0.5, s * 0.35, 0.42, 0.45);
    add(G.sphere, eyeW, 0.17, 0.17, 0.17, s * 0.42, 0.28, 0.62);
    add(G.sphere, eyeB, 0.08, 0.08, 0.08, s * 0.5, 0.3, 0.74);
    // antlers
    const a = new THREE.Group(); a.position.set(s * 0.32, 0.55, -0.25); a.rotation.set(-1.0, 0, -s * 0.35); h.add(a);
    add(G.cyl, horn, 0.08, 1.4, 0.08, 0, 0.7, 0, a);
    const br = new THREE.Group(); br.position.set(0, 0.6, 0); br.rotation.set(0.9, 0, s * 0.3); a.add(br);
    add(G.cyl, horn, 0.05, 0.6, 0.05, 0, 0.3, 0, br);
    // whiskers
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.8, -0.2, -0.3),
      new THREE.Vector3(s * 1.4, 0.2, -1.1), new THREE.Vector3(s * 1.8, -0.1, -2.0)]);
    const wg = new THREE.Group(); wg.position.set(s * 0.45, -0.05, 1.5); h.add(wg);
    wg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.04, 5), belly));
    DR.whiskers.push({ g: wg, s });
  }
  // mane around the back of the skull
  for (let k = 0; k < 7; k++) {
    const ang = (k / 6) * Math.PI;
    const m = add(G.cone, mane, 0.2, 1.0, 0.2, Math.cos(ang) * 0.6, Math.sin(ang) * 0.5 + 0.05, -0.55);
    m.rotation.x = -Math.PI / 2 + 0.4; m.rotation.z = (Math.cos(ang)) * -0.5;
  }
  DR.group.add(h);

  for (let i = 0; i < DR.N; i++) {
    const r = 0.62 * (1 - 0.72 * i / (DR.N - 1));
    const seg = new THREE.Group();
    add(G.sphere, jade, r, r * 0.95, r, 0, 0, 0, seg);
    add(G.sphere, belly, r * 0.8, r * 0.7, r * 0.9, 0, -r * 0.32, 0, seg);
    const fin = add(G.cone, mane, r * 0.32, r * 1.1, r * 0.32, 0, r * 0.95, 0.05, seg); fin.rotation.x = 0.5;
    if (i === 4 || i === 13) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Group(); leg.position.set(s * r * 0.85, -r * 0.5, 0); leg.rotation.set(0.6, 0, s * 0.7); seg.add(leg);
        add(G.cyl, jade, 0.11, 0.75, 0.11, 0, -0.35, 0, leg);
        for (let c = -1; c <= 1; c++) {
          const cl = add(G.cone, horn, 0.05, 0.25, 0.05, c * 0.08, -0.8, 0.08, leg); cl.rotation.x = Math.PI * 0.8;
        }
      }
    }
    if (i === DR.N - 1) {
      for (let k = -2; k <= 2; k++) {
        const t = add(G.cone, mane, 0.12, 1.1, 0.12, 0, 0, 0.4, seg);
        t.rotation.set(Math.PI / 2 + k * 0.12, 0, 0); t.rotation.z = k * 0.35;
      }
    }
    DR.group.add(seg); DR.segs.push(seg); DR.segR.push(r); DR.segPos.push(new THREE.Vector3(0, 0, i * DR.spacing));
  }

  // Rider: a small traveler in an orange robe with a straw hat
  const rd = DR.rider;
  add(G.cone, toon(0xf08a24), 0.36, 0.8, 0.36, 0, 0.4, 0, rd);
  add(G.cyl, toon(0xb93a2a), 0.27, 0.08, 0.27, 0, 0.55, 0, rd);
  add(G.sphere, toon(0xffd9b0), 0.2, 0.2, 0.2, 0, 0.98, 0, rd);
  add(G.cone, toon(0xe6c56b), 0.5, 0.22, 0.5, 0, 1.17, 0, rd);
  const staff = add(G.cyl, toon(0xe8b93c), 0.025, 1.7, 0.025, 0.35, 0.8, -0.1, rd); staff.rotation.x = -0.35;
  const ring = add(G.torus, toon(0xe8b93c), 0.12, 0.12, 0.12, 0.35, 1.6, -0.38, rd); ring.rotation.y = Math.PI / 2;
  DR.group.add(rd);

  // The pearl the dragon chases; shots fly out of it
  DR.pearl.add(new THREE.Mesh(G.sphere, basic(0xfffbe6)));
  DR.pearl.children[0].scale.setScalar(0.3);
  DR.pearl.add(glowSprite(0xfff0a0, 2.4, 0.9));
  DR.group.add(DR.pearl);
}

function resetDragon() {
  DR.offset.set(0, 0, 0);
  for (let i = 0; i < DR.N; i++) DR.segPos[i].set(0, -i * 0.05, i * DR.spacing);
}

// ============================================================
// Input
// ============================================================
const input = { x: 0, y: 0, down: false, holdT: 0, touchId: null, lastTX: 0, lastTY: 0, keys: {} };
resize();
input.x = W / 2; input.y = H / 2;
addEventListener('resize', resize);

let isTouch = false;
hud.addEventListener('pointerdown', (e) => {
  if (state !== 'play' || paused) return;
  audio.init();
  if (e.pointerType === 'touch') {
    isTouch = true;
    if (input.touchId !== null) return;
    input.touchId = e.pointerId; input.lastTX = e.clientX; input.lastTY = e.clientY;
  } else {
    input.x = e.clientX; input.y = e.clientY;
  }
  pressFire();
  e.preventDefault();
});
hud.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    if (e.pointerId !== input.touchId) return;
    input.x = clamp(input.x + (e.clientX - input.lastTX) * 1.5, 0, W);
    input.y = clamp(input.y + (e.clientY - input.lastTY) * 1.5, 0, H);
    input.lastTX = e.clientX; input.lastTY = e.clientY;
  } else {
    input.x = e.clientX; input.y = e.clientY;
  }
});
const endPointer = (e) => {
  if (e.pointerType === 'touch') { if (e.pointerId !== input.touchId) return; input.touchId = null; }
  releaseFire();
};
hud.addEventListener('pointerup', endPointer);
hud.addEventListener('pointercancel', endPointer);
hud.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  input.keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'KeyQ') turnView(-1);
  if (e.code === 'KeyE') turnView(1);
  if (e.code === 'KeyM') audio.toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
  if (e.code === 'Space' && !e.repeat) { audio.init(); pressFire(); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
  if (e.code === 'Space' && state === 'play') releaseFire();
});

function bindButton(id, fn) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); audio.init(); fn(); });
}
bindButton('turnL', () => state === 'play' && !paused && turnView(-1));
bindButton('turnR', () => state === 'play' && !paused && turnView(1));
bindButton('mute', () => audio.toggleMute());
bindButton('pauseBtn', () => state === 'play' && setPaused(!paused));
$('startBtn').addEventListener('click', () => { audio.init(); startGame(); });
$('retryBtn').addEventListener('click', () => { audio.init(); startGame(); });
$('resumeBtn').addEventListener('click', () => setPaused(false));
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });

// ============================================================
// View (front / right / back / left)
// ============================================================
const VIEW_NAMES = ['前方', '右方', '後方', '左方'];
const view = { idx: 0, angle: 0, target: 0 };
function turnView(d) {
  view.idx = (view.idx + d + 4) % 4;
  view.target -= d * Math.PI / 2;
  audio.sfx('turn');
}
const viewDir = (a, out) => out.set(-Math.sin(a), 0, -Math.cos(a));

// ============================================================
// Audio (all synthesized, original tunes)
// ============================================================
const audio = (() => {
  let ac = null, master, sfxG, musG, noiseBuf, muted = false, song = null, step = 0, nextT = 0;
  const noteFreq = (n) => {
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, (12 * (+m[3] + 1) + semi - 69) / 12);
  };
  const parseLead = (str) => {
    const tok = str.trim().split(/\s+/); const out = new Array(tok.length).fill(null);
    for (let i = 0; i < tok.length; i++) {
      if (tok[i] === '-' || tok[i] === '.') continue;
      let d = 1; while (tok[i + d] === '-') d++;
      out[i] = { f: noteFreq(tok[i]), d };
    }
    return out;
  };
  const SONGS = {
    field: {
      bpm: 128,
      lead: parseLead(`
        D5 - - E5 F#5 - A5 - B5 - A5 - F#5 - E5 -
        D5 - - - B4 - D5 - E5 - - - . . . .
        F#5 - - A5 B5 - D6 - B5 - A5 - F#5 - A5 -
        E5 - - - D5 - E5 - D5 - - - . . . .
        B5 - A5 - F#5 - - - A5 - F#5 - E5 - - -
        D5 - E5 - F#5 - A5 - E5 - - - . . . .
        B4 - D5 - E5 - F#5 - A5 - B5 - D6 - B5 -
        A5 - F#5 - E5 - F#5 - D5 - - - . . . .`),
      bass: ['D3', 'B2', 'G2', 'A2', 'B2', 'G2', 'A2', 'D3'],
      drums: 'K.h.S.h.K.Kh.Sh.',
      leadType: 'triangle', leadVol: 0.16,
    },
    boss: {
      bpm: 152,
      lead: parseLead(`
        E4 - G4 - A4 - B4 - D5 - B4 - A4 - G4 -
        E4 - - - E5 - D5 - B4 - - - A4 - B4 -
        G4 - A4 - B4 - D5 - E5 - D5 - B4 - D5 -
        E5 - - - . . B4 - E5 - - - . . . .`),
      bass: ['E2', 'E2', 'C3', 'D3'],
      drums: 'K.KhS.hKK.KhShSh',
      leadType: 'square', leadVol: 0.07,
    },
  };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ac.destination);
    sfxG = ac.createGain(); sfxG.gain.value = 0.55; sfxG.connect(master);
    musG = ac.createGain(); musG.gain.value = 0.32; musG.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 25);
    if (pendingSong) setSong(pendingSong);
  }
  function osc(type, f, t, dur, vol, dest, f2) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, vol, freq, dest, type = 'lowpass') {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.03);
  }
  let pendingSong = null;
  function setSong(name) {
    pendingSong = name;
    if (!ac) return;
    song = name ? SONGS[name] : null; step = 0; nextT = ac.currentTime + 0.08;
  }
  function schedule() {
    if (!ac || !song || paused) { if (ac) nextT = ac.currentTime + 0.05; return; }
    const stepDur = 60 / song.bpm / 4;
    while (nextT < ac.currentTime + 0.12) {
      const L = song.lead.length, i = step % L, bar = Math.floor(i / 16), b = i % 16;
      const n = song.lead[i];
      if (n) {
        osc(song.leadType, n.f, nextT, n.d * stepDur * 0.95, song.leadVol, musG);
        osc('sine', n.f * 2, nextT, n.d * stepDur * 0.6, song.leadVol * 0.25, musG);
      }
      const root = noteFreq(song.bass[bar % song.bass.length]);
      if (b === 0 || b === 8) osc('triangle', root, nextT, stepDur * 3.5, 0.22, musG);
      if (b === 4 || b === 12) osc('triangle', root * (b === 4 ? 2 : 1.5), nextT, stepDur * 2.5, 0.14, musG);
      const dch = song.drums[b];
      if (dch === 'K') osc('sine', 130, nextT, 0.22, 0.45, musG, 45);
      if (dch === 'S') noise(nextT, 0.12, 0.18, 2200, musG, 'bandpass');
      if (dch === 'h') noise(nextT, 0.04, 0.06, 7000, musG, 'highpass');
      nextT += stepDur; step++;
    }
  }
  function sfx(name, arg = 1) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    switch (name) {
      case 'shot': osc('square', 900, t, 0.06, 0.05, sfxG, 1500); break;
      case 'lock': osc('sine', 1500, t, 0.07, 0.14, sfxG); osc('sine', 2250, t + 0.035, 0.07, 0.1, sfxG); break;
      case 'release': osc('sawtooth', 260, t, 0.35, 0.08, sfxG, 1800); osc('sine', 600, t, 0.3, 0.12, sfxG, 2400); break;
      case 'hit': osc('square', 240, t, 0.05, 0.05, sfxG, 160); break;
      case 'spark': osc('triangle', 2600, t, 0.05, 0.06, sfxG, 3200); break;
      case 'explode':
        noise(t, 0.35 + arg * 0.25, 0.35 + arg * 0.15, 700 + arg * 200, sfxG);
        osc('sine', 140, t, 0.3 + arg * 0.2, 0.3, sfxG, 40); break;
      case 'hurt': noise(t, 0.3, 0.4, 1200, sfxG); osc('sawtooth', 180, t, 0.3, 0.12, sfxG, 60); break;
      case 'heal': [0, 0.07, 0.14, 0.21].forEach((d, k) => osc('triangle', [587, 740, 880, 1175][k], t + d, 0.18, 0.15, sfxG)); break;
      case 'turn': noise(t, 0.18, 0.08, 1800, sfxG, 'bandpass'); break;
      case 'warn': for (let k = 0; k < 6; k++) osc('square', k % 2 ? 660 : 880, t + k * 0.22, 0.2, 0.07, sfxG); break;
      case 'bonus': [0, 0.06, 0.12].forEach((d, k) => osc('square', [1046, 1318, 1568][k], t + d, 0.12, 0.06, sfxG)); break;
    }
  }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.6;
    $('mute').textContent = muted ? '×' : '♪';
  }
  return { init, sfx, setSong, toggleMute };
})();

// ============================================================
// Game state
// ============================================================
let state = 'title';
let paused = false;
let stageT = 0, gameT = 0, score = 0, hp = 100, invuln = 0, shake = 0, flash = 0;
let shotCd = 0, lockMode = false, clock = 0;
let timelineI = 0;
const stats = { spawned: 0, kills: 0, damage: 0 };
const targets = [], ebullets = [], shots = [], homings = [], fx = [], popups = [], locks = [], queue = [];
let boss = null;
let message = null;

function later(t, fn) { queue.push({ t: gameT + t, fn }); }
function msg(text, style = 'info', dur = 2.4) { message = { text, style, t: 0, dur }; }
function popup(pos, text, color = '#fff') { popups.push({ pos: pos.clone(), text, color, t: 0 }); }

function clearEntities() {
  for (const e of targets) if (e.obj.parent === rail) rail.remove(e.obj);
  for (const list of [ebullets, shots]) for (const b of list) rail.remove(b.obj);
  for (const h of homings) { rail.remove(h.obj); h.trail.forEach((s) => { rail.remove(s); s.material.dispose(); }); }
  for (const f of fx) { rail.remove(f.obj); f.obj.material.dispose(); }
  if (boss) rail.remove(boss.root);
  boss = null;
  targets.length = ebullets.length = shots.length = homings.length = fx.length = 0;
  popups.length = locks.length = queue.length = 0;
}

function startGame() {
  clearEntities();
  stageT = DEBUG_START; gameT = 0; score = 0; hp = 100; invuln = 0; shake = 0; flash = 0;
  stats.spawned = stats.kills = stats.damage = 0;
  dist = DEBUG_START * SPEED; timelineI = 0;
  while (timelineI < TIMELINE.length && TIMELINE[timelineI][0] < stageT) timelineI++;
  view.idx = 0; view.angle = view.target = 0;
  lockMode = false; input.down = false; message = null;
  resetDragon(); resetScenery();
  paused = false;
  state = 'play';
  DR.group.visible = true;
  ['title', 'result', 'pause'].forEach((id) => $(id).classList.add('hidden'));
  ['turnL', 'turnR', 'mute', 'pauseBtn'].forEach((id) => $(id).classList.remove('hidden'));
  audio.setSong(stageT >= 86 ? 'boss' : 'field');
  msg('いざ、西方へ！', 'info', 2);
}

function setPaused(p) {
  if (state !== 'play') return;
  paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) { input.down = false; lockMode = false; locks.length = 0; input.touchId = null; }
}

function endGame(cleared) {
  state = cleared ? 'clear' : 'over';
  input.down = false; lockMode = false; locks.length = 0;
  ['turnL', 'turnR', 'pauseBtn'].forEach((id) => $(id).classList.add('hidden'));
  setTimeout(() => {
    $('resTitle').textContent = cleared ? '雲海を越えた！' : '旅はここまで…';
    $('resScore').textContent = `得点 ${score.toLocaleString()}`;
    const rank = !cleared ? '龍よ、もう一度飛べ'
      : score >= 28000 ? '称号：天翔ける龍王'
      : score >= 18000 ? '称号：雲海の守護者'
      : score >= 10000 ? '称号：西方の旅人' : '称号：見習いの龍使い';
    $('resRank').textContent = rank;
    const ratio = stats.spawned ? Math.round(stats.kills / stats.spawned * 100) : 0;
    $('resDetail').innerHTML = `撃破 ${stats.kills} / ${stats.spawned} 体（撃破率 ${ratio}%）<br>受けたダメージ ${stats.damage}`;
    $('result').classList.remove('hidden');
    audio.setSong(null);
  }, cleared ? 1200 : 1600);
}

function hurt(n) {
  if (invuln > 0 || state !== 'play') return;
  shake = 0.6; flash = 0.6; audio.sfx('hurt');
  if (GOD) return;
  hp -= n; stats.damage += n; invuln = 1.1;
  if (hp <= 0) {
    hp = 0;
    _v1.copy(DR.headPos); explode(_v1, 3, 0xff8040);
    DR.group.visible = false;
    endGame(false);
  }
}

// ============================================================
// Enemy builders (faces point toward +z; we lookAt the dragon)
// ============================================================
const EM = {
  red: toon(0xe53935, { emissive: 0x4a0d00 }), gold: toon(0xf6c343), white: basic(0xffffff), black: basic(0x151515),
  dark: basic(0x3a0a0a), pink: toon(0xff7b9c), purple: toon(0x6c43a8), purpleDark: toon(0x4a2a7a, { side: THREE.DoubleSide }),
  yellowEye: basic(0xffe14d), blue: toon(0x3f86ff), cloud: toon(0xffffff), horn: toon(0xffe08a), redEye: basic(0xff3b30),
  peach: toon(0xffa0b4), leaf: toon(0x4fbf5a),
};
function part(parent, geo, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
}

function buildLantern() {
  const g = new THREE.Group();
  part(g, G.sphere, EM.red, 1.25, 1.45, 1.25, 0, 0, 0);
  for (const y of [1.45, -1.45]) part(g, G.cyl, EM.gold, 0.7, 0.3, 0.7, 0, y, 0);
  for (const ry of [0, Math.PI / 2]) { const t = part(g, G.torus, EM.dark, 1.27, 1.47, 1, 0, 0, 0); t.rotation.y = ry; }
  const ta = part(g, G.cone, EM.gold, 0.3, 0.8, 0.3, 0, -2.0, 0); ta.rotation.x = Math.PI;
  for (const s of [-1, 1]) {
    part(g, G.sphere, EM.white, 0.32, 0.36, 0.2, s * 0.45, 0.35, 1.1);
    part(g, G.sphere, EM.black, 0.14, 0.16, 0.1, s * 0.45, 0.33, 1.27);
  }
  part(g, G.box, EM.dark, 0.9, 0.35, 0.2, 0, -0.35, 1.17);
  const tongue = part(g, G.box, EM.pink, 0.3, 0.1, 0.5, 0, -0.55, 1.35); tongue.rotation.x = 0.5;
  return g;
}

const wingShape = new THREE.Shape();
[[0, 0], [1.0, 0.5], [1.8, 0.35], [2.2, -0.1], [1.8, -0.2], [1.5, -0.05], [1.2, -0.3], [0.9, -0.1], [0.6, -0.35], [0.3, -0.05]]
  .forEach(([x, y], i) => (i ? wingShape.lineTo(x, y) : wingShape.moveTo(x, y)));
const wingGeo = new THREE.ShapeGeometry(wingShape); wingGeo.rotateX(-Math.PI / 2);

function buildBat() {
  const g = new THREE.Group();
  part(g, G.sphere, EM.purple, 0.55, 0.5, 0.55, 0, 0, 0);
  for (const s of [-1, 1]) {
    part(g, G.cone, EM.purple, 0.15, 0.4, 0.15, s * 0.28, 0.55, 0);
    part(g, G.sphere, EM.yellowEye, 0.12, 0.12, 0.08, s * 0.2, 0.12, 0.47);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.4, 0.05, 0); g.add(piv);
    const w = new THREE.Mesh(wingGeo, EM.purpleDark); w.scale.set(s, 1, 1); piv.add(w);
    wings.push({ piv, s });
  }
  g.userData.wings = wings;
  return g;
}

function buildImp() {
  const g = new THREE.Group();
  part(g, G.ico, EM.cloud, 1.3, 0.6, 1.1, 0, -1.2, 0);
  part(g, G.ico, EM.cloud, 0.9, 0.5, 0.8, 1.0, -1.1, -0.2);
  part(g, G.ico, EM.cloud, 0.9, 0.5, 0.8, -1.0, -1.15, 0.2);
  part(g, G.sphere, EM.blue, 0.72, 0.75, 0.65, 0, -0.1, 0);
  part(g, G.sphere, EM.blue, 0.65, 0.62, 0.62, 0, 0.95, 0.05);
  part(g, G.cone, EM.horn, 0.16, 0.55, 0.16, 0, 1.75, 0);
  for (const s of [-1, 1]) {
    part(g, G.sphere, EM.white, 0.2, 0.22, 0.12, s * 0.24, 1.05, 0.55);
    part(g, G.sphere, EM.redEye, 0.09, 0.1, 0.06, s * 0.24, 1.03, 0.66);
    part(g, G.sphere, EM.blue, 0.2, 0.2, 0.2, s * 0.75, 0.0, 0.25);
  }
  part(g, G.box, EM.dark, 0.4, 0.1, 0.1, 0, 0.72, 0.6);
  const fork = part(g, G.cyl, EM.gold, 0.04, 2.2, 0.04, 0.85, 0.4, 0.3); fork.rotation.z = 0.2;
  part(g, G.cone, EM.gold, 0.12, 0.4, 0.12, 0.62, 1.55, 0.3);
  return g;
}

function buildPeach() {
  const g = new THREE.Group();
  part(g, G.sphere, EM.peach, 1.0, 1.05, 1.0, 0, 0, 0);
  part(g, G.cone, EM.peach, 0.35, 0.5, 0.35, 0, 1.1, 0);
  const l1 = part(g, G.sphere, EM.leaf, 0.5, 0.12, 0.25, 0.45, -0.85, 0.2); l1.rotation.z = 0.4;
  const l2 = part(g, G.sphere, EM.leaf, 0.5, 0.12, 0.25, -0.45, -0.85, 0.2); l2.rotation.z = -0.4;
  g.add(glowSprite(0xff9ec0, 4.5, 0.7));
  return g;
}

// ============================================================
// Targets (anything the player can shoot)
// ============================================================
function addTarget(o) {
  Object.assign(o, { alive: true, t: 0, hitT: 0, lockCd: 0, maxHp: o.hp, gone: false });
  if (o.lockable === undefined) o.lockable = true;
  if (!o.noAdd) rail.add(o.obj);
  if (o.countable) stats.spawned++;
  targets.push(o);
  return o;
}
function tpos(e, out) {
  if (e.obj.parent === rail) return out.copy(e.obj.position);
  return e.obj.getWorldPosition(out).sub(rail.position);
}
function isInvuln(e) { return e.shield || (e.invuln && e.invuln()); }

function damage(e, amt, volley) {
  if (!e.alive) return;
  if (isInvuln(e)) { tpos(e, _v5); spark(_v5); audio.sfx('spark'); return; }
  e.hp -= amt; e.hitT = 0.12; audio.sfx('hit');
  if (e.hp <= 0) kill(e, volley);
}
function kill(e, volley) {
  e.alive = false;
  const p = tpos(e, new THREE.Vector3());
  if (e.score) { score += e.score; popup(p, `+${e.score}`, '#fff6c0'); }
  if (e.countable) stats.kills++;
  explode(p, e.radius, e.boomColor || 0xffa040);
  if (volley) volley.kills++;
  if (e.onKill) e.onKill(e);
}

function enemyFire(from, speed = 24, yaw = 0, aimOverride = null) {
  const dir = (aimOverride ? _v4.copy(aimOverride) : _v4.subVectors(DR.headPos, from)).normalize();
  if (yaw) dir.applyAxisAngle(UP, yaw);
  const obj = new THREE.Group();
  obj.add(new THREE.Mesh(G.lowSphere, basic(0xff6a10)));
  obj.children[0].scale.setScalar(0.45);
  obj.add(glowSprite(0xff7a20, 1.9, 0.85));
  obj.position.copy(from);
  rail.add(obj);
  ebullets.push({ obj, vel: dir.clone().multiplyScalar(speed), life: 7 });
}

// --- Lanterns: come from the front, hover and shoot, then leave
function spawnLantern(x, y, z, holdZ) {
  const obj = buildLantern(); obj.position.set(x, y, z);
  addTarget({ obj, kind: 'lantern', hp: 2, radius: 1.7, score: 100, countable: true,
    bx: x, by: y, holdZ, ph: rand(0, TAU), fireT: rand(2, 3.2), side: x >= 0 ? 1 : -1,
    update(e, dt) {
      const p = e.obj.position;
      p.z += (e.holdZ - p.z) * (1 - Math.exp(-dt * 1.1));
      if (e.t > 9) { e.by += 12 * dt; e.bx += e.side * 14 * dt; }
      p.x = e.bx + Math.sin(e.t * 1.3 + e.ph) * 3;
      p.y = e.by + Math.sin(e.t * 1.9 + e.ph) * 1.4;
      e.obj.rotation.z = Math.sin(e.t * 2 + e.ph) * 0.15;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.t < 10) { e.fireT = rand(2.2, 3.2); enemyFire(p, 22); }
      if (e.t > 15) e.gone = true;
    } });
}
function lanternArc(n, yBase = 2) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 9;
    later(i * 0.25, () => spawnLantern(x, yBase + rand(-2, 4), -170 - i * 4, -48 - Math.abs(x) * 0.3));
  }
}

// --- Bats: fast fly-bys in formation
function spawnBat(pos, vel, opts = {}) {
  const obj = buildBat(); obj.position.copy(pos);
  addTarget({ obj, kind: 'bat', hp: 1, radius: 1.2, score: 50, countable: !opts.summoned, boomColor: 0xc28aff,
    vel: vel.clone(), ph: rand(0, TAU), fireAt: opts.fireAt ?? -1, fired: false,
    update(e, dt) {
      const p = e.obj.position;
      p.addScaledVector(e.vel, dt);
      p.y += Math.sin(e.t * 3 + e.ph) * 3 * dt;
      _v5.set(-e.vel.z, 0, e.vel.x).normalize();
      p.addScaledVector(_v5, Math.cos(e.t * 2.5 + e.ph) * 4 * dt);
      for (const w of e.obj.userData.wings) w.piv.rotation.z = w.s * Math.sin(e.t * 16 + e.ph) * 0.8;
      if (!e.fired && e.fireAt >= 0 && e.t > e.fireAt) { e.fired = true; enemyFire(p, 22); }
      if (e.t > 1 && (Math.abs(p.x) > 150 || p.z > 110 || p.z < -280 || e.t > 14)) e.gone = true;
    } });
}
function batsFrom(side, n, lat = 0) {
  for (let i = 0; i < n; i++) {
    later(i * 0.18, () => {
      const y = rand(-1, 6);
      if (side === 'back') spawnBat(_v1.set(lat * 10 + rand(-4, 4), y, 75), _v2.set(0, 0, -46));
      if (side === 'front') spawnBat(_v1.set(lat * 8 + rand(-4, 4), y, -200), _v2.set(0, 0, 58), { fireAt: 1.4 });
      if (side === 'right') spawnBat(_v1.set(115, y, rand(-45, -10)), _v2.set(-48, 0, 6), { fireAt: 1.2 });
      if (side === 'left') spawnBat(_v1.set(-115, y, rand(-45, -10)), _v2.set(48, 0, 6), { fireAt: 1.2 });
    });
  }
}

// --- Cloud imps: hover at your side and shoot
function spawnImp(sideSign, z) {
  const obj = buildImp(); const y = rand(-2, 7);
  obj.position.set(sideSign * 125, y, z);
  addTarget({ obj, kind: 'imp', hp: 3, radius: 1.9, score: 150, countable: true, boomColor: 0x80b8ff,
    hx: sideSign * rand(36, 46), by: y, fireT: rand(2.2, 3.5), ph: rand(0, TAU),
    update(e, dt) {
      const p = e.obj.position;
      p.x += (e.hx - p.x) * (1 - Math.exp(-dt * 1.3));
      p.y = e.by + Math.sin(e.t * 1.6 + e.ph) * 1.6;
      if (e.t > 12) e.by += 14 * dt;
      e.fireT -= dt;
      if (e.fireT <= 0 && e.t > 2 && e.t < 12) { e.fireT = rand(2.4, 3.4); enemyFire(p, 21); }
      if (e.t > 17) e.gone = true;
    } });
}
function imps(side, n) {
  const s = side === 'right' ? 1 : -1;
  for (let i = 0; i < n; i++) later(i * 0.5, () => spawnImp(s, -28 + i * 22));
}

// --- Healing peach
function spawnPeach() {
  const obj = buildPeach(); obj.position.set(rand(-6, 6), rand(1, 5), -190);
  addTarget({ obj, kind: 'peach', hp: 1, radius: 1.5, score: 0, boomColor: 0xff9ec0,
    update(e, dt) {
      const p = e.obj.position; p.z += 32 * dt; p.y += Math.sin(e.t * 2) * 2 * dt; e.obj.rotation.y += dt;
      if (p.z > 60) e.gone = true;
    },
    onKill() { hp = Math.min(100, hp + 30); audio.sfx('heal'); msg('仙桃で龍気が回復！', 'good', 1.8); } });
  msg('仙桃が流れてきた！ 撃てば回復', 'good', 2.2);
}

// ============================================================
// Boss: the fire-cloud bull demon
// ============================================================
function makeHorn(side) {
  const g = new THREE.Group(); g.position.set(side * 3.0, 2.0, 0.2);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 2.2, 1.0, 0.3),
    new THREE.Vector3(side * 3.4, 3.2, 0.9), new THREE.Vector3(side * 2.8, 5.2, 1.6)]);
  const pts = curve.getPoints(5);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const r0 = 0.85 * (1 - k / 5.5), r1 = 0.85 * (1 - (k + 1) / 5.5);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(r1, 0.12), r0, len * 1.08, 9), EM.gold);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, _v1.subVectors(b, a).normalize());
    g.add(m);
  }
  const marker = new THREE.Object3D(); marker.position.copy(pts[3]); g.add(marker);
  return { group: g, marker };
}

function spawnBoss() {
  const root = new THREE.Group(); root.position.set(0, 14, -300); root.scale.setScalar(1.5); rail.add(root);
  const hide = toon(0x9c2f2f), snout = toon(0xd9a066), fire = toon(0xff7b1c, { emissive: 0x7a2000 });
  const head = part(root, G.sphere, hide, 4, 3.6, 3.8, 0, 0, 0);
  part(root, G.sphere, snout, 2.5, 1.7, 1.9, 0, -1.6, 3.0);
  for (const s of [-1, 1]) {
    part(root, G.sphere, EM.black, 0.35, 0.3, 0.2, s * 0.8, -1.2, 4.8);
    part(root, G.sphere, basic(0xffd23f), 0.75, 0.55, 0.4, s * 1.6, 0.9, 3.3);
    part(root, G.sphere, EM.black, 0.3, 0.3, 0.2, s * 1.6, 0.85, 3.65);
    const brow = part(root, G.box, EM.black, 1.6, 0.35, 0.4, s * 1.6, 1.65, 3.25); brow.rotation.z = s * 0.35;
    const ear = part(root, G.sphere, hide, 1.4, 0.5, 0.8, s * 4.2, 0.6, -0.5); ear.rotation.z = s * -0.4;
  }
  const ring = part(root, G.torus, EM.gold, 0.9, 0.9, 2.5, 0, -2.2, 4.8); ring.rotation.x = Math.PI / 2;
  const fireRing = new THREE.Group(); fireRing.position.y = -4; root.add(fireRing);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    part(fireRing, G.ico, fire, rand(1.3, 2), 1.1, rand(1.3, 2), Math.cos(a) * 4, rand(-0.5, 0.5), Math.sin(a) * 4);
    const gl = glowSprite(0xff8a30, 5, 0.6); gl.position.set(Math.cos(a) * 4, 0, Math.sin(a) * 4); fireRing.add(gl);
  }
  const core = new THREE.Mesh(G.octa, basic(0x335566)); core.scale.setScalar(0.9); core.position.set(0, 2.5, 3.5); root.add(core);
  const coreGlow = glowSprite(0x7ff6ff, 5, 0); core.add(coreGlow);
  const hornL = makeHorn(-1), hornR = makeHorn(1); root.add(hornL.group, hornR.group);

  boss = { root, fireRing, core, coreGlow, t: 0, phase: 0, hornsLeft: 2, theta: 0, thetaTarget: 0,
    seqI: 0, seqT: 0, fireT: 2.5, summonT: 7, dying: 0, boomT: 0, parts: [] };

  boss.parts.push(addTarget({ obj: head, noAdd: true, hp: 1e9, radius: 6.3, lockable: false, shield: true, score: 0, update() {} }));
  for (const horn of [hornL, hornR]) {
    boss.parts.push(addTarget({ obj: horn.marker, noAdd: true, hp: 20, radius: 2.8, score: 1000, boomColor: 0xffd040,
      update() {},
      onKill() {
        horn.group.visible = false; boss.hornsLeft--; shake = 0.5;
        if (boss.hornsLeft === 0) {
          boss.phase = 2; boss.seqT = 0; boss.fireT = 2;
          core.material.color.set(0x7ff6ff); coreGlow.material.opacity = 0.9;
          msg('角を折った！ 次は額の宝珠を狙え！', 'warn', 2.6);
        } else msg('角を一本折った！', 'good', 1.6);
      } }));
  }
  boss.parts.push(addTarget({ obj: core, noAdd: true, hp: 60, radius: 2.2, score: 5000, boomColor: 0x9ff8ff,
    invuln: () => boss.phase < 2, update() {},
    onKill() {
      boss.dying = 3; core.visible = false;
      for (const p of boss.parts) p.alive = false;
      for (const b of ebullets) rail.remove(b.obj); ebullets.length = 0;
      msg('火雲魔牛を打ち破った！', 'good', 3);
    } }));
  msg('火雲魔牛 出現！ まずは二本の角を折れ！', 'warn', 3);
}

const BOSS_DIRS = ['前', '右', '後ろ', '左'];
function updateBoss(dt) {
  const b = boss; b.t += dt; const R = b.root;
  b.fireRing.rotation.y += dt * 1.5;
  if (b.dying > 0) {
    b.dying -= dt; b.boomT -= dt; shake = Math.max(shake, 0.3);
    if (b.boomT <= 0) {
      b.boomT = 0.15;
      _v1.set(rand(-4, 4), rand(-4, 4), rand(-3, 3)).add(R.position); explode(_v1, 2.2, Math.random() < 0.5 ? 0xffa040 : 0xffe080);
    }
    R.rotation.z += dt * 0.6; R.position.y -= dt * 5;
    if (b.dying <= 0) {
      explode(R.position, 7, 0xffd060); shake = 1;
      rail.remove(R);
      for (const p of b.parts) p.gone = true;
      boss = null;
      score += Math.round(hp * 50);
      popup(DR.headPos.clone().add(_v1.set(0, 3, -6)), `残り龍気ボーナス +${Math.round(hp * 50)}`, '#bff');
      endGame(true);
    }
    return;
  }
  const tp = _v1;
  if (b.phase < 2) {
    tp.set(Math.sin(b.t * 0.45) * 14, 5 + Math.sin(b.t * 0.8) * 3, -68);
    if (b.phase === 0 && R.position.z > -80) b.phase = 1;
  } else {
    b.seqT += dt;
    if (b.seqT > 7.5) {
      b.seqT = 0; b.seqI++; b.thetaTarget -= Math.PI / 2;
      msg(`魔牛が${BOSS_DIRS[b.seqI % 4]}へ回り込む！`, 'warn', 1.8);
    }
    b.theta += (b.thetaTarget - b.theta) * (1 - Math.exp(-dt * 0.9));
    tp.set(-Math.sin(b.theta) * 64, 4 + Math.sin(b.t) * 3, -Math.cos(b.theta) * 64);
    b.core.rotation.y += dt * 3;
    b.coreGlow.material.opacity = 0.6 + Math.sin(b.t * 8) * 0.3;
  }
  R.position.lerp(tp, 1 - Math.exp(-dt * (b.phase === 0 ? 0.7 : 1.4)));
  R.lookAt(_v2.copy(DR.headPos).add(rail.position));

  if (b.phase >= 1) {
    const mouth = _v3.set(0, -2.2, 7.5).applyQuaternion(R.quaternion).add(R.position);
    b.fireT -= dt;
    if (b.fireT <= 0) {
      if (b.phase === 1) {
        for (let k = -2; k <= 2; k++) enemyFire(mouth, 24, k * 0.17);
        b.fireT = 2.3;
      } else {
        const aim = _v4.subVectors(DR.headPos, mouth).normalize();
        const u = new THREE.Vector3().crossVectors(aim, UP).normalize();
        const v = new THREE.Vector3().crossVectors(u, aim).normalize();
        const a0 = aim.clone();
        enemyFire(mouth, 26);
        for (let k = 0; k < 8; k++) {
          const ph = (k / 8) * TAU;
          const d = a0.clone().addScaledVector(u, Math.cos(ph) * 0.3).addScaledVector(v, Math.sin(ph) * 0.3);
          enemyFire(mouth, 24, 0, d);
        }
        b.fireT = 1.8;
      }
    }
    b.summonT -= dt;
    if (b.summonT <= 0) {
      b.summonT = 9;
      for (let k = 0; k < 4; k++) {
        const vel = _v5.subVectors(DR.headPos, R.position).normalize().multiplyScalar(38);
        vel.x += rand(-6, 6); vel.y += rand(-3, 3);
        spawnBat(_v2.copy(R.position).add(_v1.set(rand(-5, 5), rand(-2, 4), rand(-3, 3))), vel, { summoned: true });
      }
    }
  }
}

// ============================================================
// Stage timeline (seconds)
// ============================================================
const TIMELINE = [
  [2, () => { msg(COARSE ? '前方に妖怪！ タップで撃て' : '前方に妖怪！ クリックで撃て', 'info'); lanternArc(5); }],
  [9, () => { msg(COARSE ? '後ろから来るぞ！ ◀▶で視点を回せ' : '後ろから来るぞ！ Q・Eで視点を回せ', 'warn', 3); batsFrom('back', 6, -1); }],
  [16, () => { msg(COARSE ? '押したままなぞるとロックオン！' : '長押しで照準をなぞるとロックオン！', 'info', 3); lanternArc(4, 6); }],
  [22, () => { msg('右方に敵！', 'warn'); imps('right', 3); }],
  [30, () => batsFrom('front', 8, 1)],
  [36, () => { msg('左方に敵！', 'warn'); imps('left', 3); }],
  [41, () => spawnPeach()],
  [44, () => { lanternArc(5); batsFrom('back', 6, 1); }],
  [52, () => { msg('左右から挟み撃ち！', 'warn'); imps('right', 2); imps('left', 2); }],
  [59, () => { batsFrom('right', 6); batsFrom('left', 6); }],
  [65, () => lanternArc(6, 4)],
  [71, () => { msg('後方から大群！', 'warn'); batsFrom('back', 8, -1); later(1.5, () => batsFrom('back', 8, 1)); }],
  [77, () => spawnPeach()],
  [79, () => { lanternArc(4); imps('left', 2); }],
  [87, () => { msg('⚠ 強大な妖気が近づいてくる…', 'boss', 4); audio.sfx('warn'); audio.setSong('boss'); }],
  [92, () => spawnBoss()],
];

// ============================================================
// Player weapons
// ============================================================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();

function aimPoint(out) {
  let best = null, bestProj = 1e9;
  for (const e of targets) {
    if (!e.alive || !e.lockable || isInvuln(e)) continue;
    tpos(e, _v4).sub(rayO);
    const proj = _v4.dot(rayD);
    if (proj < 5 || proj > 230) continue;
    const perp2 = _v4.lengthSq() - proj * proj;
    const r = e.radius * 1.4 + 1;
    if (perp2 < r * r && proj < bestProj) { bestProj = proj; best = e; }
  }
  if (best) return tpos(best, out);
  return out.copy(rayO).addScaledVector(rayD, 140);
}

const shotMat = basic(0xa8f6ff);
function fireShot() {
  if (shotCd > 0) return;
  shotCd = 0.09;
  const from = DR.pearl.position;
  const to = aimPoint(_v1);
  const vel = _v2.subVectors(to, from).normalize().multiplyScalar(175);
  const obj = new THREE.Group();
  const core = new THREE.Mesh(G.lowSphere, shotMat); core.scale.set(0.22, 0.22, 1.4); obj.add(core);
  obj.add(glowSprite(0x8ff0ff, 1.8, 0.8));
  obj.position.copy(from);
  obj.lookAt(_v3.copy(from).add(vel).add(rail.position));
  rail.add(obj);
  shots.push({ obj, vel: vel.clone(), life: 1.2, prev: from.clone() });
  audio.sfx('shot');
}

function pressFire() {
  input.down = true; input.holdT = 0;
  fireShot();
}
function releaseFire() {
  if (!input.down) return;
  input.down = false;
  if (lockMode && locks.length) releaseLocks();
  lockMode = false; locks.length = 0;
}

function releaseLocks() {
  const volley = { kills: 0, n: locks.length, done: 0 };
  const a = view.angle;
  const right = _v1.set(Math.cos(a), 0, -Math.sin(a));
  const fwd = viewDir(a, _v2);
  locks.forEach((L, i) => {
    const obj = glowSprite(0xffe066, 1.6, 1);
    obj.position.copy(DR.pearl.position);
    rail.add(obj);
    const vel = new THREE.Vector3().addScaledVector(right, rand(-1, 1) * 28).addScaledVector(UP, rand(0.4, 1) * 26).addScaledVector(fwd, 18);
    const trail = [];
    for (let k = 0; k < 9; k++) {
      const s = glowSprite(0xffc23d, 1.3 * (1 - k / 10), 0.8 * (1 - k / 10)); s.visible = false; rail.add(s); trail.push(s);
    }
    homings.push({ obj, target: L.target, vel, t: -i * 0.05, volley, trail, hist: [], life: 3 });
  });
  audio.sfx('release');
}

function updateLocking(dt) {
  if (input.down) {
    input.holdT += dt;
    if (input.holdT > 0.2) lockMode = true;
  }
  for (let i = locks.length - 1; i >= 0; i--) if (!locks[i].target.alive) locks.splice(i, 1);
  if (!lockMode || locks.length >= 6) return;
  for (const e of targets) {
    if (locks.length >= 6) break;
    if (!e.alive || !e.lockable || e.lockCd > 0 || isInvuln(e)) continue;
    tpos(e, _v4);
    if (_v4.distanceTo(DR.headPos) > 220) continue;
    if (!toScreen(_v4, scr)) continue;
    const dx = scr.x - input.x, dy = scr.y - input.y;
    if (dx * dx + dy * dy > 50 * 50) continue;
    let count = 0; for (const L of locks) if (L.target === e) count++;
    if (count < Math.min(Math.ceil(e.hp / 2), 6)) {
      locks.push({ target: e, t: 0 }); e.lockCd = 0.13; audio.sfx('lock');
    }
  }
}

// ============================================================
// Effects
// ============================================================
function explode(pos, size = 1.5, color = 0xffa040) {
  const n = Math.round(6 + size * 3);
  for (let k = 0; k < n; k++) {
    const s = glowSprite(k % 2 ? color : 0xfff0b0, size * rand(1.2, 2.2), 1);
    s.position.copy(pos); rail.add(s);
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(size * rand(4, 10));
    fx.push({ obj: s, vel: v, life: rand(0.45, 0.85), t: 0, base: s.scale.x });
  }
  const fl = glowSprite(0xffffff, size * 5, 1); fl.position.copy(pos); rail.add(fl);
  fx.push({ obj: fl, vel: new THREE.Vector3(), life: 0.18, t: 0, base: size * 5 });
  audio.sfx('explode', Math.min(size / 2, 3));
}
function spark(pos) {
  for (let k = 0; k < 4; k++) {
    const s = glowSprite(0xfff0a0, 0.8, 1); s.position.copy(pos); rail.add(s);
    fx.push({ obj: s, vel: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(12), life: 0.25, t: 0, base: 0.8 });
  }
}

// ============================================================
// Update
// ============================================================
const scr = { x: 0, y: 0 };
const camFwd = new THREE.Vector3();
function toScreen(local, out) {
  _w.copy(local).add(rail.position);
  _v5.copy(_w).sub(camera.getWorldPosition(_v3));
  if (_v5.dot(camFwd) <= 0.5) return false;
  _w.project(camera);
  out.x = (_w.x + 1) / 2 * W; out.y = (1 - _w.y) / 2 * H;
  return true;
}

function updateDragon(dt) {
  const rx = (input.x / W) * 2 - 1, ry = -((input.y / H) * 2 - 1);
  const a = view.angle;
  const right = _v1.set(Math.cos(a), 0, -Math.sin(a));
  const target = _v2.copy(right).multiplyScalar(rx * 10); target.y = ry * 6;
  if (state !== 'play') target.set(Math.sin(clock * 0.5) * 5, Math.sin(clock * 0.7) * 2, 0);
  const prev = _v3.copy(DR.offset);
  DR.offset.lerp(target, 1 - Math.exp(-dt * 3));
  if (dt > 0) DR.vel.subVectors(DR.offset, prev).divideScalar(dt);
  const t = clock;
  DR.headPos.set(DR.offset.x + Math.sin(t * 2.1) * 0.45, DR.offset.y + Math.sin(t * 1.5) * 0.35, DR.offset.z);
  DR.head.position.copy(DR.headPos);
  DR.head.lookAt(_v4.set(DR.vel.x * 0.12, DR.vel.y * 0.12, -4).add(DR.headPos).add(rail.position));
  for (const w of DR.whiskers) w.g.rotation.set(Math.sin(t * 3 + w.s) * 0.15, w.s * Math.sin(t * 2.3) * 0.2, 0);

  const P = DR.segPos;
  P[0].copy(DR.headPos); P[0].z += 0.75; P[0].y -= 0.1;
  for (let i = 1; i < DR.N; i++) {
    const p = P[i];
    p.z += 22 * dt; p.y -= 3 * dt;
    const d = _v4.subVectors(p, P[i - 1]); const L = d.length() || 1;
    p.copy(P[i - 1]).addScaledVector(d, DR.spacing / L);
  }
  for (let i = 0; i < DR.N; i++) {
    const k = Math.min(1, i / 4);
    DR.segs[i].position.set(
      P[i].x + Math.sin(t * 4 - i * 0.55) * 0.35 * k,
      P[i].y + Math.cos(t * 3.1 - i * 0.5) * 0.25 * k, P[i].z);
  }
  DR.rider.position.copy(DR.segs[2].position); DR.rider.position.y += DR.segR[2] * 0.75;
  DR.pearl.position.set(DR.headPos.x + Math.sin(t * 3) * 0.4, DR.headPos.y + 0.2 + Math.cos(t * 2.6) * 0.3, DR.headPos.z - 2.8);
  DR.group.visible = state === 'over' ? false : (invuln > 0 ? Math.floor(invuln * 14) % 2 === 0 : true);
}

function updateCamera(dt) {
  view.angle += (view.target - view.angle) * (1 - Math.exp(-dt * 7));
  const a = view.angle;
  const dir = viewDir(a, _v1);
  camera.position.copy(DR.offset).multiplyScalar(0.55).addScaledVector(dir, -13.5);
  camera.position.y += 4.2;
  if (shake > 0) camera.position.add(_v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.7));
  const look = _v3.copy(DR.offset).multiplyScalar(0.55).addScaledVector(dir, 40); look.y += 1.5;
  camera.lookAt(look.add(rail.position));
  camera.updateMatrixWorld();
  camera.getWorldDirection(camFwd);
  // follow the camera with sky and sun
  camera.getWorldPosition(_v4);
  sky.position.copy(_v4);
  sunGlow.position.copy(_v4).addScaledVector(sunDir, 800);
  sunCore.position.copy(sunGlow.position);
  // aim ray in rail-local coordinates
  ndc.set((input.x / W) * 2 - 1, -(input.y / H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  rayO.copy(raycaster.ray.origin).sub(rail.position);
  rayD.copy(raycaster.ray.direction);
}

function updateWeapons(dt) {
  shotCd -= dt;
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    s.prev.copy(s.obj.position);
    s.obj.position.addScaledVector(s.vel, dt);
    let hitE = null, hitT = 2;
    for (const e of targets) {
      if (!e.alive) continue;
      const r = segPoint(s.prev, s.obj.position, tpos(e, _v4));
      if (r.d2 < (e.radius + 0.5) ** 2 && r.t < hitT) { hitT = r.t; hitE = e; }
    }
    let used = false;
    if (hitE) { damage(hitE, 1); used = true; }
    else {
      for (let j = ebullets.length - 1; j >= 0; j--) {
        const b = ebullets[j];
        if (segPoint(s.prev, s.obj.position, b.obj.position).d2 < 1.3) {
          spark(b.obj.position); score += 10; rail.remove(b.obj); ebullets.splice(j, 1); used = true; break;
        }
      }
    }
    if (used || s.life <= 0) { rail.remove(s.obj); shots.splice(i, 1); }
  }

  for (let i = homings.length - 1; i >= 0; i--) {
    const h = homings[i]; h.t += dt;
    if (h.t < 0) continue;
    const p = h.obj.position;
    const tgt = h.target;
    const speed = Math.min(150, 50 + h.t * 160);
    if (tgt.alive) {
      tpos(tgt, _v4);
      const desired = _v5.subVectors(_v4, p).normalize().multiplyScalar(speed);
      h.vel.lerp(desired, Math.min(1, dt * (3 + h.t * 14)));
    } else {
      h.vel.setLength(speed);
    }
    const prev = _v3.copy(p);
    p.addScaledVector(h.vel, dt);
    h.hist.unshift(p.clone()); if (h.hist.length > h.trail.length * 2) h.hist.pop();
    h.trail.forEach((s, k) => { const q = h.hist[k * 2]; if (q) { s.visible = true; s.position.copy(q); } });
    h.life -= dt;
    let done = h.life <= 0;
    if (tgt.alive && segPoint(prev, p, tpos(tgt, _v4)).d2 < (tgt.radius + 0.6) ** 2) {
      damage(tgt, 2, h.volley); done = true;
    }
    if (done) {
      rail.remove(h.obj); h.obj.material.dispose();
      h.trail.forEach((s) => { rail.remove(s); s.material.dispose(); });
      homings.splice(i, 1);
      h.volley.done++;
      if (h.volley.done === h.volley.n && h.volley.kills >= 2) {
        const k = h.volley.kills, bonus = k * k * 50;
        score += bonus; audio.sfx('bonus');
        popup(DR.headPos.clone().add(_v1.set(0, 3, 0)).addScaledVector(viewDir(view.angle, _v2), 12), `${k}連破！ +${bonus}`, '#ffd34d');
      }
    }
  }
}

function updateEnemies(dt) {
  for (const e of targets) {
    if (!e.alive) continue;
    e.t += dt; e.lockCd -= dt;
    e.update(e, dt);
    if (e.hitT > 0) { e.hitT -= dt; }
    if (e.obj.parent === rail) {
      e.obj.scale.setScalar(e.hitT > 0 ? 1.18 : 1);
      if (e.kind !== 'peach') e.obj.lookAt(_v1.copy(DR.headPos).add(rail.position));
      // collision with the dragon
      if (state === 'play' && e.obj.position.distanceTo(DR.headPos) < e.radius + 1.3) {
        hurt(14); damage(e, 5);
      }
    }
  }
  for (let i = targets.length - 1; i >= 0; i--) {
    const e = targets[i];
    if (!e.alive || e.gone) {
      if (e.obj.parent === rail) rail.remove(e.obj);
      e.alive = false;
      targets.splice(i, 1);
    }
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i]; b.life -= dt;
    b.obj.position.addScaledVector(b.vel, dt);
    let hit = false;
    if (state === 'play') {
      if (b.obj.position.distanceTo(DR.headPos) < 1.5) hit = true;
      else for (let k = 0; k < 8; k++) if (b.obj.position.distanceTo(DR.segs[k].position) < DR.segR[k] + 0.45) { hit = true; break; }
    }
    if (hit) hurt(8);
    if (hit || b.life <= 0) { rail.remove(b.obj); ebullets.splice(i, 1); }
  }
  if (boss) updateBoss(dt);
}

function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    f.obj.position.addScaledVector(f.vel, dt); f.vel.multiplyScalar(Math.exp(-dt * 4));
    const k = f.t / f.life;
    f.obj.material.opacity = 1 - k;
    f.obj.scale.setScalar(f.base * (1 + k * 1.5));
    if (k >= 1) { rail.remove(f.obj); f.obj.material.dispose(); fx.splice(i, 1); }
  }
  for (let i = popups.length - 1; i >= 0; i--) { popups[i].t += dt; if (popups[i].t > 1.2) popups.splice(i, 1); }
}

function update(dt) {
  clock += dt;
  dist += SPEED * dt;
  railAt(dist, rail.position);
  rail.updateMatrixWorld(true);

  if (state === 'play') {
    gameT += dt; stageT += dt;
    while (timelineI < TIMELINE.length && TIMELINE[timelineI][0] <= stageT) { TIMELINE[timelineI][1](); timelineI++; }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t <= gameT) { const q = queue[i]; queue.splice(i, 1); q.fn(); }
    // keyboard aiming
    const k = input.keys, sp = 650 * dt;
    if (k.ArrowLeft || k.KeyA) input.x -= sp;
    if (k.ArrowRight || k.KeyD) input.x += sp;
    if (k.ArrowUp || k.KeyW) input.y -= sp;
    if (k.ArrowDown || k.KeyS) input.y += sp;
    input.x = clamp(input.x, 0, W); input.y = clamp(input.y, 0, H);
    invuln -= dt;
  }
  shake = Math.max(0, shake - dt * 1.5);
  flash = Math.max(0, flash - dt * 1.5);

  updateDragon(dt);
  updateCamera(dt);
  updateScenery();
  updateStreaks(dt);
  if (state === 'play' || state === 'clear' || state === 'over') {
    updateLocking(dt);
    updateWeapons(dt);
    updateEnemies(dt);
  }
  updateFx(dt);
  if (message) { message.t += dt; if (message.t > message.dur) message = null; }
}

// ============================================================
// HUD
// ============================================================
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",Meiryo,sans-serif';
function drawHUD() {
  ctx.clearRect(0, 0, W, H);
  if (state === 'title') return;

  if (flash > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,40,20,${flash * 0.7})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // score popups
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of popups) {
    if (!toScreen(_v1.copy(p.pos).add(_v2.set(0, p.t * 3, 0)), scr)) continue;
    ctx.globalAlpha = 1 - p.t / 1.2;
    ctx.font = `bold 16px ${FONT}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(p.text, scr.x, scr.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, scr.x, scr.y);
  }
  ctx.globalAlpha = 1;

  // lock markers
  const seen = new Map();
  for (const L of locks) seen.set(L.target, (seen.get(L.target) || 0) + 1);
  for (const [e, n] of seen) {
    if (!toScreen(tpos(e, _v1), scr)) continue;
    const r = 16 + e.radius * 2;
    ctx.save(); ctx.translate(scr.x, scr.y); ctx.rotate(clock * 3);
    ctx.strokeStyle = '#ff4d2e'; ctx.lineWidth = 3;
    for (let q = 0; q < 4; q++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(r, r - 8); ctx.lineTo(r, r); ctx.lineTo(r - 8, r); ctx.stroke();
    }
    ctx.restore();
    if (n > 1) { ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#ffde59'; ctx.fillText(`×${n}`, scr.x + r + 10, scr.y - r); }
  }

  if (state === 'play') drawReticle();

  // HP gauge
  const x0 = 18, y0 = 16, bw = Math.min(220, W * 0.42);
  ctx.textAlign = 'left'; ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4;
  ctx.fillText('龍気', x0, y0 + 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(x0 + 40, y0, bw, 16, 8); ctx.fill();
  const hg = ctx.createLinearGradient(x0 + 40, 0, x0 + 40 + bw, 0);
  hg.addColorStop(0, hp > 30 ? '#3ee08f' : '#ff5a3c'); hg.addColorStop(1, hp > 30 ? '#c6ff7a' : '#ffb03c');
  ctx.fillStyle = hg; roundRect(x0 + 40, y0, bw * hp / 100, 16, 8); ctx.fill();
  ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#fff'; ctx.shadowBlur = 4;
  ctx.fillText(`得点 ${score.toLocaleString()}`, x0, y0 + 40);
  ctx.shadowBlur = 0;

  drawRadar();

  // view label
  ctx.textAlign = 'center'; ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4;
  ctx.fillText(COARSE ? VIEW_NAMES[view.idx] : `◀ Q　　${VIEW_NAMES[view.idx]}　　E ▶`, W / 2, H - 30);
  ctx.shadowBlur = 0;

  // boss gauge
  if (boss && boss.dying <= 0) {
    let cur = 0, max = 0;
    for (const p of boss.parts) { if (p.shield) continue; max += p.maxHp; cur += Math.max(0, p.alive ? p.hp : 0); }
    const bw2 = Math.min(360, W * 0.6), bx = W / 2 - bw2 / 2, by = 62;
    ctx.font = `bold 14px ${FONT}`; ctx.fillStyle = '#ffd0b0'; ctx.fillText('火雲魔牛', W / 2, by - 10);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; roundRect(bx, by, bw2, 10, 5); ctx.fill();
    ctx.fillStyle = '#ff6a3c'; roundRect(bx, by, bw2 * cur / max, 10, 5); ctx.fill();
  }

  // message banner
  if (message) {
    const m = message, a = Math.min(1, m.t * 5, (m.dur - m.t) * 3);
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `bold ${Math.min(m.style === 'boss' ? 26 : 22, W / 18)}px ${FONT}`;
    const tw = ctx.measureText(m.text).width;
    const y = Math.max(H * 0.24, 200);
    ctx.fillStyle = m.style === 'warn' || m.style === 'boss' ? 'rgba(150,20,10,.55)' : m.style === 'good' ? 'rgba(20,110,60,.5)' : 'rgba(10,40,90,.45)';
    roundRect(W / 2 - tw / 2 - 20, y - 22, tw + 40, 44, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(m.text, W / 2, y + 1);
    ctx.globalAlpha = 1;
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawReticle() {
  const x = input.x, y = input.y;
  ctx.save(); ctx.translate(x, y);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = lockMode ? '#ffd34d' : 'rgba(255,255,255,.95)';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3;
  if (lockMode) ctx.rotate(clock * 4);
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
  for (let q = 0; q < 4; q++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 26); ctx.stroke();
  }
  ctx.restore();
  if (lockMode) {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < locks.length ? '#ff4d2e' : 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(x - 25 + i * 10, y + 36, 3.5, 0, TAU); ctx.fill();
    }
  }
}

function drawRadar() {
  const R = 46, cx = W - R - 16, cy = R + 16;
  ctx.save();
  ctx.fillStyle = 'rgba(10,30,60,.45)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  // threat per quadrant (0 front, 1 right, 2 back, 3 left)
  const threat = [0, 0, 0, 0];
  const dots = [];
  for (const e of targets) {
    if (!e.alive || e.shield) continue;
    tpos(e, _v1);
    const dx = _v1.x - DR.offset.x, dz = _v1.z - DR.offset.z;
    const ang = Math.atan2(dx, -dz); // 0 = front, +PI/2 = right
    const q = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
    if (e.kind !== 'peach') threat[q]++;
    const d = Math.min(1, Math.hypot(dx, dz) / 160);
    dots.push({ x: cx + Math.sin(ang) * d * (R - 5), y: cy - Math.cos(ang) * d * (R - 5), e });
  }
  for (let q = 0; q < 4; q++) {
    const mid = -Math.PI / 2 + q * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, mid - Math.PI / 4, mid + Math.PI / 4); ctx.closePath();
    if (q === view.idx) { ctx.fillStyle = 'rgba(120,220,255,.35)'; ctx.fill(); }
    else if (threat[q]) { ctx.fillStyle = `rgba(255,60,40,${0.25 + 0.2 * Math.sin(clock * 8)})`; ctx.fill(); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - R * 0.707, cy - R * 0.707); ctx.lineTo(cx + R * 0.707, cy + R * 0.707);
  ctx.moveTo(cx + R * 0.707, cy - R * 0.707); ctx.lineTo(cx - R * 0.707, cy + R * 0.707); ctx.stroke();
  for (const d of dots) {
    ctx.fillStyle = d.e.kind === 'peach' ? '#ff9ec0' : boss && boss.parts.includes(d.e) ? '#ffb000' : '#ff4d2e';
    ctx.beginPath(); ctx.arc(d.x, d.y, boss && boss.parts.includes(d.e) ? 5 : 3, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#7ff'; ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.fill();
  ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.fillText('前', cx, cy - R + 10);
  ctx.restore();
}

// ============================================================
// Main loop
// ============================================================
resetDragon();
resetScenery();
audio.setSong('field');
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (paused) dt = 0;
  if (dt > 0) update(dt);
  renderer.render(scene, camera);
  drawHUD();
}
requestAnimationFrame(frame);

// Exposed for automated testing only
window.__game = { get state() { return state; }, get score() { return score; }, get hp() { return hp; },
  get stageT() { return stageT; }, get boss() { return boss; }, targets, startGame, turnView, input,
  pressFire, releaseFire, get view() { return view.idx; },
  screenTargets() {
    const out = [];
    for (const e of targets) {
      if (!e.alive || !e.lockable || isInvuln(e)) continue;
      tpos(e, _v1);
      const dx = _v1.x - DR.offset.x, dz = _v1.z - DR.offset.z;
      const q = ((Math.round(Math.atan2(dx, -dz) / (Math.PI / 2)) % 4) + 4) % 4;
      const on = toScreen(_v1, scr);
      out.push({ kind: e.kind, q, on, x: scr.x, y: scr.y });
    }
    return out;
  } };
