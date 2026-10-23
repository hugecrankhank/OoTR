/*
 * icons.js — the tracker's item pictures, drawn from the ROM you play
 * (js/patcher.js reads them out of the game's own icon files), so none of
 * Nintendo's art is shipped with this app. Without a ROM the tracker shows
 * names instead.
 *
 *   OotIcons.load(romBytes)   read the pictures (any OoT 1.0-based ROM)
 *   OotIcons.url(itemId)      a data: URL for that item's picture, or null
 *   OotIcons.onChange(fn)
 */
(function () {
  'use strict';
  var urls = {}, subs = [], loadedFor = null;

  function toUrl(rgba, size) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var cx = c.getContext('2d'), img = cx.createImageData(size, size);
    img.data.set(rgba.subarray(0, size * size * 4));
    cx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  // a picture that's all transparent or all one colour isn't a picture
  function looksReal(rgba) {
    var seen = 0, first = -1;
    for (var i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 16) continue;
      var v = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      if (first < 0) first = v; else if (v !== first) seen++;
      if (seen > 8) return true;
    }
    return false;
  }
  function load(bytes) {
    if (!bytes || !window.OotPatcher) return false;
    var key = bytes.length + ':' + bytes[0x10] + bytes[0x11] + bytes[0x12] + bytes[0x13];
    if (key === loadedFor) return true;
    var got;
    try { got = OotPatcher.icons(bytes); } catch (e) { console.warn('[icons]', e); got = null; }
    if (!got || !looksReal(got.big[0x03])) return false;     // the Fairy Bow should be a picture
    urls = {};
    Object.keys(got.big).forEach(function (id) { if (looksReal(got.big[id])) urls[id] = toUrl(got.big[id], 32); });
    Object.keys(got.small).forEach(function (id) { if (looksReal(got.small[id])) urls[id] = toUrl(got.small[id], 24); });
    loadedFor = key;
    subs.forEach(function (fn) { try { fn(); } catch (e) {} });
    return true;
  }

  window.OotIcons = {
    load: load,
    url: function (id) { return id == null ? null : urls[id] || null; },
    get ready() { return !!loadedFor; },
    onChange: function (fn) { subs.push(fn); },
  };
})();
