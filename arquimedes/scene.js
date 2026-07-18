// arquimedes/scene.js

const PALETTE = [
  '#2d7d9a', '#e07a5f', '#3aa776', '#b06ab3',
  '#d4a23c', '#5fb3d4', '#ee5253', '#10ac84',
];
function colorFor(index) { return PALETTE[index % PALETTE.length]; }

function isDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function niceStep(range) {
  if (range <= 0) return 1;
  const target = range / 6;
  const exp    = Math.floor(Math.log10(target));
  const base   = target / Math.pow(10, exp);
  let nice;
  if      (base < 1.5) nice = 1;
  else if (base < 3)   nice = 2;
  else if (base < 7)   nice = 5;
  else                 nice = 10;
  return nice * Math.pow(10, exp);
}

function setupCanvas(canvas) {
  const ctx  = canvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, cssW, cssH };
}

function darkColors() {
  const dark = isDarkMode();
  return {
    bg:    dark ? '#222831' : '#ffffff',
    axis:  dark ? '#7a8595' : '#5a6776',
    grid:  dark ? '#3b4252' : '#e2e8f0',
    text:  dark ? '#d0d8e4' : '#1f2937',
    muted: dark ? '#8f9ba8' : '#6b7280',
    edge:  dark ? '#7a8595' : '#8899aa',
    fluid: dark ? 'rgba(95,179,212,0.28)' : 'rgba(45,125,154,0.16)',
    cube:  dark ? '#5fb3d4' : '#2d7d9a',
  };
}

function interpFloat(points, t) {
  if (points.length === 0) return { y: 0, d: 0, Vsub: 0, buoyancy: 0, f: 0 };
  if (points.length === 1 || t <= points[0].t) return points[0];
  if (t >= points[points.length - 1].t) return points[points.length - 1];
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid].t <= t) lo = mid; else hi = mid; }
  const a = points[lo], b = points[hi];
  const u = (t - a.t) / (b.t - a.t);
  return {
    y: a.y + u * (b.y - a.y),
    d: a.d + u * (b.d - a.d),
    Vsub: a.Vsub + u * (b.Vsub - a.Vsub),
    buoyancy: a.buoyancy + u * (b.buoyancy - a.buoyancy),
    f: a.f + u * (b.f - a.f),
  };
}

// Draws the container walls + fluid fill + surface line, returns the pixel
// geometry so callers can place objects inside it.
function drawContainer(ctx, contX, contW, padT, surfaceY, bottomY, c) {
  ctx.strokeStyle = c.edge; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contX, padT);
  ctx.lineTo(contX, bottomY);
  ctx.lineTo(contX + contW, bottomY);
  ctx.lineTo(contX + contW, padT);
  ctx.stroke();

  ctx.fillStyle = c.fluid;
  ctx.fillRect(contX, surfaceY, contW, bottomY - surfaceY);

  ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(contX, surfaceY); ctx.lineTo(contX + contW, surfaceY); ctx.stroke();

  ctx.fillStyle = c.muted; ctx.font = '11px DM Sans, system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('superficie', contX + 4, surfaceY - 3);
}

// Vertical labeled force arrow anchored at (x, y1), pointing to (x, y2).
function drawForceArrow(ctx, x, y1, y2, color, label) {
  const len = Math.abs(y2 - y1);
  if (len < 2) return;
  const dir = y2 > y1 ? 1 : -1;

  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();

  const headLen = Math.min(10, len * 0.4);
  const headW   = headLen * 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y2);
  ctx.lineTo(x - headW, y2 - dir * headLen);
  ctx.lineTo(x + headW, y2 - dir * headLen);
  ctx.closePath();
  ctx.fill();

  ctx.font = 'bold 12px DM Sans, system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 10, (y1 + y2) / 2);
  ctx.restore();
}

// ─── MODE 1: escena de flotación ──────────────────────────────────────────────

