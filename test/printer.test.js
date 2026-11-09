import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transportFromDeviceUri, parseLpstatDevices } from '../lib/printer.js';

test('works out how a CUPS printer is connected', () => {
  assert.equal(transportFromDeviceUri('bluetooth://00:11:22:33:44:55'), 'bluetooth');
  assert.equal(transportFromDeviceUri('usb://Canon/SELPHY%20CP1500?serial=1'), 'usb');
  assert.equal(transportFromDeviceUri('dnssd://Canon%20SELPHY._ipp._tcp.local./?uuid=x'), 'wifi');
  assert.equal(transportFromDeviceUri('ipp://192.168.1.40/ipp/print'), 'wifi');
  assert.equal(transportFromDeviceUri(''), null);
});

test('parses lpstat -v output', () => {
  const out = 'device for Canon_SELPHY: dnssd://Canon._ipp._tcp.local./\ndevice for Kodak_Mini: bluetooth://AA:BB:CC:DD:EE:FF\n';
  assert.deepEqual(parseLpstatDevices(out), { Canon_SELPHY: 'dnssd://Canon._ipp._tcp.local./', Kodak_Mini: 'bluetooth://AA:BB:CC:DD:EE:FF' });
});
