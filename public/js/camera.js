// Camera access: picks the highest resolution a device offers, lists every
// connected camera (built-in, USB webcam, or a pro camera through an HDMI
// capture card / USB-C webcam mode) and captures full-resolution stills.

// Names that pro cameras and capture devices commonly report.
const PRO_PATTERN =
  /cam ?link|elgato|capture|hdmi|uvc video|usb video|magewell|blackmagic|avermedia|atomos|canon|eos|sony|alpha|nikon|fujifilm|x webcam|lumix|panasonic|olympus|om system|gopro|insta360|obsbot|ultra ?stream/i;

export function isProCamera(label = '') {
  return PRO_PATTERN.test(label) && !/facetime|integrated|built-?in/i.test(label);
}

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}`, pro: isProCamera(d.label) }));
}

/**
 * Open a camera at its maximum resolution.
 * deviceId: specific camera, or null for the default front camera.
 */
export async function openCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
  const base = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };
  // Ask big first; the browser falls back to the closest mode it supports.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { ...base, width: { ideal: 4096 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
  });
  const track = stream.getVideoTracks()[0];
  await raiseToMax(track);
  return stream;
}

/** Push the track to the largest resolution it advertises. */
async function raiseToMax(track) {
  const caps = track.getCapabilities?.();
  if (!caps?.width?.max || !caps?.height?.max) return;
  const now = track.getSettings();
  if (now.width >= caps.width.max && now.height >= caps.height.max) return;
  try {
    await track.applyConstraints({ width: { ideal: caps.width.max }, height: { ideal: caps.height.max } });
  } catch {
    /* keep the mode we already have */
  }
}

/** Describe what the camera is delivering, for the settings panel. */
export async function describeCamera(stream) {
  const track = stream?.getVideoTracks()[0];
  if (!track) return null;
  const s = track.getSettings();
  const info = { label: track.label, video: `${s.width}×${s.height}`, photo: null };
  const photo = await photoCapabilities(track);
  if (photo) info.photo = `${photo.width}×${photo.height}`;
  return info;
}

const imageCaptures = new WeakMap();
function imageCaptureFor(track) {
  if (typeof ImageCapture === 'undefined') return null;
  if (!imageCaptures.has(track)) imageCaptures.set(track, new ImageCapture(track));
  return imageCaptures.get(track);
}

async function photoCapabilities(track) {
  const ic = imageCaptureFor(track);
  if (!ic?.getPhotoCapabilities) return null;
  try {
    const caps = await withTimeout(ic.getPhotoCapabilities(), 1500);
    const w = caps.imageWidth?.max;
    const h = caps.imageHeight?.max;
    const s = track.getSettings();
    // Only worth it when the still sensor beats the video feed.
    if (!w || !h || w * h <= (s.width || 0) * (s.height || 0)) return null;
    return { width: w, height: h };
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Centre-crop a source to an aspect ratio (w/h) onto a new canvas. */
function cropTo(src, sw, sh, aspect, mirror) {
  let cw = sw;
  let ch = sh;
  if (sw / sh > aspect) cw = Math.round(sh * aspect);
  else ch = Math.round(sw / aspect);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (mirror) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, cw, ch);
  return c;
}

/**
 * Take one still at the best quality available. Uses the device's photo
 * pipeline (full sensor resolution) when the browser supports it, otherwise
 * the current video frame. Output keeps the preview's framing.
 */
export async function captureStill(video, { mirror = false, highRes = true } = {}) {
  const track = video.srcObject?.getVideoTracks?.()[0];
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (highRes && track && (await photoCapabilities(track))) {
    try {
      const ic = imageCaptureFor(track);
      const caps = await ic.getPhotoCapabilities();
      const blob = await withTimeout(ic.takePhoto({ imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max }), 4000);
      const bmp = await createImageBitmap(blob);
      // The still sensor may be 4:3 while video is 16:9 — match the preview.
      return cropTo(bmp, bmp.width, bmp.height, vw / vh, mirror);
    } catch {
      /* fall back to the video frame */
    }
  }
  return cropTo(video, vw, vh, vw / vh, mirror);
}
