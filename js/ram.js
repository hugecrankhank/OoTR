/*
 * ram.js — the N64's memory (RDRAM), read live from the emulator.
 *
 * EmulatorJS's N64 core (mupen64plus-next) has no "give me RAM" call, so the
 * 8 MB of RDRAM is found inside the core's own memory once, by looking for
 * Ocarina of Time's save marker "ZELDAZ" at gSaveContext + 0x1C
 * (NTSC 1.0, the version the randomizer uses: gSaveContext = 0x8011A5D0).
 * mupen keeps RDRAM as 32-bit words in the computer's byte order, so the
 * byte at N64 address A sits at base + (A ^ 3).
 *
 *   OotRam.find()            locate RDRAM (cheap once found; rescans if lost)
 *   OotRam.u8(addr) / u16 / u32 / s8 / s16   read an N64 address (0x80xxxxxx or 0x00xxxxxx)
 *   OotRam.save(off)         gSaveContext + off, a byte
 *   OotRam.status()          'idle' | 'searching' | 'live'
 */
(function () {
  'use strict';
  var SAVE = 0x11A5D0;                 // gSaveContext, NTSC 1.0 (OoTR)
  var MAGIC = SAVE + 0x1C;             // "ZELDAZ"
  var base = -1, heapRef = null, state = 'idle';

  function heap() {
    var e = window.EJS_emulator, m = e && e.gameManager && e.gameManager.Module;
    return m && m.HEAPU8 ? m.HEAPU8 : null;
  }
  // "ZELD" "AZ" as stored: each 4-byte word reversed
  function magicAt(h, b) {
    var p = b + MAGIC;
    return h[p + 3] === 0x5A && h[p + 2] === 0x45 && h[p + 1] === 0x4C && h[p] === 0x44 &&
           h[p + 7] === 0x41 && h[p + 6] === 0x5A;
  }
  // The core's memory is up to 2 GB, so it's searched a slice at a time
  // (96 MB per call, a few tens of milliseconds) as a 32-bit compare: "ZELD" stored
  // reversed reads as the little-endian number 0x5A454C44.
  var CHUNK = 96 << 20, cursor = 0, hint = -1;
  var WANT = 0x5A454C44;
  function scanSome(h) {
    var w = new Uint32Array(h.buffer, 0, h.length >>> 2);
    var from = cursor >>> 2, to = Math.min(w.length, (cursor + CHUNK) >>> 2);
    for (var i = from; i < to; i++) {
      if (w[i] === WANT) {
        var b = (i << 2) - MAGIC;
        if (b >= 0 && b + 0x800000 <= h.length && magicAt(h, b)) { cursor = 0; return b; }
      }
    }
    cursor = to << 2 >= h.length ? 0 : to << 2;
    return -1;
  }
  function find() {
    var h = heap();
    if (!h) { base = -1; state = 'idle'; return false; }
    // the heap view is replaced when memory grows: same offset, new view
    if (base >= 0 && magicAt(h, base)) { heapRef = h; state = 'live'; return true; }
    if (hint >= 0 && hint + 0x800000 <= h.length && magicAt(h, hint)) { base = hint; heapRef = h; state = 'live'; return true; }
    base = scanSome(h);
    heapRef = h;
    if (base >= 0) { hint = base; try { sessionStorage.setItem('ootr:rdram', String(base)); } catch (e) {} }
    state = base >= 0 ? 'live' : 'searching';
    return base >= 0;
  }
  try { hint = parseInt(sessionStorage.getItem('ootr:rdram') || '-1', 10); } catch (e) {}
  function a(addr) { return base + ((addr & 0x7FFFFF) ^ 3); }
  function u8(addr) { return heapRef[a(addr)]; }
  function u16(addr) { return (u8(addr) << 8) | u8(addr + 1); }
  function u32(addr) { return ((u8(addr) << 24) | (u8(addr + 1) << 16) | (u8(addr + 2) << 8) | u8(addr + 3)) >>> 0; }
  function s8(addr) { var v = u8(addr); return v > 127 ? v - 256 : v; }
  function s16(addr) { var v = u16(addr); return v > 32767 ? v - 65536 : v; }

  window.OotRam = {
    SAVE: SAVE,
    find: find,
    status: function () { return state; },
    reset: function () { base = -1; state = 'idle'; cursor = 0; },
    u8: u8, u16: u16, u32: u32, s8: s8, s16: s16,
    save: function (off) { return u8(SAVE + off); },
    save16: function (off) { return u16(SAVE + off); },
    save32: function (off) { return u32(SAVE + off); },
    get base() { return base; },
  };
})();
