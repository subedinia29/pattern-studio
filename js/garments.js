/*
 * Garment definitions and pattern drafting.
 *
 * Every garment declares the measurements it needs, its options, and a
 * build() function that turns measurements (in cm) into pattern pieces.
 * Coordinates: x to the right, y DOWN, in centimetres, on the stitch line.
 */
const Garments = (() => {
  /** Standard body measurements (cm) used by the size presets. */
  const SIZES = {
    XS: { chest: 84, waist: 66, hip: 90, neck: 34, shoulder: 38, bicep: 26, wrist: 15 },
    S:  { chest: 90, waist: 72, hip: 96, neck: 36, shoulder: 40, bicep: 28, wrist: 16 },
    M:  { chest: 96, waist: 78, hip: 102, neck: 38, shoulder: 42, bicep: 30, wrist: 17 },
    L:  { chest: 104, waist: 86, hip: 110, neck: 40, shoulder: 44, bicep: 33, wrist: 18 },
    XL: { chest: 112, waist: 96, hip: 118, neck: 42, shoulder: 46, bicep: 36, wrist: 19 },
  };

  /** Small fluent helper for describing a closed outline. */
  function draft(name, start) {
    const p = { name, start, edges: [], marks: [] };
    const api = {
      line(to, sa, extra) {
        p.edges.push({ kind: 'L', to, sa, ...extra });
        return api;
      },
      curve(c1, c2, to, sa, extra) {
        p.edges.push({ kind: 'C', c1, c2, to, sa, ...extra });
        return api;
      },
      done(props) {
        return Object.assign(p, props);
      },
    };
    return api;
  }

  function rect(name, w, h, sa, props) {
    return draft(name, [0, 0])
      .line([w, 0], sa.top ?? sa.all)
      .line([w, h], sa.side ?? sa.all)
      .line([0, h], sa.bottom ?? sa.all)
      .line([0, 0], sa.side ?? sa.all)
      .done(props);
  }

  // ------------------------------------------------------------------
  // T-shirt
  // ------------------------------------------------------------------
  const tee = {
    id: 'tee',
    name: 'T-shirt',
    blurb: 'Knit tee with set-in sleeves and a neckband',
    fabric: 'Knit (cotton jersey) with some stretch',
    icon: '<path d="M22 8 L14 11 L6 18 L10 25 L15 22 L15 56 L49 56 L49 22 L54 25 L58 18 L50 11 L42 8 Q32 16 22 8 Z"/>',
    fields: [
      { key: 'chest', label: 'Chest', def: 96, circ: true, gAdd: 10 },
      { key: 'hip', label: 'Hip (at hem)', def: 102, circ: true, gAdd: 10 },
      { key: 'shoulder', label: 'Shoulder width', def: 42, help: 'Shoulder point to shoulder point, across the back.' },
      { key: 'neck', label: 'Neck', def: 38, help: 'Around the base of the neck.' },
      { key: 'length', label: 'Body length', def: 66, help: 'From where the shoulder meets the neck, down to the hem.' },
      { key: 'bicep', label: 'Upper arm', def: 30, circ: true, gAdd: 6, showIf: (o) => o.sleeve !== 'sleeveless' },
      { key: 'sleeveLen', label: 'Sleeve length', def: 20, help: 'From the shoulder point down to the sleeve hem.', showIf: (o) => o.sleeve !== 'sleeveless' },
      { key: 'wrist', label: 'Wrist', def: 17, showIf: (o) => o.sleeve === 'long' },
      { key: 'ease', label: 'Ease', def: 10, gDef: 0, isEase: true, help: 'Extra room added around the chest and hip.' },
    ],
    options: [
      { key: 'sleeve', label: 'Sleeves', def: 'short', choices: [['short', 'Short'], ['long', 'Long'], ['sleeveless', 'Sleeveless']],
        effects: { short: { sleeveLen: 20 }, long: { sleeveLen: 60 } } },
    ],
    defaults: { sa: 1, hem: 2.5 },
    build(m, o, c) {
      const warnings = [];
      const chest = m.chest + m.ease;
      const hip = m.hip + m.ease;
      const W = chest / 4;
      const Hw = Math.max(W, hip / 4);
      const L = m.length;
      const neckW = m.neck / 6 + 1;
      const drop = 4;
      const sx = Math.max(m.shoulder / 2, neckW + 6);
      const armY = Math.max(chest / 8 + 9, drop + 10);
      if (L < armY + 5) warnings.push('Body length is shorter than the armhole. Check the length measurement.');

      let neckTotal = 0, armTotal = 0;
      const pieces = [];

      for (const front of [true, false]) {
        const nd = front ? m.neck / 6 + 2.5 : 2;
        const shift = front ? 1.8 : 0.8;
        const nC1 = [neckW * 0.6, nd], nC2 = [neckW * 0.95, nd * 0.4], nTo = [neckW, 0];
        const aC1 = [sx - shift, drop + (armY - drop) * 0.55];
        const aC2 = [(sx - shift + W) / 2, armY];
        neckTotal += Geo.cubicLength([0, nd], nC1, nC2, nTo) * 2;
        armTotal += Geo.cubicLength([sx, drop], aC1, aC2, [W, armY]);

        pieces.push(
          draft(front ? 'Front' : 'Back', [0, nd])
            .curve(nC1, nC2, nTo, c.sa)
            .line([sx, drop], c.sa)
            .curve(aC1, aC2, [W, armY], c.sa)
            .line([Hw, L], c.sa)
            .line([0, L], c.hem)
            .line([0, nd], 0, { fold: true })
            .done({
              cut: 'Cut 1 on fold',
              grain: [[W * 0.28, armY + 3], [W * 0.28, L - 5]],
              label: [W * 0.62, armY + (L - armY) * 0.4],
            })
        );
      }

      if (o.sleeve !== 'sleeveless') {
        const long = o.sleeve === 'long';
        const bw = m.bicep + m.ease * 0.6;
        const len = m.sleeveLen;
        const halfCap = (h) =>
          Geo.cubicLength([-bw / 2, h], [-bw / 2 + bw * 0.22, h], [-bw * 0.2, 0], [0, 0]);
        // Cap height chosen so the cap seam matches the armhole (+1 cm ease).
        const h = Geo.solveIncreasing(halfCap, armTotal / 2 + 0.5, 2, 30);
        let open = long ? Math.max(m.wrist * 1.5, m.wrist + 8) : bw - 3;
        open = Math.min(open, bw);
        if (len < h + 2) warnings.push('Sleeve length is shorter than the sleeve cap. Increase the sleeve length.');

        pieces.push(
          draft('Sleeve', [0, 0])
            .curve([bw * 0.2, 0], [bw / 2 - bw * 0.22, h], [bw / 2, h], c.sa)
            .line([open / 2, len], c.sa)
            .line([-open / 2, len], c.hem)
            .line([-bw / 2, h], c.sa)
            .curve([-bw / 2 + bw * 0.22, h], [-bw * 0.2, 0], [0, 0], c.sa)
            .done({
              cut: 'Cut 2',
              grain: [[-bw * 0.28, h + 1.5], [-bw * 0.28, len - 3]],
              label: [bw * 0.08, h + (len - h) * 0.45],
              marks: [{ type: 'dot', at: [0, 0.6], label: 'shoulder' }],
            })
        );
      } else {
        const bl = armTotal * 2 * 0.9;
        pieces.push(
          rect('Armhole binding', 4, bl, { all: 0, top: 1, bottom: 1 }, {
            cut: 'Cut 2',
            grain: [[1, 4], [1, bl - 4]],
            grainLabel: 'stretch',
            label: [2.6, bl / 2],
            vertical: true,
            marks: [{ type: 'line', style: 'fold', pts: [[2, 0], [2, bl]] }],
          })
        );
      }

      const bandLen = neckTotal * 0.85;
      pieces.push(
        rect('Neckband', 5, bandLen, { all: c.sa }, {
          cut: 'Cut 1 (rib or jersey)',
          grain: [[1.2, 3], [1.2, bandLen - 3]],
          grainLabel: 'stretch',
          label: [3.2, bandLen / 2],
          vertical: true,
          marks: [{ type: 'line', style: 'fold', pts: [[2.5, 0], [2.5, bandLen]] }],
        })
      );

      return {
        pieces,
        warnings,
        facts: [
          ['Finished chest', chest],
          ['Finished length', L],
          ['Neckline', neckTotal],
        ],
      };
    },
    steps: [
      'Pre-wash your knit fabric. Cut all pieces, keeping the grainline arrows parallel to the selvage (the fabric\'s finished edge).',
      'With right sides together, sew front to back at the shoulders using a stretch or narrow zigzag stitch.',
      'Fold the neckband in half so the short ends meet and sew them into a loop. Fold the loop in half lengthwise, wrong sides together.',
      'Quarter-mark the band and the neckline. Pin them together at the marks, then stretch the band gently to fit as you sew. Press the seam toward the body.',
      'Sleeves: match the dot at the top of the sleeve cap to the shoulder seam. Pin the cap into the armhole and sew. (Sleeveless: fold the binding strips in half and sew them around each armhole instead.)',
      'Sew one continuous seam from the sleeve hem, through the underarm, down to the body hem, on each side.',
      'Press up the hem and sleeve hems by the hem allowance. Topstitch with a twin needle or zigzag so the hems can still stretch.',
    ],
  };

  // ------------------------------------------------------------------
  // A-line skirt
  // ------------------------------------------------------------------
  const skirt = {
    id: 'skirt',
    name: 'A-line skirt',
    blurb: 'Darted skirt with a waistband, or an elastic pull-on version',
    fabric: 'Woven cotton, linen, chambray or denim',
    icon: '<path d="M20 8 L44 8 L45 16 L56 56 L8 56 L19 16 Z"/><path d="M19 16 L45 16" fill="none"/>',
    fields: [
      { key: 'waist', label: 'Waist', def: 78, circ: true, gAdd: 1 },
      { key: 'hip', label: 'Hip', def: 102, circ: true, gAdd: 4, help: 'Around the fullest part of the seat.' },
      { key: 'hipDepth', label: 'Waist to hip', def: 20, help: 'Vertical distance from the waist down to the fullest hip.' },
      { key: 'length', label: 'Skirt length', def: 60, help: 'From the waist down to where you want the hem.' },
      { key: 'flare', label: 'Flare per side', def: 6, help: 'How far each side seam kicks out at the hem. 0 gives a pencil skirt.' },
      { key: 'easeWaist', label: 'Waist ease', def: 1, gDef: 0, isEase: true },
      { key: 'easeHip', label: 'Hip ease', def: 4, gDef: 0, isEase: true },
      { key: 'band', label: 'Waistband width', def: 4, showIf: (o) => o.waist === 'fitted' },
      { key: 'elastic', label: 'Elastic width', def: 3, showIf: (o) => o.waist === 'elastic' },
    ],
    options: [
      { key: 'waist', label: 'Waist', def: 'fitted', choices: [['fitted', 'Fitted: darts + zipper'], ['elastic', 'Elastic pull-on']] },
    ],
    defaults: { sa: 1.5, hem: 3 },
    build(m, o, c) {
      const warnings = [];
      const elastic = o.waist === 'elastic';
      const pieces = [];
      const hd = Math.min(m.hipDepth, m.length - 5);

      for (const front of [true, false]) {
        const adj = front ? 0.5 : -0.5;
        const qH = (m.hip + m.easeHip) / 4 + adj;
        const qW = (m.waist + m.easeWaist) / 4 + adj;
        let dart = 0, side = 0;
        if (!elastic) {
          const diff = Math.max(0, qH - qW);
          dart = Math.min(Math.max(diff - 2.5, 0), front ? 3 : 4);
          side = diff - dart;
        }
        if (!elastic && qW > qH) warnings.push('Waist is larger than hip; the side seams will be straight.');

        const topX = qH - side;
        const rise = side > 0.5 ? 1 : 0;
        const cbDrop = !front && !elastic ? 1 : 0;
        const flare = m.flare;
        const lift = flare > 0 ? (flare * flare) / Math.max(m.length - hd, 1) : 0;
        const hemSide = [qH + flare, m.length - lift];

        const d = Geo.sub(hemSide, [qH, hd]);
        const dl = Math.hypot(d[0], d[1]) || 1;
        const inward = [-d[1] / dl, d[0] / dl];
        const hC1 = Geo.add(hemSide, Geo.mul(inward, qH * 0.35));

        const waistSa = elastic ? m.elastic + 2 : c.sa;
        const b = draft(front ? 'Skirt front' : 'Skirt back', [0, cbDrop]).line([topX, -rise], waistSa);
        if (side > 0.2) b.curve([topX + side * 0.6, hd * 0.3], [qH, hd * 0.65], [qH, hd], c.sa);
        else b.line([qH, hd], c.sa);
        b.line(hemSide, c.sa)
          .curve(hC1, [qH * 0.45, m.length], [0, m.length], c.hem)
          .line([0, cbDrop], 0, { fold: true });

        const marks = [];
        if (dart > 0.3) {
          const cx = topX * 0.45;
          const yAt = (x) => cbDrop + (-rise - cbDrop) * (x / topX);
          const len = front ? 9 : 13;
          marks.push({
            type: 'line', style: 'dart', label: 'dart',
            pts: [[cx - dart / 2, yAt(cx - dart / 2)], [cx, len], [cx + dart / 2, yAt(cx + dart / 2)]],
          });
        }
        if (elastic) {
          marks.push({ type: 'text', at: [qH * 0.5, -1.2], text: 'fold casing here' });
        }

        pieces.push(
          b.done({
            cut: 'Cut 1 on fold',
            grain: [[qH * 0.25, hd + 3], [qH * 0.25, m.length - 6]],
            label: [qH * 0.6, hd + (m.length - hd) * 0.35],
            marks,
          })
        );
      }

      if (!elastic) {
        const bandLen = m.waist + m.easeWaist + 3;
        pieces.push(
          rect('Waistband', m.band * 2, bandLen, { all: c.sa }, {
            cut: 'Cut 1 + interfacing',
            grain: [[m.band * 0.5, 4], [m.band * 0.5, bandLen - 4]],
            label: [m.band * 1.35, bandLen / 2],
            vertical: true,
            marks: [
              { type: 'line', style: 'fold', pts: [[m.band, 0], [m.band, bandLen]] },
              { type: 'line', style: 'guide', pts: [[0, bandLen - 3], [m.band * 2, bandLen - 3]] },
            ],
          })
        );
      }

      const hem = (m.hip + m.easeHip + m.flare * 4);
      return {
        pieces,
        warnings,
        facts: [
          ['Finished waist', elastic ? m.hip + m.easeHip : m.waist + m.easeWaist],
          ['Finished hip', m.hip + m.easeHip],
          ['Hem circumference', hem],
        ],
      };
    },
    stepsFor(o) {
      if (o.waist === 'elastic') {
        return [
          'Cut the front and back on the fold. Finish the raw side edges with a zigzag or serger if your fabric frays.',
          'With right sides together, sew both side seams. Press them open.',
          'Waist casing: press the top edge under 1 cm, then fold it down again along the stitch line. Stitch close to the lower fold, leaving a 5 cm gap.',
          'Cut elastic to your waist measurement minus 5 cm. Thread it through the casing with a safety pin, overlap the ends 2 cm and stitch them together. Close the gap.',
          'Press the hem up by the hem allowance (turn the raw edge under first) and topstitch.',
        ];
      }
      return [
        'Cut the front and back on the fold, plus the waistband. Iron interfacing onto half of the waistband\'s width.',
        'Sew the darts. Fold each dart right sides together so its lines match, stitch from the waist to the point, and press the darts toward the center.',
        'Sew the right side seam. Sew the left side seam only from 18 cm below the waist down to the hem. Insert an invisible zipper in the opening.',
        'Sew the interfaced edge of the waistband to the skirt waist, right sides together. Leave the 3 cm overlap at the back end of the zipper.',
        'Fold the waistband along the fold line, turn the raw edge under and stitch in the ditch from the right side. Add a hook and eye or a button at the overlap.',
        'Press the hem up by the hem allowance (turn the raw edge under first) and hand- or machine-stitch.',
      ];
    },
  };

  // ------------------------------------------------------------------
  // Pull-on pants / shorts
  // ------------------------------------------------------------------
  const pants = {
    id: 'pants',
    name: 'Pants',
    blurb: 'Relaxed elastic-waist pants or shorts',
    fabric: 'Woven cotton, linen, flannel, or a stable knit',
    icon: '<path d="M16 6 L48 6 L52 58 L37 58 L32 22 L27 58 L12 58 Z"/>',
    fields: [
      { key: 'hip', label: 'Hip', def: 102, circ: true, gAdd: 10, help: 'Around the fullest part of the seat.' },
      { key: 'rise', label: 'Crotch depth', def: 27, help: 'Sit on a flat chair and measure from your waist down to the seat.' },
      { key: 'inseam', label: 'Inseam', def: 76, help: 'From the crotch down to where the hem should fall.' },
      { key: 'legOpen', label: 'Leg opening', def: 44, help: 'Circumference of each hem. Wider means a looser leg.' },
      { key: 'ease', label: 'Ease', def: 10, gDef: 0, isEase: true, help: 'Extra room at the hip, so the pants can pull on over the hips.' },
      { key: 'elastic', label: 'Elastic width', def: 3 },
    ],
    options: [
      { key: 'length', label: 'Length', def: 'full', choices: [['full', 'Full length'], ['shorts', 'Shorts']],
        effects: { full: { inseam: 76, legOpen: 44 }, shorts: { inseam: 12, legOpen: 60 } } },
    ],
    defaults: { sa: 1.5, hem: 3 },
    build(m, o, c) {
      const warnings = [];
      const H = m.hip + m.ease;
      const Wf = H / 4 - 1, Wb = H / 4 + 1;
      const extF = H / 16, extB = H / 8 - 1;
      const cr = m.rise + (m.ease > 0 ? 2 : 0);
      const Ly = cr + m.inseam;
      const casing = m.elastic + 2;
      const fw = m.legOpen / 2 - 1, bw = m.legOpen / 2 + 1;
      const cF = (extF - Wf) / 2, cB = (extB - Wb) / 2;

      if (m.ease < 4) warnings.push('With less than 4 cm of ease, elastic-waist pants may not pull on over your hips.');
      if (fw > Wf + extF) warnings.push('Leg opening is wider than the thigh. Reduce the leg opening.');

      const front = draft('Pants front', [-Wf, 0])
        .line([0, 0], casing)
        .line([0, cr * 0.62], c.sa)
        .curve([0, cr * 0.9], [extF * 0.35, cr], [extF, cr], c.sa)
        .line([cF + fw / 2, Ly], c.sa)
        .line([cF - fw / 2, Ly], c.hem)
        .line([-Wf, cr], c.sa)
        .line([-Wf, 0], c.sa)
        .done({
          cut: 'Cut 2',
          grain: [[cF, cr + 3], [cF, Ly - 5]],
          label: [(-Wf + extF * 0.3) / 2, cr * 0.5],
          marks: [
            { type: 'line', style: 'guide', pts: [[-Wf, cr], [extF, cr]], label: 'crotch line' },
            { type: 'text', at: [-Wf / 2, -1.2], text: 'fold casing here' },
          ],
        });

      const back = draft('Pants back', [-Wb, 0])
        .line([-2, -3], casing)
        .line([0, cr * 0.6], c.sa)
        .curve([0.5, cr * 0.95], [extB * 0.4, cr + 1], [extB, cr + 1], c.sa)
        .line([cB + bw / 2, Ly], c.sa)
        .line([cB - bw / 2, Ly], c.hem)
        .line([-Wb, cr], c.sa)
        .line([-Wb, 0], c.sa)
        .done({
          cut: 'Cut 2',
          grain: [[cB, cr + 4], [cB, Ly - 5]],
          label: [(-Wb + extB * 0.3) / 2, cr * 0.5],
          marks: [
            { type: 'line', style: 'guide', pts: [[-Wb, cr + 1], [extB, cr + 1]], label: 'crotch line' },
            { type: 'dot', at: [-Wb + 3, cr * 0.25], label: 'back' },
          ],
        });

      return {
        pieces: [front, back],
        warnings,
        facts: [
          ['Finished hip', H],
          ['Waist opening (before elastic)', Wf * 2 + Geo.dist([-Wb, 0], [-2, -3]) * 2],
          ['Outseam', Ly],
        ],
      };
    },
    steps: [
      'Cut 2 fronts and 2 backs (a mirror-image pair of each). Mark the backs with chalk so you don\'t mix them up. The backs have the deeper crotch curve.',
      'Pair each front with its back, right sides together. Sew the outseam (side) and then the inseam of each leg separately.',
      'Turn one leg right side out and slip it inside the other leg so the right sides touch. Sew the whole crotch curve in one pass, from the front waist to the back waist. Sew it twice for strength.',
      'Clip the curve in the lower crotch area and finish the seam allowances.',
      'Casing: press the top edge under 1 cm, then fold it down along the stitch line. Stitch close to the lower fold, leaving a 5 cm gap.',
      'Cut elastic to your waist measurement minus 5 cm. Thread it through the casing, overlap the ends 2 cm and stitch them together. Close the gap.',
      'Press the hems up (turn the raw edge under first) and topstitch.',
    ],
  };

  // ------------------------------------------------------------------
  // Tote bag
  // ------------------------------------------------------------------
  const tote = {
    id: 'tote',
    name: 'Tote bag',
    blurb: 'Boxed-corner tote with shoulder straps',
    fabric: 'Canvas, denim, or duck cloth',
    noSizes: true,
    icon: '<path d="M10 22 L54 22 L50 58 L14 58 Z"/><path d="M22 22 Q22 6 32 6 Q42 6 42 22" fill="none"/>',
    fields: [
      { key: 'width', label: 'Finished width', def: 38 },
      { key: 'height', label: 'Finished height', def: 40 },
      { key: 'depth', label: 'Gusset depth', def: 10, help: 'Width of the flat base. 0 gives a flat bag.' },
      { key: 'strapLen', label: 'Strap length', def: 60 },
      { key: 'strapW', label: 'Strap width', def: 3 },
    ],
    options: [],
    defaults: { sa: 1, hem: 3 },
    build(m, o, c) {
      const warnings = [];
      const g = m.depth / 2;
      const Wt = m.width + m.depth;
      const Ht = m.height + g;

      const b = draft('Bag body', [0, 0]).line([Wt, 0], c.hem);
      if (g > 0.2) {
        b.line([Wt, Ht - g], c.sa)
          .line([Wt - g, Ht - g], c.sa)
          .line([Wt - g, Ht], c.sa)
          .line([g, Ht], c.sa)
          .line([g, Ht - g], c.sa)
          .line([0, Ht - g], c.sa);
      } else {
        b.line([Wt, Ht], c.sa).line([0, Ht], c.sa);
      }
      b.line([0, 0], c.sa);

      const strapCut = m.strapW * 4;
      return {
        pieces: [
          b.done({
            cut: 'Cut 2',
            grain: [[Wt * 0.2, 4], [Wt * 0.2, Ht - 6]],
            label: [Wt * 0.58, Ht * 0.45],
          }),
          rect('Strap', strapCut, m.strapLen, { all: 0 }, {
            cut: 'Cut 2',
            grain: [[m.strapW * 0.5, 3], [m.strapW * 0.5, m.strapLen - 3]],
            label: [strapCut * 0.62, m.strapLen / 2],
            vertical: true,
            marks: [1, 2, 3].map((k) => ({ type: 'line', style: 'fold', pts: [[m.strapW * k, 0], [m.strapW * k, m.strapLen]] })),
          }),
        ],
        warnings,
        facts: [
          ['Finished size (w × h × d)', [m.width, m.height, m.depth]],
        ],
      };
    },
    steps: [
      'Cut 2 bag bodies and 2 straps. Keep the grainline parallel to the selvage.',
      'Straps: fold each strap in half lengthwise and press. Open it, fold both long edges in to the center crease, then fold in half again. Edgestitch both long sides.',
      'Place the two bodies right sides together. Sew the sides and the bottom, but not the cut-out corner squares.',
      'Boxed corners: pull each corner open so the side seam lies on top of the bottom seam, forming a straight edge. Sew straight across.',
      'Top hem: press the top edge under 1 cm, then fold it under again by the rest of the hem allowance.',
      'Tuck the strap ends under the hem, 8 cm in from each side seam. Stitch around the hem, then stitch a box with an X over each strap end for strength.',
    ],
  };

  const list = [tee, skirt, pants, tote];
  const byId = Object.fromEntries(list.map((g) => [g.id, g]));

  return { list, byId, SIZES };
})();
