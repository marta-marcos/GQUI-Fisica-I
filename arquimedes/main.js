// arquimedes/main.js

const state = {
  mode: 'float',

  // Flotación libre
  float_rho:  600,    // kg/m³
  float_V:    1,       // L
  float_rhof: 1000,    // kg/m³
  float_g:    9.81,    // m/s²
  float_trajectories: [],
  float_nextColorIdx: 0,

  // Dinamómetro
  scale_rho:  2700,
  scale_V:    1,
  scale_rhof: 1000,
  scale_g:    9.81,
  scale_f:    0,        // 0..1

  paused: false,
};

let g_canvasScene, g_canvasGraph;
let g_animRunning  = false;
let g_animLastTime = null;

function floatParams() {
  return { rhoObj: state.float_rho, V: state.float_V / 1000, rhoFluid: state.float_rhof, g: state.float_g };
}
function scaleParams() {
  return { rhoObj: state.scale_rho, V: state.scale_V / 1000, rhoFluid: state.scale_rhof, g: state.scale_g };
}

function setMode(mode) {
  state.mode = mode;
  g_animRunning = false;
  updateModeUI();
  rerender();
}

function updateModeUI() {
  const isFloat = state.mode === 'float';
  document.getElementById('ctrl-float').hidden = !isFloat;
  document.getElementById('ctrl-scale').hidden = isFloat;
  document.getElementById('eq-float'  ).hidden = !isFloat;
  document.getElementById('eq-scale'  ).hidden = isFloat;
  document.getElementById('btn-mode-float').classList.toggle('active', isFloat);
  document.getElementById('btn-mode-scale').classList.toggle('active', !isFloat);
}

function rerender() {
  redraw();
  updateLiveStats();
  if (state.mode === 'float') updateLegend();
}

function redraw() {
  if (state.mode === 'float') {
    renderFloatScene(g_canvasScene, state.float_trajectories, floatParams());
    renderFloatGraph(g_canvasGraph, state.float_trajectories);
  } else {
    renderScaleScene(g_canvasScene, scaleParams(), state.scale_f);
    renderScaleGraph(g_canvasGraph, scaleParams(), state.scale_f);
  }
}

function updateLiveStats() {
  if (state.mode === 'float') {
    const p = floatParams();
    const a = floatAnalytics(p.rhoObj, p.V, p.rhoFluid, p.g);
    document.getElementById('stat-float-p').textContent = a.weight.toFixed(2) + ' N';
    document.getElementById('stat-float-e').textContent = a.buoyancy.toFixed(2) + ' N';
    document.getElementById('stat-float-f').textContent = (a.fSub * 100).toFixed(1) + ' %';
    document.getElementById('stat-float-state').textContent =
      a.neutral ? 'Equilibrio indiferente (densidades iguales)' :
      a.floating ? 'Flota' : 'Se hunde (reposa en el fondo)';
  } else {
    const p = scaleParams();
    const a = scaleAnalytics(p.rhoObj, p.V, p.rhoFluid, p.g);
    const r = scaleReading(p.rhoObj, p.V, p.rhoFluid, p.g, state.scale_f);
    document.getElementById('stat-scale-p').textContent = a.weight.toFixed(2) + ' N';
    document.getElementById('stat-scale-e').textContent = r.buoyancy.toFixed(2) + ' N';
    document.getElementById('stat-scale-reading').textContent = r.reading.toFixed(2) + ' N';
    document.getElementById('stat-scale-emax').textContent = a.buoyMax.toFixed(2) + ' N';
    document.getElementById('lbl-scale-f').textContent = Math.round(state.scale_f * 100) + ' %';
  }
}

function updateLegend() {
  const ul = document.getElementById('legend-list');
  ul.innerHTML = '';
  state.float_trajectories.forEach((tr, i) => {
    const li = document.createElement('li');
    li.className = 'legend-item';
    const estado = tr.neutral ? 'indiferente' : (tr.floating ? 'flota' : 'se hunde');
    li.innerHTML = `
      <span class="legend-swatch" style="background:${tr.color}"></span>
      <span class="legend-params">
        ρ_obj=${tr.params.rhoObj} kg/m³, V=${(tr.params.V * 1000).toFixed(2)} L, ρ_fluido=${tr.params.rhoFluid} kg/m³
      </span>
      <span class="legend-results">f=${(tr.fSub * 100).toFixed(1)}%, ${estado}</span>
      <button class="legend-remove" data-idx="${i}" title="Eliminar">×</button>
    `;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.legend-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.float_trajectories.splice(parseInt(btn.dataset.idx, 10), 1);
      rerender();
    });
  });
}

function launch() {
  const p  = floatParams();
  const tr = sampleFloat(p.rhoObj, p.V, p.rhoFluid, p.g);
  tr.color       = colorFor(state.float_nextColorIdx++);
  tr.params      = p;
  tr.animElapsed = 0;
  state.float_trajectories.push(tr);
  if (!state.paused) startAnimLoop();
  rerender();
}

function togglePause() {
  state.paused = !state.paused;
  document.getElementById('btn-float-pause').textContent = state.paused ? 'Reanudar' : 'Pausar';
  if (!state.paused) startAnimLoop();
  redraw();
}

function clearAll() {
  state.float_trajectories = [];
  state.float_nextColorIdx = 0;
  rerender();
}

function resetScaleDepth() {
  state.scale_f = 0;
  document.getElementById('inp-scale-f').value = 0;
  rerender();
}

function startAnimLoop() {
  if (g_animRunning) return;
  g_animRunning  = true;
  g_animLastTime = null;
  requestAnimationFrame(animTick);
}

function animTick(timestamp) {
  if (!g_animRunning) return;
  if (state.paused) { g_animRunning = false; return; }
  if (g_animLastTime === null) g_animLastTime = timestamp;
  const dt = (timestamp - g_animLastTime) / 1000;
  g_animLastTime = timestamp;

  let anyAnimating = false;
  for (const tr of state.float_trajectories) {
    if (tr.animElapsed < tr.tEnd) {
      tr.animElapsed = Math.min(tr.tEnd, tr.animElapsed + dt);
      if (tr.animElapsed < tr.tEnd) anyAnimating = true;
    }
  }

  redraw();

  if (anyAnimating) requestAnimationFrame(animTick);
  else              g_animRunning = false;
}

function initAll() {
  g_canvasScene = document.getElementById('canvas-scene');
  g_canvasGraph = document.getElementById('canvas-graph');

  const obs = new ResizeObserver(rerender);
  obs.observe(g_canvasScene.parentElement);
  obs.observe(g_canvasGraph.parentElement);

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
  }

  updateModeUI();
  rerender();
}

window.state           = state;
window.launch          = launch;
window.clearAll        = clearAll;
window.rerender        = rerender;
window.setMode         = setMode;
window.togglePause     = togglePause;
window.resetScaleDepth = resetScaleDepth;

window.addEventListener('load', initAll);
