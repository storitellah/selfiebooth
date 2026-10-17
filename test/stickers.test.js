import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICKERS, SLOTS, MAX_PER_PHOTO, placeStickers } from '../public/js/stickers.js';

const area = { x: 0, y: 0, w: 1080, h: 777 };

test('sticker ids are unique', () => {
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length);
});

test('stickers stay away from the middle of the photo', () => {
  const placed = placeStickers(['heart', 'star', 'rainbow', 'bff', 'flower'], area, 0);
  assert.equal(placed.length, 5);
  for (const p of placed) {
    const dx = Math.abs(p.x - area.w / 2) / area.w;
    const dy = Math.abs(p.y - area.h / 2) / area.h;
    assert.ok(dx > 0.3 || dy > 0.3, `${p.id} too central`);
  }
  // No two stickers share a spot.
  assert.equal(new Set(placed.map((p) => `${p.x},${p.y}`)).size, placed.length);
});

test('crowns go on top, and positions shuffle between photos', () => {
  const a = placeStickers(['heart', 'crown', 'star'], area, 0);
  const crown = a.find((p) => p.id === 'crown');
  assert.equal(crown.x, area.w * SLOTS[0][0]);
  assert.ok(crown.y < area.h * 0.3);
  const b = placeStickers(['heart', 'crown', 'star'], area, 1);
  assert.notDeepEqual(a.find((p) => p.id === 'heart'), b.find((p) => p.id === 'heart'));
});

test('many stickers are spread across the four photos', () => {
  const all = STICKERS.map((s) => s.id);
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const placed = placeStickers(all, area, i);
    assert.equal(placed.length, MAX_PER_PHOTO);
    placed.forEach((p) => seen.add(p.id));
  }
  assert.ok(seen.size >= MAX_PER_PHOTO * 3);
  assert.deepEqual(placeStickers([], area, 0), []);
  assert.deepEqual(placeStickers(['nope'], area, 0), []);
});

test('stickers are never cut off at the photo edge', () => {
  for (let i = 0; i < 4; i++) {
    for (const p of placeStickers(STICKERS.map((s) => s.id), area, i)) {
      assert.ok(p.x - p.size / 2 >= 0 && p.x + p.size / 2 <= area.w, `${p.id} x`);
      assert.ok(p.y - p.size / 2 >= 0 && p.y + p.size / 2 <= area.h, `${p.id} y`);
    }
  }
});
