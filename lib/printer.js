// Printer selection + status. Supports:
//   ipp://host[:port]/path   Wi-Fi / network printers (AirPrint, Mopria, IPP Everywhere)
//   ipps://...               same over TLS
//   cups:QUEUE_NAME          a printer already installed in CUPS on this machine

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getPrinterAttributes, printJpeg, summariseStatus } from './ipp.js';
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
    const [ipp, cups] = await Promise.all([discoverPrinters(), listCupsPrinters()]);
    this.discovered = [...ipp, ...cups];
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
      const s = uri.startsWith('cups:') ? await cupsStatus(uri.slice(5)) : summariseStatus(await getPrinterAttributes(uri));
      const known = this.discovered.find((p) => p.uri === uri);
      return { ...base, connected: true, ...s, name: s.name || known?.name || uri };
    } catch (err) {
      // An auto-picked printer may have gone away; look for another one.
      if (!this.config.uri) this.discover().catch(() => {});
      return { ...base, connected: false, ready: false, message: err.message };
    }
  }

  async print(jpeg, { copies = 1 } = {}) {
    const uri = this.activeUri;
    if (!uri) throw new Error('No printer connected');
    const jobName = `Photo strips ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
    if (uri.startsWith('cups:')) return cupsPrint(uri.slice(5), jpeg, { copies, jobName, borderless: this.config.borderless });
    return printJpeg(uri, jpeg, { copies, jobName, borderless: this.config.borderless });
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

async function listCupsPrinters() {
  const { code, out } = await run('lpstat', ['-e']);
  if (code !== 0) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name: `${name} (CUPS)`, uri: `cups:${name}`, model: null }));
}

async function cupsStatus(name) {
  const { code, out, err } = await run('lpstat', ['-p', name]);
  if (code !== 0) throw new Error(err.trim() || `CUPS printer ${name} not found`);
  const disabled = /disabled/i.test(out);
  return { name, model: null, state: disabled ? 'stopped' : /printing/i.test(out) ? 'processing' : 'idle', reasons: [], ready: !disabled, supports4x6: true };
}

async function cupsPrint(name, jpeg, { copies, jobName, borderless }) {
  const args = ['-d', name, '-n', String(copies), '-t', jobName, '-o', `media=${borderless ? '4x6.Borderless' : '4x6'}`, '-o', 'fit-to-page', '-o', 'print-quality=5'];
  let res = await run('lp', args, jpeg);
  if (res.code !== 0 && borderless) {
    args[args.indexOf('media=4x6.Borderless')] = 'media=4x6';
    res = await run('lp', args, jpeg);
  }
  if (res.code !== 0) return { ok: false, message: res.err.trim() || 'lp failed' };
  const m = res.out.match(/request id is (\S+)/);
  return { ok: true, jobId: m ? m[1] : null };
}
