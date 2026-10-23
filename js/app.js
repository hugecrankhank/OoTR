/*
 * app.js — picking a ROM, starting the emulator, Continue.
 *
 * The emulator is EmulatorJS (data/, GPL-3.0) with the mupen64plus-next N64
 * core, all served from this site. In-game saves are kept by EmulatorJS in
 * this browser, per ROM. The last ROM played is kept too (IndexedDB), so
 * Continue starts it again without picking the file.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // ── IndexedDB: the last ROM ───────────────────────────────────────────────
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('ootr', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function kv(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('kv', mode), q = fn(t.objectStore('kv'));
        t.oncomplete = function () { res(q && q.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  var store = {
    get: function (k) { return kv('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); },
    set: function (k, v) { return kv('readwrite', function (s) { return s.put(v, k); }).catch(function () {}); },
  };

  // a short id for a ROM: its saves and tracker marks are kept under it
  function romId(bytes) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < bytes.length; i += 97) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + bytes.length.toString(16);
  }
  // N64 ROMs come in three byte orders; the title is read in the big-endian one
  function title(bytes) {
    var b = bytes, s = '';
    var m = b[0] === 0x80 ? 'z64' : b[0] === 0x37 ? 'v64' : b[0] === 0x40 ? 'n64' : '';
    if (!m) return { ok: false, name: '' };
    for (var i = 0x20; i < 0x34; i++) {
      var j = m === 'z64' ? i : m === 'v64' ? i ^ 1 : i ^ 3;
      s += String.fromCharCode(b[j]);
    }
    return { ok: true, format: m, name: s.replace(/\0/g, '').trim() };
  }

  var booted = false;
  function play(bytes, name, meta) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var t = title(bytes);
    if (!t.ok && !confirm('"' + name + '" doesn’t look like an N64 ROM (.z64 / .n64 / .v64). Play it anyway?')) return;
    if (t.ok && !/zelda|ocarina|oot/i.test(t.name) && !confirm('This ROM is "' + t.name + '", not Ocarina of Time. The tracker only knows OoT. Play it anyway?')) return;
    if (booted) {
      // EmulatorJS runs one game per page: keep the new ROM and reload into it
      store.set('current', { bytes: bytes.buffer.slice(0), name: name }).then(function () {
        sessionStorage.setItem('ootr:autoplay', '1'); location.reload();
      });
      return;
    }
    booted = true;
    var id = romId(bytes);
    if (window.OotIcons) OotIcons.load(bytes);
    store.set('current', { bytes: bytes.buffer.slice(0), name: name });
    OotTracker.setGame(id);
    OotRam.reset();
    document.body.classList.add('playing');
    $('placeholder').hidden = true;
    $('rom-name').textContent = (t.name || name).replace(/\.[^.]+$/, '');
    document.title = (t.name || 'OoT') + ' – OoTR';

    window.EJS_player = '#game';
    window.EJS_core = 'n64';
    window.EJS_pathtodata = 'data/';
    window.EJS_gameUrl = new File([bytes], 'oot.z64');
    window.EJS_gameName = 'OoTR-' + id;          // saves are kept under this
    window.EJS_gameID = 'ootr-' + id;
    window.EJS_startOnLoaded = true;
    window.EJS_color = '#1f6feb';
    window.EJS_backgroundColor = '#0d1117';
    window.EJS_disableDatabases = true;          // the ROM is local; no need to cache it twice
    window.EJS_volume = 0.6;
    window.EJS_defaultOptions = Object.assign({ 'save-state-location': 'browser' }, window.OOTR_OPTIONS || {});
    window.EJS_onGameStart = function () { OotRam.reset(); };
    var s = document.createElement('script');
    s.src = 'data/loader.js';
    document.body.appendChild(s);
  }

  function readFile(f) {
    return f.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      if (b[0] === 0x50 && b[1] === 0x4B) { alert('That is a .zip file. Unzip it and pick the .z64 inside.'); return; }
      play(b, f.name);
    });
  }
  $('rom-input').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) readFile(f);
  });

  window.OotApp = { play: play, store: store };
  OotTracker.mount($('tracker'));
  if (window.OotSeed) OotSeed.init();
  store.get('current').then(function (cur) {
    if (!cur || !cur.bytes) {
      store.get('base').then(function (b) { if (b && b.bytes && window.OotIcons) OotIcons.load(new Uint8Array(b.bytes)); });
      return;
    }
    var b = new Uint8Array(cur.bytes);
    OotTracker.setGame(romId(b));
    if (window.OotIcons) OotIcons.load(b);
    $('continue').hidden = false;
    $('continue-name').textContent = cur.name.replace(/\.[^.]+$/, '');
    $('continue').onclick = function () { play(b, cur.name); };
    if (sessionStorage.getItem('ootr:autoplay')) { sessionStorage.removeItem('ootr:autoplay'); play(b, cur.name); }
  });
})();
