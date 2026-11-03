/* Barcode drawing, reading, and color for My Cards.
 *
 * A classic script, not a module, so the page also works when opened
 * straight off the disk as a file:// URL. Defines one global, CODES.
 *
 * Needs vendor/qrcode-generator and vendor/jsbarcode loaded first. The
 * two readers are loaded on demand by loadDecoders().
 */
window.CODES = (function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * The formats this page can draw. `enc` is the JsBarcode encoder
   * name; QR is drawn by hand from qrcode-generator's module grid.
   * ------------------------------------------------------------------ */
  var FORMATS = {
    QR_CODE:  { name: 'QR code',  shape: 'square' },
    CODE_128: { name: 'Code 128', shape: 'wide', enc: 'CODE128' },
    EAN_13:   { name: 'EAN-13',   shape: 'wide', enc: 'EAN13' },
    CODE_39:  { name: 'Code 39',  shape: 'wide', enc: 'CODE39' },
    CODABAR:  { name: 'Codabar',  shape: 'wide', enc: 'codabar' },
    ITF:      { name: 'ITF',      shape: 'wide', enc: 'ITF' }
  };
  /* Offered in this order: the two that cover almost every loyalty card
     first, then the rest. */
  var ORDER = ['EAN_13', 'CODE_128', 'QR_CODE', 'CODE_39', 'CODABAR', 'ITF'];

  /* The readers recognize more symbologies than this page can draw.
     UPC-A is an EAN-13 with a leading zero, so it converts exactly; UPC-E
     expands to one too. Everything else keeps its data in a QR code,
     which any phone camera and most modern scanners read. */
  var SUBSTITUTE = {
    UPC_A: { to: 'EAN_13', pad: '0', why: 'UPC-A is an EAN-13 with a leading zero, so the number gained one.' },
    UPC_E: { to: 'EAN_13', expand: true, why: 'UPC-E is a shortened UPC-A, so it was expanded to the full EAN-13 number.' },
    EAN_8: { to: 'QR_CODE', why: 'EAN-8 cannot be drawn here, so the number was kept in a QR code instead.' },
    CODE_93: { to: 'QR_CODE', why: 'Code 93 cannot be drawn here, so the number was kept in a QR code instead.' },
    PDF_417: { to: 'QR_CODE', why: 'PDF417 cannot be drawn here, so the data was kept in a QR code instead.' },
    AZTEC: { to: 'QR_CODE', why: 'Aztec cannot be drawn here, so the data was kept in a QR code instead.' },
    DATA_MATRIX: { to: 'QR_CODE', why: 'Data Matrix cannot be drawn here, so the data was kept in a QR code instead.' },
    RSS_14: { to: 'QR_CODE', why: 'RSS-14 cannot be drawn here, so the data was kept in a QR code instead.' },
    RSS_EXPANDED: { to: 'QR_CODE', why: 'RSS Expanded cannot be drawn here, so the data was kept in a QR code instead.' },
    MAXICODE: { to: 'QR_CODE', why: 'MaxiCode cannot be drawn here, so the data was kept in a QR code instead.' },
    ITF_14: { to: 'ITF', why: 'ITF-14 is a 14-digit ITF code.' }
  };

  /* ---------------------------- validation ---------------------------- *
   * Format-specific, so the message says what to fix rather than just
   * "invalid". Returns null when the payload is fine, 'empty' when there
   * is nothing to encode, or a sentence otherwise.
   * ------------------------------------------------------------------- */
  function validate(fmt, msg) {
    if (!msg) return 'empty';
    switch (fmt) {
      case 'EAN_13':
        if (!/^\d{12,13}$/.test(msg)) return 'EAN-13 needs 12 digits, or 13 if you include the check digit.';
        if (msg.length === 13 && ean13CheckDigit(msg.slice(0, 12)) !== msg[12]) {
          return 'That check digit is wrong. For ' + msg.slice(0, 12) + ' it should be ' +
            ean13CheckDigit(msg.slice(0, 12)) + '.';
        }
        return null;
      case 'ITF':
        if (!/^\d+$/.test(msg)) return 'ITF holds digits only.';
        if (msg.length % 2) return 'ITF needs an even number of digits; it encodes them in pairs.';
        return null;
      case 'CODE_39':
        if (!/^[0-9A-Z\-. $\/+%]+$/.test(msg)) return 'Code 39 holds digits, capital A–Z, and - . $ / + % and space.';
        return null;
      case 'CODABAR':
        if (!/^[A-D]?[0-9\-$:\/.+]+[A-D]?$/.test(msg)) return 'Codabar holds digits and - $ : / . + , optionally wrapped in a letter A–D.';
        return null;
      case 'CODE_128':
        if (!/^[\x00-\x7F]+$/.test(msg)) return 'Code 128 holds ASCII only. Characters outside it need a QR code.';
        return null;
      case 'QR_CODE':
        return null;
      default:
        return 'That barcode type cannot be drawn here.';
    }
  }

  function ean13CheckDigit(twelve) {
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
    return String((10 - (sum % 10)) % 10);
  }

  /* UPC-E to UPC-A, then to EAN-13 by prefixing a zero. The last digit of
     the 8-digit form is the check digit and the first is the number
     system, both of which carry over. */
  function upcEToEan13(code) {
    var m = /^(\d)(\d{6})(\d)$/.exec(code);
    if (!m) return null;
    var sys = m[1], body = m[2], check = m[3];
    var last = body[5], first5 = body.slice(0, 5);
    var mid;
    if (last === '0' || last === '1' || last === '2') {
      mid = first5.slice(0, 2) + last + '0000' + first5.slice(2);
    } else if (last === '3') {
      mid = first5.slice(0, 3) + '00000' + first5.slice(3);
    } else if (last === '4') {
      mid = first5.slice(0, 4) + '00000' + first5[4];
    } else {
      mid = first5 + '0000' + last;
    }
    return '0' + sys + mid + check;
  }

  /* Guess the format from the payload alone. Only a default: the reliable
     route is reading the card's own barcode, which gives the real
     symbology. A till that rejects the guess needs the right one set. */
  function autoFormat(msg) {
    var m = (msg || '').trim();
    if (!m) return 'QR_CODE';
    if (/^\d{13}$/.test(m) && ean13CheckDigit(m.slice(0, 12)) === m[12]) return 'EAN_13';
    if (/^\d{12}$/.test(m)) return 'EAN_13';
    if (/^[\x00-\x7F]+$/.test(m)) return 'CODE_128';
    return 'QR_CODE';
  }

  /* ---------------------------- drawing ---------------------------- */
  var qrUtf8Set = false;
  function qrCanvas(text, targetPx) {
    if (!window.qrcode) throw new Error('The QR code library is not loaded.');
    if (!qrUtf8Set) {
      // The library defaults to Latin-1. This makes byte mode encode the
      // same utf-8 bytes a scanner will expect from the same payload.
      try {
        window.qrcode.stringToBytes = function (s) {
          return Array.prototype.slice.call(new TextEncoder().encode(s));
        };
      } catch (e) { /* keep the library default */ }
      qrUtf8Set = true;
    }
    var q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    var n = q.getModuleCount(), quiet = 2, total = n + quiet * 2;
    var cell = Math.max(2, Math.floor((targetPx || 480) / total));
    var cv = document.createElement('canvas');
    cv.width = cv.height = cell * total;
    var cx = cv.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (q.isDark(r, c)) cx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    return cv;
  }

  function barcodeCanvas(fmt, text, opts) {
    var enc = FORMATS[fmt] && FORMATS[fmt].enc;
    if (!enc) throw new Error('No encoder for ' + fmt + '.');
    if (!window.JsBarcode) throw new Error('The barcode library is not loaded.');
    opts = opts || {};
    var cv = document.createElement('canvas');
    window.JsBarcode(cv, text, {
      format: enc,
      displayValue: false,
      // A quiet zone on both sides, or a scanner may not find the edges.
      margin: opts.margin || 10,
      height: opts.height || 110,
      width: opts.width || 3,
      background: '#ffffff',
      lineColor: '#000000'
    });
    return cv;
  }

  /* Draw whichever applies. Throws with a readable message when the
     payload does not fit the format. */
  function draw(fmt, text, opts) {
    var problem = validate(fmt, text);
    if (problem) throw new Error(problem === 'empty' ? 'There is nothing to encode.' : problem);
    if (fmt === 'QR_CODE') return qrCanvas(text, (opts && opts.targetPx) || 480);
    return barcodeCanvas(fmt, text, opts);
  }

  /* ---------------------------- color ---------------------------- */
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  function toHex(c) {
    return '#' + c.map(function (v) { return ('0' + clamp255(v).toString(16)).slice(-2); }).join('');
  }
  function fromHex(h) {
    var s = String(h).trim(), m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /^#?([0-9a-f]{3})$/i.exec(s);
    if (m) { var t = m[1]; return [parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16)]; }
    return null;
  }
  function rgbCss(c) { return 'rgb(' + clamp255(c[0]) + ',' + clamp255(c[1]) + ',' + clamp255(c[2]) + ')'; }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(clamp255);
  }
  /* The better of white and near-black. For a mid-tone background neither
     reaches 4.5:1, so this returns the higher of the two rather than
     promising a ratio it cannot deliver. */
  function autoFg(bg) {
    return contrast(bg, [255, 255, 255]) >= contrast(bg, [17, 17, 17]) ? [255, 255, 255] : [17, 17, 17];
  }
  /* Labels sit a step back from the main text but must still clear 3:1. */
  function autoLabel(bg) {
    var fg = autoFg(bg), best = fg;
    for (var t = 0.42; t > 0; t -= 0.06) {
      var c = mix(fg, bg, t);
      if (contrast(c, bg) >= 3) { best = c; break; }
    }
    return best;
  }

  /* ---------------- barcode reading, loaded on demand ---------------- *
   * ZXing and jsQR are about 600 kB together and are needed only when
   * something is scanned, so they load on first use.
   * ------------------------------------------------------------------ */
  var decodersPromise = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadDecoders(base) {
    if (!decodersPromise) {
      var dir = base || 'vendor/';
      decodersPromise = Promise.all([
        loadScript(dir + 'zxing-library-0.21.3.umd.min.js'),
        loadScript(dir + 'jsqr-1.4.0.js')
      ]).catch(function (e) { decodersPromise = null; throw e; });
    }
    return decodersPromise;
  }
  function getJsQR() { return (window.jsQR && window.jsQR.default) || window.jsQR; }

  function canvasOf(img, scale, invert, boost) {
    var w = Math.max(1, Math.round((img.width || img.videoWidth) * scale));
    var h = Math.max(1, Math.round((img.height || img.videoHeight) * scale));
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, w, h);
    if (invert || boost) applyTone(cv, invert, boost);
    return cv;
  }
  function applyTone(cv, invert, boost) {
    var cx = cv.getContext('2d', { willReadFrequently: true });
    var d = cx.getImageData(0, 0, cv.width, cv.height), p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      var v = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      if (boost) { v = (v - 128) * 1.9 + 128; v = v < 0 ? 0 : v > 255 ? 255 : v; }
      if (invert) v = 255 - v;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    cx.putImageData(d, 0, 0);
  }

  var zxReader = null;
  function zxingDecode(cv) {
    if (!window.ZXing) return null;
    var Z = window.ZXing;
    try {
      if (!zxReader) {
        var hints = new Map();
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        zxReader = new Z.MultiFormatReader();
        zxReader.setHints(hints);
      }
      var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)));
      var r = zxReader.decode(bmp);
      if (!r) return null;
      return {
        text: r.getText(),
        format: Z.BarcodeFormat[r.getBarcodeFormat()],
        points: (r.getResultPoints() || []).map(function (p) { return { x: p.getX(), y: p.getY() }; })
      };
    } catch (e) { return null; }
  }
  function qrDecode(cv) {
    var f = getJsQR();
    if (!f) return null;
    try {
      var d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
      var r = f(d.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
      if (!r || !r.data) return null;
      var pts = [];
      if (r.location) {
        ['topLeftCorner', 'topRightCorner', 'bottomRightCorner', 'bottomLeftCorner'].forEach(function (k) {
          if (r.location[k]) pts.push({ x: r.location[k].x, y: r.location[k].y });
        });
      }
      return { text: r.data, format: 'QR_CODE', points: pts };
    } catch (e) { return null; }
  }

  /* One pass over a canvas, for live camera frames where the next frame
     arrives in a few tens of milliseconds anyway. */
  function decodeFrame(cv) {
    return qrDecode(cv) || zxingDecode(cv);
  }

  /* Several passes over a still image, cheapest first: plain, upscaled for
     small screenshots, contrast-boosted for photos, inverted for
     light-on-dark codes. */
  function decode(img) {
    var w = img.width || img.videoWidth, h = img.height || img.videoHeight;
    var base = Math.min(1, 1700 / Math.max(w, h));
    var small = Math.max(w, h) < 700;
    var passes = [{ s: base, inv: false, b: false }, { s: base, inv: false, b: true }];
    if (small) passes.splice(1, 0, { s: base * 2.5, inv: false, b: false }, { s: base * 2.5, inv: false, b: true });
    else passes.push({ s: base * 1.6, inv: false, b: true });
    passes.push({ s: base, inv: true, b: false }, { s: base, inv: true, b: true });

    for (var i = 0; i < passes.length; i++) {
      var p = passes[i];
      var cv = canvasOf(img, p.s, p.inv, p.b);
      var r = decodeFrame(cv);
      if (r) { r.scale = p.s; return r; }
    }
    return null;
  }

  /* Map a decoded result onto a format this page can draw. */
  function adopt(result) {
    var fmt = result.format, text = result.text, note = null;
    var sub = SUBSTITUTE[fmt];
    if (sub) {
      if (sub.pad) text = sub.pad + text;
      if (sub.expand) {
        var full = upcEToEan13(text);
        if (full) text = full; else return { format: 'QR_CODE', text: text, note: sub.why, detected: fmt };
      }
      note = sub.why;
      fmt = sub.to;
    } else if (!FORMATS[fmt]) {
      note = 'This page cannot draw ' + String(fmt).replace(/_/g, ' ') +
        ', so the data was kept in a QR code instead.';
      fmt = 'QR_CODE';
    }
    // A substitution that still does not validate falls back to QR, which
    // accepts anything, rather than producing a card that cannot draw.
    if (validate(fmt, text)) {
      if (fmt !== 'QR_CODE') {
        note = (note ? note + ' ' : '') + 'The number did not fit ' + FORMATS[fmt].name +
          ', so it was kept in a QR code instead.';
        fmt = 'QR_CODE';
      }
    }
    return { format: fmt, text: text, note: note, detected: result.format };
  }

  /* Crop what was found out of the original image, as a visual check that
     the right code was read. 1D results give only two scan-line points,
     so those take their height from their own width. */
  function cropFrom(img, pts, scale) {
    if (!pts || pts.length < 2) return null;
    var iw = img.width || img.videoWidth, ih = img.height || img.videoHeight;
    var xs = pts.map(function (p) { return p.x / scale; });
    var ys = pts.map(function (p) { return p.y / scale; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var w = x1 - x0, h = y1 - y0;
    if (h < w * 0.22) {
      var want = Math.max(w * 0.3, 28), cy = (y0 + y1) / 2;
      y0 = cy - want / 2; y1 = cy + want / 2; h = y1 - y0;
    }
    var pad = Math.max(6, Math.min(w, h) * 0.12);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    w = Math.min(w + pad * 2, iw - x0); h = Math.min(h + pad * 2, ih - y0);
    if (w < 8 || h < 8) return null;
    var out = document.createElement('canvas');
    var up = Math.min(3, Math.max(1, 300 / Math.max(w, h)));
    out.width = Math.round(w * up); out.height = Math.round(h * up);
    var cx = out.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, out.width, out.height);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        rej(new Error('That file is not an image this browser can read.'));
      };
      img.src = url;
    });
  }

  /* Only what the page and the tests actually consume. qrCanvas,
     barcodeCanvas, canvasOf, clamp255, and mix stay internal: they are
     called from in here, and nothing outside needs them. */
  return {
    // tables
    FORMATS: FORMATS, ORDER: ORDER, SUBSTITUTE: SUBSTITUTE,
    // numbers and formats
    validate: validate, ean13CheckDigit: ean13CheckDigit, upcEToEan13: upcEToEan13,
    autoFormat: autoFormat, draw: draw,
    // color
    toHex: toHex, fromHex: fromHex, rgbCss: rgbCss,
    contrast: contrast, autoFg: autoFg, autoLabel: autoLabel,
    // reading
    loadDecoders: loadDecoders, decode: decode, decodeFrame: decodeFrame,
    applyTone: applyTone, adopt: adopt, cropFrom: cropFrom, loadImage: loadImage
  };
})();
