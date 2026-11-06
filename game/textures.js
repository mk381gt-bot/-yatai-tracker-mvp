// Procedural textures drawn on canvases at startup (no image files needed).
import * as THREE from './three.module.min.js';

const FONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, rx = 1, ry = 1, color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tileable value-noise fbm. period = lattice cells across the texture.
function makeNoise(seed) {
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const n = (x, y, px, py) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const x0 = ((ix % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((iy % py) + py) % py, y1 = (y0 + 1) % py;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // u,v in [0,1)
  return (u, v, px = 4, py = 4, oct = 4) => {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { s += amp * n(u * px * f, v * py * f, px * f, py * f); amp *= 0.5; f *= 2; }
    return s;
  };
}

function pixels(c, fn) {
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const [r, gg, b] = fn(x / c.width, y / c.height);
    const i = (y * c.width + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return g;
}
const mix = (a, b, t) => a + (b - a) * t;
const mixC = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];

// ---------- Dragon scales (color + bump)
export function dragonScales() {
  const S = 256, cols = 6, rows = 7, rw = S / cols, rh = S / rows, r = rw * 0.56;
  const c = cv(S, S), g = c.getContext('2d');
  const b = cv(S, S), h = b.getContext('2d');
  g.fillStyle = '#1a6f56'; g.fillRect(0, 0, S, S);
  h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
  for (let row = -1; row <= rows + 1; row++) {
    for (let col = -1; col <= cols; col++) {
      const x = col * rw + (row % 2 ? rw / 2 : 0), y = row * rh;
      const path = () => {
        const p = new Path2D();
        p.moveTo(x - r, y - r * 1.5); p.lineTo(x - r, y); p.arc(x, y, r, Math.PI, 0, true);
        p.lineTo(x + r, y - r * 1.5); p.closePath(); return p;
      };
      const p = path();
      const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y - r * 0.2, r * 1.25);
      gr.addColorStop(0, '#7ef0c6'); gr.addColorStop(0.4, '#34bf93'); gr.addColorStop(0.85, '#1f8a6a'); gr.addColorStop(1, '#16664f');
      g.fillStyle = gr; g.fill(p);
      g.strokeStyle = 'rgba(8,50,38,.55)'; g.lineWidth = 2; g.stroke(p);
      g.strokeStyle = 'rgba(255,236,160,.6)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, y - r * 0.15, r * 0.72, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      const hb = h.createRadialGradient(x, y - r * 0.4, 0, x, y - r * 0.2, r * 1.1);
      hb.addColorStop(0, '#fff'); hb.addColorStop(0.7, '#888'); hb.addColorStop(1, '#000');
      h.fillStyle = hb; h.fill(p);
    }
  }
  return { map: toTex(c, 1, 1), bump: toTex(b, 1, 1, false) };
}

// ---------- Golden belly plates
export function bellyPlates() {
  const c = cv(64, 256), g = c.getContext('2d');
  const n = 12, bh = 256 / n;
  for (let i = 0; i < n; i++) {
    const gr = g.createLinearGradient(0, i * bh, 0, (i + 1) * bh);
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.55, '#f2c14e'); gr.addColorStop(1, '#9c6a12');
    g.fillStyle = gr; g.fillRect(0, i * bh, 64, bh);
    g.fillStyle = 'rgba(80,40,0,.6)'; g.fillRect(0, (i + 1) * bh - 2, 64, 2);
  }
  return toTex(c, 4, 1);
}

// ---------- Flame-like mane gradient
export function flameTex() {
  const c = cv(64, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#c0200c'); gr.addColorStop(0.5, '#ff6a2a'); gr.addColorStop(1, '#ffd36a');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(255,240,180,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 11 + 4, 128); g.quadraticCurveTo(i * 11 + 12, 60, i * 11 + 2, 0); g.stroke(); }
  return toTex(c, 1, 1);
}

// ---------- Karst rock with strata and cracks
export function rockTex() {
  const W = 256, H = 512, c = cv(W, H), noise = makeNoise(3.1);
  const light = [222, 188, 142], mid = [176, 136, 98], dark = [104, 78, 58];
  const g = pixels(c, (u, v) => {
    const n = noise(u, v, 4, 8, 5);
    const strata = Math.sin((v * 46 + noise(u, v, 2, 4, 2) * 6) * 1.0) * 0.5 + 0.5;
    let col = mixC(mid, light, n);
    col = mixC(col, dark, Math.pow(strata, 6) * 0.65);
    const moss = Math.max(0, noise(u + 0.3, v, 6, 12, 3) - 0.62) * 2.4;
    col = mixC(col, [92, 140, 70], Math.min(1, moss));
    return col;
  });
  g.strokeStyle = 'rgba(50,32,20,.55)';
  for (let i = 0; i < 18; i++) {
    let x = Math.random() * W, y = Math.random() * H; g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 14; y += 6 + Math.random() * 12; g.lineTo(x, y); }
    g.stroke();
  }
  const b = cv(W, H);
  pixels(b, (u, v) => {
    const n = noise(u, v, 4, 8, 5), strata = Math.sin((v * 46 + noise(u, v, 2, 4, 2) * 6)) * 0.5 + 0.5;
    const s = 255 * (n * 0.8 + (1 - Math.pow(strata, 6)) * 0.3); return [s, s, s];
  });
  return { map: toTex(c, 2, 3), bump: toTex(b, 2, 3, false) };
}

