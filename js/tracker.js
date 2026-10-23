/*
 * tracker.js — Ocarina of Time item tracker with autotracking.
 *
 * Reads gSaveContext (js/ram.js) a few times a second while a game runs.
 * Offsets from the OoT decompilation (SaveContext, NTSC 1.0):
 *   0x2E health capacity (x16)   0x3A magic   0x3C double magic   0x3D double defense
 *   0x74 items[24]   0x9C equipment u16   0xA0 upgrades u32   0xA4 quest items u32
 *   0xA8 dungeon items[20] (1 boss key, 2 compass, 4 map)   0xBC small keys[19]
 *   0xD0 Gold Skulltula tokens s16
 * Counts only ever rise during a session (a reset or the title screen can
 * blank memory for a moment), and every item can also be clicked by hand
 * (right click / hold: back down).
 *
 *   OotTracker.mount(el)       draw into an element
 *   OotTracker.setGame(id)     per-ROM storage of hand marks
 *   OotTracker.reset()         clear this game's marks
 */
(function () {
  'use strict';
  var R = function () { return window.OotRam; };

  // ── what's tracked ────────────────────────────────────────────────────────
  // read(ctx) -> level (0 = not yet). levels[] gives each level's label.
  var IT = function (i) { return function (c) { return c.items[i]; }; };
  var has = function (slot, id) { return function (c) { return c.items[slot] === id ? 1 : 0; }; };
  var bit = function (field, b) { return function (c) { return (c[field] >>> b) & 1; }; };
  var bits3 = function (field, b) { return function (c) { return (c[field] >>> b) & 7; }; };
  function bottleCount(c) { var n = 0; for (var i = 18; i <= 21; i++) if (c.items[i] !== 0xFF) n++; return n; }

  var ITEMS = [
    // row: items
    { id: 'stick', icon: 0x00, name: 'Deku Sticks', t: 'Stick', read: has(0, 0x00) },
    { id: 'nut', icon: 0x01, name: 'Deku Nuts', t: 'Nut', read: has(1, 0x01) },
    { id: 'bombs', icon: function (v) { return v ? 0x4C + v : 0x02; }, name: 'Bomb Bag', t: 'Bomb', levels: ['', '20', '30', '40'], read: bits3('upg', 3) },
    { id: 'bow', icon: 0x03, name: 'Fairy Bow', t: 'Bow', levels: ['', '30', '40', '50'], read: bits3('upg', 0) },
    { id: 'firearrow', icon: 0x04, name: 'Fire Arrows', t: 'Fire↗', read: has(4, 0x04) },
    { id: 'din', icon: 0x05, name: "Din's Fire", t: 'Din', read: has(5, 0x05) },
    { id: 'sling', icon: 0x06, name: 'Slingshot', t: 'Sling', levels: ['', '30', '40', '50'], read: bits3('upg', 14) },
    { id: 'ocarina', icon: function (v) { return v === 2 ? 0x08 : 0x07; }, name: 'Ocarina', t: 'Ocar', levels: ['', 'Fairy', 'Time'], read: function (c) { return c.items[7] === 0x08 ? 2 : c.items[7] === 0x07 ? 1 : 0; } },
    { id: 'chu', icon: 0x09, name: 'Bombchus', t: 'Chu', read: has(8, 0x09) },
    { id: 'hook', icon: function (v) { return v === 2 ? 0x0B : 0x0A; }, name: 'Hookshot', t: 'Hook', levels: ['', 'Hook', 'Long'], read: function (c) { return c.items[9] === 0x0B ? 2 : c.items[9] === 0x0A ? 1 : 0; } },
    { id: 'icearrow', icon: 0x0C, name: 'Ice Arrows', t: 'Ice↗', read: has(10, 0x0C) },
    { id: 'farore', icon: 0x0D, name: "Farore's Wind", t: 'Farore', read: has(11, 0x0D) },
    { id: 'boomerang', icon: 0x0E, name: 'Boomerang', t: 'Boom', read: has(12, 0x0E) },
    { id: 'lens', icon: 0x0F, name: 'Lens of Truth', t: 'Lens', read: has(13, 0x0F) },
    { id: 'beans', icon: 0x10, name: 'Magic Beans', t: 'Beans', read: has(14, 0x10) },
    { id: 'hammer', icon: 0x11, name: 'Megaton Hammer', t: 'Hammer', read: has(15, 0x11) },
    { id: 'lightarrow', icon: 0x12, name: 'Light Arrows', t: 'Light↗', read: has(16, 0x12) },
    { id: 'nayru', icon: 0x13, name: "Nayru's Love", t: 'Nayru', read: has(17, 0x13) },
    { id: 'bottle', icon: 0x14, name: 'Bottles', t: 'Bottle', levels: ['', '1', '2', '3', '4'], read: bottleCount },
    { id: 'letter', icon: 0x1B, name: "Ruto's Letter", t: 'Letter', read: function (c) { for (var i = 18; i <= 21; i++) if (c.items[i] === 0x1B) return 1; return 0; } },
    { id: 'adulttrade', icon: function (v) { return v ? 0x2C + v : 0x2D; }, name: 'Adult trade', t: 'A.Trade', levels: ['', 'Egg', 'Cucco', 'Cojiro', 'Shroom', 'Potion', 'Saw', 'Broken', 'Rx', 'Frog', 'Drops', 'Claim'],
      read: function (c) { var v = c.items[22]; return v >= 0x2D && v <= 0x37 ? v - 0x2C : 0; } },
    { id: 'childtrade', icon: function (v) { return v ? 0x20 + v : 0x21; }, name: 'Child trade', t: 'C.Trade', levels: ['', 'Egg', 'Chicken', 'Letter', 'Keaton', 'Skull', 'Spooky', 'Bunny', 'Goron', 'Zora', 'Gerudo', 'Truth', 'Sold'],
      read: function (c) { var v = c.items[23]; return v >= 0x21 && v <= 0x2C ? v - 0x20 : 0; } },
  ];
  var GEAR = [
    { id: 'kokirisword', icon: 0x3B, name: 'Kokiri Sword', t: 'K.Sword', read: bit('eq', 0) },
    { id: 'mastersword', icon: 0x3C, name: 'Master Sword', t: 'M.Sword', read: bit('eq', 1) },
    { id: 'biggoron', icon: function (v) { return v === 1 ? 0x55 : 0x3D; }, name: "Giant's Knife / Biggoron Sword", t: 'BGS', levels: ['', 'Knife', 'BGS'], read: function (c) { return (c.eq >>> 2) & 1 ? (c.bgs ? 2 : 1) : 0; } },
    { id: 'dekushield', icon: 0x3E, name: 'Deku Shield', t: 'Deku Sh', read: bit('eq', 4) },
    { id: 'hylianshield', icon: 0x3F, name: 'Hylian Shield', t: 'Hyl Sh', read: bit('eq', 5) },
    { id: 'mirrorshield', icon: 0x40, name: 'Mirror Shield', t: 'Mirror', read: bit('eq', 6) },
    { id: 'gorontunic', icon: 0x42, name: 'Goron Tunic', t: 'Goron T', read: bit('eq', 9) },
    { id: 'zoratunic', icon: 0x43, name: 'Zora Tunic', t: 'Zora T', read: bit('eq', 10) },
    { id: 'ironboots', icon: 0x45, name: 'Iron Boots', t: 'Iron', read: bit('eq', 13) },
    { id: 'hoverboots', icon: 0x46, name: 'Hover Boots', t: 'Hover', read: bit('eq', 14) },
    { id: 'strength', icon: function (v) { return 0x4F + Math.max(1, v); }, name: 'Strength', t: 'Str', levels: ['', 'Goron', 'Silver', 'Gold'], read: bits3('upg', 6) },
    { id: 'scale', icon: function (v) { return v === 2 ? 0x54 : 0x53; }, name: 'Scale', t: 'Scale', levels: ['', 'Silver', 'Gold'], read: bits3('upg', 9) },
    { id: 'wallet', icon: function (v) { return v >= 2 ? 0x57 : 0x56; }, name: 'Wallet', t: 'Wallet', levels: ['', '200', '500', '999'], read: function (c) { return (c.upg >>> 12) & 3; } },
    { id: 'magic', icon: 0x78, name: 'Magic', t: 'Magic', levels: ['', '1', '2'], read: function (c) { return c.magic2 ? 2 : c.magic ? 1 : 0; } },
    { id: 'agony', icon: 0x6F, name: 'Stone of Agony', t: 'Agony', read: bit('quest', 21) },
    { id: 'gerudocard', icon: 0x70, name: 'Gerudo Card', t: 'Card', read: bit('quest', 22) },
    { id: 'defense', icon: 0x72, name: 'Double Defense', t: 'DD', read: function (c) { return c.dd ? 1 : 0; } },
  ];
  var SONG_COLOR = { minuet: '#3fd16b', bolero: '#ff5b4f', serenade: '#4fa3ff', requiem: '#ff9f2e', nocturne: '#b673ff', prelude: '#ffd83d' };
  var SONGS = [
    ['lullaby', "Zelda's Lullaby", 'Zelda', 12], ['epona', "Epona's Song", 'Epona', 13], ['saria', "Saria's Song", 'Saria', 14],
    ['sun', "Sun's Song", 'Sun', 15], ['time', 'Song of Time', 'Time', 16], ['storms', 'Song of Storms', 'Storms', 17],
    ['minuet', 'Minuet of Forest', 'Minuet', 6], ['bolero', 'Bolero of Fire', 'Bolero', 7], ['serenade', 'Serenade of Water', 'Seren.', 8],
    ['requiem', 'Requiem of Spirit', 'Requiem', 9], ['nocturne', 'Nocturne of Shadow', 'Noct.', 10], ['prelude', 'Prelude of Light', 'Prelude', 11],
  ].map(function (s) { return { id: s[0], name: s[1], t: s[2], song: true, note: SONG_COLOR[s[0]] || '#e6edf3', read: bit('quest', s[3]) }; });
  var REWARDS = [
    ['emerald', 'Kokiri Emerald', 'Emerald', 18, 'stone'], ['ruby', 'Goron Ruby', 'Ruby', 19, 'stone'], ['sapphire', 'Zora Sapphire', 'Sapph.', 20, 'stone'],
    ['forestmed', 'Forest Medallion', 'Forest', 0, 'med'], ['firemed', 'Fire Medallion', 'Fire', 1, 'med'], ['watermed', 'Water Medallion', 'Water', 2, 'med'],
    ['spiritmed', 'Spirit Medallion', 'Spirit', 3, 'med'], ['shadowmed', 'Shadow Medallion', 'Shadow', 4, 'med'], ['lightmed', 'Light Medallion', 'Light', 5, 'med'],
  ].map(function (s) { return { id: s[0], name: s[1], t: s[2], kind: s[4], icon: s[3] <= 5 ? 0x66 + s[3] : 0x6C + (s[3] - 18), read: bit('quest', s[3]) }; });

  // dungeons: [key, short, name, index in dungeon items/keys, small keys?, boss key?, map+compass?]
  var DUNGEONS = [
    ['deku', 'Deku', 'Deku Tree', 0, 0, 0, 1], ['dc', 'DC', "Dodongo's Cavern", 1, 0, 0, 1], ['jabu', 'Jabu', 'Jabu-Jabu', 2, 0, 0, 1],
    ['forest', 'Forest', 'Forest Temple', 3, 1, 1, 1], ['fire', 'Fire', 'Fire Temple', 4, 1, 1, 1], ['water', 'Water', 'Water Temple', 5, 1, 1, 1],
    ['shadow', 'Shadow', 'Shadow Temple', 7, 1, 1, 1], ['spirit', 'Spirit', 'Spirit Temple', 6, 1, 1, 1], ['botw', 'BotW', 'Bottom of the Well', 8, 1, 0, 1],
    ['ice', 'Ice', 'Ice Cavern', 9, 0, 0, 1], ['gtg', 'GTG', 'Gerudo Training Ground', 11, 1, 0, 0], ['hideout', 'Hideout', 'Thieves’ Hideout', 12, 1, 0, 0],
    ['ganon', 'Ganon', "Ganon's Castle", 13, 1, 0, 0], ['gtower', 'Tower', "Ganon's Tower (boss key)", 10, 0, 1, 0],
  ];

  // ── state ─────────────────────────────────────────────────────────────────
  var game = 'nogame', auto = {}, hand = {}, info = { hearts: 0, tokens: 0, pieces: 0 }, dg = {};
  function key() { return 'ootr-track:' + game; }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(key()) || '{}'); auto = s.auto || {}; hand = s.hand || {}; dg = s.dg || {}; info = s.info || info; }
    catch (e) { auto = {}; hand = {}; dg = {}; }
  }
  var saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem(key(), JSON.stringify({ auto: auto, hand: hand, dg: dg, info: info })); } catch (e) {} }, 400);
  }
  function level(def) { return Math.max(auto[def.id] || 0, hand[def.id] || 0); }
  function maxOf(def) { return def.levels ? def.levels.length - 1 : 1; }

  // ── reading the game ──────────────────────────────────────────────────────
  var live = false, changed = false;
  function readCtx() {
    var r = R();
    var items = [];
    for (var i = 0; i < 24; i++) items.push(r.save(0x74 + i));
    return {
      items: items, eq: r.save16(0x9C), upg: r.save32(0xA0), quest: r.save32(0xA4),
      magic: r.save(0x3A), magic2: r.save(0x3C), dd: r.save(0x3D), bgs: r.save(0x3E),
      hearts: r.save16(0x2E) >> 4, tokens: r.s16(r.SAVE + 0xD0), pieces: r.save32(0xA4) >>> 28,
    };
  }
  function poll() {
    var r = R();
    if (!r || !r.find()) { if (live) { live = false; paintStatus(); } return; }
    if (!live) { live = true; paintStatus(); }
    var c;
    try { c = readCtx(); } catch (e) { return; }
    // a save that's still blank (new file being made) has no hearts
    if (!c.hearts || c.hearts > 20) return;
    [ITEMS, GEAR, SONGS, REWARDS].forEach(function (list) {
      list.forEach(function (def) {
        var v = Math.min(maxOf(def), def.read(c) | 0);
        if (v > (auto[def.id] || 0)) { auto[def.id] = v; changed = true; }
      });
    });
    if (c.hearts > (info.hearts || 0)) { info.hearts = c.hearts; changed = true; }
    if (c.tokens >= 0 && c.tokens <= 100 && c.tokens > (info.tokens || 0)) { info.tokens = c.tokens; changed = true; }
    if (c.pieces !== info.pieces) { info.pieces = c.pieces; changed = true; }
    DUNGEONS.forEach(function (d) {
      var k = d[0], cur = dg[k] || (dg[k] = { keys: 0, bk: 0, map: 0, comp: 0 });
      var it = R().save(0xA8 + d[3]), sk = d[4] ? R().s8(R().SAVE + 0xBC + d[3]) : 0;
      if (sk < 0) sk = 0;
      // keys in hand go down when used; show what's in hand (the game's own count)
      if (d[4] && sk !== cur.keys) { cur.keys = sk; changed = true; }
      if (d[5] && (it & 1) && !cur.bk) { cur.bk = 1; changed = true; }
      if (d[6] && (it & 4) && !cur.map) { cur.map = 1; changed = true; }
      if (d[6] && (it & 2) && !cur.comp) { cur.comp = 1; changed = true; }
    });
    if (changed) { changed = false; save(); paint(); }
  }
  setInterval(poll, 300);

  // ── drawing ───────────────────────────────────────────────────────────────
  var root = null, els = {}, statusEl = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function tile(def, cls) {
    var b = el('button', 'it ' + (cls || '') + (def.song ? ' song' : '') + (def.kind ? ' ' + def.kind : ''));
    b.type = 'button'; b.title = def.name + ' (click: +1, right click / hold: -1)';
    var pic = el('img', 'pic'); pic.alt = ''; pic.draggable = false; pic.hidden = true;
    b.appendChild(pic);
    if (def.song) { var n = el('span', 'note', '\u266A'); n.style.color = def.note; b.appendChild(n); }
    b.appendChild(el('span', 't', def.t));
    b.appendChild(el('span', 'lv'));
    b.addEventListener('click', function () { var m = maxOf(def), v = level(def); hand[def.id] = v >= m ? 0 : v + 1; if (hand[def.id] < (auto[def.id] || 0)) auto[def.id] = 0; save(); paint(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); var v = level(def); hand[def.id] = Math.max(0, v - 1); auto[def.id] = Math.min(auto[def.id] || 0, hand[def.id]); save(); paint(); });
    hold(b);
    els[def.id] = { b: b, def: def };
    return b;
  }
  // iPad / phone: hold = right click
  function hold(node) {
    var t = null, fired = false;
    node.addEventListener('touchstart', function () { fired = false; t = setTimeout(function () { fired = true; node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); }, 450); }, { passive: true });
    node.addEventListener('touchmove', function () { clearTimeout(t); }, { passive: true });
    node.addEventListener('touchend', function (e) { clearTimeout(t); if (fired) e.preventDefault(); });
  }
  function section(title, list, cls) {
    var s = el('section', 'sec'); s.appendChild(el('h3', null, title));
    var g = el('div', 'grid ' + (cls || '')); list.forEach(function (d) { g.appendChild(tile(d)); }); s.appendChild(g);
    return s;
  }
  function mount(node) {
    root = node; root.textContent = ''; els = {};
    var head = el('div', 'thead');
    statusEl = el('span', 'tstat');
    var stats = el('span', 'tinfo'); stats.id = 'tinfo';
    head.appendChild(statusEl); head.appendChild(stats);
    root.appendChild(head);
    root.appendChild(section('Items', ITEMS, 'g6'));
    root.appendChild(section('Equipment', GEAR, 'g6'));
    root.appendChild(section('Songs', SONGS, 'g6'));
    root.appendChild(section('Stones & Medallions', REWARDS, 'g9'));
    var ds = el('section', 'sec'); ds.appendChild(el('h3', null, 'Dungeons'));
    var tbl = el('div', 'dgs');
    DUNGEONS.forEach(function (d) {
      var row = el('div', 'dg'); row.title = d[2];
      row.appendChild(el('span', 'dn', d[1]));
      var k = d[0];
      function part(cls, label, has, act) {
        var p = el('button', 'dp ' + cls, label); p.type = 'button';
        if (!has) { p.classList.add('na'); p.disabled = true; return p; }
        p.addEventListener('click', function () { act(1); });
        p.addEventListener('contextmenu', function (e) { e.preventDefault(); act(-1); });
        hold(p);
        return p;
      }
      function cur() { return dg[k] || (dg[k] = { keys: 0, bk: 0, map: 0, comp: 0 }); }
      var keys = part('keys', '', d[4], function (s) { var c = cur(); c.keys = Math.max(0, c.keys + s); save(); paint(); });
      var bk = part('bk', 'BK', d[5], function (s) { cur().bk = s > 0 ? 1 - cur().bk : 0; save(); paint(); });
      var mp = part('map', 'Map', d[6], function (s) { cur().map = s > 0 ? 1 - cur().map : 0; save(); paint(); });
      var cp = part('comp', 'Comp', d[6], function (s) { cur().comp = s > 0 ? 1 - cur().comp : 0; save(); paint(); });
      row.appendChild(keys); row.appendChild(bk); row.appendChild(mp); row.appendChild(cp);
      els['dg:' + k] = { keys: keys, bk: bk, map: mp, comp: cp };
      tbl.appendChild(row);
    });
    ds.appendChild(tbl); root.appendChild(ds);
    var foot = el('div', 'tfoot');
    var rs = el('button', 'linkish', 'Reset tracker'); rs.type = 'button';
    rs.onclick = function () { if (confirm('Clear everything the tracker has for this game?')) { auto = {}; hand = {}; dg = {}; info = { hearts: 0, tokens: 0, pieces: 0 }; save(); paint(); } };
    foot.appendChild(rs); root.appendChild(foot);
    paint(); paintStatus();
  }
  function paint() {
    if (!root) return;
    Object.keys(els).forEach(function (id) {
      var e = els[id];
      if (id.indexOf('dg:') === 0) {
        var c = dg[id.slice(3)] || {};
        e.keys.textContent = '🗝' + (c.keys || 0); e.keys.classList.toggle('on', (c.keys || 0) > 0);
        dgPic(e.keys, 0x77, '\u00D7' + (c.keys || 0)); dgPic(e.bk, 0x74, ''); dgPic(e.map, 0x76, ''); dgPic(e.comp, 0x75, '');
        e.bk.classList.toggle('on', !!c.bk); e.map.classList.toggle('on', !!c.map); e.comp.classList.toggle('on', !!c.comp);
        return;
      }
      var v = level(e.def), lv = e.b.querySelector('.lv');
      e.b.classList.toggle('on', v > 0);
      lv.textContent = v > 0 && e.def.levels ? e.def.levels[v] : '';
      var ic = e.def.icon, src = window.OotIcons && OotIcons.url(typeof ic === 'function' ? ic(v) : ic), pic = e.b.querySelector('.pic');
      if (src) { if (pic.getAttribute('src') !== src) pic.src = src; pic.hidden = false; e.b.classList.add('has-pic'); }
      else { pic.hidden = true; e.b.classList.remove('has-pic'); }
    });
    var t = document.getElementById('tinfo');
    if (t) t.textContent = '♥ ' + (info.hearts || 3) + (info.pieces ? ' +' + info.pieces + '/4' : '') + '   ☠ Skulltulas ' + (info.tokens || 0);
  }
  // a dungeon part with the game's picture (the label stays as its tooltip)
  function dgPic(btn, id, text) {
    var src = window.OotIcons && OotIcons.url(id);
    if (!src || btn.classList.contains('na')) return;
    if (!btn.__lab) btn.__lab = btn.textContent;
    btn.title = btn.__lab;
    btn.textContent = '';
    var im = el('img', 'dpic'); im.src = src; im.alt = ''; btn.appendChild(im);
    if (text) btn.appendChild(el('span', 'dct', text));
  }
  if (window.OotIcons) OotIcons.onChange(function () { paint(); });
  function paintStatus() {
    if (!statusEl) return;
    var s = R() ? R().status() : 'idle';
    statusEl.className = 'tstat ' + (live ? 'live' : s);
    statusEl.textContent = live ? '● Autotracking' : s === 'searching' ? '● Waiting for a save file…' : '● Not playing (click items to track by hand)';
  }
  setInterval(paintStatus, 1500);

  window.OotTracker = {
    mount: mount,
    setGame: function (id) { game = id || 'nogame'; load(); paint(); },
    reset: function () { auto = {}; hand = {}; dg = {}; save(); paint(); },
    get live() { return live; },
    _poll: poll,
  };
})();
