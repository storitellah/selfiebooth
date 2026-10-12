// Tiny mDNS / DNS-SD browser used to find IPP printers on the local Wi-Fi
// network (the same mechanism AirPrint and Mopria use).

import dgram from 'node:dgram';

const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;

export const RR = { A: 1, PTR: 12, TXT: 16, AAAA: 28, SRV: 33, ANY: 255 };

export function encodeName(name) {
  const parts = name.replace(/\.$/, '').split('.');
  const bufs = [];
  for (const label of parts) {
    const b = Buffer.from(label, 'utf8');
    bufs.push(Buffer.from([b.length]), b);
  }
  bufs.push(Buffer.from([0]));
  return Buffer.concat(bufs);
}

/** Build a DNS query packet with one or more questions. */
export function buildQuery(questions) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(questions.length, 4);
  const qs = questions.map(({ name, type }) => {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(type, 0);
    tail.writeUInt16BE(0x0001, 2); // class IN
    return Buffer.concat([encodeName(name), tail]);
  });
  return Buffer.concat([header, ...qs]);
}

export function readName(buf, offset) {
  const labels = [];
  let off = offset;
  let end = -1;
  let jumps = 0;
  while (off < buf.length) {
    const len = buf[off];
    if (len === 0) {
      off += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (off + 1 >= buf.length || ++jumps > 32) throw new Error('Bad DNS name pointer');
      if (end < 0) end = off + 2;
      off = ((len & 0x3f) << 8) | buf[off + 1];
      continue;
    }
    labels.push(buf.toString('utf8', off + 1, off + 1 + len));
    off += 1 + len;
  }
  return [labels.join('.'), end < 0 ? off : end];
}

/** Parse every resource record (answers + authority + additional). */
export function parsePacket(buf) {
  if (buf.length < 12) throw new Error('DNS packet too short');
  const qd = buf.readUInt16BE(4);
  const total = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let off = 12;
  for (let i = 0; i < qd; i++) {
    [, off] = readName(buf, off);
    off += 4;
  }
  const records = [];
  for (let i = 0; i < total && off < buf.length; i++) {
    let name;
    [name, off] = readName(buf, off);
    const type = buf.readUInt16BE(off);
    const rdlen = buf.readUInt16BE(off + 8);
    const rdStart = off + 10;
    const rdata = buf.subarray(rdStart, rdStart + rdlen);
    let data = null;
    if (type === RR.PTR) {
      [data] = readName(buf, rdStart);
    } else if (type === RR.SRV) {
      const [target] = readName(buf, rdStart + 6);
      data = { priority: rdata.readUInt16BE(0), weight: rdata.readUInt16BE(2), port: rdata.readUInt16BE(4), target };
    } else if (type === RR.TXT) {
      data = {};
      let p = 0;
      while (p < rdata.length) {
        const len = rdata[p];
        const s = rdata.toString('utf8', p + 1, p + 1 + len);
        p += 1 + len;
        const eq = s.indexOf('=');
        if (eq > 0) data[s.slice(0, eq).toLowerCase()] = s.slice(eq + 1);
        else if (s) data[s.toLowerCase()] = true;
      }
    } else if (type === RR.A && rdlen === 4) {
      data = Array.from(rdata).join('.');
    }
    records.push({ name, type, data });
    off = rdStart + rdlen;
  }
  return records;
}

/**
 * Turn a bag of DNS-SD records into printer descriptors:
 * [{ name, uri, host, port, model }]
 */
export function resolvePrinters(records, service = '_ipp._tcp.local') {
  const lower = (s) => s.toLowerCase();
  const instances = new Set();
  const srv = new Map();
  const txt = new Map();
  const addr = new Map();
  for (const r of records) {
    if (r.type === RR.PTR && lower(r.name) === service) instances.add(r.data);
    else if (r.type === RR.SRV) srv.set(lower(r.name), r.data);
    else if (r.type === RR.TXT) txt.set(lower(r.name), r.data);
    else if (r.type === RR.A) addr.set(lower(r.name), r.data);
  }
  const printers = [];
  for (const instance of instances) {
    const s = srv.get(lower(instance));
    if (!s) continue;
    const t = txt.get(lower(instance)) || {};
    const ip = addr.get(lower(s.target));
    const host = ip || s.target;
    const rp = String(t.rp || 'ipp/print').replace(/^\/+/, '');
    printers.push({
      name: t.ty || instance.slice(0, instance.length - service.length - 1),
      model: t.ty || null,
      host,
      port: s.port,
      uri: `ipp://${host}:${s.port}/${rp}`,
    });
  }
  return printers;
}

/** Browse the local network for IPP printers for `timeoutMs`. */
export function discoverPrinters({ timeoutMs = 2500, service = '_ipp._tcp.local' } = {}) {
  return new Promise((resolve) => {
    const records = [];
    const asked = new Set();
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }
    const send = (questions) => {
      try {
        socket.send(buildQuery(questions), MDNS_PORT, MDNS_ADDR);
      } catch {
        /* ignore — network may be down */
      }
    };
    const followUp = () => {
      // Ask for any SRV/TXT/A records the responders didn't volunteer.
      const known = new Set(records.map((r) => `${r.type}:${r.name.toLowerCase()}`));
      const questions = [];
      for (const r of records) {
        if (r.type === RR.PTR && !known.has(`${RR.SRV}:${r.data.toLowerCase()}`) && !asked.has(r.data)) {
          asked.add(r.data);
          questions.push({ name: r.data, type: RR.ANY });
        }
        if (r.type === RR.SRV && !known.has(`${RR.A}:${r.data.target.toLowerCase()}`) && !asked.has(r.data.target)) {
          asked.add(r.data.target);
          questions.push({ name: r.data.target, type: RR.A });
        }
      }
      if (questions.length) send(questions);
    };
    socket.on('message', (msg) => {
      try {
        records.push(...parsePacket(msg));
        followUp();
      } catch {
        /* malformed packet — skip */
      }
    });
    socket.on('error', () => finish());
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      const seen = new Set();
      resolve(resolvePrinters(records, service).filter((p) => !seen.has(p.uri) && seen.add(p.uri)));
    };
    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(255);
      } catch {
        /* not fatal */
      }
      send([{ name: service, type: RR.PTR }]);
      setTimeout(() => send([{ name: service, type: RR.PTR }]), 600);
    });
    setTimeout(finish, timeoutMs);
  });
}
