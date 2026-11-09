// Printer selection + status. Supports:
//   ipp://host[:port]/path   Wi-Fi / network printers (AirPrint, Mopria, IPP Everywhere)
//   ipps://...               same over TLS
//   cups:QUEUE_NAME          a printer already installed in CUPS on this machine

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getPrinterAttributes, printJpeg, summariseStatus, mediaSize } from './ipp.js';
import { discoverPrinters } from './mdns.js';

export class PrinterManager {
  constructor({ configPath, envUri } = {}) {
    this.configPath = configPath;
    this.config = { uri: null, borderless: true };
    this.discovered = [];
    this.autoUri = null;
    this.lastDiscovery = 0;
    this.load();
    if (envUri) this.config.uri = envUri;
  }

  load() {
    if (!this.configPath) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      this.config = { ...this.config, ...saved };
    } catch {
      /* first run */
    }
  }

  save() {
    if (!this.configPath) return;
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /** The printer we'll actually use: manual choice, else first one discovered. */
  get activeUri() {
    return this.config.uri || this.autoUri;
  }

  setPrinter(uri) {
    if (uri && !/^(ipps?|https?):\/\/|^cups:/i.test(uri)) {
      throw new Error('Printer must be an ipp://, ipps:// or cups: address');
    }
    this.config.uri = uri || null;
    this.save();
  }

  setOptions({ borderless }) {
    if (typeof borderless === 'boolean') this.config.borderless = borderless;
    this.save();
  }

  async discover({ force = false } = {}) {
    if (!force && Date.now() - this.lastDiscovery < 15000) return this.discovered;
    this.lastDiscovery = Date.now();
    const [ipp, found, cups] = await Promise.all([discoverPrinters(), ippfindPrinters(), listCupsPrinters()]);
    const seen = new Set();
    const net = [...ipp, ...found].filter((p) => {
      const key = `${p.host}:${p.port}`.toLowerCase();
      return !seen.has(key) && seen.add(key);
    });
    this.discovered = [...net.map((p) => ({ ...p, transport: 'wifi' })), ...cups];
    if (!this.discovered.some((p) => p.uri === this.autoUri)) {
      this.autoUri = this.discovered[0]?.uri || null;
    }
    return this.discovered;
  }

  async status() {
    if (!this.activeUri) await this.discover();
    const uri = this.activeUri;
    const base = { uri, source: this.config.uri ? 'manual' : uri ? 'auto' : null, borderless: this.config.borderless };
    if (!uri) return { ...base, connected: false, ready: false, message: 'No printer found on this network' };
    try {
      const s = await this.check(uri);
      const known = this.discovered.find((p) => p.uri === uri);
      const transport = known?.transport || (uri.startsWith('cups:') ? null : 'wifi');
      return { ...base, connected: true, ...s, transport, name: s.name || known?.name || uri };
    } catch (err) {
      // An auto-picked printer may have gone away; look for another one.
      if (!this.config.uri) this.discover().catch(() => {});
      return { ...base, connected: false, ready: false, message: err.message };
    }
  }

  /** Ask a printer what it is, whether it's ready and which paper to use. */
  async check(uri) {
    const s = uri.startsWith('cups:') ? await cupsStatus(uri.slice(5)) : summariseStatus(await getPrinterAttributes(uri));
    this.lastCheck = { uri, at: Date.now(), status: s };
    return s;
  }

  async print(jpeg, { copies = 1, jobName } = {}) {
    const uri = this.activeUri;
    if (!uri) throw new Error('No printer connected');
    jobName = jobName || `Photo strips ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
    const fresh = this.lastCheck?.uri === uri && Date.now() - this.lastCheck.at < 60000;
    const s = fresh ? this.lastCheck.status : await this.check(uri);
    if (uri.startsWith('cups:')) return cupsPrint(uri.slice(5), jpeg, { copies, jobName, borderless: this.config.borderless, media: s.paper?.keyword });
    if (s.jpeg === false) {
      return { ok: false, message: `${s.name || 'This printer'} doesn't accept photos (JPEG) directly. Add it in your computer's printer settings and pick it from the list instead.` };
    }
    const size = mediaSize(s.paper?.keyword) || {};
    return printJpeg(uri, jpeg, { copies, jobName, borderless: this.config.borderless, media: { keyword: s.paper?.keyword, ...size } });
  }
}

// ---------------------------------------------------------------------------
// CUPS helpers (optional — only used when `lp`/`lpstat` exist)

function run(cmd, args, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args);
    } catch {
      resolve({ code: -1, out: '', err: 'not available' });
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', () => resolve({ code: -1, out, err: 'not available' }));
    child.on('close', (code) => resolve({ code, out, err }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** How a printer is connected, from its CUPS device URI. */
export function transportFromDeviceUri(uri = '') {
  const scheme = String(uri).split(':')[0].toLowerCase();
  if (/^(bluetooth|bth|bt|btspp)$/.test(scheme) || /bluetooth/i.test(uri)) return 'bluetooth';
  if (scheme === 'usb' || scheme === 'ippusb') return 'usb';
  if (/^(dnssd|mdns|ipp|ipps|http|https|socket|lpd|smb)$/.test(scheme)) return 'wifi';
  return null;
}

/** Parse `lpstat -v` ("device for NAME: URI") into { NAME: URI }. */
export function parseLpstatDevices(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^device for (.+?):\s*(\S+)/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function listCupsPrinters() {
  const { code, out } = await run('lpstat', ['-e']);
  if (code !== 0) return [];
  const devices = parseLpstatDevices((await run('lpstat', ['-v'])).out);
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      const transport = transportFromDeviceUri(devices[name]);
      const label = transport === 'bluetooth' ? 'Bluetooth' : transport === 'usb' ? 'USB' : 'this computer';
      return { name: `${name.replace(/_/g, ' ')} (${label})`, uri: `cups:${name}`, model: null, transport };
    });
}

// Paper names CUPS/macOS drivers use for 4×6-ish photo paper, with sizes in mm.
const CUPS_PAPER = [
  [/^(4x6|w288h432|na_index-4x6.*|Photo4x6|Index4x6)$/i, 101.6, 152.4],
  [/^(Postcard|jpn_hagaki.*|Hagaki|100x148mm)$/i, 100, 148],
  [/^(10x15cm|100x150mm|om_photo-10x15.*)$/i, 100, 150],
];

/**
 * From `lpoptions -p NAME -l`, pick the PageSize closest to 4×6 — "Postcard"
 * on a Canon SELPHY — preferring its borderless ("Fullbleed") variant.
 */
export function pickCupsPageSize(lpoptionsText, borderless = true) {
  const line = String(lpoptionsText)
    .split('\n')
    .find((l) => /^(PageSize|media)\b/i.test(l));
  if (!line) return null;
  const sizes = line
    .split(':')
    .slice(1)
    .join(':')
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^\*/, ''));
  for (const [re, wmm, hmm] of CUPS_PAPER) {
    const base = sizes.filter((t) => re.test(t.replace(/\.(Fullbleed|Borderless|FB)$/i, '')));
    if (!base.length) continue;
    const edge = base.find((t) => /\.(Fullbleed|Borderless|FB)$/i.test(t));
    const plain = base.find((t) => !/\.(Fullbleed|Borderless|FB)$/i.test(t));
    return { keyword: (borderless && edge) || plain || base[0], wmm, hmm };
  }
  return null;
}

async function cupsStatus(name) {
  const { code, out, err } = await run('lpstat', ['-p', name]);
  if (code !== 0) throw new Error(err.trim() || `CUPS printer ${name} not found`);
  const disabled = /disabled/i.test(out);
  const paper = pickCupsPageSize((await run('lpoptions', ['-p', name, '-l'])).out) || { keyword: null, wmm: 101.6, hmm: 152.4 };
  return {
    name: name.replace(/_/g, ' '),
    model: null,
    state: disabled ? 'stopped' : /printing/i.test(out) ? 'processing' : 'idle',
    reasons: [],
    ready: !disabled,
    supports4x6: true,
    paper,
    jpeg: true,
  };
}

async function cupsPrint(name, jpeg, { copies, jobName, borderless, media }) {
  const base = ['-d', name, '-n', String(copies), '-t', jobName, '-o', 'fit-to-page', '-o', 'print-quality=5'];
  const tries = [media, borderless ? '4x6.Borderless' : null, '4x6', null].filter((m, i, a) => m !== undefined && a.indexOf(m) === i);
  let res;
  for (const m of tries) {
    res = await run('lp', m ? [...base, '-o', `media=${m}`] : base, jpeg);
    if (res.code === 0) break;
  }
  if (res.code !== 0) return { ok: false, message: res.err.trim() || 'lp failed' };
  const m = res.out.match(/request id is (\S+)/);
  return { ok: true, jobId: m ? m[1] : null };
}

/** Printers found by `ippfind` (ships with CUPS on macOS and Linux). */
async function ippfindPrinters() {
  const { code, out } = await run('ippfind', ['-T', '3', '_ipp._tcp']);
  if (code !== 0 && !out) return [];
  return parseIppfind(out);
}

export function parseIppfind(text) {
  const printers = [];
  for (const line of String(text).split('\n')) {
    const uri = line.trim();
    if (!/^ipps?:\/\//i.test(uri)) continue;
    try {
      const u = new URL(uri);
      const host = u.hostname.replace(/\.$/, '');
      const port = Number(u.port) || 631;
      const name = decodeURIComponent(host.replace(/\.local$/i, '')).replace(/[-_]+/g, ' ');
      printers.push({ name, model: null, host, port, uri: `ipp://${host}:${port}${u.pathname}` });
    } catch {
      /* not a URI */
    }
  }
  return printers;
}
