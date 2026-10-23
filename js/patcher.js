/*
 * patcher.js — turn your Ocarina of Time 1.0 ROM plus an OoT Randomizer
 * patch file (.zpf) into a playable randomized ROM, in the browser.
 *
 * Ported from the OoT Randomizer (MIT): bin/Decompress (decompressor.c),
 * N64Patch.py (apply_patch_file), crc.py (calculate_crc) and Main.py
 * (patch_rspboot_antipiracy). The result is the randomizer's "uncompressed"
 * ROM (64 MB), which emulators play as is.
 *
 * Also reads the item pictures out of a ROM (compressed or not), so the
 * tracker can show the game's own icons without shipping any.
 *
 * Works in a page and in a Web Worker (js/patch-worker.js).
 */
(function (root) {
  'use strict';
  var DMADATA = 0x7430;                    // NTSC 1.0
  var DCMPSIZE = 0x4000000;

  function rd32(b, a) { return ((b[a] << 24) | (b[a + 1] << 16) | (b[a + 2] << 8) | b[a + 3]) >>> 0; }
  function wr32(b, a, v) { b[a] = v >>> 24; b[a + 1] = (v >>> 16) & 255; b[a + 2] = (v >>> 8) & 255; b[a + 3] = v & 255; }

  // .z64 (big-endian) from any of the three N64 byte orders
  function toZ64(bytes) {
    var b = new Uint8Array(bytes), i, t;
    if (b[0] === 0x37 && b[1] === 0x80) { for (i = 0; i + 1 < b.length; i += 2) { t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; } }
    else if (b[0] === 0x40 && b[1] === 0x12) {
      for (i = 0; i + 3 < b.length; i += 4) { t = b[i]; b[i] = b[i + 3]; b[i + 3] = t; t = b[i + 1]; b[i + 1] = b[i + 2]; b[i + 2] = t; }
    }
    return b;
  }

  // What kind of OoT ROM is this? (Rom.read_rom's checks)
  var CRC_COMPRESSED = [0xEC, 0x70, 0x11, 0xB7, 0x76, 0x16, 0xD7, 0x2B];
  var CRC_DECOMPRESSED = [0x93, 0x52, 0x2E, 0x7B, 0xE5, 0x06, 0xD4, 0x27];
  function same(b, at, list) { for (var i = 0; i < list.length; i++) if (b[at + i] !== list[i]) return false; return true; }
  function identify(z64) {
    if (z64.length === 0x2000000 && same(z64, 0x10, CRC_COMPRESSED)) return 'base';
    if (z64.length >= 0x2000000 && z64.length <= DCMPSIZE && same(z64, 0x10, CRC_DECOMPRESSED)) return 'base-decompressed';
    var name = String.fromCharCode.apply(null, z64.subarray(0x20, 0x34));
    if (/ZELDA|OCARINA/i.test(name)) return 'other-oot';
    return 'unknown';
  }

  // ── Yaz0 ──────────────────────────────────────────────────────────────────
  function yaz0(src, at, out, outAt, size) {
    var s = at + 0x10, d = outAt, end = outAt + size, code = 0, bits = 0;
    while (d < end) {
      if (!bits) { code = src[s++]; bits = 8; }
      if (code & 0x80) out[d++] = src[s++];
      else {
        var b1 = src[s++], b2 = src[s++];
        var cp = d - ((((b1 & 0xF) << 8) | b2) + 1), n = b1 >> 4;
        n = n ? n + 2 : src[s++] + 0x12;
        for (var i = 0; i < n && d < end; i++) out[d++] = out[cp++];
      }
      code = (code << 1) & 0xFF; bits--;
    }
  }

  // ── decompressing the base ROM (decompressor.c) ───────────────────────────
  function findTable(b) {
    for (var i = 1048 * 4; i + 8 < b.length; i += 4) if (rd32(b, i) === 0 && rd32(b, i + 4) === 0x1060) return i;
    throw new Error('This ROM has no file table (not Ocarina of Time?)');
  }
  function decompress(z64, progress) {
    var out = new Uint8Array(DCMPSIZE);
    out.set(z64.subarray(0, Math.min(z64.length, DCMPSIZE)));
    var tab = findTable(z64);
    var ent = function (i) { var a = tab + i * 16; return [rd32(z64, a), rd32(z64, a + 4), rd32(z64, a + 8), rd32(z64, a + 12)]; };
    var t2 = ent(2), count = (t2[1] - t2[0]) / 16;
    out.fill(0, t2[1]);
    for (var i = 3; i < count; i++) {
      var e = ent(i), size = e[1] - e[0];
      if (e[2] >= DCMPSIZE || e[3] === 0xFFFFFFFF) continue;
      if (e[3] === 0) out.set(z64.subarray(e[2], e[2] + size), e[0]);
      else yaz0(z64, e[2], out, e[0], size);
      var o = tab + i * 16;
      wr32(out, o + 8, e[0]); wr32(out, o + 12, 0);
      if (progress && (i & 127) === 0) progress(i / count);
    }
    writeCrc(out);
    return out;
  }

  // ── CRC (crc.py; OoT uses the 6105 boot code) ─────────────────────────────
  function writeCrc(b) {
    var t1, t2, t3, t4, t5, t6; t1 = t2 = t3 = t4 = t5 = t6 = 0xDF26F436;
    for (var i = 0x1000; i < 0x101000; i += 4) {
      var d = rd32(b, i), d2 = rd32(b, 0x750 + (i & 0xFF));
      if (((t6 + d) >>> 0) < t6) t4 = (t4 + 1) >>> 0;
      t6 = (t6 + d) >>> 0;
      t3 = (t3 ^ d) >>> 0;
      var sh = d & 0x1F, r = ((d << sh) | (d >>> (32 - sh))) >>> 0;
      if (sh === 0) r = d;
      t5 = (t5 + r) >>> 0;
      t2 = t2 > d ? (t2 ^ r) >>> 0 : (t2 ^ t6 ^ d) >>> 0;
      t1 = (t1 + (d2 ^ d)) >>> 0;
    }
    wr32(b, 0x10, (t6 ^ t4 ^ t3) >>> 0);
    wr32(b, 0x14, (t5 ^ t2 ^ t1) >>> 0);
  }

  // ── applying a patch (N64Patch.apply_patch_file) ──────────────────────────
  function inflate(data) {
    // zlib (the randomizer's zlib.compress): the browser's 'deflate' stream
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function dmaRecordByStart(orig, dmaStart, key) {
    // DMAIterator: the table's own entry tells how many entries there are
    var i = -1, s = -1;
    while (s !== dmaStart) { i++; if (i > 2000) throw new Error('DMA table not found'); s = rd32(orig, dmaStart + i * 16); }
    var count = (rd32(orig, dmaStart + i * 16 + 4) - dmaStart) >> 4;
    for (var k = 0; k < count; k++) {
      var a = dmaStart + k * 16, st = rd32(orig, a), en = rd32(orig, a + 4);
      if (st === key) return [st, en, en - st];
    }
    throw new Error('Patch refers to a file the base ROM doesn’t have (0x' + key.toString(16) + ')');
  }
  function applyZpf(original, zpfRaw) {
    return inflate(zpfRaw).then(function (p) {
      var at = 0;
      function u8() { return p[at++]; }
      function u16() { var v = (p[at] << 8) | p[at + 1]; at += 2; return v; }
      function u24() { var v = (p[at] << 16) | (p[at + 1] << 8) | p[at + 2]; at += 3; return v; }
      function u32() { var v = rd32(p, at); at += 4; return v; }
      if (String.fromCharCode(p[0], p[1], p[2], p[3]) !== 'ZPFv') throw new Error('Not an OoT Randomizer patch file (.zpf)');
      at = 4;
      if (u8() !== 0x31) throw new Error('Unsupported patch version');
      var dmaStart = u32(), xr0 = u32(), xr1 = u32(), xa = u32();
      var rom = new Uint8Array(original);       // a copy: reads come from the original
      for (;;) {
        var idx = u16();
        if (idx === 0xFFFF) break;
        var from = u32(), start = u32(), size = u24();
        var e = dmaStart + idx * 16;
        wr32(rom, e, start); wr32(rom, e + 4, start + size); wr32(rom, e + 8, start); wr32(rom, e + 12, 0);
        if (from !== 0xFFFFFFFF) {
          var old = dmaRecordByStart(original, dmaStart, from), n = Math.min(size, old[2]);
          rom.set(original.subarray(from, from + n), start);
          rom.fill(0, start + n, start + size);
        } else rom.fill(0, start, start + size);
      }
      function keyNext() {
        var k = 0;
        while (k === 0) { xa++; if (xa > xr1) xa = xr0; k = original[xa]; }
        return k;
      }
      var blockStart = 0;
      while (at < p.length) {
        var size2;
        if (p[at] !== 0xFF) { blockStart = u32(); size2 = u16(); }
        else { at++; var skip = u8(); size2 = u16(); for (var s = 0; s < skip; s++) keyNext(); }
        for (var j = 0; j < size2; j++) {
          var b = p[at++];
          rom[blockStart + j] = b === 0 ? 0 : (b ^ keyNext());
        }
        blockStart += size2;
      }
      // Main.patch_rspboot_antipiracy: nop the boot's anti-piracy branches
      [0x6CFC, 0x6D0C, 0x6D18, 0x6D24, 0x6D2C].forEach(function (a) { wr32(rom, a, 0); });
      writeCrc(rom);
      return rom;
    });
  }

  // ── item pictures, from any OoT 1.0-based ROM ─────────────────────────────
  // icon_item_static: one 32x32 RGBA picture per item id, starting at VROM
  // 0x7BD000 (the randomizer's Cosmetics.py has the Kokiri Tunic, item 0x41,
  // at 0x7FE000). icon_item_24_static, the next file: 24x24 pictures for the
  // quest items, starting with the Forest Medallion (item 0x66).
  var ICON_STATIC = 0x7BD000;
  function fileByVrom(b, vrom) {
    var tab = DMADATA;
    if (rd32(b, tab) !== 0 || rd32(b, tab + 4) !== 0x1060) tab = findTable(b);
    for (var i = 0; i < 1600; i++) {
      var a = tab + i * 16, vs = rd32(b, a), ve = rd32(b, a + 4), ps = rd32(b, a + 8), pe = rd32(b, a + 12);
      if (vs === 0 && ve === 0 && i > 2) break;
      if (vs !== vrom) continue;
      var next = rd32(b, a + 16);
      var size = ve - vs, out = new Uint8Array(size);
      if (pe === 0) out.set(b.subarray(ps, ps + size));
      else yaz0(b, ps, out, 0, size);
      return { data: out, nextVrom: next };
    }
    return null;
  }
  function icons(romBytes) {
    var b = romBytes[0] === 0x80 ? romBytes : toZ64(romBytes.slice ? romBytes.slice() : romBytes);
    var big = fileByVrom(b, ICON_STATIC);
    if (!big || big.data.length < 0x5A * 0x1000) return null;
    var out = { big: {}, small: {} };
    for (var id = 0; id < 0x5A; id++) out.big[id] = big.data.subarray(id * 0x1000, id * 0x1000 + 0x1000);
    var q = fileByVrom(b, big.nextVrom);
    if (q && q.data.length >= 0x900 * 11) {
      var n = Math.floor(q.data.length / 0x900);
      for (var k = 0; k < n && k < 0x20; k++) out.small[0x66 + k] = q.data.subarray(k * 0x900, k * 0x900 + 0x900);
    }
    return out;
  }

  var api = { toZ64: toZ64, identify: identify, decompress: decompress, applyZpf: applyZpf, writeCrc: writeCrc, icons: icons, yaz0: yaz0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OotPatcher = api;
})(typeof self !== 'undefined' ? self : this);
