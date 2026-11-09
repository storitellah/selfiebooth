// Find printers by asking every address on the local Wi-Fi network directly,
// for networks where Bonjour/mDNS is blocked (common on mesh routers, guest
// networks and some ISP routers).

import net from 'node:net';
import os from 'node:os';
import { getPrinterAttributes, summariseStatus } from './ipp.js';

const PRIVATE = [
  [0x0a000000, 8], // 10.0.0.0/8
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0a80000, 16], // 192.168.0.0/16
];

const toInt = (ip) => ip.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
const toIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export function isPrivateIPv4(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = toInt(ip);
  return PRIVATE.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
}

/**
 * Addresses to try on each private IPv4 network this computer is on.
 * Large networks are narrowed to the /24 around our own address.
 */
export function subnetHosts(interfaces = os.networkInterfaces()) {
  const hosts = new Set();
  for (const list of Object.values(interfaces)) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || !isPrivateIPv4(i.address)) continue;
      const bits = Math.max(24, String(i.netmask).split('.').reduce((a, o) => a + (Number(o).toString(2).match(/1/g) || []).length, 0));
      const size = 2 ** (32 - bits);
      const base = (toInt(i.address) & ~(size - 1)) >>> 0;
      for (let k = 1; k < size - 1; k++) {
        const ip = toIp(base + k);
        if (ip !== i.address) hosts.add(ip);
      }
    }
  }
  return [...hosts];
}

/** Is a TCP port open? Resolves quickly either way. */
export function portOpen(host, port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

// Where printers commonly answer IPP. AirPrint printers (Canon SELPHY
// included) use port 631 and /ipp/print.
const PATHS = ['ipp/print', 'ipp', 'ipp/printer', ''];

/**
 * Turn "192.168.100.102", "printer.local" or a full ipp:// address into a
 * working printer address, by asking the printer. Returns { uri, attrs }.
 */
export async function probePrinter(input, { ports = [631, 80], timeoutMs = 6000 } = {}) {
  const text = String(input).trim();
  let host;
  let tryPorts = ports;
  let tryPaths = PATHS;
  if (/^(ipps?|https?):\/\//i.test(text)) {
    const u = new URL(text.replace(/^ipps?:/i, 'http:'));
    host = u.hostname;
    tryPorts = [Number(u.port) || 631, ...ports.filter((p) => p !== (Number(u.port) || 631))];
    const given = u.pathname.replace(/^\/+/, '');
    tryPaths = given ? [given, ...PATHS.filter((p) => p !== given)] : PATHS;
  } else {
    const m = text.match(/^([\w.-]+)(?::(\d+))?\/?(.*)$/);
    if (!m) throw new Error(`“${text}” isn't a printer address`);
    host = m[1];
    if (m[2]) tryPorts = [Number(m[2])];
    if (m[3]) tryPaths = [m[3], ...PATHS.filter((p) => p !== m[3])];
  }
  let lastErr = new Error(`No printer answered at ${host}`);
  for (const port of tryPorts) {
    if (!(await portOpen(host, port, 1500))) {
      lastErr = new Error(`${host} isn't answering on port ${port}. Is the printer on and on the same Wi-Fi?`);
      continue;
    }
    for (const path of tryPaths) {
      const uri = `ipp://${host}:${port}/${path}`;
      try {
        const attrs = await getPrinterAttributes(uri, { timeoutMs });
        return { uri, attrs };
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr;
}

/** Ask every address on the local network for a printer on port 631. */
export async function scanForPrinters({ hosts = subnetHosts(), port = 631, concurrency = 64, connectTimeoutMs = 600 } = {}) {
  const open = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++];
      if (await portOpen(host, port, connectTimeoutMs)) open.push(host);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  const printers = [];
  for (const host of open) {
    try {
      const { uri, attrs } = await probePrinter(`${host}:${port}`, { timeoutMs: 4000 });
      const s = summariseStatus(attrs);
      printers.push({ name: s.name || s.model || host, model: s.model, host, port, uri });
    } catch {
      /* something else listening on 631 */
    }
  }
  return printers;
}
