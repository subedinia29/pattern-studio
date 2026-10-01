/*
 * Geometry helpers for pattern drafting. All units are centimetres.
 *
 * A pattern piece's outline is described on the STITCH line as a closed
 * sequence of edges. Each edge carries its own allowance (sa), so a fold
 * edge can have 0, a hem 2.5 and a regular seam 1.5. The cut line is then
 * derived by offsetting every edge outward by its allowance.
 */
const Geo = (() => {
  const CURVE_STEPS = 40;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function cubicAt(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ];
  }

  /** Points along an edge, excluding its start and including its end. */
  function flattenEdge(from, edge) {
    if (edge.kind === 'C') {
      const pts = [];
      for (let i = 1; i <= CURVE_STEPS; i++) {
        pts.push(cubicAt(from, edge.c1, edge.c2, edge.to, i / CURVE_STEPS));
      }
      return pts;
    }
    return [edge.to];
  }

  function polyLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
    return len;
  }

  function edgeLength(from, edge) {
    return polyLength([from, ...flattenEdge(from, edge)]);
  }

  function cubicLength(p0, p1, p2, p3) {
    return edgeLength(p0, { kind: 'C', c1: p1, c2: p2, to: p3 });
  }

  function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  /**
   * Flatten a piece outline to a closed polygon. Returns the stitch-line
   * points, each segment's allowance, and the fold edges.
   */
  function outline(piece) {
    let pts = [piece.start];
    let sas = [];
    const folds = [];
    let cur = piece.start;
    for (const e of piece.edges) {
      if (e.fold) folds.push({ a: cur, b: e.to });
      for (const p of flattenEdge(cur, e)) {
        pts.push(p);
        sas.push(e.sa);
      }
      cur = e.to;
    }
    // The last point duplicates the start; segment i runs pts[i] -> pts[i+1].
    pts.pop();

    // Drop zero-length segments.
    const cleanPts = [], cleanSas = [];
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      if (dist(pts[i], next) < 1e-6) continue;
      cleanPts.push(pts[i]);
      cleanSas.push(sas[i]);
    }
    pts = cleanPts;
    sas = cleanSas;

    const orient = Math.sign(signedArea(pts)) || 1;
    return { pts, sas, folds, orient };
  }

  /** Outward unit normal of segment a->b for a polygon with given orientation. */
  function outwardNormal(a, b, orient) {
    const d = sub(b, a);
    const len = Math.hypot(d[0], d[1]) || 1;
    return [(orient * d[1]) / len, (-orient * d[0]) / len];
  }

  /** Offset a closed polygon outward, each segment by its own allowance. */
  function offsetPolygon(pts, sas, orient) {
    const n = pts.length;
    const normals = [], dirs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      normals.push(outwardNormal(a, b, orient));
      const d = sub(b, a);
      const len = Math.hypot(d[0], d[1]) || 1;
      dirs.push([d[0] / len, d[1] / len]);
    }

    const out = [];
    for (let i = 0; i < n; i++) {
      const j = (i - 1 + n) % n;
      const P = pts[i];
      const a1 = sas[j], a2 = sas[i];
      const A1 = add(P, mul(normals[j], a1));
      const A2 = add(P, mul(normals[i], a2));
      const c = cross(dirs[j], dirs[i]);

      if (Math.abs(c) < 1e-4) {
        out.push(A1);
        if (dist(A1, A2) > 1e-6) out.push(A2);
        continue;
      }
      // Intersect line (A1 + t*d1) with line (A2 + s*d2).
      const t = cross(sub(A2, A1), dirs[i]) / c;
      const X = add(A1, mul(dirs[j], t));
      const limit = 3 * Math.max(a1, a2) + 0.01;
      if (dist(X, P) > limit) {
        out.push(A1, A2); // bevel very sharp corners
      } else {
        out.push(X);
      }
    }
    return out;
  }

  function bounds(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  /** Solve f(x) = target for monotonically increasing f on [lo, hi]. */
  function solveIncreasing(f, target, lo, hi) {
    if (f(lo) >= target) return lo;
    if (f(hi) <= target) return hi;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return {
    add, sub, mul, dist, lerp, cross,
    cubicAt, flattenEdge, edgeLength, cubicLength, polyLength,
    outline, offsetPolygon, outwardNormal, bounds, solveIncreasing,
  };
})();
