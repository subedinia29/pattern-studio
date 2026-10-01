/*
 * Turns drafted pieces into SVG: the pattern sheet, the cutting layout,
 * and page tiles for printing at 1:1 scale. SVG user units are centimetres.
 */
const Render = (() => {
  const INK = '#1d2433';
  const SEAM = '#c2552d';
  const FOLD = '#2f6f5e';
  const PAPER = '#fffdf8';
  const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";

  const f = (n) => (Math.round(n * 100) / 100).toString();
  const pt = (p) => `${f(p[0])},${f(p[1])}`;
  const poly = (pts) => pts.map(pt).join(' ');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function text(at, str, { size = 1, weight = 400, anchor = 'middle', rotate = 0, fill = INK, italic = false } = {}) {
    const tr = rotate ? ` transform="rotate(${f(rotate)} ${pt(at)})"` : '';
    return `<text x="${f(at[0])}" y="${f(at[1])}" font-family="${FONT}" font-size="${f(size)}" font-weight="${weight}"` +
      `${italic ? ' font-style="italic"' : ''} text-anchor="${anchor}" dominant-baseline="middle" fill="${fill}"${tr}>${esc(str)}</text>`;
  }

  function arrowHead(tip, from, size, color) {
    const d = Geo.sub(tip, from);
    const len = Math.hypot(d[0], d[1]) || 1;
    const u = [d[0] / len, d[1] / len];
    const n = [-u[1], u[0]];
    const base = Geo.sub(tip, Geo.mul(u, size));
    const a = Geo.add(base, Geo.mul(n, size * 0.45));
    const b = Geo.sub(base, Geo.mul(n, size * 0.45));
    return `<polygon points="${poly([tip, a, b])}" fill="${color}"/>`;
  }

  /** Readable text angle (degrees) for a direction vector. */
  function readableAngle(d) {
    let a = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    if (a > 90) a -= 180;
    if (a < -90) a += 180;
    return a;
  }

  /** Flatten a piece and compute its cut line and bounds. */
  function prepare(piece) {
    const o = Geo.outline(piece);
    const cut = Geo.offsetPolygon(o.pts, o.sas, o.orient);
    return { piece, seam: o.pts, cut, folds: o.folds, orient: o.orient, bounds: Geo.bounds(cut) };
  }

  function cutCount(piece) {
    const m = /Cut\s+(\d+)/i.exec(piece.cut || '');
    return m ? parseInt(m[1], 10) : 1;
  }

  /** SVG markup for one piece, in its own drafting coordinates. */
  function pieceMarkup(prep, ctx) {
    const { piece, seam, cut, folds, orient } = prep;
    const out = [];

    out.push(`<polygon points="${poly(cut)}" fill="${PAPER}" stroke="${INK}" stroke-width="0.09" stroke-linejoin="round"/>`);
    out.push(`<polygon points="${poly(seam)}" fill="none" stroke="${SEAM}" stroke-width="0.05" stroke-dasharray="0.4 0.25"/>`);

    // Fold edges: heavy line plus a "place on fold" bracket.
    for (const { a, b } of folds) {
      out.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${FOLD}" stroke-width="0.16" stroke-dasharray="1.2 0.3 0.2 0.3"/>`);
      const nOut = Geo.outwardNormal(a, b, orient);
      const nIn = Geo.mul(nOut, -1);
      const p1 = Geo.lerp(a, b, 0.2), p2 = Geo.lerp(a, b, 0.8);
      const q1 = Geo.add(p1, Geo.mul(nIn, 2.2)), q2 = Geo.add(p2, Geo.mul(nIn, 2.2));
      out.push(`<polyline points="${poly([Geo.add(p1, Geo.mul(nIn, 0.5)), q1, q2, Geo.add(p2, Geo.mul(nIn, 0.5))])}" fill="none" stroke="${FOLD}" stroke-width="0.08"/>`);
      out.push(arrowHead(Geo.add(p1, Geo.mul(nIn, 0.15)), q1, 0.8, FOLD));
      out.push(arrowHead(Geo.add(p2, Geo.mul(nIn, 0.15)), q2, 0.8, FOLD));
      const mid = Geo.add(Geo.lerp(q1, q2, 0.5), Geo.mul(nIn, 0.9));
      out.push(text(mid, 'PLACE ON FOLD', { size: 0.9, weight: 600, rotate: readableAngle(Geo.sub(b, a)), fill: FOLD }));
    }

    // Internal marks.
    for (const mk of piece.marks || []) {
      if (mk.type === 'line') {
        const style = {
          dart: `stroke="${INK}" stroke-width="0.06"`,
          fold: `stroke="${FOLD}" stroke-width="0.06" stroke-dasharray="1 0.3 0.2 0.3"`,
          guide: `stroke="${INK}" stroke-width="0.04" stroke-dasharray="0.2 0.3" opacity="0.6"`,
        }[mk.style];
        out.push(`<polyline points="${poly(mk.pts)}" fill="none" ${style}/>`);
        if (mk.label) {
          const a = mk.pts[0], b = mk.pts[mk.pts.length - 1];
          const at = mk.style === 'dart' ? Geo.add(mk.pts[1], [0, 1]) : Geo.add(Geo.lerp(a, b, 0.5), [0, -0.7]);
          out.push(text(at, mk.label, { size: 0.8, italic: true }));
        }
      } else if (mk.type === 'dot') {
        out.push(`<circle cx="${f(mk.at[0])}" cy="${f(mk.at[1])}" r="0.35" fill="${SEAM}"/>`);
        if (mk.label) out.push(text(Geo.add(mk.at, [0, 1.1]), mk.label, { size: 0.8, italic: true }));
      } else if (mk.type === 'text') {
        out.push(text(mk.at, mk.text, { size: 0.8, italic: true, fill: SEAM }));
      }
    }

    // Grainline.
    if (piece.grain) {
      const [g1, g2] = piece.grain;
      out.push(`<line x1="${f(g1[0])}" y1="${f(g1[1])}" x2="${f(g2[0])}" y2="${f(g2[1])}" stroke="${INK}" stroke-width="0.07"/>`);
      out.push(arrowHead(g1, g2, 1, INK), arrowHead(g2, g1, 1, INK));
      const d = Geo.sub(g2, g1);
      const len = Math.hypot(d[0], d[1]);
      if (len > 8) {
        const n = [d[1] / len, -d[0] / len];
        const at = Geo.add(Geo.lerp(g1, g2, 0.5), Geo.mul(n, -0.7));
        out.push(text(at, (piece.grainLabel || 'grainline').toUpperCase(), { size: 0.7, weight: 600, rotate: readableAngle(d) }));
      }
    }

    // Label block.
    if (piece.label) {
      const at = piece.label;
      const rot = piece.vertical ? -90 : 0;
      const lines = [
        [piece.name.toUpperCase(), 1.5, 700],
        [piece.cut, 1.05, 500],
        [ctx.subtitle, 0.75, 400],
      ];
      const spacing = [0, 1.9, 1.5];
      let y = 0;
      const g = [];
      lines.forEach(([str, size, weight], i) => {
        y += spacing[i];
        g.push(text([0, y], str, { size, weight }));
      });
      out.push(`<g transform="translate(${pt(at)}) rotate(${rot}) translate(0 ${f(-y / 2)})">${g.join('')}</g>`);
    }

    return out.join('');
  }

  /** Arrange pieces on a sheet with simple shelf packing. */
  function sheet(preps, ctx, { grid = true, maxWidth } = {}) {
    const margin = 3, gap = 4;
    const widest = Math.max(...preps.map((p) => p.bounds.w));
    const limit = Math.max(maxWidth || 130, widest);
    const placed = [];
    let x = margin, y = margin, rowH = 0, sheetW = 0;
    for (const p of preps) {
      if (x > margin && x + p.bounds.w > margin + limit) {
        x = margin;
        y += rowH + gap;
        rowH = 0;
      }
      placed.push({ p, x, y });
      x += p.bounds.w + gap;
      rowH = Math.max(rowH, p.bounds.h);
      sheetW = Math.max(sheetW, x - gap + margin);
    }
    const W = sheetW, H = y + rowH + margin;

    const body = placed.map(({ p, x, y }) =>
      `<g transform="translate(${f(x - p.bounds.minX)} ${f(y - p.bounds.minY)})">${pieceMarkup(p, ctx)}</g>`
    ).join('');

    const gridDefs = grid
      ? `<defs><pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0 L0 0 0 1" fill="none" stroke="#b9c3d6" stroke-width="0.02"/></pattern>` +
        `<pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#g1)"/><path d="M10 0 L0 0 0 10" fill="none" stroke="#8e9bb5" stroke-width="0.05"/></pattern></defs>` +
        `<rect width="${f(W)}" height="${f(H)}" fill="#f4f1e8"/><rect width="${f(W)}" height="${f(H)}" fill="url(#g10)"/>`
      : '';

    const rects = placed.map(({ p, x, y }) => ({ x, y, w: p.bounds.w, h: p.bounds.h }));
    return { inner: gridDefs + body, width: W, height: H, rects };
  }

  function svgDoc(inner, w, h, { physical = false, pxPerCm = 4 } = {}) {
    const size = physical ? `width="${f(w)}cm" height="${f(h)}cm"` : `width="${f(w * pxPerCm)}" height="${f(h * pxPerCm)}"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${f(w)} ${f(h)}">${inner}</svg>`;
  }

  /**
   * Cutting layout on fabric folded selvage-to-selvage. Fold pieces sit
   * against the fold; "cut 2" pieces are cut once through both layers.
   */
  function cuttingLayout(preps, fabricWidth) {
    const FW = fabricWidth / 2;
    const gap = 1;
    const items = [];
    for (const p of preps) {
      const fold = p.folds.length > 0;
      const n = fold ? 1 : Math.ceil(cutCount(p.piece) / 2);
      for (let i = 0; i < n; i++) items.push({ p, fold });
    }
    items.sort((a, b) => (b.fold - a.fold) || (b.p.bounds.h - a.p.bounds.h));

    // Shelf packing along the fabric length. Fold pieces must start a shelf
    // (against the fold); other pieces fill gaps, and the last shelf may grow.
    const shelves = [];
    const tooWide = new Set();
    for (const it of items) {
      const { w, h } = it.p.bounds;
      if (w > FW) tooWide.add(it.p.piece.name);
      let shelf = null;
      if (!it.fold) {
        const last = shelves[shelves.length - 1];
        shelf = shelves.find((s) => s.x + w <= FW && (h <= s.h || s === last)) || null;
      }
      if (!shelf) {
        shelf = { x: 0, h: 0, items: [] };
        shelves.push(shelf);
      }
      shelf.items.push({ it, x: shelf.x });
      shelf.x += w + gap;
      shelf.h = Math.max(shelf.h, h);
    }
    const placed = [];
    let total = 0;
    for (const s of shelves) {
      for (const { it, x } of s.items) placed.push({ it, x, y: total });
      total += s.h + gap;
    }
    const length = Math.max(total - gap, 0);
    const drawW = Math.max(FW, ...preps.map((p) => p.bounds.w));
    const pad = 4;
    const W = drawW + pad * 2, H = length + pad * 2 + 2;

    const out = [];
    out.push(`<rect width="${f(W)}" height="${f(H)}" fill="#f4f1e8"/>`);
    out.push(`<rect x="${pad}" y="${pad}" width="${f(FW)}" height="${f(length + 2)}" fill="#e3ebe6" stroke="${FOLD}" stroke-width="0.2"/>`);
    out.push(`<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${f(pad + length + 2)}" stroke="${FOLD}" stroke-width="0.6" stroke-dasharray="3 1"/>`);
    out.push(text([pad - 1.8, pad + (length + 2) / 2], 'FOLD', { size: 1.8, weight: 700, rotate: -90, fill: FOLD }));
    out.push(text([pad + FW + 1.8, pad + (length + 2) / 2], 'SELVAGES', { size: 1.8, weight: 700, rotate: 90, fill: FOLD }));

    for (const { it, x, y } of placed) {
      const p = it.p;
      const ox = pad + x - p.bounds.minX, oy = pad + 1 + y - p.bounds.minY;
      const bad = tooWide.has(p.piece.name);
      out.push(`<g transform="translate(${f(ox)} ${f(oy)})">` +
        `<polygon points="${poly(p.cut)}" fill="${bad ? '#f6d6c8' : PAPER}" stroke="${INK}" stroke-width="0.25"/>` +
        `</g>`);
      const c = [pad + x + p.bounds.w / 2, pad + 1 + y + p.bounds.h / 2];
      const size = Math.max(1.6, Math.min(3.2, p.bounds.w / 7));
      out.push(text(c, p.piece.name, { size, weight: 600, rotate: p.bounds.w < 12 ? -90 : 0 }));
    }

    return { inner: out.join(''), width: W, height: H, length: length + 2, tooWide: [...tooWide] };
  }

  const PAPERS = {
    letter: { name: 'letter', w: 21.59, h: 27.94, tileW: 19, tileH: 25 },
    a4: { name: 'A4', w: 21, h: 29.7, tileW: 18.5, tileH: 27 },
  };

  /** Split a 1:1 sheet into printable tiles, skipping tiles with no pieces on them. */
  function tiles(sheet, paperKey) {
    const paper = PAPERS[paperKey] || PAPERS.letter;
    const cols = Math.ceil(sheet.width / paper.tileW);
    const rows = Math.ceil(sheet.height / paper.tileH);
    const pages = [];
    const used = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * paper.tileW, y = r * paper.tileH;
        const hit = sheet.rects.some((b) =>
          b.x < x + paper.tileW && b.x + b.w > x && b.y < y + paper.tileH && b.y + b.h > y);
        if (!hit) continue;
        const id = `${String.fromCharCode(65 + r)}${c + 1}`;
        used.add(id);
        const marks = [];
        // Border and page ID; tiles butt together edge to edge.
        marks.push(`<rect x="${f(x)}" y="${f(y)}" width="${paper.tileW}" height="${paper.tileH}" fill="none" stroke="#8e9bb5" stroke-width="0.03"/>`);
        marks.push(text([x + paper.tileW - 1.2, y + 0.8], id, { size: 0.7, weight: 700, fill: '#8e9bb5' }));
        if (c > 0) marks.push(text([x + 0.6, y + paper.tileH / 2], `◀ ${String.fromCharCode(65 + r)}${c}`, { size: 0.5, rotate: -90, fill: '#8e9bb5' }));
        if (r > 0) marks.push(text([x + paper.tileW / 2, y + 0.5], `▲ ${String.fromCharCode(64 + r)}${c + 1}`, { size: 0.5, fill: '#8e9bb5' }));
        pages.push({
          id,
          svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${paper.tileW}cm" height="${paper.tileH}cm" viewBox="${f(x)} ${f(y)} ${paper.tileW} ${paper.tileH}">${sheet.inner}${marks.join('')}</svg>`,
        });
      }
    }
    return { paper, rows, cols, pages, used };
  }

  return { prepare, sheet, svgDoc, cuttingLayout, tiles, PAPERS };
})();
