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
  const p = await fakePrinter((job, n) => ({ status: n === 1 ? 0x040b : 0, attrs: [] }));
  const r = await printJpeg(p.uri, Buffer.from([0xff, 0xd8]));
  p.server.close();
  assert.equal(r.ok, true);
  assert.equal(p.jobs.length, 2);
  assert.equal(p.jobs[1].attrs.media, 'na_index-4x6_4x6in');
  assert.equal(p.jobs[1].attrs['media-col'], undefined);
});

test('reads printer attributes', async () => {
  const p = await fakePrinter(() => ({ status: 0, attrs: [['printer-state', TAG.enum, 3], ['printer-make-and-model', TAG.text, 'Canon SELPHY']] }));
  const attrs = await getPrinterAttributes(p.uri);
  p.server.close();
  assert.equal(p.jobs[0].op, OP.getPrinterAttributes);
  assert.equal(attrs['printer-make-and-model'], 'Canon SELPHY');
});
