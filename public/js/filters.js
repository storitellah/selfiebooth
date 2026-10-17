// Light-focused photo looks. The per-pixel maths (processPixels) is pure so it
// runs the same in the browser and in Node tests; glow, light leaks, vignettes
// and grain are layered on with canvas compositing in applyLook().

export const GROUPS = [
  { id: 'colour', label: 'Colour' },
  { id: 'bw', label: 'Black & White' },
  { id: 'white', label: 'White' },
];

const DEFAULTS = {
  exposure: 0, // stops
  contrast: 1,
  saturation: 1,
  warmth: 0, // -1 cool … +1 warm
  tint: 0, // -1 magenta … +1 green
  fade: 0, // lifts blacks (0…1)
  highKey: 0, // pushes tones toward white (0…1)
  gamma: 1,
  mono: false,
  monoTone: null, // [r,g,b] multipliers for toned mono
  glow: 0, // bloom strength
  leak: null, // { color, x, y, alpha } light leak in 0…1 coords
  vignette: 0, // + darkens edges, - whitens edges
  spotlight: 0, // brightens centre
  grain: 0,
};

export const LOOKS = [
  // ── Colour: all about the light ──────────────────────────────
  { id: 'natural', group: 'colour', name: 'Natural Light', contrast: 1.06, saturation: 1.05, gamma: 0.97 },
  {
    id: 'golden',
    group: 'colour',
    name: 'Golden Hour',
    exposure: 0.15,
    warmth: 0.75,
    saturation: 1.1,
    contrast: 1.05,
    glow: 0.35,
    leak: { color: [255, 170, 60], x: 0.95, y: 0.05, alpha: 0.35 },
    vignette: 0.25,
  },
  { id: 'softglow', group: 'colour', name: 'Soft Glow', exposure: 0.25, contrast: 0.92, saturation: 0.92, warmth: 0.15, glow: 0.65, fade: 0.04 },
  {
    id: 'sunlit',
    group: 'colour',
    name: 'Sunlit Film',
    exposure: 0.1,
    warmth: 0.45,
    tint: 0.08,
    contrast: 1.04,
    saturation: 0.95,
    fade: 0.1,
    leak: { color: [255, 110, 50], x: 0.02, y: 0.35, alpha: 0.4 },
    grain: 0.06,
  },
  { id: 'window', group: 'colour', name: 'Window Light', exposure: 0.2, warmth: -0.35, contrast: 1.1, saturation: 0.9, glow: 0.25, spotlight: 0.2 },
  { id: 'polaroid', group: 'colour', name: 'Faded Polaroid', warmth: 0.25, tint: 0.15, contrast: 0.88, saturation: 0.8, fade: 0.16, vignette: 0.3, grain: 0.05 },
  { id: 'neon', group: 'colour', name: 'Neon Night', exposure: -0.05, warmth: -0.2, tint: -0.35, contrast: 1.18, saturation: 1.3, glow: 0.4, vignette: 0.45 },

  // ── Black & white ────────────────────────────────────────────
  { id: 'classic', group: 'bw', name: 'Classic Mono', mono: true, contrast: 1.12, grain: 0.04 },
  { id: 'noir', group: 'bw', name: 'Noir Spotlight', mono: true, contrast: 1.45, exposure: -0.1, spotlight: 0.45, vignette: 0.7, grain: 0.07 },
  { id: 'silver', group: 'bw', name: 'Silver Screen', mono: true, exposure: 0.15, contrast: 1.0, glow: 0.5, fade: 0.06, grain: 0.05 },
  { id: 'sepia', group: 'bw', name: 'Sepia Lamp', mono: true, monoTone: [1.08, 0.94, 0.74], contrast: 1.05, fade: 0.08, vignette: 0.4, grain: 0.06 },
  { id: 'grit', group: 'bw', name: 'Hard Light', mono: true, contrast: 1.7, gamma: 1.05, grain: 0.12 },

  // ── White: bright, high-key, almost paper-white ──────────────
  { id: 'highkey', group: 'white', name: 'High-Key White', mono: true, exposure: 0.5, highKey: 0.55, contrast: 1.05, vignette: -0.45 },
  { id: 'porcelain', group: 'white', name: 'Porcelain', saturation: 0.35, exposure: 0.55, highKey: 0.6, contrast: 0.95, glow: 0.45, vignette: -0.35 },
  { id: 'ghost', group: 'white', name: 'Ghost White', mono: true, exposure: 0.8, highKey: 0.85, contrast: 1.35, vignette: -0.6 },
  { id: 'milk', group: 'white', name: 'Milk Glass', saturation: 0.55, warmth: 0.1, exposure: 0.45, highKey: 0.45, glow: 0.7, fade: 0.12, vignette: -0.5 },
].map((l) => ({ ...DEFAULTS, ...l }));

