// End-to-end against a strict Canon SELPHY CP1300 stand-in (test/helpers/selphy-sim.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSelphy, startSelphyBonjour } from './helpers/selphy-sim.js';
import { PrinterManager, pickCupsPageSize, parseIppfind } from '../lib/printer.js';
import { discoverPrinters } from '../lib/mdns.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 1, 44, 1, 44, 0, 0, 0xff, 0xd9]);

test('finds a SELPHY that only answers Bonjour by multicast', async () => {
  const printer = await startSelphy();
  // Unique name, in case another SELPHY (or simulator) is on the network.
  const name = `Canon SELPHY CP1300 ${printer.port}`;
  const bonjour = await startSelphyBonjour({ port: printer.port, multicastOnly: true, name });
  try {
    const found = await discoverPrinters({ timeoutMs: 2000 });
    const selphy = found.find((p) => p.uri === printer.uri);
    assert.ok(selphy, `not found in ${JSON.stringify(found)}`);
    assert.equal(selphy.name, name);
  } finally {
    await bonjour.close();
    await printer.close();
  }
});

test('connects to the CP1300, reads its postcard paper and prints on the first try', async () => {
  const printer = await startSelphy();
  const tmp = path.join(os.tmpdir(), `selfie-${process.pid}.json`);
  try {
    const pm = new PrinterManager({ configPath: tmp, envUri: printer.uri });
    const status = await pm.status();
    assert.equal(status.connected, true);
    assert.equal(status.ready, true);
    assert.equal(status.model, 'Canon SELPHY CP1300');
    assert.deepEqual(status.paper, { keyword: 'jpn_hagaki_100x148mm', wmm: 100, hmm: 148 });
    assert.equal(status.jpeg, true);

    const result = await pm.print(jpeg, { copies: 2 });
    assert.equal(result.ok, true, result.message);
    assert.equal(printer.rejected.length, 0, `printer refused: ${printer.rejected.map((r) => r.why)}`);
    const job = printer.jobs[0];
    assert.equal(job.attrs['document-format'], 'image/jpeg');
    assert.deepEqual(job.attrs['media-col']['media-size'], { 'x-dimension': 10000, 'y-dimension': 14800 });
    assert.equal(job.attrs['media-col']['media-left-margin'], 0); // borderless
    assert.equal(job.attrs.copies, 2);
    assert.deepEqual([...job.data], [...jpeg]);
  } finally {
    fs.rmSync(tmp, { force: true });
    await printer.close();
  }
});

test('reports a SELPHY that is out of paper as not ready', async () => {
  const printer = await startSelphy({ state: 5, reasons: 'media-empty-error' });
  try {
    const pm = new PrinterManager({ envUri: printer.uri });
    const status = await pm.status();
    assert.equal(status.connected, true);
    assert.equal(status.ready, false);
    assert.deepEqual(status.reasons, ['media-empty-error']);
  } finally {
    await printer.close();
  }
});

test('picks Postcard (borderless) on a SELPHY added to macOS/CUPS', () => {
  const lp = 'PageSize/Media Size: 54x86mm 54x86mm.Fullbleed 89x119mm 89x119mm.Fullbleed *Postcard Postcard.Fullbleed\nColorModel/Color Mode: Gray *RGB\n';
  assert.deepEqual(pickCupsPageSize(lp, true), { keyword: 'Postcard.Fullbleed', wmm: 100, hmm: 148 });
  assert.deepEqual(pickCupsPageSize(lp, false), { keyword: 'Postcard', wmm: 100, hmm: 148 });
  assert.equal(pickCupsPageSize('PageSize/Media Size: *Letter A4 4x6 4x6.Borderless', true).keyword, '4x6.Borderless');
  assert.equal(pickCupsPageSize('ColorModel: RGB'), null);
});

test('reads printers from ippfind output', () => {
  const out = 'ipp://Canon-SELPHY-CP1300.local.:631/ipp/print\nsomething else\n';
  assert.deepEqual(parseIppfind(out), [
    { name: 'Canon SELPHY CP1300', model: null, host: 'Canon-SELPHY-CP1300.local', port: 631, uri: 'ipp://Canon-SELPHY-CP1300.local:631/ipp/print' },
  ]);
});
