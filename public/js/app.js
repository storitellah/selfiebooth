import { GROUPS, LOOKS, getLook, applyLook } from './filters.js';
import { BACKDROPS, DOWNLOAD_DPI, PRINT_DPI, SHOTS, stripLayout, coverCrop, renderStrip, renderSheet, canvasToJpeg } from './layout.js';
import { getPrinterStatus, listPrinters, configurePrinter, printViaServer, printViaBrowser } from './printing.js';

const $ = (id) => document.getElementById(id);
const COUNTDOWN_SECONDS = 3;
const FRAME_ASPECT = stripLayout().aspect;

// ---------------------------------------------------------------------------
// Settings (remembered per browser; everything works without storage too)

const DEFAULT_SETTINGS = { look: 'natural', backdrop: 'black', caption: '', showDate: true, autoPrint: true, copies: 1, mirror: true };
const settings = { ...DEFAULT_SETTINGS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('selfiebooth') || '{}'));
} catch {
  /* storage unavailable */
}
const persist = () => {
  try {
    localStorage.setItem('selfiebooth', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
};

const state = {
  stream: null,
  video: document.createElement('video'),
  shots: [],
  busy: false,
  printer: { server: false, connected: false, ready: false },
  lastStrip: null,
  activeGroup: getLook(settings.look).group,
};
state.video.muted = true;
state.video.playsInline = true;

// ---------------------------------------------------------------------------
// Camera

async function startCamera() {
  const msg = $('cameraMsg');
  msg.hidden = false;
  $('retryCamera').hidden = true;
  msg.querySelector('.camera-msg-title').textContent = 'The camera is warming up…';
  msg.querySelector('.camera-msg-body').textContent = 'Allow camera access when your browser asks.';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
    state.video.srcObject = state.stream;
    await state.video.play();
    msg.hidden = true;
    $('shutter').disabled = false;
  } catch (err) {
    const insecure = err.name === 'InsecureContext' || !window.isSecureContext;
    msg.querySelector('.camera-msg-title').textContent = insecure ? 'Camera needs a secure page' : 'No camera available';
    msg.querySelector('.camera-msg-body').textContent = insecure
      ? 'Open the booth at http://localhost on the booth computer, or serve it over https.'
      : err.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow it in the address bar, then try again.'
        : 'Plug in or enable a camera, then try again.';
    $('retryCamera').hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Live preview with the chosen look

const preview = $('preview');
const pctx = preview.getContext('2d', { willReadFrequently: true });
let previewSized = false;
function sizePreview() {
  previewSized = true;
  const w = Math.min(960, Math.round(preview.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5)) || 720);
  preview.width = w;
  preview.height = Math.round(w / FRAME_ASPECT);
}
preview.style.aspectRatio = String(FRAME_ASPECT);
$('viewfinder').style.aspectRatio = String(FRAME_ASPECT);

function drawVideo(ctx, w, h) {
  const v = state.video;
  const c = coverCrop(v.videoWidth, v.videoHeight, w / h);
  ctx.save();
  if (settings.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
  ctx.restore();
}

function renderLoop() {
  if (state.video.readyState >= 2) {
    if (!previewSized) sizePreview();
    drawVideo(pctx, preview.width, preview.height);
    applyLook(pctx, preview.width, preview.height, getLook(settings.look), { seed: 9 });
  }
  requestAnimationFrame(renderLoop);
}
window.addEventListener('resize', () => (previewSized = false));

// ---------------------------------------------------------------------------
// Look picker with live thumbnails

const thumbs = new Map();
function buildLookPicker() {
  const tabs = $('lookTabs');
  tabs.innerHTML = '';
  for (const g of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.textContent = g.label;
    b.setAttribute('aria-selected', String(g.id === state.activeGroup));
    b.onclick = () => {
      state.activeGroup = g.id;
      buildLookPicker();
    };
    tabs.append(b);
  }
  const list = $('looks');
  list.innerHTML = '';
  thumbs.clear();
  for (const look of LOOKS.filter((l) => l.group === state.activeGroup)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'look';
    b.role = 'option';
    b.setAttribute('aria-selected', String(look.id === settings.look));
    const c = document.createElement('canvas');
    c.width = 168;
    c.height = Math.round(168 / FRAME_ASPECT);
    const label = document.createElement('span');
    label.textContent = look.name;
    b.append(c, label);
    b.onclick = () => selectLook(look.id);
    list.append(b);
    thumbs.set(look.id, c);
  }
  updateThumbs();
}

function updateThumbs() {
  if (state.video.readyState < 2) return;
  for (const [id, c] of thumbs) {
    const ctx = c.getContext('2d', { willReadFrequently: true });
    drawVideo(ctx, c.width, c.height);
    applyLook(ctx, c.width, c.height, getLook(id), { seed: 3 });
  }
}
setInterval(updateThumbs, 1500);

function selectLook(id) {
  settings.look = id;
  persist();
  for (const b of $('looks').children) b.setAttribute('aria-selected', String(b.querySelector('span').textContent === getLook(id).name));
  refreshStripPreview();
}

// ---------------------------------------------------------------------------
// Background colour

function buildBackdrops() {
  const wrap = $('backdrops');
  wrap.innerHTML = '';
  for (const bd of Object.values(BACKDROPS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'backdrop';
    b.role = 'radio';
    b.setAttribute('aria-checked', String(bd.id === settings.backdrop));
    const sw = document.createElement('i');
    sw.style.background = bd.paper;
    b.append(sw, bd.label);
    b.onclick = () => selectBackdrop(bd.id);
    wrap.append(b);
  }
}

function selectBackdrop(id) {
  settings.backdrop = id;
  persist();
  document.documentElement.dataset.backdrop = id;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  buildBackdrops();
  refreshStripPreview();
}

// ---------------------------------------------------------------------------
// Strip rendering

function dateStamp() {
  if (!settings.showDate) return '';
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function stripOptions(overrides = {}) {
  return { look: getLook(settings.look), backdrop: settings.backdrop, caption: settings.caption, date: dateStamp(), ...overrides };
}

let previewQueued = false;
function refreshStripPreview() {
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    const strip = renderStrip(state.shots, stripOptions({ dpi: 150 }));
    const out = $('stripPreview');
    out.width = strip.width;
    out.height = strip.height;
    out.getContext('2d').drawImage(strip, 0, 0);
  });
}

// ---------------------------------------------------------------------------
// Shooting session

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function captureFrame() {
  const v = state.video;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext('2d');
  if (settings.mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, 0, 0);
  return c;
}

function setDots(n) {
  [...$('shotDots').children].forEach((d, i) => d.classList.toggle('done', i < n));
}

async function countdown(label) {
  const el = $('countdown');
  for (let s = COUNTDOWN_SECONDS; s >= 1; s--) {
    el.innerHTML = `<div>${s}<small>${label}</small></div>`;
    el.classList.remove('tick');
    void el.offsetWidth;
    el.classList.add('tick');
    await wait(1000);
  }
  el.textContent = '';
  el.classList.remove('tick');
}

async function runSession() {
  if (state.busy || !state.stream) return;
  state.busy = true;
  $('shutter').disabled = true;
  state.shots = [];
  setDots(0);
  refreshStripPreview();
  await document.fonts?.ready;
  try {
    for (let i = 0; i < SHOTS; i++) {
      await countdown(i === 0 ? 'Get ready' : `Pose ${i + 1} of ${SHOTS}`);
      const flash = $('flash');
      flash.classList.remove('fire');
      void flash.offsetWidth;
      flash.classList.add('fire');
      state.shots.push(captureFrame());
      setDots(i + 1);
      refreshStripPreview();
      await wait(500);
    }
    await finishSession();
  } finally {
    state.busy = false;
    $('shutter').disabled = !state.stream;
  }
}

// ---------------------------------------------------------------------------
// Review, download & print

let buildGeneration = 0;
async function buildOutputs() {
  const generation = ++buildGeneration;
  await document.fonts?.load('italic 700 40px "Playfair Display"').catch(() => {});
  await document.fonts?.load('20px "Special Elite"').catch(() => {});
  const strip = renderStrip(state.shots, stripOptions({ dpi: DOWNLOAD_DPI, placeholder: false }));
  const sheet = renderSheet(strip, { backdrop: settings.backdrop, dpi: PRINT_DPI });
  const [stripJpg, sheetJpg] = await Promise.all([canvasToJpeg(strip, { dpi: DOWNLOAD_DPI, quality: 0.95 }), canvasToJpeg(sheet, { dpi: PRINT_DPI, quality: 0.95 })]);
  if (generation !== buildGeneration) return false; // a newer restyle superseded this one
  if (state.lastStrip) {
    URL.revokeObjectURL(state.lastStrip.stripUrl);
    URL.revokeObjectURL(state.lastStrip.sheetUrl);
  }
  state.lastStrip = { stripJpg, sheetJpg, stripUrl: URL.createObjectURL(stripJpg), sheetUrl: URL.createObjectURL(sheetJpg), stamp: new Date() };
  $('reviewStrip').src = state.lastStrip.stripUrl;
  $('reviewSheet').src = state.lastStrip.sheetUrl;
  return true;
}

function setPrintStatus(text, kind = '') {
  const el = $('printStatus');
  el.textContent = text;
  el.className = `print-status ${kind}`;
}

async function finishSession() {
  setPrintStatus('Developing…');
  syncReviewSelects();
  await buildOutputs();
  const dlg = $('review');
  if (!dlg.open) dlg.showModal();

  if (settings.autoPrint && state.printer.connected && state.printer.ready) {
    await printSheet();
  } else if (settings.autoPrint && state.printer.connected) {
    setPrintStatus(`Printer isn't ready (${(state.printer.reasons || []).join(', ') || state.printer.state}). Press Print once it is.`, 'err');
  } else if (settings.autoPrint) {
    setPrintStatus('No Wi-Fi printer connected. Download your strip, or press Print to use a printer on this device.');
  } else {
    setPrintStatus('Ready to download or print.');
  }
}

async function printSheet() {
  if (!state.lastStrip) return;
  const btn = $('printNow');
  btn.disabled = true;
  try {
    if (state.printer.connected) {
      setPrintStatus(`Sending to ${state.printer.name || 'printer'}…`);
      setChip('busy', 'Printing…');
      await printViaServer(state.lastStrip.sheetJpg, settings.copies);
      setPrintStatus(`Printing ${settings.copies} sheet${settings.copies > 1 ? 's' : ''} of 4×6 (${settings.copies * 2} strips) — cut each down the middle.`, 'ok');
    } else {
      setPrintStatus('Opening print dialog — choose 4×6 photo paper, borderless, 100% scale.');
      await printViaBrowser(state.lastStrip.sheetJpg);
      setPrintStatus('Sent to the print dialog.');
    }
  } catch (err) {
    setPrintStatus(`Couldn't print: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
    refreshPrinter();
  }
}

function fileName(kind) {
  const d = state.lastStrip?.stamp || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `selfiebooth-${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

function syncReviewSelects() {
  const look = $('reviewLook');
  if (!look.options.length) {
    for (const g of GROUPS) {
      const og = document.createElement('optgroup');
      og.label = g.label;
      for (const l of LOOKS.filter((x) => x.group === g.id)) og.append(new Option(l.name, l.id));
      look.append(og);
    }
    for (const bd of Object.values(BACKDROPS)) $('reviewBackdrop').append(new Option(bd.label, bd.id));
  }
  look.value = settings.look;
  $('reviewBackdrop').value = settings.backdrop;
}

async function restyleFromReview() {
  selectLook($('reviewLook').value);
  selectBackdrop($('reviewBackdrop').value);
  state.activeGroup = getLook(settings.look).group;
  buildLookPicker();
  setPrintStatus('Re-developing…');
  if (await buildOutputs()) setPrintStatus('Updated. Press Print for a copy with this look.');
}

// ---------------------------------------------------------------------------
// Printer status + settings dialog

function setChip(kind, text) {
  const chip = $('printerChip');
  chip.dataset.state = kind;
  chip.querySelector('.chip-label').textContent = text;
}

async function refreshPrinter() {
  const p = await getPrinterStatus();
  state.printer = p;
  if (!p.server) setChip('idle', 'Browser printing');
  else if (p.connected && p.ready) setChip('ready', `${p.name || 'Printer'} · ready`);
  else if (p.connected) setChip('error', `${p.name || 'Printer'} · ${p.reasons?.[0] || p.state}`);
  else setChip('idle', p.uri ? 'Printer offline' : 'No printer found');
  return p;
}

async function openPrinterDialog() {
  const dlg = $('printerDialog');
  const p = await refreshPrinter();
  $('printerDetail').textContent = !p.server
    ? 'Start the booth with `npm start` to print straight to a Wi-Fi printer.'
    : p.connected
      ? `Connected: ${p.name}${p.model && p.model !== p.name ? ` (${p.model})` : ''} — ${p.ready ? 'ready' : p.reasons?.join(', ') || p.state}${p.source === 'auto' ? ' · auto-detected' : ''}`
      : p.message || 'Not connected.';
  $('printerUri').value = p.source === 'manual' ? p.uri : '';
  $('borderless').checked = p.borderless !== false;
  for (const id of ['scanPrinters', 'useAuto', 'savePrinter', 'printerUri', 'borderless']) $(id).disabled = !p.server;
  if (!dlg.open) dlg.showModal();
  if (p.server) scan(false);
  else $('printerList').innerHTML = '<li class="muted">Printer discovery needs the booth server.</li>';
}

async function scan(refresh) {
  const list = $('printerList');
  list.innerHTML = '<li class="muted">Searching the network…</li>';
  try {
    const printers = await listPrinters(refresh);
    list.innerHTML = '';
    if (!printers.length) list.innerHTML = '<li class="muted">No printers answered. Make sure the printer is on the same Wi-Fi.</li>';
    for (const pr of printers) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pr.uri === state.printer.uri));
      b.innerHTML = '<span></span><small></small>';
      b.querySelector('span').textContent = pr.name;
      b.querySelector('small').textContent = pr.uri;
      b.onclick = () => ($('printerUri').value = pr.uri);
      li.append(b);
      list.append(li);
    }
  } catch (err) {
    list.innerHTML = `<li class="muted"></li>`;
    list.firstChild.textContent = err.message;
  }
}

async function savePrinter(uri) {
  try {
    await configurePrinter({ uri, borderless: $('borderless').checked });
    await openPrinterDialog();
  } catch (err) {
    $('printerDetail').textContent = err.message;
  }
}

// ---------------------------------------------------------------------------
// Wire up

function init() {
  document.documentElement.dataset.backdrop = settings.backdrop;
  buildLookPicker();
  buildBackdrops();
  selectBackdrop(settings.backdrop);

  const caption = $('caption');
  caption.value = settings.caption;
  caption.oninput = () => {
    settings.caption = caption.value;
    persist();
    refreshStripPreview();
  };
  const bindCheck = (id, key, after) => {
    $(id).checked = settings[key];
    $(id).onchange = () => {
      settings[key] = $(id).checked;
      persist();
      after?.();
    };
  };
  bindCheck('showDate', 'showDate', refreshStripPreview);
  bindCheck('autoPrint', 'autoPrint');
  bindCheck('mirror', 'mirror');
  $('copies').value = String(settings.copies);
  $('copies').onchange = () => {
    settings.copies = Number($('copies').value);
    persist();
  };

  $('shutter').onclick = runSession;
  $('retryCamera').onclick = startCamera;
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && !document.querySelector('dialog[open]') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      runSession();
    }
  });

  $('downloadStrip').onclick = () => state.lastStrip && download(state.lastStrip.stripUrl, fileName('strip'));
  $('downloadSheet').onclick = () => state.lastStrip && download(state.lastStrip.sheetUrl, fileName('4x6'));
  $('printNow').onclick = printSheet;
  $('newSession').onclick = () => {
    $('review').close();
    state.shots = [];
    setDots(0);
    refreshStripPreview();
  };
  $('reviewLook').onchange = restyleFromReview;
  $('reviewBackdrop').onchange = restyleFromReview;

  $('printerChip').onclick = openPrinterDialog;
  $('openPrinter').onclick = openPrinterDialog;
  $('scanPrinters').onclick = () => scan(true);
  $('savePrinter').onclick = () => savePrinter($('printerUri').value.trim());
  $('useAuto').onclick = () => savePrinter(null);

  refreshStripPreview();
  refreshPrinter();
  setInterval(() => !state.busy && refreshPrinter(), 15000);
  document.fonts?.ready.then(refreshStripPreview);
  startCamera().then(updateThumbs);
  requestAnimationFrame(renderLoop);
}

init();
