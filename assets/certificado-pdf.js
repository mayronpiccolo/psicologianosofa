/* Psicologia no Sofá — vector PDF certificate (A4 landscape), drawn with jsPDF.
   Fonts are embedded from assets/fonts/ (Fraunces, Archivo, Poppins — all OFL).
   Public API: PNSCert.generate(data) -> Promise<jsPDF>
   data = { name, title, speaker, dateText, issuedText, certId, signerName, signerDegrees, signerCred: [..],
            mode: "live" | "async", durationText }
*/
(function (global) {
  "use strict";

  var PETROL = [44, 74, 84], CORAL = [232, 132, 106], CORAL_TEXT = [217, 116, 90], CREAM = [245, 238, 225],
      INK = [34, 56, 63], MUTED = [95, 110, 114];
  var W = 297, H = 210;              // A4 landscape, mm
  var PT = 0.352778;                  // mm per pt

  var FONTS = [
    ["Fraunces-Regular.ttf", "Fraunces", "normal"],
    ["Fraunces-Italic.ttf", "Fraunces", "italic"],
    ["Fraunces-SemiBold.ttf", "Fraunces", "bold"],
    ["Archivo-Regular.ttf", "Archivo", "normal"],
    ["Archivo-SemiBold.ttf", "Archivo", "bold"],
    ["Poppins-SemiBold.ttf", "Poppins", "normal"],
    ["Poppins-Black.ttf", "Poppins", "bold"]
  ];
  var fontCache = null;
  function loadFonts(base) {
    if (fontCache) return fontCache;
    fontCache = Promise.all(FONTS.map(function (f) {
      return fetch(base + f[0]).then(function (r) {
        if (!r.ok) throw new Error("font " + f[0] + " " + r.status);
        return r.arrayBuffer();
      }).then(function (buf) {
        var bytes = new Uint8Array(buf), s = "", CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return { file: f[0], family: f[1], style: f[2], b64: btoa(s) };
      });
    }));
    return fontCache;
  }
  function registerFonts(doc, fonts) {
    fonts.forEach(function (f) { doc.addFileToVFS(f.file, f.b64); doc.addFont(f.file, f.family, f.style); });
  }

  /* ---------- tiny vector helpers (all coordinates in mm after an affine transform) ---------- */
  function mat(a, b, c, d, e, f) { return [a, b, c, d, e, f]; }
  function mul(m, n) { // m ∘ n  (apply n first, then m)
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function tr(x, y) { return mat(1, 0, 0, 1, x, y); }
  function sc(k) { return mat(k, 0, 0, k, 0, 0); }
  function rot(deg, cx, cy) { var r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return mul(tr(cx, cy), mul(mat(c, s, -s, c, 0, 0), tr(-cx, -cy))); }
  function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function scaleOf(m) { return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }

  function parsePath(d) { // absolute M L C Z only (what our SVGs use)
    var toks = d.match(/[MLCZ]|-?\d*\.?\d+/g), ops = [], i = 0;
    while (i < toks.length) {
      var t = toks[i++];
      if (t === "M") ops.push({ op: "m", c: [+toks[i++], +toks[i++]] });
      else if (t === "L") ops.push({ op: "l", c: [+toks[i++], +toks[i++]] });
      else if (t === "C") ops.push({ op: "c", c: [+toks[i++], +toks[i++], +toks[i++], +toks[i++], +toks[i++], +toks[i++]] });
      else if (t === "Z") ops.push({ op: "h" });
    }
    return ops;
  }
  function xf(ops, m) {
    return ops.map(function (o) {
      if (o.op === "h") return o;
      var c = [];
      for (var i = 0; i < o.c.length; i += 2) { var p = ap(m, o.c[i], o.c[i + 1]); c.push(p[0], p[1]); }
      return { op: o.op, c: c };
    });
  }
  function ellipsePath(cx, cy, rx, ry) {
    var k = 0.5523;
    return [{ op: "m", c: [cx + rx, cy] },
      { op: "c", c: [cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry] },
      { op: "c", c: [cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy] },
      { op: "c", c: [cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry] },
      { op: "c", c: [cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy] }, { op: "h" }];
  }
  function rrectPath(x, y, w, h, r) {
    var k = 0.5523 * r;
    return [{ op: "m", c: [x + r, y] }, { op: "l", c: [x + w - r, y] },
      { op: "c", c: [x + w - r + k, y, x + w, y + r - k, x + w, y + r] }, { op: "l", c: [x + w, y + h - r] },
      { op: "c", c: [x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h] }, { op: "l", c: [x + r, y + h] },
      { op: "c", c: [x + r - k, y + h, x, y + h - r + k, x, y + h - r] }, { op: "l", c: [x, y + r] },
      { op: "c", c: [x, y + r - k, x + r - k, y, x + r, y] }, { op: "h" }];
  }
  function draw(doc, ops, m, style) { // style: {stroke:[rgb], fill:[rgb], width}
    doc.path(xf(ops, m));
    var k = scaleOf(m);
    if (style.stroke) { doc.setDrawColor.apply(doc, style.stroke); doc.setLineWidth((style.width || 1) * k); }
    if (style.fill) doc.setFillColor.apply(doc, style.fill);
    if (style.fill && style.stroke) doc.fillStroke(); else if (style.fill) doc.fill(); else doc.stroke();
  }

  /* ---------- the brand drawings (same geometry as the SVGs on the site) ---------- */
  var COUCH_D = "M28,92 L28,64 C28,54 34,48 44,48 C50,48 54,51 54,56 C54,44 62,38 74,38 L126,38 C138,38 146,44 146,56 C146,51 150,48 156,48 C166,48 172,54 172,64 L172,92 Z";
  var COUCH_LINES = [[54, 56, 54, 76], [146, 56, 146, 76], [54, 76, 146, 76], [100, 40, 100, 76], [46, 92, 40, 110], [154, 92, 160, 110], [74, 92, 71, 108], [126, 92, 129, 108]];
  function couch(doc, m, sw) { // 200×130 unit drawing
    doc.setLineCap(1); doc.setLineJoin(1);
    draw(doc, parsePath(COUCH_D), m, { stroke: PETROL, width: sw });
    COUCH_LINES.forEach(function (l) { draw(doc, [{ op: "m", c: [l[0], l[1]] }, { op: "l", c: [l[2], l[3]] }], m, { stroke: PETROL, width: sw }); });
    draw(doc, rrectPath(60, 52, 28, 28, 6), mul(m, rot(-12, 74, 66)), { stroke: PETROL, fill: CORAL, width: sw * 0.8 });
  }
  function emblem(doc, x, y, width) { // couch + lamp, 330×240 viewBox
    var k = width / 330, m = mul(tr(x, y), sc(k));
    doc.setLineCap(1); doc.setLineJoin(1);
    draw(doc, ellipsePath(288, 214, 11, 3), m, { stroke: PETROL, width: 5 });
    draw(doc, parsePath("M288,211 L288,112 C288,84 262,70 238,70 L226,70"), m, { stroke: PETROL, width: 5 });
    draw(doc, parsePath("M212,94 L242,94 L234,70 L220,70 Z"), m, { stroke: PETROL, fill: CORAL, width: 4 });
    couch(doc, mul(m, mul(tr(20, 72), sc(1.3))), 5);
  }
  function seal(doc, cx, cy, diameter, year) { // 240-unit seal
    var k = diameter / 240, m = mul(tr(cx - 120 * k, cy - 120 * k), sc(k));
    draw(doc, ellipsePath(120, 120, 112, 112), m, { stroke: PETROL, fill: CREAM, width: 3 });
    draw(doc, ellipsePath(120, 120, 104, 104), m, { stroke: PETROL, width: 1.2 });
    draw(doc, ellipsePath(120, 120, 70, 70), m, { stroke: PETROL, width: 1.2 });
    couch(doc, mul(m, mul(tr(66, 78), sc(0.54))), 6);
    // ring text, clockwise starting at 9 o'clock, spread over the full circle
    var text = "PSICOLOGIA NO SOFÁ · CERTIFICADO DE PARTICIPAÇÃO · ";
    var fs = 13 * k / PT;                     // 13 units → pt
    doc.setFont("Poppins", "normal"); doc.setFontSize(fs); doc.setTextColor.apply(doc, PETROL);
    var rb = 83.5 * k;                          // baseline radius (mm)
    var circ = 2 * Math.PI * rb, natural = 0, widths = [];
    for (var i = 0; i < text.length; i++) { var w = doc.getTextWidth(text[i]); widths.push(w); natural += w; }
    var gap = (circ - natural) / text.length, s = 0;
    for (i = 0; i < text.length; i++) {
      var a = Math.PI + s / rb;                 // start angle (screen coords, y down): left → over the top → right
      var px = cx + rb * Math.cos(a), py = cy + rb * Math.sin(a);
      var deg = -(a * 180 / Math.PI + 90);      // tangent, reading clockwise
      doc.text(text[i], px, py, { angle: deg });
      s += widths[i] + gap;
    }
    doc.setFont("Poppins", "bold"); doc.setFontSize(15 * k / PT); doc.setTextColor.apply(doc, CORAL);
    doc.text(String(year), cx, cy + 43 * k, { align: "center", charSpace: 2 * k });
  }

  /* ---------- mixed-style paragraph: runs → centered lines ---------- */
  function layoutRuns(doc, runs, size, maxW) {
    var words = [];
    runs.forEach(function (r) {
      var parts = r.t.split(/(\s+)/);
      parts.forEach(function (p) { if (p) words.push({ t: p, f: r.f, s: r.s || "normal", c: r.c }); });
    });
    var lines = [], line = [], lw = 0;
    function width(w) { doc.setFont(w.f, w.s); doc.setFontSize(size); return doc.getTextWidth(w.t); }
    words.forEach(function (w) {
      var ww = width(w);
      if (/^\s+$/.test(w.t)) { if (line.length) { line.push({ w: w, ww: ww }); lw += ww; } return; }
      if (lw + ww > maxW && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].w.t)) lw -= line.pop().ww;
        lines.push({ items: line, w: lw }); line = []; lw = 0;
      }
      line.push({ w: w, ww: ww }); lw += ww;
    });
    if (line.length) { while (line.length && /^\s+$/.test(line[line.length - 1].w.t)) lw -= line.pop().ww; lines.push({ items: line, w: lw }); }
    return lines;
  }
  function drawRuns(doc, runs, size, cx, y, maxW, lineH, defaultColor) {
    var lines = layoutRuns(doc, runs, size, maxW);
    lines.forEach(function (ln, i) {
      var x = cx - ln.w / 2;
      ln.items.forEach(function (it) {
        doc.setFont(it.w.f, it.w.s); doc.setFontSize(size);
        doc.setTextColor.apply(doc, it.w.c || defaultColor);
        doc.text(it.w.t, x, y + i * lineH); x += it.ww;
      });
    });
    return y + lines.length * lineH;
  }

  /* ---------- the certificate ---------- */
  function generate(data, opts) {
    opts = opts || {};
    var base = opts.fontBase || "assets/fonts/";
    return loadFonts(base).then(function (fonts) {
      var doc = new global.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      registerFonts(doc, fonts);
      var cx = W / 2;

      // ground + frame
      doc.setFillColor.apply(doc, CREAM); doc.rect(0, 0, W, H, "F");
      doc.setLineJoin(0); doc.setLineCap(0);
      doc.setDrawColor.apply(doc, PETROL); doc.setLineWidth(0.55); doc.rect(5.8, 5.8, W - 11.6, H - 11.6);
      doc.setDrawColor.apply(doc, CORAL); doc.setLineWidth(0.26); doc.rect(7.7, 7.7, W - 15.4, H - 15.4);
      doc.setLineWidth(0.5); var ci = 10.6, cl = 6.9;
      [[ci, ci, 1, 1], [W - ci, ci, -1, 1], [ci, H - ci, 1, -1], [W - ci, H - ci, -1, -1]].forEach(function (c) {
        doc.line(c[0], c[1], c[0] + cl * c[2], c[1]); doc.line(c[0], c[1], c[0], c[1] + cl * c[3]);
      });

      // top: emblem, brand, title, rule
      emblem(doc, cx - 15.5, 14.5, 31);
      doc.setFont("Poppins", "bold"); doc.setFontSize(11.2); doc.setTextColor.apply(doc, PETROL);
      var brand = "PSICOLOGIA NO ", brandW = doc.getTextWidth(brand) + 1.1 * brand.length, sofaW = doc.getTextWidth("SOFÁ") + 1.1 * 3;
      var bx = cx - (brandW + sofaW) / 2;
      doc.text(brand, bx, 44.5, { charSpace: 1.1 });
      doc.setTextColor.apply(doc, CORAL); doc.text("SOFÁ", bx + brandW, 44.5, { charSpace: 1.1 });
      doc.setFont("Fraunces", "normal"); doc.setFontSize(34.5); doc.setTextColor.apply(doc, PETROL);
      doc.text("Certificado de Participação", cx, 57.5, { align: "center" });
      doc.setDrawColor.apply(doc, CORAL); doc.setLineWidth(0.55); doc.line(cx - 9.5, 62.5, cx + 9.5, 62.5);

      // middle: lead, name, rule, citation
      doc.setFont("Archivo", "normal"); doc.setFontSize(9.7); doc.setTextColor.apply(doc, MUTED);
      doc.text("CERTIFICAMOS QUE", cx, 84, { align: "center", charSpace: 1.05 });
      var name = data.name, nameSize = name.length > 34 ? 32 : (name.length > 26 ? 38 : 45);
      doc.setFont("Fraunces", "italic"); doc.setFontSize(nameSize); doc.setTextColor.apply(doc, INK);
      doc.text(name, cx, 101, { align: "center" });
      var nw = Math.max(122, Math.min(243, doc.getTextWidth(name) + 15));
      doc.setDrawColor.apply(doc, PETROL); doc.setLineWidth(0.26); doc.line(cx - nw / 2, 105.5, cx + nw / 2, 105.5);

      var isAsync = data.mode === "async";
      var runs = isAsync ? [
        { t: "assistiu à gravação da palestra ", f: "Fraunces" }, { t: "“" + data.title + "”", f: "Fraunces", s: "italic", c: PETROL },
        { t: ", ministrada por ", f: "Fraunces" }, { t: data.speaker, f: "Fraunces", s: "bold", c: PETROL },
        { t: ", promovida pelo Psicologia no Sofá e disponibilizada de forma assíncrona (realizada ao vivo em ", f: "Fraunces" },
        { t: data.dateText, f: "Fraunces", s: "bold", c: PETROL }, { t: "), com duração de ", f: "Fraunces" },
        { t: data.durationText || "1 hora de atividade", f: "Fraunces", s: "bold", c: PETROL }, { t: ".", f: "Fraunces" }
      ] : [
        { t: "participou da palestra ", f: "Fraunces" }, { t: "“" + data.title + "”", f: "Fraunces", s: "italic", c: PETROL },
        { t: ", ministrada por ", f: "Fraunces" }, { t: data.speaker, f: "Fraunces", s: "bold", c: PETROL },
        { t: ", promovida pelo Psicologia no Sofá e realizada online, ao vivo, em ", f: "Fraunces" },
        { t: data.dateText, f: "Fraunces", s: "bold", c: PETROL }, { t: ", com duração de ", f: "Fraunces" },
        { t: data.durationText || "1 hora de atividade", f: "Fraunces", s: "bold", c: PETROL }, { t: ".", f: "Fraunces" }
      ];
      drawRuns(doc, runs, 14.6, cx, 117.5, 211, 8.25, INK);

      // bottom: signature | seal | issue data
      var ry = 173, colW = 96, lcx = 72, rcx = W - 72;
      doc.setDrawColor.apply(doc, PETROL); doc.setLineWidth(0.26);
      doc.line(lcx - colW / 2, ry, lcx + colW / 2, ry); doc.line(rcx - colW / 2, ry, rcx + colW / 2, ry);

      var sigName = data.signerName + (data.signerDegrees ? ", " + data.signerDegrees : "");
      doc.setFont("Fraunces", "bold"); doc.setFontSize(12.2); doc.setTextColor.apply(doc, PETROL);
      while (doc.getTextWidth(sigName) > colW - 4 && doc.getFontSize() > 9) doc.setFontSize(doc.getFontSize() - 0.5);
      doc.text(sigName, lcx, ry + 7, { align: "center" });
      doc.setFont("Archivo", "normal"); doc.setFontSize(7.9); doc.setTextColor.apply(doc, MUTED);
      doc.text("PELO PSICOLOGIA NO SOFÁ", lcx, ry + 12, { align: "center", charSpace: 0.3 });
      doc.setFontSize(7.5);
      (data.signerCred || []).forEach(function (line, i) { doc.text(line, lcx, ry + 17.5 + i * 3.9, { align: "center" }); });

      seal(doc, cx, 180.5, 46.5, data.year);

      var issueRuns = [
        [{ t: "Emitido em ", f: "Archivo", c: MUTED }, { t: data.issuedText, f: "Archivo", s: "bold", c: INK }],
        [{ t: "Certificado nº ", f: "Archivo", c: MUTED }, { t: data.certId, f: "Archivo", s: "bold", c: INK }],
        [{ t: "psicologianosofa.com/certificado.html", f: "Archivo", c: MUTED }]
      ];
      issueRuns.forEach(function (r, i) { drawRuns(doc, r, 7.9, rcx, ry + 7 + i * 4.6, colW, 4.6, MUTED); });

      doc.setProperties({ title: "Certificado — " + data.name, subject: data.title, author: "Psicologia no Sofá", creator: "psicologianosofa.com" });
      return doc;
    });
  }

  global.PNSCert = { generate: generate, preload: loadFonts };
})(window);
