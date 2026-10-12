// Minimal, dependency-free IPP/1.1 + 2.0 client.
//
// Practically every Wi-Fi printer sold in the last decade (AirPrint, Mopria,
// IPP Everywhere) accepts IPP over HTTP on port 631 and understands
// image/jpeg documents, so this is all we need to print a 4x6 sheet without
// installing drivers.

import http from 'node:http';
import https from 'node:https';

export const TAG = {
  operation: 0x01,
  job: 0x02,
  end: 0x03,
  printer: 0x04,
  unsupported: 0x05,
  integer: 0x21,
  boolean: 0x22,
  enum: 0x23,
  octetString: 0x30,
  dateTime: 0x31,
  resolution: 0x32,
  rangeOfInteger: 0x33,
  begCollection: 0x34,
  textWithLanguage: 0x35,
  nameWithLanguage: 0x36,
  endCollection: 0x37,
  text: 0x41,
  name: 0x42,
  keyword: 0x44,
  uri: 0x45,
  uriScheme: 0x46,
  charset: 0x47,
  naturalLanguage: 0x48,
  mimeMediaType: 0x49,
  memberAttrName: 0x4a,
};

export const OP = {
  printJob: 0x0002,
  validateJob: 0x0004,
  getPrinterAttributes: 0x000b,
};

export const PRINTER_STATE = { 3: 'idle', 4: 'processing', 5: 'stopped' };

// 4x6 in = 101.6 x 152.4 mm, expressed in hundredths of a millimetre.
export const MEDIA_4X6 = { keyword: 'na_index-4x6_4x6in', x: 10160, y: 15240 };

// ---------------------------------------------------------------------------
// Encoding

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function encodeValue(valueTag, value) {
  switch (valueTag) {
    case TAG.integer:
    case TAG.enum: {
      const b = Buffer.alloc(4);
      b.writeInt32BE(value);
      return b;
    }
    case TAG.boolean:
      return Buffer.from([value ? 1 : 0]);
    default:
      return Buffer.from(String(value), 'utf8');
  }
}

function encodeOne(valueTag, name, value) {
  const n = Buffer.from(name, 'utf8');
  const v = encodeValue(valueTag, value);
  return Buffer.concat([Buffer.from([valueTag]), u16(n.length), n, u16(v.length), v]);
}

// A collection is passed as an array of [memberName, valueTag, value] where a
// nested collection uses TAG.begCollection with another member array as value.
function encodeCollection(name, members) {
  const parts = [encodeOne(TAG.begCollection, name, '')];
  for (const [memberName, valueTag, value] of members) {
    parts.push(encodeOne(TAG.memberAttrName, '', memberName));
    if (valueTag === TAG.begCollection) {
      parts.push(encodeCollection('', value));
    } else {
      parts.push(encodeOne(valueTag, '', value));
    }
  }
  parts.push(encodeOne(TAG.endCollection, '', ''));
  return Buffer.concat(parts);
}

function encodeAttribute(name, valueTag, value) {
  if (valueTag === TAG.begCollection) return encodeCollection(name, value);
  const values = Array.isArray(value) ? value : [value];
  return Buffer.concat(values.map((v, i) => encodeOne(valueTag, i === 0 ? name : '', v)));
}

/**
 * Build an IPP request.
 * groups: [{ tag: TAG.operation, attrs: [[name, valueTag, value], ...] }, ...]
 */