export function grassTex() {
  const c = cv(128, 128), noise = makeNoise(7.7);
  pixels(c, (u, v) => {
    const n = noise(u, v, 6, 6, 4);
    const fl = noise(u, v, 24, 24, 1) > 0.78 ? 1 : 0;
    return fl ? [255, 230, 120] : mixC([46, 120, 58], [130, 205, 98], n);
  });
  return toTex(c, 2, 2);
}

export function cloudFloorTex() {
  const c = cv(256, 256), noise = makeNoise(11.3);
  pixels(c, (u, v) => mixC([236, 222, 200], [255, 252, 244], Math.pow(noise(u, v, 4, 4, 5), 0.8)));
  return toTex(c, 30, 30);
}

// ---------- Architecture
export function pagodaWallTex() {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#c6362a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8f1f18'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 5, 128);
  g.fillStyle = '#f2c14e'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10);
  for (let x = 8; x < 128; x += 32) {
    g.fillStyle = '#3a1410'; g.fillRect(x + 4, 34, 16, 50);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.strokeRect(x + 4, 34, 16, 50);
    g.beginPath(); g.moveTo(x + 12, 34); g.lineTo(x + 12, 84); g.moveTo(x + 4, 59); g.lineTo(x + 20, 59); g.stroke();
  }
  return toTex(c, 1, 1);
}
export function roofTileTex() {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#1d5c53'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 12) for (let x = 0; x < 136; x += 12) {
    const gr = g.createLinearGradient(0, y, 0, y + 12);
    gr.addColorStop(0, '#5fb3a2'); gr.addColorStop(1, '#1a4f47');
    g.fillStyle = gr; g.beginPath(); g.arc(x + ((y / 12) % 2 ? 6 : 0), y + 6, 6.5, 0, Math.PI); g.fill();
  }
  return toTex(c, 3, 3);
}
export function lacquerTex() {
  const c = cv(128, 256), noise = makeNoise(5.5), g = pixels(c, (u, v) => mixC([150, 22, 18], [222, 58, 40], noise(u, v, 2, 8, 4)));
  g.fillStyle = '#f2c14e';
  for (let y = 0; y < 256; y += 64) { g.fillRect(0, y, 128, 6); g.fillStyle = '#b8862a'; g.fillRect(0, y + 6, 128, 2); g.fillStyle = '#f2c14e'; }
  return toTex(c, 1, 2);
}
export function plaqueTex(text) {
  const c = cv(512, 256), g = c.getContext('2d');
  g.fillStyle = '#f2c14e'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1c2f6b'; g.fillRect(22, 22, 468, 212);
  g.strokeStyle = '#ffe9a0'; g.lineWidth = 6; g.strokeRect(36, 36, 440, 184);
  g.fillStyle = '#ffd860'; g.font = `bold 140px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 132);
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------- Enemies & boss
export function lanternTex() {
  const c = cv(512, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#a3170f'); gr.addColorStop(0.5, '#ff4a2a'); gr.addColorStop(1, '#a3170f');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(70,0,0,.55)'; g.lineWidth = 3;
  for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.font = `bold 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [0, 256, 512]) {
    g.fillStyle = '#ffd54a'; g.beginPath(); g.arc(x, 128, 74, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a0500'; g.fillText('妖', x, 134);
  }
  return toTex(c);
}
export function furTex(base, dark, light) {
  const c = cv(256, 256), noise = makeNoise(9.9);
  const g = pixels(c, (u, v) => mixC(base, light, noise(u, v, 4, 4, 4) * 0.5));
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, l = 5 + Math.random() * 9, a = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    g.strokeStyle = Math.random() < 0.55 ? `rgba(${dark.join(',')},.55)` : `rgba(${light.join(',')},.4)`;
    g.lineWidth = 1 + Math.random();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return toTex(c, 2, 2);
}
export function hornTex() {
  const c = cv(64, 256), g = c.getContext('2d');
  for (let y = 0; y < 256; y += 16) {
    const gr = g.createLinearGradient(0, y, 0, y + 16);
    gr.addColorStop(0, '#fff2b8'); gr.addColorStop(0.5, '#e8b63a'); gr.addColorStop(1, '#7a520c');
    g.fillStyle = gr; g.fillRect(0, y, 64, 16);
  }
  return toTex(c, 1, 1);
}
export function wingTex() {
  const c = cv(128, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, '#3b1d66'); gr.addColorStop(1, '#8a5cd0');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(25,8,45,.8)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 64); g.lineTo(128, i * 32); g.stroke(); }
  return toTex(c, 0.5, 1);
}
