import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RR, buildQuery, encodeName, parsePacket, resolvePrinters } from '../lib/mdns.js';

function rr(name, type, rdata) {
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(1, 2);
  head.writeUInt32BE(120, 4);
  head.writeUInt16BE(rdata.length, 8);
  return Buffer.concat([name, head, rdata]);
}

test('builds a PTR query', () => {
  const q = buildQuery([{ name: '_ipp._tcp.local', type: RR.PTR }]);
  assert.equal(q.readUInt16BE(4), 1);
  assert.equal(q.readUInt16BE(q.length - 4), RR.PTR);
});

test('parses a DNS-SD response with name compression into a printer', () => {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(1, 6); // 1 answer
  header.writeUInt16BE(3, 10); // 3 additional
  const service = encodeName('_ipp._tcp.local'); // at offset 12
  const ptrData = Buffer.concat([Buffer.from([10]), Buffer.from('HP ENVY 64'), Buffer.from([0xc0, 12])]);
  const ptr = rr(service, RR.PTR, ptrData);
  const instanceOffset = 12 + service.length + 10; // where ptrData starts
  const instPtr = Buffer.from([0xc0, instanceOffset]);
  const srvData = Buffer.concat([Buffer.from([0, 0, 0, 0, 0x02, 0x77]), encodeName('hp-envy.local')]);
  const txt = Buffer.concat(['rp=ipp/print', 'ty=HP ENVY 6400'].map((s) => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)])));
  const packet = Buffer.concat([header, ptr, rr(instPtr, RR.SRV, srvData), rr(instPtr, RR.TXT, txt), rr(encodeName('hp-envy.local'), RR.A, Buffer.from([192, 168, 1, 40]))]);
  const records = parsePacket(packet);
  assert.equal(records.length, 4);
  assert.equal(records[0].data, 'HP ENVY 64._ipp._tcp.local');
  const printers = resolvePrinters(records);
  assert.deepEqual(printers, [{ name: 'HP ENVY 6400', model: 'HP ENVY 6400', host: '192.168.1.40', port: 631, uri: 'ipp://192.168.1.40:631/ipp/print' }]);
});
