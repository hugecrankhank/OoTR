/*
 * patch-worker.js — the heavy lifting of js/patcher.js off the page, so the
 * page stays responsive while 64 MB are decompressed and patched.
 *
 *   { type: 'patch', base: ArrayBuffer (your OoT 1.0 ROM), zpf: ArrayBuffer }
 *     -> { type: 'progress', step, frac } ... { type: 'done', rom: ArrayBuffer } | { type: 'error', message }
 */
importScripts('patcher.js');
self.onmessage = function (e) {
  var m = e.data;
  if (m.type !== 'patch') return;
  try {
    var z = OotPatcher.toZ64(new Uint8Array(m.base));
    var kind = OotPatcher.identify(z);
    if (kind !== 'base' && kind !== 'base-decompressed') throw new Error('That isn’t an Ocarina of Time 1.0 (US) ROM. The randomizer needs exactly that version.');
    self.postMessage({ type: 'progress', step: 'Decompressing your ROM', frac: 0 });
    var orig;
    if (kind === 'base') orig = OotPatcher.decompress(z, function (f) { self.postMessage({ type: 'progress', step: 'Decompressing your ROM', frac: f }); });
    else { orig = new Uint8Array(0x4000000); orig.set(z.subarray(0, 0x4000000)); }
    self.postMessage({ type: 'progress', step: 'Applying the seed', frac: 0 });
    OotPatcher.applyZpf(orig, new Uint8Array(m.zpf)).then(function (rom) {
      self.postMessage({ type: 'done', rom: rom.buffer }, [rom.buffer]);
    }, function (err) { self.postMessage({ type: 'error', message: String(err && err.message || err) }); });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
