#!/usr/bin/env node
// Selfie Booth Studio server: serves the booth UI and relays print jobs to a
// Wi-Fi printer (browsers cannot talk to printers directly).
//
//   PORT=8080 PRINTER_URI=ipp://192.168.1.40/ipp/print node server.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PrinterManager } from './lib/printer.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_UPLOAD = 40 * 1024 * 1024;

const printer = new PrinterManager({
  configPath: process.env.SELFIEBOOTH_CONFIG || path.join(ROOT, 'config.json'),
  envUri: process.env.PRINTER_URI || null,
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Upload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, 64 * 1024);
  try {
    return body.length ? JSON.parse(body.toString('utf8')) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/printer':
      return sendJson(res, 200, await printer.status());

    case 'POST /api/printer': {
      const body = await readJson(req);
      if ('uri' in body) printer.setPrinter(body.uri ? String(body.uri).trim() : null);
      printer.setOptions(body);
      return sendJson(res, 200, await printer.status());
    }

    case 'GET /api/printers':
      return sendJson(res, 200, { printers: await printer.discover({ force: url.searchParams.has('refresh') }) });

    case 'POST /api/print': {
      const type = req.headers['content-type'] || '';
      if (!type.startsWith('image/jpeg')) return sendJson(res, 415, { ok: false, message: 'Send the 4x6 sheet as image/jpeg' });
      const jpeg = await readBody(req);
      if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return sendJson(res, 400, { ok: false, message: 'Not a JPEG' });
      const copies = Math.min(10, Math.max(1, Number(url.searchParams.get('copies')) || 1));
      const result = await printer.print(jpeg, { copies });
      return sendJson(res, result.ok ? 200 : 502, result);
    }

    default:
      return sendJson(res, 404, { ok: false, message: 'Unknown endpoint' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname);
    else res.writeHead(405).end();
  } catch (err) {
    if (!res.headersSent) sendJson(res, err.status || 500, { ok: false, message: err.message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`\n  Selfie Booth Studio running`);
  console.log(`  ➜ This computer: http://localhost:${PORT}`);
  for (const u of lan) console.log(`  ➜ On your network: ${u}  (camera needs https or localhost)`);
  console.log(`\n  Searching for Wi-Fi printers…`);
  printer.discover({ force: true }).then((found) => {
    if (found.length) for (const p of found) console.log(`  🖨  ${p.name} — ${p.uri}`);
    else console.log('  No printers found yet. The booth will keep looking (or set PRINTER_URI).');
    if (printer.config.uri) console.log(`  Using printer: ${printer.config.uri}`);
  });
});
