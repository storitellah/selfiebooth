import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLayout, sheetLayout, coverCrop, setJpegDpi } from '../public/js/layout.js';

test('download strip is 2x6 in at 600 DPI with four equal frames', () => {
  const L = stripLayout(600);
  assert.equal(L.W, 1200);
  assert.equal(L.H, 3600);
  assert.equal(L.frames.length, 4);
  for (const f of L.frames) {
    assert.equal(f.w, L.frames[0].w);
    assert.equal(f.h, L.frames[0].h);
    assert.ok(f.x >= 0 && f.x + f.w <= L.W);
  }
  const last = L.frames.at(-1);
  assert.ok(last.y + last.h <= L.footer.y);
  assert.ok(L.footer.y + L.footer.h === L.H);
});

test('4x6 sheet holds two strips split down the long edge', () => {
  const S = sheetLayout(300);
  assert.equal(S.W, 1200);
  assert.equal(S.H, 1800);
  assert.equal(S.strips.length, 2);
  for (const s of S.strips) {
    assert.equal(s.w / s.h, 2 / 6); // each half is exactly a 2x6 strip
    assert.equal(s.h, S.H);
  }
  assert.equal(S.cutX, S.W / 2);
  assert.equal(S.strips[1].x, S.cutX);
});

test('coverCrop keeps aspect and stays inside the source', () => {
  const c = coverCrop(1920, 1080, 1.4);
  assert.ok(Math.abs(c.sw / c.sh - 1.4) < 1e-9);
  assert.ok(c.sx >= 0 && c.sx + c.sw <= 1920);
  const t = coverCrop(1080, 1920, 1.4);
  assert.ok(t.sy > 0 && t.sy + t.sh <= 1920);
});

test('setJpegDpi writes JFIF density', () => {
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1]);
  setJpegDpi(b, 600);
  assert.equal(b[13], 1);
  assert.equal((b[14] << 8) | b[15], 600);
  assert.equal((b[16] << 8) | b[17], 600);
});

import { tiltScale, formatStamp, TILTS } from '../public/js/layout.js';

test('tilted frames stay inside their slot plus the allowed spill', () => {
  const L = stripLayout(600);
  const { w, h } = L.frames[0];
  for (const deg of TILTS) {
    const sx = L.margin * 0.55;
    const sy = L.gap * 0.45;
    const k = tiltScale(w, h, deg, sx, sy);
    const a = (Math.abs(deg) * Math.PI) / 180;
    assert.ok(k * (w * Math.cos(a) + h * Math.sin(a)) <= w + sx * 2 + 1e-6);
    assert.ok(k * (w * Math.sin(a) + h * Math.cos(a)) <= h + sy * 2 + 1e-6);
  }
  assert.equal(tiltScale(100, 50, 0, 0, 0), 1);
});

test('stamp includes both date and time', () => {
  const s = formatStamp(new Date(2026, 9, 12, 21, 41), 'en-GB');
  assert.match(s, /12 Oct 2026/);
  assert.match(s, /21:41|9:41/);
});

import { perforations } from '../public/js/layout.js';

test('stamp perforations sit evenly on all four edges', () => {
  const holes = perforations(1000, 700, 50);
  const top = holes.filter(([, y]) => y === 0);
  const left = holes.filter(([x]) => x === 0);
  assert.equal(top.length, 20);
  assert.equal(left.length, 14);
  assert.equal(holes.length, (20 + 14) * 2);
  for (const [x, y] of holes) assert.ok((y === 0 || y === 700 || x === 0 || x === 1000) && x >= 0 && x <= 1000 && y >= 0 && y <= 700);
  assert.equal(top[1][0] - top[0][0], 50); // even spacing
});