export function encodeRequest({ operation, requestId = 1, groups, version = [2, 0] }) {
  const parts = [Buffer.from(version), u16(operation), Buffer.alloc(4)];
  parts[2].writeUInt32BE(requestId);
  for (const group of groups) {
    parts.push(Buffer.from([group.tag]));
    for (const [name, valueTag, value] of group.attrs) {
      parts.push(encodeAttribute(name, valueTag, value));
    }
  }
  parts.push(Buffer.from([TAG.end]));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Decoding

function decodeValue(valueTag, buf) {
  switch (valueTag) {
    case TAG.integer:
    case TAG.enum:
      return buf.length === 4 ? buf.readInt32BE(0) : null;
    case TAG.boolean:
      return buf[0] === 1;
    case TAG.rangeOfInteger:
      return buf.length === 8 ? [buf.readInt32BE(0), buf.readInt32BE(4)] : null;
    case TAG.resolution:
      return buf.length === 9 ? [buf.readInt32BE(0), buf.readInt32BE(4), buf[8]] : null;
    case TAG.octetString:
    case TAG.dateTime:
      return buf;
    default:
      return buf.toString('utf8');
  }
}

/**
 * Parse an IPP response. Returns { version, statusCode, requestId, groups, attributes }
 * where `attributes` merges every group into { name: value | value[] } and
 * `data` holds any trailing document bytes.
 */
export function decodeResponse(buf) {
  if (!buf || buf.length < 9) throw new Error('IPP response too short');
  const res = {
    version: `${buf[0]}.${buf[1]}`,
    statusCode: buf.readUInt16BE(2),
    requestId: buf.readUInt32BE(4),
    groups: [],
    attributes: {},
    data: null,
  };
  let off = 8;
  let group = null;
  let lastName = null;
  // Stack of collections being built: { obj, pendingMember, name }
  const stack = [];

  const assign = (target, name, value) => {
    if (name in target) {
      if (!Array.isArray(target[name]) || !target[name].__multi) {
        const arr = [target[name]];
        Object.defineProperty(arr, '__multi', { value: true });
        target[name] = arr;
      }
      target[name].push(value);
    } else {
      target[name] = value;
    }
  };

  while (off < buf.length) {
    const tag = buf[off++];
    if (tag === TAG.end) {
      res.data = off < buf.length ? buf.subarray(off) : null;
      break;
    }
    if (tag <= 0x0f) {
      group = { tag, attrs: {} };
      res.groups.push(group);
      continue;
    }
    if (off + 2 > buf.length) break;
    const nameLen = buf.readUInt16BE(off);
    off += 2;
    const name = buf.toString('utf8', off, off + nameLen);
    off += nameLen;
    const valueLen = buf.readUInt16BE(off);
    off += 2;
    const raw = buf.subarray(off, off + valueLen);
    off += valueLen;

    if (stack.length) {
      const top = stack[stack.length - 1];
      if (tag === TAG.memberAttrName) {
        top.pendingMember = raw.toString('utf8');
        continue;
      }
      if (tag === TAG.endCollection) {
        stack.pop();
        if (stack.length) {
          const parent = stack[stack.length - 1];
          assign(parent.obj, parent.pendingMember, top.obj);
        } else if (group) {
          assign(group.attrs, top.name, top.obj);
        }
        continue;
      }
      if (tag === TAG.begCollection) {
        stack.push({ obj: {}, pendingMember: null, name: top.pendingMember });
        continue;
      }
      assign(top.obj, top.pendingMember, decodeValue(tag, raw));
      continue;
    }

    if (!group) continue;
    const attrName = nameLen ? name : lastName;
    if (nameLen) lastName = name;
    if (tag === TAG.begCollection) {
      stack.push({ obj: {}, pendingMember: null, name: attrName });
      continue;
    }
    assign(group.attrs, attrName, decodeValue(tag, raw));
  }

  for (const g of res.groups) Object.assign(res.attributes, g.attrs);
  return res;
}

export function isSuccess(statusCode) {
  return statusCode >= 0x0000 && statusCode <= 0x00ff;
}

// ---------------------------------------------------------------------------
// Transport

/** Convert ipp://host[:port]/path to an http(s) URL. */
export function toHttpUrl(printerUri) {
  const u = new URL(printerUri);
  const secure = u.protocol === 'ipps:' || u.protocol === 'https:';
  if (!['ipp:', 'ipps:', 'http:', 'https:'].includes(u.protocol)) {
    throw new Error(`Unsupported printer URI scheme: ${u.protocol}`);
  }
  const port = u.port || (u.protocol === 'https:' ? 443 : u.protocol === 'http:' ? 80 : 631);
  return new URL(`${secure ? 'https' : 'http'}://${u.hostname}:${port}${u.pathname || '/ipp/print'}${u.search}`);
}

function post(printerUri, body, timeoutMs) {
  const url = toHttpUrl(printerUri);
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/ipp', 'Content-Length': body.length },
        // Network printers ship self-signed certificates.
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Printer answered HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(decodeResponse(Buffer.concat(chunks)));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Printer did not respond in time')));
    req.on('error', reject);
    req.end(body);
  });
}

let nextRequestId = 1;

function operationAttrs(printerUri, extra = []) {
  return [
    ['attributes-charset', TAG.charset, 'utf-8'],
    ['attributes-natural-language', TAG.naturalLanguage, 'en'],
    ['printer-uri', TAG.uri, printerUri],
    ['requesting-user-name', TAG.name, 'selfiebooth'],
    ...extra,
  ];
}

