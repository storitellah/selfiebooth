// Talks to the booth server's printer relay, with a browser-print fallback.

const API = 'api';

export async function getPrinterStatus() {
  try {
    const res = await fetch(`${API}/printer`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { server: true, ...(await res.json()) };
  } catch {
    // Static hosting / opened without the server: only browser printing works.
    return { server: false, connected: false, ready: false };
  }
}

export async function listPrinters(refresh = false) {
  const res = await fetch(`${API}/printers${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not scan for printers');
  return (await res.json()).printers;
}

export async function configurePrinter(body) {
  const res = await fetch(`${API}/printer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Could not save printer');
  return json;
}

/** Send the 4x6 JPEG to the Wi-Fi printer via the server. */
export async function printViaServer(jpegBlob, copies = 1) {
  const res = await fetch(`${API}/print?copies=${copies}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: jpegBlob,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (!res.ok || !json.ok) throw new Error(json.message || `Printer error (HTTP ${res.status})`);
  return json;
}

/**
 * Print through the browser's dialog using a 4in x 6in @page.
 * Launch Chrome with --kiosk-printing to make this silent.
 */
export function printViaBrowser(jpegBlob) {
  const img = document.getElementById('printImg');
  const url = URL.createObjectURL(jpegBlob);
  return new Promise((resolve) => {
    img.onload = () => {
      const done = () => {
        window.removeEventListener('afterprint', done);
        URL.revokeObjectURL(url);
        resolve();
      };
      window.addEventListener('afterprint', done);
      window.print();
    };
    img.src = url;
  });
}
