// Strip + 4x6 sheet geometry and rendering.
//
//  Download:  one 2" x 6" strip (four frames) at 600 DPI  → 1200 x 3600 px JPG
//  Print:     4" x 6" portrait sheet with two identical strips side by side,
//             so one cut down the long centre line gives two 2" x 6" strips.

import { applyLook } from './filters.js';

export const STRIP_IN = { w: 2, h: 6 };
export const SHEET_IN = { w: 4, h: 6 };
export const SHOTS = 4;
export const DOWNLOAD_DPI = 600;
export const PRINT_DPI = 300;

export const BACKDROPS = {
  black: { id: 'black', label: 'Black', paper: '#0b0b0c', ink: '#f3ead7', subInk: 'rgba(243,234,215,0.62)', cutMark: '#555', texture: 0 },
  vintage: { id: 'vintage', label: 'Vintage', paper: '#ecdfc3', ink: '#3b2a1c', subInk: 'rgba(59,42,28,0.62)', cutMark: '#a8957a', texture: 1 },
  white: { id: 'white', label: 'White', paper: '#ffffff', ink: '#141414', subInk: 'rgba(20,20,20,0.55)', cutMark: '#c8c8c8', texture: 0 },
};

/** Pixel rectangles for a strip at the given DPI. */
export function stripLayout(dpi = DOWNLOAD_DPI) {
  const W = Math.round(STRIP_IN.w * dpi);
  const H = Math.round(STRIP_IN.h * dpi);
  const margin = Math.round(0.11 * dpi);
  const gap = Math.round(0.08 * dpi);
  const minFooter = Math.round(0.55 * dpi);
  const photoW = W - margin * 2;
  const photoH = Math.floor((H - margin - minFooter - gap * (SHOTS - 1)) / SHOTS);
  const frames = [];
  for (let i = 0; i < SHOTS; i++) {
    frames.push({ x: margin, y: margin + i * (photoH + gap), w: photoW, h: photoH });
  }
  const footerTop = margin + SHOTS * photoH + (SHOTS - 1) * gap;
  return { W, H, margin, gap, frames, footer: { x: 0, y: footerTop, w: W, h: H - footerTop }, aspect: photoW / photoH };
}

/** Where each strip lands on the 4x6 sheet, and where to cut. */
export function sheetLayout(dpi = PRINT_DPI) {
  const W = Math.round(SHEET_IN.w * dpi);
  const H = Math.round(SHEET_IN.h * dpi);
  const stripW = W / 2;
  return {
    W,
    H,
    strips: [
      { x: 0, y: 0, w: stripW, h: H },
      { x: stripW, y: 0, w: stripW, h: H },
    ],
    cutX: stripW,
  };
}

/** Centre-crop rectangle of a source so it fills `aspect` (w/h). */
export function coverCrop(srcW, srcH, aspect) {
  if (srcW / srcH > aspect) {
    const w = srcH * aspect;
    return { sx: (srcW - w) / 2, sy: 0, sw: w, sh: srcH };
  }
  const h = srcW / aspect;
  return { sx: 0, sy: (srcH - h) / 2, sw: srcW, sh: h };
}

/** Rewrite the JFIF density so photo apps & printers know the physical size. */
export function setJpegDpi(bytes, dpi) {
  const b = bytes;
  // FFD8 FFE0 len 'JFIF\0' ver(2) units(1) X(2) Y(2)
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46 && b[10] === 0) {
    b[13] = 1; // dots per inch
    b[14] = dpi >> 8;
    b[15] = dpi & 0xff;
    b[16] = dpi >> 8;
    b[17] = dpi & 0xff;
  }
  return b;
}