export async function getPrinterAttributes(printerUri, { timeoutMs = 4000 } = {}) {
  const body = encodeRequest({
    operation: OP.getPrinterAttributes,
    requestId: nextRequestId++,
    groups: [
      {
        tag: TAG.operation,
        attrs: operationAttrs(printerUri, [
          [
            'requested-attributes',
            TAG.keyword,
            [
              'printer-name',
              'printer-info',
              'printer-make-and-model',
              'printer-state',
              'printer-state-reasons',
              'printer-is-accepting-jobs',
              'media-supported',
              'media-ready',
              'document-format-supported',
            ],
          ],
        ]),
      },
    ],
  });
  const res = await post(printerUri, body, timeoutMs);
  if (!isSuccess(res.statusCode)) {
    throw new Error(`Printer rejected status request (0x${res.statusCode.toString(16)})`);
  }
  return res.attributes;
}

/** Summarise printer attributes into a small status object for the UI. */
export function summariseStatus(attrs) {
  const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const reasons = list(attrs['printer-state-reasons']).filter((r) => r && r !== 'none');
  const state = PRINTER_STATE[attrs['printer-state']] || 'unknown';
  const accepting = attrs['printer-is-accepting-jobs'] !== false;
  const blocking = reasons.filter((r) => /-error$/.test(r) || /^(media-empty|media-jam|door-open|cover-open|offline)/.test(r));
  const media = list(attrs['media-supported']);
  return {
    name: attrs['printer-info'] || attrs['printer-name'] || null,
    model: attrs['printer-make-and-model'] || null,
    state,
    reasons,
    ready: accepting && state !== 'stopped' && blocking.length === 0,
    supports4x6: media.length === 0 || media.some((m) => /4x6|101\.6x152\.4|10x15cm|100x150/.test(m)),
    formats: list(attrs['document-format-supported']),
  };
}

function printJobRequest(printerUri, { jobName, copies, borderless, mediaColl }) {
  const jobAttrs = [
    ['copies', TAG.integer, copies],
    ['print-quality', TAG.enum, 5], // high
    ['print-color-mode', TAG.keyword, 'color'],
    ['orientation-requested', TAG.enum, 3], // portrait
  ];
  if (mediaColl) {
    const members = [
      [
        'media-size',
        TAG.begCollection,
        [
          ['x-dimension', TAG.integer, MEDIA_4X6.x],
          ['y-dimension', TAG.integer, MEDIA_4X6.y],
        ],
      ],
    ];
    if (borderless) {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        members.push([`media-${side}-margin`, TAG.integer, 0]);
      }
    }
    jobAttrs.push(['media-col', TAG.begCollection, members]);
    jobAttrs.push(['print-scaling', TAG.keyword, 'fill']);
  } else {
    jobAttrs.push(['media', TAG.keyword, MEDIA_4X6.keyword]);
  }
  return encodeRequest({
    operation: OP.printJob,
    requestId: nextRequestId++,
    groups: [
      {
        tag: TAG.operation,
        attrs: operationAttrs(printerUri, [
          ['job-name', TAG.name, jobName],
          ['document-format', TAG.mimeMediaType, 'image/jpeg'],
        ]),
      },
      { tag: TAG.job, attrs: jobAttrs },
    ],
  });
}

/**
 * Send a 4x6 JPEG to an IPP printer. Tries a borderless media-col request
 * first, then falls back to the plain `media` keyword for printers that
 * reject collections.
 */
export async function printJpeg(printerUri, jpeg, { copies = 1, jobName = 'Photo strip', borderless = true, timeoutMs = 60000 } = {}) {
  const attempts = [
    { mediaColl: true, borderless },
    { mediaColl: false, borderless: false },
  ];
  let last;
  for (const attempt of attempts) {
    const header = printJobRequest(printerUri, { jobName, copies, ...attempt });
    last = await post(printerUri, Buffer.concat([header, jpeg]), timeoutMs);
    if (isSuccess(last.statusCode)) {
      return { ok: true, jobId: last.attributes['job-id'] ?? null, statusCode: last.statusCode };
    }
    // Only client errors (0x04xx) are worth retrying with simpler attributes.
    if (last.statusCode >> 8 !== 0x04) break;
  }
  return {
    ok: false,
    statusCode: last.statusCode,
    message: last.attributes['status-message'] || `IPP status 0x${last.statusCode.toString(16).padStart(4, '0')}`,
  };
}
