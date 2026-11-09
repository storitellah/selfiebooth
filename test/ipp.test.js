import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { TAG, OP, encodeRequest, decodeResponse, toHttpUrl, summariseStatus, printJpeg, getPrinterAttributes } from '../lib/ipp.js';

test('encodes and decodes attributes, multi-values and collections', () => {
  const buf = encodeRequest({
    operation: OP.printJob,
    requestId: 42,
    groups: [
      { tag: TAG.operation, attrs: [['attributes-charset', TAG.charset, 'utf-8'], ['requested-attributes', TAG.keyword, ['a', 'b']]] },
      {
        tag: TAG.job,
        attrs: [
          ['copies', TAG.integer, 3],
          ['media-col', TAG.begCollection, [['media-size', TAG.begCollection, [['x-dimension', TAG.integer, 10160], ['y-dimension', TAG.integer, 15240]]], ['media-top-margin', TAG.integer, 0]]],
        ],
      },
    ],
  });
  assert.equal(buf.readUInt16BE(2), OP.printJob);
  assert.equal(buf.readUInt32BE(4), 42);
  const res = decodeResponse(buf);
  assert.equal(res.attributes['attributes-charset'], 'utf-8');
  assert.deepEqual([...res.attributes['requested-attributes']], ['a', 'b']);
  assert.equal(res.attributes.copies, 3);
  assert.deepEqual(res.attributes['media-col'], { 'media-size': { 'x-dimension': 10160, 'y-dimension': 15240 }, 'media-top-margin': 0 });
});

test('maps ipp:// URIs to http on port 631', () => {
  assert.equal(toHttpUrl('ipp://10.0.0.5/ipp/print').href, 'http://10.0.0.5:631/ipp/print');
  assert.equal(toHttpUrl('ipps://printer.local:443/ipp/print').href, 'https://printer.local/ipp/print');
  assert.equal(toHttpUrl('ipps://printer.local/ipp/print').href, 'https://printer.local:631/ipp/print');
  assert.throws(() => toHttpUrl('ftp://x/'));
});

test('summarises printer state', () => {
  const s = summariseStatus({ 'printer-state': 3, 'printer-state-reasons': 'none', 'printer-make-and-model': 'HP ENVY', 'media-supported': ['na_letter_8.5x11in', 'na_index-4x6_4x6in'] });
  assert.equal(s.ready, true);
  assert.equal(s.state, 'idle');
  assert.equal(s.supports4x6, true);
  const jam = summariseStatus({ 'printer-state': 5, 'printer-state-reasons': ['media-jam-error'] });
  assert.equal(jam.ready, false);
});

function fakePrinter(handler) {
  const jobs = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const parsed = decodeResponse(body); // requests share the response layout
      jobs.push({ op: body.readUInt16BE(2), attrs: parsed.attributes, data: parsed.data });
      const { status, attrs } = handler(jobs.at(-1), jobs.length);
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      const out = encodeRequest({ operation: status, requestId: 1, groups: [{ tag: TAG.operation, attrs: [['attributes-charset', TAG.charset, 'utf-8']] }, { tag: TAG.printer, attrs }] });
      res.end(out);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, jobs, uri: `ipp://127.0.0.1:${server.address().port}/ipp/print` })));
}

test('prints a JPEG with borderless 4x6 media-col', async () => {
  const p = await fakePrinter(() => ({ status: 0, attrs: [['job-id', TAG.integer, 77]] }));
  const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const r = await printJpeg(p.uri, jpeg, { copies: 2 });
  p.server.close();
  assert.equal(r.ok, true);
  assert.equal(r.jobId, 77);
  const job = p.jobs[0];
  assert.equal(job.op, OP.printJob);
  assert.equal(job.attrs['document-format'], 'image/jpeg');
  assert.equal(job.attrs.copies, 2);
  assert.deepEqual(job.attrs['media-col']['media-size'], { 'x-dimension': 10160, 'y-dimension': 15240 });
  assert.equal(job.attrs['media-col']['media-left-margin'], 0);
  assert.deepEqual([...job.data], [...jpeg]);
});

test('falls back to the media keyword when media-col is rejected', async () => {
  // A printer that refuses media-col collections entirely.
  const p = await fakePrinter((job) => ({ status: job.attrs['media-col'] ? 0x040b : 0, attrs: [] }));
  const r = await printJpeg(p.uri, Buffer.from([0xff, 0xd8]));
  p.server.close();
  assert.equal(r.ok, true);
  assert.equal(p.jobs.length, 3); // borderless col → bordered col → keyword
  assert.equal(p.jobs[2].attrs.media, 'na_index-4x6_4x6in');
  assert.equal(p.jobs[2].attrs['media-col'], undefined);
});

test('reads printer attributes', async () => {
  const p = await fakePrinter(() => ({ status: 0, attrs: [['printer-state', TAG.enum, 3], ['printer-make-and-model', TAG.text, 'Canon SELPHY']] }));
  const attrs = await getPrinterAttributes(p.uri);
  p.server.close();
  assert.equal(p.jobs[0].op, OP.getPrinterAttributes);
  assert.equal(attrs['printer-make-and-model'], 'Canon SELPHY');
});

import { mediaSize, chooseMedia } from '../lib/ipp.js';

test('reads paper sizes from PWG media names', () => {
  assert.deepEqual(mediaSize('na_index-4x6_4x6in'), { x: 10160, y: 15240 });
  assert.deepEqual(mediaSize('jpn_hagaki_100x148mm'), { x: 10000, y: 14800 });
  assert.deepEqual(mediaSize('om_l_89x119mm'), { x: 8900, y: 11900 });
  assert.equal(mediaSize('custom_min_25.4x25.4mm'), null);
  assert.equal(mediaSize('photo'), null);
});

test('picks the closest photo paper to 4x6', () => {
  // Canon SELPHY: postcard only, no true 4x6.
  assert.equal(chooseMedia(['om_card_54x86mm', 'jpn_hagaki_100x148mm', 'om_l_89x119mm']).keyword, 'jpn_hagaki_100x148mm');
  // A printer with both picks exact 4x6.
  assert.equal(chooseMedia(['iso_a4_210x297mm', 'jpn_hagaki_100x148mm', 'na_index-4x6_4x6in']).keyword, 'na_index-4x6_4x6in');
  // 10x15 cm photo paper.
  assert.equal(chooseMedia(['iso_a4_210x297mm', 'om_photo-10x15_100x150mm']).keyword, 'om_photo-10x15_100x150mm');
  // Loaded paper wins over merely supported paper.
  assert.equal(chooseMedia(['na_index-4x6_4x6in', 'jpn_hagaki_100x148mm'], ['jpn_hagaki_100x148mm']).keyword, 'jpn_hagaki_100x148mm');
  // Nothing close (A4 office printer): fall back to plain 4x6.
  const fb = chooseMedia(['iso_a4_210x297mm', 'na_letter_8.5x11in']);
  assert.equal(fb.keyword, 'na_index-4x6_4x6in');
  assert.equal(fb.matched, false);
});
