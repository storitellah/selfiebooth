// Small platform helpers so the studio behaves well on iPhone, iPad,
// Android and desktop browsers alike.

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

/** iPhone, iPod and iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/i.test(ua);

/** Phones and tablets: touch-first, less memory, share sheet instead of downloads. */
export const isMobile = isIOS || isAndroid || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);

/**
 * Largest edge we keep for a captured photo. The 600 DPI strip needs about
 * 1100 px per frame, so this keeps full print quality while staying well
 * inside Safari's canvas memory limits.
 */
export const MAX_CAPTURE_EDGE = isMobile ? 2400 : 3200;

/** Free a canvas's pixel memory now (Safari otherwise holds it until GC). */
export function releaseCanvas(c) {
  if (c && 'width' in c) {
    c.width = 0;
    c.height = 0;
  }
}

/** Can this browser hand files to the system share sheet (Save to Photos, Print, AirDrop…)? */
export function canShareFiles(file) {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** showModal() with a fallback for browsers that lack <dialog> (iOS < 15.4). */
export function openDialog(dlg) {
  if (dlg.open) return;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else {
    dlg.setAttribute('open', '');
    dlg.classList.add('dialog-fallback');
    document.body.classList.add('dialog-fallback-open');
  }
}

export function closeDialog(dlg) {
  if (typeof dlg.close === 'function' && typeof dlg.showModal === 'function') dlg.close();
  else {
    dlg.removeAttribute('open');
    dlg.classList.remove('dialog-fallback');
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-fallback-open');
  }
}
