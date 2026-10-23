/*
 * seed.js — the "New seed" dialog: roll a seed on ootrandomizer.com without
 * leaving the app (through the Cloudflare relay in relay/ootr-worker.js,
 * which holds the API key), or use a patch file (.zpf) you downloaded there.
 * Either way the patch is applied here, to your own ROM (js/patch-worker.js).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var RELAY_KEY = 'ootr:relay', DEFAULT_RELAY = 'https://ootr-relay.hugecrankhank.workers.dev';
  var SAVED = 'ootr:seedform';
  var presets = null, busy = false, stopped = false;

  function relay() { try { return (localStorage.getItem(RELAY_KEY) || DEFAULT_RELAY).replace(/\/+$/, ''); } catch (e) { return DEFAULT_RELAY; } }
  function status(text, cls) { var s = $('sd-status'); s.textContent = text || ''; s.className = 'msg ' + (cls || ''); }
  function bar(frac) { var b = $('sd-bar'); b.hidden = frac == null; if (frac != null) b.firstChild.style.width = Math.round(frac * 100) + '%'; }

  // ── your base ROM ─────────────────────────────────────────────────────────
  var base = null;
  function paintBase() {
    var s = $('sd-base-status');
    if (!base) { s.textContent = 'Pick your Ocarina of Time 1.0 (US) ROM once. It stays on this device.'; s.className = 'msg'; return; }
    var z = OotPatcher.toZ64(new Uint8Array(base.bytes.slice(0, 0x40)));
    var len = base.bytes.byteLength;
    var ok = (len === 0x2000000 || len === 0x4000000) && (z[0x10] === 0xEC || z[0x10] === 0x93);
    s.textContent = base.name + (ok ? ' — Ocarina of Time 1.0, ready.' : ' — this doesn’t look like Ocarina of Time 1.0 (US). Seeds need exactly that version.');
    s.className = 'msg ' + (ok ? 'ok' : 'bad');
  }
  function pickBase(ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    f.arrayBuffer().then(function (buf) {
      if (new Uint8Array(buf)[0] === 0x50) { alert('That is a .zip file. Unzip it and pick the ROM inside.'); return; }
      base = { bytes: buf, name: f.name };
      OotApp.store.set('base', base);
      paintBase();
    });
  }

  // ── presets and versions ──────────────────────────────────────────────────
  function loadPresets() {
    if (presets) return Promise.resolve(presets);
    return fetch('presets/presets.json').then(function (r) { return r.json(); }).then(function (j) {
      presets = j.presets;
      var sel = $('sd-preset'); sel.innerHTML = '';
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Default settings'; sel.appendChild(o0);
      Object.keys(presets).forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
      var saved = readSaved(); if (saved.preset != null) sel.value = saved.preset;
      return presets;
    });
  }
  function loadVersions() {
    var sel = $('sd-version');
    if (sel.options.length > 1) return;
    Promise.all(['dev', 'master'].map(function (br) {
      return fetch(relay() + '/api/version?branch=' + br).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    })).then(function (v) {
      var saved = readSaved().version;
      sel.innerHTML = '';
      [['Dev', v[0]], ['Release', v[1]]].forEach(function (x) {
        if (!x[1] || !x[1].currentlyActiveVersion) return;
        var o = document.createElement('option'); o.value = x[1].currentlyActiveVersion; o.textContent = x[0] + ' ' + x[1].currentlyActiveVersion; sel.appendChild(o);
      });
      if (!sel.options.length) { var o = document.createElement('option'); o.value = ''; o.textContent = 'Site default'; sel.appendChild(o); }
      if (saved && Array.prototype.some.call(sel.options, function (o) { return o.value === saved; })) sel.value = saved;
    });
  }
  function readSaved() { try { return JSON.parse(localStorage.getItem(SAVED) || '{}'); } catch (e) { return {}; } }
  function writeSaved() { try { localStorage.setItem(SAVED, JSON.stringify({ preset: $('sd-preset').value, version: $('sd-version').value })); } catch (e) {} }

  // ── patching (in a worker) ────────────────────────────────────────────────
  function patch(zpf, label) {
    if (!base) return Promise.reject(new Error('Pick your Ocarina of Time ROM first (step 1).'));
    return new Promise(function (res, rej) {
      var w = new Worker('js/patch-worker.js');
      w.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'progress') { status(m.step + '…', 'busy'); bar(m.frac); }
        else if (m.type === 'done') { w.terminate(); bar(null); res(new Uint8Array(m.rom)); }
        else if (m.type === 'error') { w.terminate(); bar(null); rej(new Error(m.message)); }
      };
      w.onerror = function (e) { w.terminate(); bar(null); rej(new Error(e.message || 'The patcher stopped')); };
      var copy = base.bytes.slice(0);
      w.postMessage({ type: 'patch', base: copy, zpf: zpf }, [copy]);
    });
  }
  function finish(rom, name, meta) {
    status('Ready! Starting ' + name + '…', 'ok');
    setTimeout(function () { $('seed-dlg').close(); OotApp.play(rom, name, meta); }, 300);
  }

  // ── rolling a seed through the relay ──────────────────────────────────────
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function roll() {
    if (busy) return;
    if (!base) { status('Pick your Ocarina of Time ROM first (step 1).', 'bad'); return; }
    busy = true; stopped = false; updateButtons();
    writeSaved();
    var name = $('sd-preset').value, settings = name ? JSON.parse(JSON.stringify(presets[name])) : {};
    var seedText = $('sd-seed').value.trim();
    if (seedText) settings.seed = seedText;
    var custom = $('sd-json').value.trim();
    if (custom) { try { Object.assign(settings, JSON.parse(custom)); } catch (e) { busy = false; updateButtons(); status('The custom settings aren’t valid JSON: ' + e.message, 'bad'); return; } }
    var v = $('sd-version').value, id = null, t0 = Date.now();
    status('Asking ootrandomizer.com for a seed…', 'busy'); bar(null);
    fetch(relay() + '/api/v2/seed/create?locked=0' + (v ? '&version=' + encodeURIComponent(v) : ''), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error(apiError(r.status, t));
        var j = JSON.parse(t); id = j.id;
        if (!id) throw new Error('No seed id came back');
        return poll();
      });
    }).then(function () {
      status('Downloading the patch…', 'busy');
      return fetch(relay() + '/api/v2/seed/patch?id=' + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error(apiError(r.status, ''));
        return r.arrayBuffer();
      });
    }).then(function (zpf) {
      return patch(zpf).then(function (rom) {
        $('sd-last').hidden = false;
        $('sd-last-link').href = 'https://ootrandomizer.com/seed/get?id=' + encodeURIComponent(id);
        finish(rom, 'OoTR_' + id + '.z64', { id: id, preset: name || 'Default', version: v });
      });
    }).catch(function (e) {
      status(String(e.message || e), 'bad'); bar(null);
    }).then(function () { busy = false; updateButtons(); });

    function poll() {
      if (stopped) return Promise.reject(new Error('Stopped.'));
      return fetch(relay() + '/api/v2/seed/status?id=' + encodeURIComponent(id)).then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(apiError(r.status, t));
          var j = JSON.parse(t), secs = Math.round((Date.now() - t0) / 1000);
          if (j.status === 1) return true;
          if (j.status === 3 || j.status === 2) throw new Error('ootrandomizer.com couldn’t make this seed (these settings may not work with this version). Try another preset.');
          var q = j.positionQueue ? ' · #' + j.positionQueue + ' in line' : '';
          status('Making the seed… ' + (j.progress != null ? j.progress + '% ' : '') + secs + 's' + q, 'busy');
          if (j.progress != null) bar(j.progress / 100);
          return wait(2500).then(poll);
        });
      });
    }
  }
  function apiError(code, text) {
    if (code === 0 || code === 404 && !text) return 'The seed relay isn’t reachable. Set up the Cloudflare relay (see README) or use a patch file instead.';
    if (code === 401 || code === 403) return 'ootrandomizer.com refused the request (API key missing or not allowed). Check the relay’s OOTR_API_KEY.';
    if (code === 429) return 'Too many requests to ootrandomizer.com right now. Wait a few seconds and try again.';
    if (code === 400) return 'ootrandomizer.com didn’t accept these settings' + (text ? ': ' + text.slice(0, 200) : '') + '. Try another preset or version.';
    return 'ootrandomizer.com answered ' + code + (text ? ': ' + text.slice(0, 200) : '');
  }

  // ── a patch file from the site ────────────────────────────────────────────
  function usePatch(ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f || busy) return;
    if (/\.zpfz$/i.test(f.name)) { status('That’s a multiworld patch (.zpfz). Use the single-player .zpf for your world.', 'bad'); return; }
    busy = true; updateButtons();
    f.arrayBuffer().then(function (zpf) { return patch(zpf); }).then(function (rom) {
      finish(rom, f.name.replace(/\.zpf$/i, '') + '.z64', { patch: f.name });
    }).catch(function (e) { status(String(e.message || e), 'bad'); }).then(function () { busy = false; updateButtons(); });
  }

  function updateButtons() {
    $('sd-roll').disabled = busy; $('sd-patch-label').classList.toggle('disabled', busy);
    $('sd-stop').hidden = !busy;
  }

  function open() {
    var d = $('seed-dlg');
    if (!d.open) d.showModal();
    $('sd-relay').value = relay();
    paintBase(); loadPresets().then(function () {}, function () { status('Couldn’t load the presets.', 'bad'); }); loadVersions();
  }
  function init() {
    $('new-seed').addEventListener('click', open);
    $('sd-close').addEventListener('click', function () { if (!busy) $('seed-dlg').close(); });
    $('sd-base').addEventListener('change', pickBase);
    $('sd-roll').addEventListener('click', roll);
    $('sd-stop').addEventListener('click', function () { stopped = true; });
    $('sd-patch').addEventListener('change', usePatch);
    $('sd-relay').addEventListener('change', function () {
      try { var v = $('sd-relay').value.trim(); if (v && v !== DEFAULT_RELAY) localStorage.setItem(RELAY_KEY, v); else localStorage.removeItem(RELAY_KEY); } catch (e) {}
      $('sd-version').innerHTML = ''; loadVersions();
    });
    OotApp.store.get('base').then(function (b) { if (b && b.bytes) { base = b; paintBase(); } });
  }
  window.OotSeed = { open: open, init: init, patch: patch };
})();