function renderFloatScene(canvas, trajectories, params) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const c = darkColors();
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, cssW, cssH);

  const latestTr = trajectories.length > 0 ? trajectories[trajectories.length - 1] : null;
  const Lcur = cubeSide(params.V);
  const Ltr  = latestTr ? latestTr.L : Lcur;
  const Lmax = Math.max(Lcur, Ltr);
  const contDepth = containerDepth(Lmax);

  const padL = 30, padR = 30, padT = 34, padB = 20;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const yMax = Lmax * 1.05;
  const yMin = -contDepth;
  const scale = plotH / (yMax - yMin);
  const toY = y => padT + (yMax - y) * scale;
  const surfaceY = toY(0);
  const bottomY  = toY(yMin);

  const contW = Math.min(plotW * 0.7, Math.max(160, Lmax * scale * 3.2));
  const contX = padL + (plotW - contW) / 2;
  const cx = contX + contW / 2;

  drawContainer(ctx, contX, contW, padT, surfaceY, bottomY, c);

  // Dashed preview: equilibrium position for the CURRENT input parameters.
  const a = floatAnalytics(params.rhoObj, params.V, params.rhoFluid, params.g);
  const dEq = a.fSub * a.L;
  const yEqCenter = -dEq + a.L / 2;
  const halfCur = a.L * scale / 2;
  ctx.strokeStyle = c.muted; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  ctx.strokeRect(cx - halfCur, toY(yEqCenter) - halfCur, a.L * scale, a.L * scale);
  ctx.setLineDash([]);

  // Solid animated cube for the most recently dropped object.
  if (latestTr) {
    const tNow = Math.max(0, Math.min(latestTr.tEnd, latestTr.animElapsed ?? latestTr.tEnd));
    const pt = interpFloat(latestTr.points, tNow);
    const half = latestTr.L * scale / 2;
    const cy = toY(pt.y);

    ctx.fillStyle = latestTr.color; ctx.strokeStyle = c.bg; ctx.lineWidth = 2;
    ctx.fillRect(cx - half, cy - half, latestTr.L * scale, latestTr.L * scale);
    ctx.strokeRect(cx - half, cy - half, latestTr.L * scale, latestTr.L * scale);

    const Fref = Math.max(latestTr.m * params.g, 1e-9);
    const arrowMax = Math.min(60, plotH * 0.3);
    const wLen = (latestTr.m * params.g / Fref) * arrowMax;
    const bLen = (pt.buoyancy / Fref) * arrowMax;
    drawForceArrow(ctx, cx, cy, cy + wLen, '#ee5253', 'P');
    if (bLen > 2) drawForceArrow(ctx, cx, cy, cy - bLen, '#5fb3d4', 'E');
  }

  ctx.fillStyle = c.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '11px DM Sans, system-ui, sans-serif';
  ctx.fillText('Flotación — línea discontinua: equilibrio previsto', padL, 8);
}

function drawFCurveUpTo(ctx, points, tCut, toX, toY) {
  if (points.length < 2 || tCut <= 0) return;
  ctx.beginPath();
  ctx.moveTo(toX(points[0].t), toY(points[0].f));
  let i = 1;
  for (; i < points.length && points[i].t <= tCut; i++) ctx.lineTo(toX(points[i].t), toY(points[i].f));
  if (i < points.length) {
    const a = points[i - 1], b = points[i];
    const u = (tCut - a.t) / (b.t - a.t);
    ctx.lineTo(toX(tCut), toY(a.f + u * (b.f - a.f)));
  }
  ctx.stroke();
}

function renderFloatGraph(canvas, trajectories) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const c = darkColors();
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, cssW, cssH);

  const padL = 56, padR = 18, padT = 24, padB = 36;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  let tMax = 1;
  trajectories.forEach(tr => { if (tr.tEnd > tMax) tMax = tr.tEnd; });

  const toX = t => padL + (t / tMax) * plotW;
  const toY = f => padT + plotH - (f / 100) * plotH;

  ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.muted;
  ctx.font = '11px DM Sans, system-ui, sans-serif';

  const xStep = niceStep(tMax);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = 0; v <= tMax; v += xStep) {
    const X = toX(v);
    ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, padT + plotH); ctx.stroke();
    ctx.fillText(v.toFixed(xStep < 1 ? 1 : 0), X, padT + plotH + 6);
  }
  const yStep = niceStep(100);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= 100; v += yStep) {
    const Y = toY(v);
    ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(padL + plotW, Y); ctx.stroke();
    ctx.fillText(v.toFixed(0), padL - 6, Y);
  }

  ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

  ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = '12px DM Sans, system-ui, sans-serif';
  ctx.fillText('t  (s)', padL + plotW / 2, cssH - 4);
  ctx.save(); ctx.translate(14, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('% sumergido', 0, 0); ctx.restore();

  ctx.fillStyle = c.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Fracción sumergida vs. tiempo', padL + 6, padT + 5);

  trajectories.forEach(tr => {
    const tNow = Math.max(0, Math.min(tr.tEnd, tr.animElapsed ?? tr.tEnd));

    ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = tr.color; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    const fEq = tr.fSub * 100;
    ctx.beginPath(); ctx.moveTo(padL, toY(fEq)); ctx.lineTo(padL + plotW, toY(fEq)); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();

    ctx.strokeStyle = tr.color; ctx.lineWidth = 2.2;
    drawFCurveUpTo(ctx, tr.points, tNow, toX, toY);

    const pt = interpFloat(tr.points, tNow);
    ctx.fillStyle = tr.color; ctx.strokeStyle = c.bg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(toX(tNow), toY(pt.f), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
}

// ─── MODE 2: escena del dinamómetro ───────────────────────────────────────────

function renderScaleScene(canvas, params, f) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const c = darkColors();
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, cssW, cssH);

  const L = cubeSide(params.V);
  const contDepth = containerDepth(L);

  const padL = 30, padR = 30, padT = 50, padB = 20;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const yMax = L * 1.6;   // holgura arriba para el hilo y el dinamómetro
  const yMin = -contDepth;
  const scale = plotH / (yMax - yMin);
  const toY = y => padT + (yMax - y) * scale;
  const surfaceY = toY(0);
  const bottomY  = toY(yMin);

  const contW = Math.min(plotW * 0.7, Math.max(160, L * scale * 3.2));
  const contX = padL + (plotW - contW) / 2;
  const cx = contX + contW / 2;

  drawContainer(ctx, contX, contW, padT, surfaceY, bottomY, c);

  // Soporte + dinamómetro
  const standTopY = 6;
  const scaleBoxY = standTopY + 4;
  const scaleBoxH = 26;
  ctx.strokeStyle = c.edge; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, scaleBoxY); ctx.stroke();

  const { reading, buoyancy } = scaleReading(params.rhoObj, params.V, params.rhoFluid, params.g, f);
  const boxW = 74;
  ctx.fillStyle = c.bg; ctx.strokeStyle = c.edge; ctx.lineWidth = 1.5;
  ctx.fillRect(cx - boxW / 2, scaleBoxY, boxW, scaleBoxH);
  ctx.strokeRect(cx - boxW / 2, scaleBoxY, boxW, scaleBoxH);
  ctx.fillStyle = c.text; ctx.font = 'bold 13px DM Sans, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(reading.toFixed(2) + ' N', cx, scaleBoxY + scaleBoxH / 2);

  // Hilo + cubo
  const d = f * L;
  const centerY = -d + L / 2;
  const cubeCY  = toY(centerY);
  const half    = L * scale / 2;

  ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, scaleBoxY + scaleBoxH); ctx.lineTo(cx, cubeCY - half); ctx.stroke();

  ctx.fillStyle = c.cube; ctx.strokeStyle = c.bg; ctx.lineWidth = 2;
  ctx.fillRect(cx - half, cubeCY - half, L * scale, L * scale);
  ctx.strokeRect(cx - half, cubeCY - half, L * scale, L * scale);

  const weight = params.rhoObj * params.V * params.g;
  const Fref = Math.max(weight, 1e-9);
  const arrowMax = Math.min(50, plotH * 0.22);
  const wLen = (weight / Fref) * arrowMax;
  const bLen = (buoyancy / Fref) * arrowMax;
  drawForceArrow(ctx, cx, cubeCY, cubeCY + wLen, '#ee5253', 'P');
  if (bLen > 2) drawForceArrow(ctx, cx, cubeCY, cubeCY - bLen, '#5fb3d4', 'E');

  ctx.fillStyle = c.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '11px DM Sans, system-ui, sans-serif';
  ctx.fillText('Dinamómetro', padL, cssH - 14);
}

