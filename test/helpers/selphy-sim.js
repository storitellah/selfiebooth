// A strict stand-in for a Canon SELPHY CP1300 on Wi-Fi, used by the tests.
//
// It mirrors what the real printer advertises over AirPrint/IPP:
//   - paper: postcard 100×148 mm (no 4×6 in), card 54×86 mm, L 89×119 mm
//   - formats: image/jpeg and image/urf only, 300 dpi
// and it is strict: unknown paper sizes or formats are refused, the way a
// real printer refuses them. It can also answer mDNS (Bonjour) the way many
// embedded printers do: multicast replies only.

import http from 'node:http';
import dgram from 'node:dgram';
import { TAG, encodeRequest, decodeResponse } from '../../lib/ipp.js';
import { encodeName, buildQuery, parsePacket, RR } from '../../lib/mdns.js';

export const CP1300 = {
  model: 'Canon SELPHY CP1300',
  media: ['jpn_hagaki_100x148mm', 'om_card_54x86mm', 'om_l_89x119mm'],
  sizes: { jpn_hagaki_100x148mm: [10000, 14800], om_card_54x86mm: [5400, 8600], om_l_89x119mm: [8900, 11900] },
  formats: ['application/octet-stream', 'image/jpeg', 'image/urf'],
};

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function reply(res, status, printerAttrs = [], jobAttrs = []) {
  const groups = [{ tag: TAG.operation, attrs: [['attributes-charset', TAG.charset, 'utf-8'], ['attributes-natural-language', TAG.naturalLanguage, 'en']] }];
  if (printerAttrs.length) groups.push({ tag: TAG.printer, attrs: printerAttrs });
  if (jobAttrs.length) groups.push({ tag: TAG.job, attrs: jobAttrs });
  res.writeHead(200, { 'Content-Type': 'application/ipp' });
  res.end(encodeRequest({ operation: status, requestId: 1, groups }));
}

export function startSelphy({ state = 3, reasons = 'none' } = {}) {
  const jobs = [];
  const rejected = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const msg = decodeResponse(body);
      const op = body.readUInt16BE(2);
      const a = msg.attributes;
      if (op === 0x000b) {
        return reply(res, 0, [
          ['printer-name', TAG.name, 'Canon_SELPHY_CP1300'],
          ['printer-info', TAG.text, CP1300.model],
          ['printer-make-and-model', TAG.text, CP1300.model],
          ['printer-state', TAG.enum, state],
          ['printer-state-reasons', TAG.keyword, reasons],
          ['printer-is-accepting-jobs', TAG.boolean, true],
          ['document-format-supported', TAG.mimeMediaType, CP1300.formats],
          ['media-supported', TAG.keyword, CP1300.media],
          ['media-ready', TAG.keyword, ['jpn_hagaki_100x148mm']],
        ]);
      }
      if (op !== 0x0002) return reply(res, 0x0501);
      const fail = (code, why) => {
        rejected.push({ code, why, attrs: a });
        reply(res, code, [], [['status-message', TAG.text, why]]);
      };
      if (!CP1300.formats.includes(a['document-format'])) return fail(0x040a, `document-format ${a['document-format']} not supported`);
      if (a.media != null && !CP1300.media.includes(a.media)) return fail(0x040b, `media ${a.media} not supported`);
      const size = a['media-col']?.['media-size'];
      if (size) {
        const ok = Object.values(CP1300.sizes).some(([x, y]) => Math.abs(x - size['x-dimension']) <= 100 && Math.abs(y - size['y-dimension']) <= 100);
        if (!ok) return fail(0x040b, `media-size ${size['x-dimension']}x${size['y-dimension']} not supported`);
      }
      if (!msg.data || msg.data[0] !== 0xff || msg.data[1] !== 0xd8) return fail(0x0400, 'document is not a JPEG');
      jobs.push({ attrs: a, data: msg.data });
      reply(res, 0x0001, [], [['job-id', TAG.integer, jobs.length], ['job-state', TAG.enum, 3]]);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        port,
        uri: `ipp://127.0.0.1:${port}/ipp/print`,
        jobs,
        rejected,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/**
 * Answer Bonjour browses for _ipp._tcp like an embedded printer.
 * multicastOnly: ignore the unicast-reply path (common on printers).
 */
export function startSelphyBonjour({ port, multicastOnly = true, name = 'Canon SELPHY CP1300' } = {}) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const instance = `${name}._ipp._tcp.local`;
  const host = `${name.replace(/\W+/g, '-')}.local`;
  const rr = (rname, type, rdata) => {
    const head = Buffer.alloc(10);
    head.writeUInt16BE(type, 0);
    head.writeUInt16BE(0x8001, 2);
    head.writeUInt32BE(120, 4);
    head.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([encodeName(rname), head, rdata]);
  };
  const txt = (pairs) => Buffer.concat(pairs.map((s) => Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)])));
  const answer = () => {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0x8400, 2);
    header.writeUInt16BE(4, 6);
    const srv = Buffer.alloc(6);
    srv.writeUInt16BE(port, 4);
    return Buffer.concat([
      header,
      rr('_ipp._tcp.local', RR.PTR, encodeName(instance)),
      rr(instance, RR.SRV, Buffer.concat([srv, encodeName(host)])),
      rr(instance, RR.TXT, txt(['txtvers=1', 'rp=ipp/print', `ty=${name}`, 'pdl=image/jpeg,image/urf', 'URF=W8,SRGB24,RS300'])),
      rr(host, RR.A, Buffer.from([127, 0, 0, 1])),
    ]);
  };
  let queries = 0;
  sock.on('message', (msg, from) => {
    let asks = false;
    try {
      const qd = msg.readUInt16BE(4);
      const flags = msg.readUInt16BE(2);
      if (qd === 0 || flags & 0x8000) return; // not a query
      asks = msg.includes(encodeName('_ipp._tcp.local')) || msg.includes(Buffer.from('SELPHY'));
    } catch {
      return;
    }
    if (!asks) return;
    queries++;
    if (from.port !== 5353 && !multicastOnly) sock.send(answer(), from.port, from.address);
    else sock.send(answer(), 5353, '224.0.0.251');
  });
  return new Promise((resolve, reject) => {
    sock.once('error', reject);
    sock.bind(5353, () => {
      sock.addMembership('224.0.0.251');
      sock.setMulticastLoopback(true);
      resolve({ close: () => new Promise((r) => sock.close(r)), get queries() { return queries; } });
    });
  });
}

export { buildQuery, parsePacket };
