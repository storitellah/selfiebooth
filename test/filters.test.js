import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, GROUPS, processPixels } from '../public/js/filters.js';

const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

test('every group has looks and ids are unique', () => {
  for (const g of GROUPS) assert.ok(LOOKS.some((l) => l.group === g.id), g.id);
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, LOOKS.length);
});

test('black & white looks output neutral greys', () => {
  for (const look of LOOKS.filter((l) => l.group === 'bw' && !l.monoTone)) {
    const d = processPixels(px(200, 60, 30), look);
    assert.equal(d[0], d[1], look.id);
    assert.equal(d[1], d[2], look.id);
  }
});

test('white looks push mid-tones well toward white', () => {
  for (const look of LOOKS.filter((l) => l.group === 'white')) {
    const d = processPixels(px(110, 110, 110), look);
    assert.ok(d[0] > 200 && d[1] > 200 && d[2] > 200, `${look.id}: ${[...d]}`);
  }
});

test('golden hour warms the image', () => {
  const d = processPixels(px(128, 128, 128), LOOKS.find((l) => l.id === 'golden'));
  assert.ok(d[0] > d[2]);
});