// ---------------------------------------------------------------------------
// Rendering (browser)

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paperTexture(ctx, W, H, seed = 3) {
  // Fibres + mottling + a gentle aged edge for the vintage backdrop.
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  for (let i = 0; i < (W * H) / 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = rnd() * W * 0.004 + 0.5;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(120,90,50,0.05)' : 'rgba(255,250,235,0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(140,100,50,0)');
  g.addColorStop(1, 'rgba(140,100,50,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * Render a full strip.
 * shots: array (≤4) of CanvasImageSource (raw captured frames), may contain nulls
 * opts: { look, backdrop, caption, date, dpi, mirror }
 */
export function renderStrip(shots, { look, backdrop = 'black', caption = '', date = '', dpi = DOWNLOAD_DPI, placeholder = true } = {}) {
  const L = stripLayout(dpi);
  const bd = BACKDROPS[backdrop] || BACKDROPS.black;
  const canvas = createCanvas(L.W, L.H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bd.paper;
  ctx.fillRect(0, 0, L.W, L.H);
  if (bd.texture) paperTexture(ctx, L.W, L.H);

  const frame = createCanvas(L.frames[0].w, L.frames[0].h);
  const fctx = frame.getContext('2d', { willReadFrequently: true });
  fctx.imageSmoothingQuality = 'high';

  L.frames.forEach((r, i) => {
    const shot = shots[i];
    if (!shot) {
      if (placeholder) {
        ctx.fillStyle = backdrop === 'white' ? '#ececec' : backdrop === 'vintage' ? 'rgba(59,42,28,0.12)' : '#1c1c1e';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = bd.subInk;
        ctx.font = `${Math.round(r.h * 0.22)}px "Playfair Display", Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), r.x + r.w / 2, r.y + r.h / 2);
      }
      return;
    }
    const sw = shot.videoWidth || shot.naturalWidth || shot.width;
    const sh = shot.videoHeight || shot.naturalHeight || shot.height;
    const c = coverCrop(sw, sh, r.w / r.h);
    fctx.drawImage(shot, c.sx, c.sy, c.sw, c.sh, 0, 0, r.w, r.h);
    applyLook(fctx, r.w, r.h, look, { seed: 101 + i });
    ctx.drawImage(frame, r.x, r.y);
  });

  // Footer: caption + date, set in vintage type.
  const f = L.footer;
  const cx = L.W / 2;
  ctx.fillStyle = bd.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const title = (caption || 'Selfie Booth').slice(0, 40);
  let size = Math.round(f.h * 0.3);
  ctx.font = `italic 700 ${size}px "Playfair Display", Georgia, serif`;
  while (ctx.measureText(title).width > L.W - L.margin * 2.4 && size > 10) {
    size -= 2;
    ctx.font = `italic 700 ${size}px "Playfair Display", Georgia, serif`;
  }
  ctx.fillText(title, cx, f.y + f.h * 0.48);
  if (date) {
    ctx.fillStyle = bd.subInk;
    const ds = Math.round(f.h * 0.13);
    ctx.font = `${ds}px "Special Elite", "Courier New", monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(ds * 0.18)}px`;
    ctx.fillText(date.toUpperCase(), cx, f.y + f.h * 0.76);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  return canvas;
}

/** Lay two copies of a strip onto a 4x6 portrait sheet. */
export function renderSheet(strip, { backdrop = 'black', dpi = PRINT_DPI, cutMarks = true } = {}) {
  const S = sheetLayout(dpi);
  const bd = BACKDROPS[backdrop] || BACKDROPS.black;
  const canvas = createCanvas(S.W, S.H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = bd.paper;
  ctx.fillRect(0, 0, S.W, S.H);
  for (const r of S.strips) ctx.drawImage(strip, r.x, r.y, r.w, r.h);
  if (cutMarks) {
    // Short ticks in the top & bottom margins show where to cut.
    const len = Math.round(0.07 * dpi);
    ctx.strokeStyle = bd.cutMark;
    ctx.lineWidth = Math.max(1, dpi / 300);
    ctx.beginPath();
    ctx.moveTo(S.cutX, 0);
    ctx.lineTo(S.cutX, len);
    ctx.moveTo(S.cutX, S.H - len);
    ctx.lineTo(S.cutX, S.H);
    ctx.stroke();
  }
  return canvas;
}

export async function canvasToJpeg(canvas, { dpi, quality = 0.95 } = {}) {
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode JPEG'))), 'image/jpeg', quality));
  if (!dpi) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Blob([setJpegDpi(bytes, dpi)], { type: 'image/jpeg' });
}
