import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIPv4, subnetHosts, probePrinter, scanForPrinters } from '../lib/scan.js';
import { PrinterManager } from '../lib/printer.js';
import { startSelphy } from './helpers/selphy-sim.js';

test('recognises home-network addresses', () => {
  assert.ok(isPrivateIPv4('192.168.100.102'));
  assert.ok(isPrivateIPv4('10.0.0.7'));
  assert.ok(isPrivateIPv4('172.20.1.1'));
  assert.ok(!isPrivateIPv4('8.8.8.8'));
  assert.ok(!isPrivateIPv4('172.32.0.1'));
});

test('lists every address on the Wi-Fi to scan', () => {
  const hosts = subnetHosts({
    en0: [{ family: 'IPv4', address: '192.168.100.5', netmask: '255.255.255.0', internal: false }],
    lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
    vpn: [{ family: 'IPv4', address: '100.64.1.2', netmask: '255.192.0.0', internal: false }],
  });
  assert.equal(hosts.length, 253); // .1–.254 minus ourselves
  assert.ok(hosts.includes('192.168.100.102'));
  assert.ok(!hosts.includes('192.168.100.5'));
  // Big networks are narrowed to our own /24.
  const big = subnetHosts({ en0: [{ family: 'IPv4', address: '10.1.2.3', netmask: '255.0.0.0', internal: false }] });
  assert.equal(big.length, 253);
  assert.ok(big.every((h) => h.startsWith('10.1.2.')));
});

test('a plain IP address is turned into the printer’s working address', async () => {
  const printer = await startSelphy();
  try {
    const { uri, attrs } = await probePrinter(`127.0.0.1:${printer.port}`);
    assert.equal(uri, printer.uri);
    assert.equal(attrs['printer-make-and-model'], 'Canon SELPHY CP1300');
    // A wrong path is corrected too.
    const fixed = await probePrinter(`ipp://127.0.0.1:${printer.port}/printers/x`);
    assert.equal(fixed.uri, printer.uri);
  } finally {
    await printer.close();
  }
  await assert.rejects(probePrinter('127.0.0.1:9'), /isn't answering/);
});

test('finds the SELPHY by scanning the network when Bonjour is blocked', async () => {
  const printer = await startSelphy({ port: 0 });
  try {
    const found = await scanForPrinters({ hosts: ['127.0.0.2', '127.0.0.1'], port: printer.port });
    assert.deepEqual(found.map((p) => p.uri), [printer.uri]);
    assert.equal(found[0].name, 'Canon SELPHY CP1300');

    // And the booth picks it up automatically and remembers it.
    const pm = new PrinterManager({ scan: { hosts: ['127.0.0.1'], port: printer.port } });
    const status = await pm.status();
    assert.equal(status.connected, true);
    assert.equal(status.source, 'auto');
    assert.equal(status.uri, printer.uri);
    assert.equal(pm.config.lastPrinter.uri, printer.uri);
  } finally {
    await printer.close();
  }
});

test('typing just the IP address saves a working printer', async () => {
  const printer = await startSelphy();
  try {
    const pm = new PrinterManager();
    await pm.setPrinterFrom(`127.0.0.1:${printer.port}`);
    assert.equal(pm.config.uri, printer.uri);
    const status = await pm.status();
    assert.equal(status.ready, true);
    assert.deepEqual(status.paper, { keyword: 'jpn_hagaki_100x148mm', wmm: 100, hmm: 148 });
  } finally {
    await printer.close();
  }
});
