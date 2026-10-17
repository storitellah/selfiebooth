// Fun die-cut stickers drawn with canvas paths, so they look identical on
// every device and print crisply at any size.
//
// Each sticker draws itself centred on (0,0) inside a 100 x 100 box.

import { mulberry32 } from './filters.js';

const FONT = '"Fraunces", Georgia, serif';

function star(ctx, points, outer, inner, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function heartPath(ctx, s = 1, dx = 0, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(dx, dy + 34 * s);
  ctx.bezierCurveTo(dx - 52 * s, dy + 2 * s, dx - 38 * s, dy - 44 * s, dx, dy - 20 * s);
  ctx.bezierCurveTo(dx + 38 * s, dy - 44 * s, dx + 52 * s, dy + 2 * s, dx, dy + 34 * s);
  ctx.closePath();
}

function shine(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.6, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function badge(ctx, text, bg, fg, { w = 92, h = 46, r = 23, rot = 0 } = {}) {
  ctx.save();
  ctx.rotate(rot);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = h * 0.62;
  ctx.font = `italic 800 ${size}px ${FONT}`;
  while (ctx.measureText(text).width > w * 0.84 && size > 8) {
    size -= 1;
    ctx.font = `italic 800 ${size}px ${FONT}`;
  }
  ctx.fillText(text, 0, h * 0.04);
  ctx.restore();
}

export const STICKERS = [
  {
    id: 'heart',
    name: 'Heart',
    draw(ctx) {
      heartPath(ctx, 1.15, 0, 4);
      ctx.fillStyle = '#ff4f8b';
      ctx.fill();
      shine(ctx, -20, -14, 9);
    },
  },
  {
    id: 'star',
    name: 'Star',
    draw(ctx) {
      star(ctx, 5, 48, 21);
      ctx.fillStyle = '#ffc928';
      ctx.fill();
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      ctx.arc(-9, -2, 4, 0, Math.PI * 2);
      ctx.arc(9, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a1c';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 4, 8, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    },
  },
  {
    id: 'sparkles',
    name: 'Sparkles',
    draw(ctx) {
      const sp = (x, y, r, c) => {
        ctx.save();
        ctx.translate(x, y);
        star(ctx, 4, r, r * 0.28, 0);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.restore();
      };
      sp(-8, 6, 40, '#ffd84d');
      sp(28, -26, 20, '#ff8fc7');
      sp(30, 30, 14, '#8fd8ff');
    },
  },
  {
    id: 'crown',
    name: 'Crown',
    top: true,
    draw(ctx) {
      ctx.fillStyle = '#ffc928';
      ctx.beginPath();
      ctx.moveTo(-46, 28);
      ctx.lineTo(-46, -18);
      ctx.lineTo(-24, 4);
      ctx.lineTo(0, -32);
      ctx.lineTo(24, 4);
      ctx.lineTo(46, -18);
      ctx.lineTo(46, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2a900';
      ctx.fillRect(-46, 18, 92, 10);
      for (const [x, y, c] of [
        [-46, -22, '#ff4f8b'],
        [0, -36, '#7b5cff'],
        [46, -22, '#3ec7ff'],
      ]) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff4f8b';
      ctx.beginPath();
      ctx.arc(0, 8, 6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    draw(ctx) {
      const colours = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ecf8e', '#3ec7ff', '#8f6bff'];
      ctx.lineWidth = 8;
      colours.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(0, 18, 44 - i * 7.5, Math.PI, 0);
        ctx.stroke();
      });
      ctx.fillStyle = '#fff';
      for (const x of [-34, 34]) {
        ctx.beginPath();
        ctx.arc(x - 8, 22, 10, 0, Math.PI * 2);
        ctx.arc(x + 6, 20, 12, 0, Math.PI * 2);
        ctx.arc(x + 1, 12, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    draw(ctx) {
      const wing = (sx, top, c) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(sx * 24, top ? -14 : 18, top ? 24 : 17, top ? 30 : 20, sx * (top ? 0.5 : -0.4), 0, Math.PI * 2);
        ctx.fill();
      };
      wing(-1, true, '#b06bff');
      wing(1, true, '#b06bff');
      wing(-1, false, '#ff8fc7');
      wing(1, false, '#ff8fc7');
      ctx.fillStyle = '#fff3a8';
      for (const [x, y] of [
        [-26, -16],
        [26, -16],
        [-18, 20],
        [18, 20],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      ctx.ellipse(0, 2, 5, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a1c';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, -28);
      ctx.quadraticCurveTo(-10, -44, -18, -44);
      ctx.moveTo(2, -28);
      ctx.quadraticCurveTo(10, -44, 18, -44);
      ctx.stroke();
    },
  },
  {
    id: 'flower',
    name: 'Flower',
    draw(ctx) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.ellipse(0, -27, 12, 21, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#ffd1e6';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.ellipse(0, -27, 12, 21, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ffc928';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'bow',
    name: 'Bow',
    top: true,
    draw(ctx) {
      ctx.fillStyle = '#ff6fae';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(s * 20, -36, s * 52, -30, s * 46, 0);
        ctx.bezierCurveTo(s * 52, 30, s * 20, 36, 0, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 4, 6);
        ctx.lineTo(s * 26, 44);
        ctx.lineTo(s * 14, 40);
        ctx.lineTo(s * 8, 48);
        ctx.lineTo(s * 0, 10);
        ctx.fill();
      }
      ctx.fillStyle = '#e04c8e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      shine(ctx, -28, -10, 6);
      shine(ctx, 22, -10, 6);
    },
  },
  {
    id: 'cloud',
    name: 'Happy cloud',
    draw(ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-24, 8, 20, 0, Math.PI * 2);
      ctx.arc(0, -6, 26, 0, Math.PI * 2);
      ctx.arc(26, 6, 20, 0, Math.PI * 2);
      ctx.rect(-24, 6, 50, 22);
      ctx.fill();
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(-24, 8, 20, 0, Math.PI * 2);
      ctx.arc(0, -6, 26, 0, Math.PI * 2);
      ctx.arc(26, 6, 20, 0, Math.PI * 2);
      ctx.rect(-24, 6, 50, 22);
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      ctx.arc(-9, 4, 3.5, 0, Math.PI * 2);
      ctx.arc(9, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8fb5';
      ctx.beginPath();
      ctx.arc(-17, 12, 4.5, 0, Math.PI * 2);
      ctx.arc(17, 12, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a1c';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 9, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    },
  },
  {
    id: 'lollipop',
    name: 'Lollipop',
    draw(ctx) {
      ctx.fillStyle = '#f5e6c8';
      ctx.fillRect(-3.5, 6, 7, 44);
      ctx.fillStyle = '#ff6fae';
      ctx.beginPath();
      ctx.arc(0, -14, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let t = 0; t < 5.5 * Math.PI; t += 0.1) {
        const r = 2 + t * 1.55;
        ctx.lineTo(Math.cos(t) * r, -14 + Math.sin(t) * r);
      }
      ctx.stroke();
    },
  },
  {
    id: 'icecream',
    name: 'Ice cream',
    draw(ctx) {
      ctx.fillStyle = '#e8a85c';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.lineTo(0, 50);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c6843b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 8);
      ctx.lineTo(8, 36);
      ctx.moveTo(14, 8);
      ctx.lineTo(-8, 36);
      ctx.stroke();
      ctx.fillStyle = '#ffb3d1';
      ctx.beginPath();
      ctx.arc(-12, -6, 16, 0, Math.PI * 2);
      ctx.arc(12, -6, 16, 0, Math.PI * 2);
      ctx.arc(0, -26, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8394d';
      ctx.beginPath();
      ctx.arc(2, -46, 7, 0, Math.PI * 2);
      ctx.fill();
      const sprinkles = ['#3ec7ff', '#ffd23f', '#8f6bff', '#3ecf8e'];
      sprinkles.forEach((c, i) => {
        ctx.save();
        ctx.translate(-14 + i * 9, -18 + (i % 2) * 12);
        ctx.rotate(i);
        ctx.fillStyle = c;
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();
      });
    },
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    draw(ctx) {
      ctx.fillStyle = '#ff4d5e';
      ctx.beginPath();
      ctx.moveTo(0, 46);
      ctx.bezierCurveTo(-46, 10, -40, -26, 0, -22);
      ctx.bezierCurveTo(40, -26, 46, 10, 0, 46);
      ctx.fill();
      ctx.fillStyle = '#fff3a8';
      for (const [x, y] of [
        [-16, -6],
        [0, -8],
        [16, -6],
        [-10, 10],
        [10, 10],
        [0, 26],
        [-20, 6],
        [20, 6],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x, y, 2.2, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(0, -24);
      star(ctx, 5, 20, 8, Math.PI / 2);
      ctx.fillStyle = '#3ecf6e';
      ctx.fill();
      ctx.restore();
    },
  },
  { id: 'bff', name: 'BFF', badge: true, draw: (ctx) => badge(ctx, 'BFF', '#8f6bff', '#fff', { rot: -0.12 }) },
  { id: 'sisters', name: 'Sisters', badge: true, draw: (ctx) => badge(ctx, 'Sisters', '#ff6fae', '#fff', { w: 98, h: 42, rot: 0.08 }) },
  { id: 'wow', name: 'WOW!', badge: true, draw: (ctx) => badge(ctx, 'WOW!', '#ffc928', '#3a2a1c', { w: 90, h: 48, rot: -0.1 }) },
  { id: 'cutie', name: 'Cutie', badge: true, draw: (ctx) => badge(ctx, 'cutie', '#3ec7ff', '#fff', { w: 88, h: 44, rot: 0.1 }) },
];

export function getSticker(id) {
  return STICKERS.find((s) => s.id === id) || null;
}

// ---------------------------------------------------------------------------
// Placement: stickers hug the edges and corners so faces stay clear, and
// shuffle between the four photos.

// Slot centres as fractions of the photo area. Index 0 is top-centre, kept
// for "top" stickers like crowns and bows.
export const SLOTS = [
  [0.5, 0.12],
  [0.12, 0.16],
  [0.88, 0.15],
  [0.1, 0.84],
  [0.9, 0.85],
  [0.5, 0.9],
  [0.08, 0.5],
  [0.92, 0.5],
];
export const MAX_PER_PHOTO = 5;

/**
 * Where each sticker goes on photo `frameIndex`.
 * Returns [{ id, x, y, size, rot }] in pixels inside { x, y, w, h }.
 */
export function placeStickers(ids, area, frameIndex = 0) {
  const chosen = ids.map(getSticker).filter(Boolean);
  if (!chosen.length) return [];
  const n = chosen.length;
  const count = Math.min(n, MAX_PER_PHOTO);
  // Rotate which stickers appear when there are more than fit on one photo.
  const pick = Array.from({ length: count }, (_, j) => chosen[(frameIndex * count + j) % n]);
  const rnd = mulberry32(1000 + frameIndex * 97 + n);
  const free = SLOTS.map((_, i) => i);
  const take = (i) => free.splice(free.indexOf(i), 1)[0];
  const unit = Math.min(area.w, area.h);
  const out = [];
  // Crown/bow-style stickers claim the top-centre spot first.
  const ordered = [...pick.filter((s) => s.top), ...pick.filter((s) => !s.top)];
  ordered.forEach((s, k) => {
    let slot;
    if (s.top && free.includes(0)) slot = take(0);
    else {
      const others = free.filter((i) => i !== 0 || ordered.every((o) => !o.top));
      const pool = others.length ? others : free;
      slot = take(pool[(k + frameIndex * 3) % pool.length]);
    }
    const [fx, fy] = SLOTS[slot];
    const size = unit * (s.badge ? 0.3 : 0.25) * (0.88 + rnd() * 0.24);
    // Keep the whole sticker (plus its white border) inside the photo.
    const half = size * 0.62;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    out.push({
      id: s.id,
      x: area.x + clamp(fx * area.w, half, area.w - half),
      y: area.y + clamp(fy * area.h, half, area.h - half),
      size,
      rot: s.top && slot === 0 ? (rnd() - 0.5) * 0.25 : (rnd() - 0.5) * 0.6,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rendering with a white die-cut border and a soft shadow (cached per size).

const cache = new Map();

function renderSticker(sticker, px) {
  const key = `${sticker.id}@${px}`;
  if (cache.has(key)) return cache.get(key);
  const pad = Math.ceil(px * 0.12);
  const full = px + pad * 2;
  const art = document.createElement('canvas');
  art.width = art.height = full;
  const a = art.getContext('2d');
  a.translate(full / 2, full / 2);
  a.scale(px / 100, px / 100);
  sticker.draw(a);

  // Die-cut outline: stamp a white silhouette around the artwork.
  const out = document.createElement('canvas');
  out.width = out.height = full;
  const o = out.getContext('2d');
  const sil = document.createElement('canvas');
  sil.width = sil.height = full;
  const s = sil.getContext('2d');
  s.drawImage(art, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#ffffff';
  s.fillRect(0, 0, full, full);
  const border = Math.max(1.5, px * 0.05);
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    o.drawImage(sil, Math.cos(t) * border, Math.sin(t) * border);
  }
  o.drawImage(art, 0, 0);
  art.width = sil.width = 0;

  if (cache.size > 80) {
    for (const c of cache.values()) c.width = 0;
    cache.clear();
  }
  cache.set(key, out);
  return out;
}

/** Draw placed stickers onto a canvas context. */
export function drawStickers(ctx, placed) {
  for (const p of placed) {
    const sticker = getSticker(p.id);
    if (!sticker) continue;
    const px = Math.max(8, Math.round(p.size / 4) * 4); // bucket sizes for the cache
    const img = renderSticker(sticker, px);
    const k = p.size / px;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(k, k);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = px * 0.06;
    ctx.shadowOffsetY = px * 0.03;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

/** A small icon of one sticker for the picker. */
export function stickerIcon(id, px = 72) {
  const sticker = getSticker(id);
  const img = renderSticker(sticker, Math.round(px * 0.8));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, (px - img.width) / 2, (px - img.height) / 2);
  return c;
}