function renderScaleGraph(canvas, params, f) {
  const { ctx, cssW, cssH } = setupCanvas(canvas);
  const c = darkColors();
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, cssW, cssH);

  const padL = 64, padR = 18, padT = 24, padB = 36;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const weight    = params.rhoObj * params.V * params.g;
  const buoyMax   = params.rhoFluid * params.V * params.g;
  const readingMin = weight - buoyMax;

  const eMax = Math.max(weight, 1) * 1.15;
  const eMin = Math.min(0, readingMin) * 1.15;

  const toX = pct => padL + (pct / 100) * plotW;
  const toY = e => padT + plotH - ((e - eMin) / (eMax - eMin)) * plotH;

  ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.muted;
  ctx.font = '11px DM Sans, system-ui, sans-serif';

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = 0; v <= 100; v += 20) {
    const X = toX(v);
    ctx.beginPath(); ctx.moveTo(X, padT); ctx.lineTo(X, padT + plotH); ctx.stroke();
    ctx.fillText(v.toFixed(0), X, padT + plotH + 6);
  }
  const yStep = niceStep(eMax - eMin);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(eMin / yStep) * yStep; v <= eMax; v += yStep) {
    const Y = toY(v);
    ctx.beginPath(); ctx.moveTo(padL, Y); ctx.lineTo(padL + plotW, Y); ctx.stroke();
    ctx.fillText(v.toFixed(1), padL - 6, Y);
  }

  ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

  if (eMin < 0) {
    ctx.strokeStyle = c.axis; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, toY(0)); ctx.lineTo(padL + plotW, toY(0)); ctx.stroke();
  }

  // Referencia: peso en aire (P constante)
  ctx.strokeStyle = c.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(padL, toY(weight)); ctx.lineTo(padL + plotW, toY(weight)); ctx.stroke();
  ctx.setLineDash([]);

  // Recta lectura(f)
  ctx.strokeStyle = c.text; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(toX(0), toY(weight)); ctx.lineTo(toX(100), toY(readingMin)); ctx.stroke();

  const curPct = f * 100;
  const curReading = weight - buoyMax * f;
  ctx.fillStyle = c.cube; ctx.strokeStyle = c.bg; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(toX(curPct), toY(curReading), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.fillStyle = c.text; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.font = '12px DM Sans, system-ui, sans-serif';
  ctx.fillText('profundidad sumergida  (%)', padL + plotW / 2, cssH - 4);
  ctx.save(); ctx.translate(14, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('lectura  (N)', 0, 0); ctx.restore();

  ctx.fillStyle = c.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '11px DM Sans, system-ui, sans-serif';
  ctx.fillText('Lectura del dinamómetro vs. profundidad', padL + 6, padT + 5);
}