export function getLook(id) {
  return LOOKS.find((l) => l.id === id) || LOOKS[0];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Build 256-entry lookup tables for the tone stages of a look. */
export function buildTables(look) {
  const gain = 2 ** look.exposure;
  const w = look.warmth * 0.09;
  const t = look.tint * 0.06;
  const chanShift = [w, t, -w];
  const pre = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const post = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const tone = look.monoTone || [1, 1, 1];
  const hk = 1 + look.highKey * 4;
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    for (let c = 0; c < 3; c++) {
      pre[c][i] = Math.round(clamp01(v * gain + chanShift[c] * (0.4 + v)) * 255);
    }
    let p = v ** look.gamma;
    p = (p - 0.5) * look.contrast + 0.5;
    p = clamp01(p);
    if (look.highKey > 0) p = 1 - (1 - p) ** hk;
    p = look.fade + p * (1 - look.fade);
    for (let c = 0; c < 3; c++) {
      // Toning: shadows/mids take the tone, highlights stay neutral.
      const toned = look.monoTone ? p * tone[c] + (1 - tone[c]) * p * p : p;
      post[c][i] = Math.round(clamp01(toned) * 255);
    }
  }
  return { pre, post };
}

/** In-place colour/tone grade on RGBA pixel data. */
export function processPixels(data, look, tables = buildTables(look)) {
  const { pre, post } = tables;
  const [pr, pg, pb] = pre;
  const [qr, qg, qb] = post;
  const sat = look.mono ? 0 : look.saturation;
  for (let i = 0; i < data.length; i += 4) {
    let r = pr[data[i]];
    let g = pg[data[i + 1]];
    let b = pb[data[i + 2]];
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
      r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
      g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
      b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    }
    data[i] = qr[r];
    data[i + 1] = qg[g];
    data[i + 2] = qb[b];
  }
  return data;
}

/** Small deterministic PRNG so grain is identical between preview & export. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addGrain(data, amount, seed = 7) {
  if (!amount) return data;
  const rnd = mulberry32(seed);
  const strength = amount * 255;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rnd() + rnd() - 1) * strength;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Canvas layer (browser only)

function makeCanvas(w, h) {
  // A plain canvas works everywhere (OffscreenCanvas 2D is missing on older Safari).
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const tableCache = new Map();
function tablesFor(look) {
  if (!tableCache.has(look.id)) tableCache.set(look.id, buildTables(look));
  return tableCache.get(look.id);
}

let scratch = null;
let mid = null;
function blurred(src, w, h) {
  // Cheap, portable blur: repeatedly downscale, then scale back up smoothly.
  const sw = Math.max(4, Math.round(w / 24));
  const sh = Math.max(4, Math.round(h / 24));
  const mw = Math.max(8, Math.round(w / 6));
  const mh = Math.max(8, Math.round(h / 6));
  if (!scratch || scratch.width !== sw || scratch.height !== sh) scratch = makeCanvas(sw, sh);
  if (!mid || mid.width !== mw || mid.height !== mh) mid = makeCanvas(mw, mh);
  const mctx = mid.getContext('2d');
  mctx.clearRect(0, 0, mw, mh);
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(src, 0, 0, mid.width, mid.height);
  const sctx = scratch.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.clearRect(0, 0, sw, sh);
  sctx.drawImage(mid, 0, 0, sw, sh);
  return scratch;
}

/**
 * Apply a look to whatever is currently drawn on `ctx` inside (0,0,w,h).
 * `seed` keeps grain stable for the same photo.
 */
export function applyLook(ctx, w, h, look, { seed = 1 } = {}) {
  const img = ctx.getImageData(0, 0, w, h);
  processPixels(img.data, look, tablesFor(look));
  addGrain(img.data, look.grain * 0.35, seed);
  ctx.putImageData(img, 0, 0);

  const canvas = ctx.canvas;
  ctx.save();
  if (look.glow > 0) {
    const soft = blurred(canvas, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = look.glow * 0.75;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(soft, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (look.spotlight > 0) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.55);
    g.addColorStop(0, `rgba(255,255,255,${look.spotlight * 0.35})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (look.leak) {
    const { color, x, y, alpha } = look.leak;
    const r = Math.max(w, h) * 0.75;
    const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(0.45, `rgba(${color},${alpha * 0.35})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (look.vignette) {
    const dark = look.vignette > 0;
    const a = Math.abs(look.vignette);
    const rgb = dark ? '0,0,0' : '255,255,255';
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
