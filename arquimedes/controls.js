// arquimedes/controls.js

window.addEventListener('load', () => {

  // ── Mode toggle ────────────────────────────────────────────────────────────
  document.getElementById('btn-mode-float').addEventListener('click', () => setMode('float'));
  document.getElementById('btn-mode-scale').addEventListener('click', () => setMode('scale'));

  function populateSelect(sel, list) {
    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.rho;
      opt.textContent = `${item.name} (${item.rho} kg/m³)`;
      sel.appendChild(opt);
    });
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Personalizado';
    sel.appendChild(custom);
  }

  // Links a <select> of presets with a numeric density input and a state key.
  function bindDensity(selId, inpId, key, list) {
    const sel = document.getElementById(selId);
    const inp = document.getElementById(inpId);
    populateSelect(sel, list);
    const match = list.find(item => item.rho === state[key]);
    sel.value = match ? match.rho : '';

    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      inp.value = sel.value;
      state[key] = parseFloat(sel.value);
      rerender();
    });
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      state[key] = v;
      const found = list.find(item => item.rho === v);
      sel.value = found ? found.rho : '';
      rerender();
    });
  }

  function bindNumber(id, key, min = null) {
    const el = document.getElementById(id);
    el.value = state[key];
    el.addEventListener('input', () => {
      let v = parseFloat(el.value);
      if (!Number.isFinite(v)) return;
      if (min !== null) v = Math.max(min, v);
      state[key] = v;
      rerender();
    });
  }

  // ── Float mode ─────────────────────────────────────────────────────────────
  bindDensity('sel-float-material', 'inp-float-rho',  'float_rho',  MATERIALS);
  bindDensity('sel-float-fluid',    'inp-float-rhof', 'float_rhof', FLUIDS);
  bindNumber('inp-float-V', 'float_V', 0.01);
  bindNumber('inp-float-g', 'float_g', 0.01);

  document.getElementById('btn-float-launch').addEventListener('click', launch);
  document.getElementById('btn-float-pause' ).addEventListener('click', togglePause);
  document.getElementById('btn-float-clear' ).addEventListener('click', clearAll);

  document.querySelectorAll('#ctrl-float input[type=number]').forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') launch(); })
  );

  // ── Scale (dynamometer) mode ──────────────────────────────────────────────
  bindDensity('sel-scale-material', 'inp-scale-rho',  'scale_rho',  MATERIALS);
  bindDensity('sel-scale-fluid',    'inp-scale-rhof', 'scale_rhof', FLUIDS);
  bindNumber('inp-scale-V', 'scale_V', 0.01);
  bindNumber('inp-scale-g', 'scale_g', 0.01);

  const fSlider = document.getElementById('inp-scale-f');
  fSlider.addEventListener('input', () => {
    state.scale_f = parseFloat(fSlider.value) / 100;
    rerender();
  });

  document.getElementById('btn-scale-reset').addEventListener('click', resetScaleDepth);
});
