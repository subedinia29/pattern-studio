/*
 * UI wiring: garment picker, measurement form, live pattern output,
 * SVG download and tiled printing. All measurements are stored in cm.
 */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const CM_PER_IN = 2.54;
  const STORE_KEY = 'pattern-studio-v1';

  const COMMON_FIELDS = [
    { key: 'sa', label: 'Seam allowance' },
    { key: 'hem', label: 'Hem allowance' },
    { key: 'fabricWidth', label: 'Fabric width', help: 'Usually 110–150 cm (44–60 in).' },
  ];

  const state = {
    garment: 'tee',
    mode: 'body',
    unit: 'cm',
    size: 'M',
    tab: 'pieces',
    zoom: 1,
    photo: null,
    perGarment: {}, // id -> { values, options, common }
  };

  let current = null; // last build result

  // ---------------------------------------------------------------- storage
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved) Object.assign(state, saved, { photo: null });
    } catch { /* storage unavailable */ }
    try { state.photo = sessionStorage.getItem(STORE_KEY + '-photo'); } catch { /* ignore */ }
  }
  function save() {
    try {
      const { photo, ...rest } = state;
      localStorage.setItem(STORE_KEY, JSON.stringify(rest));
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- units
  const toDisplay = (cm) => {
    if (state.unit === 'in') return Math.round((cm / CM_PER_IN) * 8) / 8;
    return Math.round(cm * 10) / 10;
  };
  const fromDisplay = (v) => (state.unit === 'in' ? v * CM_PER_IN : v);
  const fmt = (cm) => `${toDisplay(cm)} ${state.unit}`;

  // ---------------------------------------------------------------- per-garment data
  function gdata(id = state.garment) {
    const g = Garments.byId[id];
    if (!state.perGarment[id]) {
      const values = {}, options = {};
      g.fields.forEach((fd) => (values[fd.key] = fd.def));
      g.options.forEach((op) => (options[op.key] = op.def));
      state.perGarment[id] = {
        values, options,
        common: { sa: g.defaults.sa, hem: g.defaults.hem, fabricWidth: 150 },
      };
      applySize(id, state.size);
      applyMode(id);
    }
    // New fields added in later versions.
    const d = state.perGarment[id];
    g.fields.forEach((fd) => { if (typeof d.values[fd.key] !== 'number') d.values[fd.key] = fd.def; });
    return d;
  }

  /** Fill circumference measurements from the size table. */
  function applySize(id, size) {
    const g = Garments.byId[id];
    const d = state.perGarment[id];
    const row = Garments.SIZES[size];
    if (!row || g.noSizes) return;
    g.fields.forEach((fd) => {
      if (row[fd.key] == null) return;
      d.values[fd.key] = row[fd.key] + (state.mode === 'garment' && fd.gAdd ? fd.gAdd : 0);
    });
  }

  /** Switching source mode resets ease so garment measurements are copied as-is. */
  function applyMode(id) {
    const g = Garments.byId[id];
    const d = state.perGarment[id];
    g.fields.forEach((fd) => {
      if (fd.isEase) d.values[fd.key] = state.mode === 'garment' ? (fd.gDef ?? 0) : fd.def;
    });
  }

  // ---------------------------------------------------------------- UI building
  function renderGarmentGrid() {
    $('#garment-grid').innerHTML = Garments.list.map((g) => `
      <button type="button" class="garment-card${g.id === state.garment ? ' active' : ''}" data-garment="${g.id}" aria-pressed="${g.id === state.garment}">
        <svg viewBox="0 0 64 64" aria-hidden="true">${g.icon}</svg>
        <span class="g-name">${g.name}</span>
        <span class="g-blurb">${g.blurb}</span>
      </button>`).join('');
  }

  function fieldHelp(fd) {
    if (state.mode === 'garment' && fd.circ) {
      return 'Lay the garment flat, measure straight across, then double it.';
    }
    if (state.mode === 'garment' && fd.isEase) {
      return 'Keep this at 0 to copy the garment exactly. It already has its ease built in.';
    }
    return fd.help || '';
  }

  function numberInput(key, label, cm, help, group) {
    const step = state.unit === 'in' ? 0.125 : 0.5;
    return `
      <label class="field">
        <span class="f-label">${label}</span>
        <span class="f-input">
          <input type="number" inputmode="decimal" min="0" step="${step}" value="${toDisplay(cm)}" data-key="${key}" data-group="${group}">
          <em>${state.unit}</em>
        </span>
        ${help ? `<small>${help}</small>` : ''}
      </label>`;
  }

  function renderForm() {
    const g = Garments.byId[state.garment];
    const d = gdata();

    $$('.mode-toggle .seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode));
    $$('.unit-toggle .seg').forEach((b) => b.classList.toggle('active', b.dataset.unit === state.unit));
    $('#mode-hint').textContent = state.mode === 'garment'
      ? 'Measure a piece of clothing that fits you well. The pattern will reproduce its size.'
      : 'Measure snugly over light clothing. Ease is added so the garment isn\'t skin-tight.';
    $('#size-select').closest('.row').hidden = !!g.noSizes;
    $('#size-select').value = state.size || '';

    $('#fields').innerHTML = g.fields
      .filter((fd) => !fd.showIf || fd.showIf(d.options))
      .map((fd) => numberInput(fd.key, fd.label, d.values[fd.key], fieldHelp(fd), 'values'))
      .join('');

    $('#options').innerHTML = g.options.map((op) => `
      <div class="field">
        <span class="f-label">${op.label}</span>
        <div class="chips" role="group">
          ${op.choices.map(([v, l]) => `<button type="button" class="chip${d.options[op.key] === v ? ' active' : ''}" data-opt="${op.key}" data-val="${v}">${l}</button>`).join('')}
        </div>
      </div>`).join('');

    $('#common-fields').innerHTML = COMMON_FIELDS
      .map((fd) => numberInput(fd.key, fd.label, d.common[fd.key], fd.help, 'common'))
      .join('');
  }

  function renderPhoto() {
    const has = !!state.photo;
    $('#photo-preview').hidden = !has;
    $('#photo-clear').hidden = !has;
    $('#dropzone').classList.toggle('has-photo', has);
    if (has) $('#photo-preview').src = state.photo;
    $('#steps-photo').hidden = !has;
    if (has) $('#steps-photo').src = state.photo;
  }

  // ---------------------------------------------------------------- output
  function build() {
    const g = Garments.byId[state.garment];
    const d = gdata();
    const warnings = [];
    for (const fd of g.fields) {
      if (!(d.values[fd.key] >= 0)) warnings.push(`${fd.label} needs a valid number.`);
    }
    let result;
    try {
      result = g.build(d.values, d.options, d.common);
    } catch (err) {
      console.error(err);
      result = { pieces: [], warnings: ['Those measurements could not be drafted. Check for unusual values.'], facts: [] };
    }
    const preps = result.pieces.map(Render.prepare);
    const sizeLabel = g.noSizes ? '' : state.size ? `size ${state.size}` : 'custom';
    const ctx = { subtitle: [g.name, sizeLabel].filter(Boolean).join(' · ') };
    const sheet = preps.length ? Render.sheet(preps, ctx, { grid: true }) : null;
    const plain = preps.length ? Render.sheet(preps, ctx, { grid: false }) : null;
    const layout = preps.length ? Render.cuttingLayout(preps, d.common.fabricWidth) : null;
    current = { g, d, preps, sheet, plain, layout, result, warnings: [...warnings, ...result.warnings] };
  }

  function renderOutput() {
    if (!current) return;
    const { g, sheet, layout, result, preps, d } = current;

    const warnings = [...current.warnings];
    if (layout && layout.tooWide.length) {
      warnings.push(`${layout.tooWide.join(', ')} ${layout.tooWide.length > 1 ? 'are' : 'is'} wider than your folded fabric. Cut on a single open layer instead.`);
    }
    $('#warnings').innerHTML = warnings.map((w) => `<div class="warn">${w}</div>`).join('');

    const meters = layout ? (layout.length + 10) / 100 : 0;
    const yards = meters * 1.0936;
    const factValue = (v) => (Array.isArray(v) ? `${v.map(toDisplay).join(' × ')} ${state.unit}` : fmt(v));
    const facts = result.facts.map(([k, v]) => `<div class="fact"><span>${k}</span><strong>${factValue(v)}</strong></div>`);
    facts.push(`<div class="fact"><span>Fabric needed</span><strong>${state.unit === 'in' ? `${(Math.ceil(yards * 4) / 4).toFixed(2)} yd` : `${(Math.ceil(meters * 10) / 10).toFixed(1)} m`}</strong><small>${fmt(d.common.fabricWidth)} wide</small></div>`);
    facts.push(`<div class="fact"><span>Pieces</span><strong>${preps.length}</strong><small>${g.fabric}</small></div>`);
    $('#summary').innerHTML = facts.join('');

    if (sheet) {
      // 100% zoom = fit the sheet to the canvas width.
      const avail = ($('.output').clientWidth || 900) - 2;
      const px = (avail / sheet.width) * state.zoom;
      const layoutPx = Math.min(avail / layout.width, 4);
      $('#pieces-canvas').innerHTML = Render.svgDoc(sheet.inner, sheet.width, sheet.height, { pxPerCm: px });
      $('#layout-canvas').innerHTML = Render.svgDoc(layout.inner, layout.width, layout.height, { pxPerCm: layoutPx });
      $('#layout-note').textContent =
        `Fold the fabric in half lengthwise so the selvages meet. Pieces marked "Cut 2" are cut once through both layers, giving a mirrored pair. The fabric estimate adds 10 cm (4 in) for shrinkage and straightening.`;
    } else {
      $('#pieces-canvas').innerHTML = '';
      $('#layout-canvas').innerHTML = '';
    }
    $('#zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;

    const steps = g.stepsFor ? g.stepsFor(d.options) : g.steps;
    $('#steps-list').innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  }

  function refresh({ form = false } = {}) {
    if (form) renderForm();
    build();
    renderOutput();
    save();
  }

  let pending = 0;
  function refreshSoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => refresh());
  }

  function setTab(tab) {
    state.tab = tab;
    $$('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', t.dataset.tab === tab);
    });
    $$('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    $('#zoom-ctl').style.visibility = tab === 'pieces' ? 'visible' : 'hidden';
    save();
  }

  // ---------------------------------------------------------------- export / print
  function download() {
    if (!current?.plain) return;
    const { plain, g } = current;
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + Render.svgDoc(plain.inner, plain.width, plain.height, { physical: true });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${g.id}-pattern${state.size && !g.noSizes ? '-' + state.size : ''}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function pageCount() {
    if (!current?.plain) return;
    const t = Render.tiles(current.plain, $('#paper-select').value);
    $('#page-count').textContent = `${t.pages.length + 1} pages: a cover page plus ${t.pages.length} tiles on a ${t.rows} × ${t.cols} grid (blank tiles are skipped).`;
  }

  function preparePrint(paperKey) {
    const { plain, g, d } = current;
    const t = Render.tiles(plain, paperKey);
    let style = document.getElementById('page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-style';
      document.head.appendChild(style);
    }
    const pw = t.paper.w, ph = t.paper.h;
    const mx = ((pw - t.paper.tileW) / 2).toFixed(2), my = ((ph - t.paper.tileH) / 2).toFixed(2);
    style.textContent = `@page { size: ${t.paper.name === 'A4' ? 'A4' : 'letter'}; margin: ${my}cm ${mx}cm; }
      .print-page { width: ${t.paper.tileW}cm; height: ${t.paper.tileH}cm; }`;

    const map = [];
    for (let r = 0; r < t.rows; r++) {
      map.push('<tr>' + Array.from({ length: t.cols }, (_, c) => {
        const id = `${String.fromCharCode(65 + r)}${c + 1}`;
        return t.used.has(id) ? `<td>${id}</td>` : '<td class="blank"></td>';
      }).join('') + '</tr>');
    }
    const cover = `
      <div class="print-page cover">
        <h1>${g.name} pattern</h1>
        <p>${current.preps.map((p) => `${p.piece.name} (${p.piece.cut})`).join(' · ')}</p>
        <p>Seam allowance ${fmt(d.common.sa)} and hem ${fmt(d.common.hem)} are included. The dashed line is the stitch line.</p>
        <div class="test">
          <div class="sq cm"><span>5 cm</span></div>
          <div class="sq in"><span>2 in</span></div>
        </div>
        <p>If the squares measure correctly, your printer is at 100% scale. Trim or fold under the right and bottom margins, then match each page to its neighbours using the labels.</p>
        <table class="tile-map">${map.join('')}</table>
      </div>`;
    $('#print-area').innerHTML = cover + t.pages.map((p) => `<div class="print-page">${p.svg}</div>`).join('');
  }

  // ---------------------------------------------------------------- events
  function bind() {
    $('#garment-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-garment]');
      if (!card) return;
      state.garment = card.dataset.garment;
      renderGarmentGrid();
      refresh({ form: true });
    });

    $$('.unit-toggle .seg').forEach((b) => b.addEventListener('click', () => {
      state.unit = b.dataset.unit;
      refresh({ form: true });
    }));

    $$('.mode-toggle .seg').forEach((b) => b.addEventListener('click', () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      applyMode(state.garment);
      if (state.size) applySize(state.garment, state.size);
      refresh({ form: true });
    }));

    $('#size-select').addEventListener('change', (e) => {
      state.size = e.target.value;
      if (state.size) applySize(state.garment, state.size);
      refresh({ form: true });
    });

    document.addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-key]');
      if (!inp) return;
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v) || v < 0) return;
      const d = gdata();
      const bucket = inp.dataset.group === 'common' ? d.common : d.values;
      bucket[inp.dataset.key] = fromDisplay(v);
      const fd = Garments.byId[state.garment].fields.find((x) => x.key === inp.dataset.key);
      if (fd && Garments.SIZES.M[fd.key] != null && state.size) {
        state.size = '';
        $('#size-select').value = '';
      }
      refreshSoon();
    });

    $('#options').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-opt]');
      if (!chip) return;
      const g = Garments.byId[state.garment];
      const d = gdata();
      const op = g.options.find((o) => o.key === chip.dataset.opt);
      d.options[op.key] = chip.dataset.val;
      Object.assign(d.values, op.effects?.[chip.dataset.val] || {});
      refresh({ form: true });
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

    const setZoom = (z) => {
      state.zoom = Math.min(4, Math.max(0.5, z));
      renderOutput();
      save();
    };
    $('#zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.25));
    $('#zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.25));

    $('#download-svg').addEventListener('click', download);
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderOutput, 120);
    });

    const dlg = $('#print-dialog');
    $('#print-btn').addEventListener('click', () => {
      if (!current?.plain) return;
      pageCount();
      dlg.showModal();
    });
    $('#paper-select').addEventListener('change', pageCount);
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'print') return;
      preparePrint($('#paper-select').value);
      setTimeout(() => window.print(), 50);
    });

    // Photo upload (click or drag & drop).
    const readPhoto = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.photo = reader.result;
        try { sessionStorage.setItem(STORE_KEY + '-photo', state.photo); } catch { /* too large; keep in memory */ }
        renderPhoto();
      };
      reader.readAsDataURL(file);
    };
    $('#photo-input').addEventListener('change', (e) => readPhoto(e.target.files[0]));
    const dz = $('#dropzone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
      readPhoto(e.dataTransfer.files[0]);
    });
    $('#photo-clear').addEventListener('click', (e) => {
      e.preventDefault();
      state.photo = null;
      $('#photo-input').value = '';
      try { sessionStorage.removeItem(STORE_KEY + '-photo'); } catch { /* ignore */ }
      renderPhoto();
    });
  }

  // ---------------------------------------------------------------- init
  load();
  if (!Garments.byId[state.garment]) state.garment = 'tee';
  renderGarmentGrid();
  bind();
  renderPhoto();
  setTab(state.tab || 'pieces');
  refresh({ form: true });
})();
