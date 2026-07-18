// arquimedes/physics.js
// Principio de Arquímedes: E = ρ_fluido · V_sumergido · g
//
// El objeto se modela como un cubo de lado L = V^(1/3), de forma que su
// sección horizontal (L²) es constante mientras se sumerge y la fracción de
// volumen sumergido coincide con la fracción de altura sumergida.

const MATERIALS = [
  { name: 'Corcho',        rho: 240   },
  { name: 'Madera (pino)', rho: 550   },
  { name: 'Hielo',         rho: 917   },
  { name: 'Aluminio',      rho: 2700  },
  { name: 'Hierro',        rho: 7870  },
  { name: 'Plomo',         rho: 11340 },
];

const FLUIDS = [
  { name: 'Agua',        rho: 1000  },
  { name: 'Agua salada', rho: 1025  },
  { name: 'Aceite',      rho: 800   },
  { name: 'Glicerina',   rho: 1260  },
  { name: 'Mercurio',    rho: 13600 },
];

function cubeSide(V) { return Math.cbrt(V); }

// Container fluid depth used for scene scaling and as the floor the object
// can rest on when it sinks. Scales with object size, floors at 0.4 m.
function containerDepth(L) { return Math.max(0.4, 4 * L); }

// Submerged volume for a cube of side L whose bottom face is a depth "d"
// below the surface (0 ≤ d, clamped at L once fully submerged).
function submergedVolume(d, L) {
  return L * L * Math.max(0, Math.min(d, L));
}

// ─── MODE 1: FLOTACIÓN LIBRE ──────────────────────────────────────────────────

function floatAnalytics(rhoObj, V, rhoFluid, g) {
  const L      = cubeSide(V);
  const m      = rhoObj * V;
  const weight = m * g;
  const fSub   = Math.min(1, rhoObj / rhoFluid);   // fracción sumergida en equilibrio
  const Vsub   = fSub * V;
  const buoyancy = rhoFluid * Vsub * g;
  return {
    L, m, weight, fSub, Vsub, buoyancy,
    floating: rhoObj < rhoFluid - 1e-9,
    neutral:  Math.abs(rhoObj - rhoFluid) <= 1e-9,
    sinks:    rhoObj > rhoFluid + 1e-9,
  };
}

// Simula la caída y el asentamiento del cubo, soltado con su cara inferior
// justo tocando la superficie (d=0, v=0). Se integra con un amortiguamiento
// viscoso simplificado (no a escala) solo para que la animación converja
// visiblemente al equilibrio predicho por Arquímedes, en vez de oscilar para
// siempre. Si el objeto se hunde, se detiene al tocar el fondo del recipiente.
function sampleFloat(rhoObj, V, rhoFluid, g, nSamples = 400) {
  const a = floatAnalytics(rhoObj, V, rhoFluid, g);
  const { L, m } = a;

  const TEND = 6; // s
  const dt   = TEND / nSamples;

  const kEff    = rhoFluid * L * L * g;                     // "rigidez" del empuje cerca del equilibrio
  const bCrit   = 2 * Math.sqrt(Math.max(kEff, 1e-9) * m);
  const damping = 0.35 * bCrit;
  const floorBottom = -containerDepth(L);

  let y  = L / 2;  // centro del cubo; su cara inferior arranca en y=0
  let vy = 0;
  const pts = [];

  for (let i = 0; i <= nSamples; i++) {
    const d    = Math.max(0, L / 2 - y);
    const Vsub = submergedVolume(d, L);
    const buoyancy = rhoFluid * Vsub * g;
    pts.push({ t: i * dt, y, d, Vsub, f: (Vsub / V) * 100, buoyancy });

    if (i < nSamples) {
      const drag = d > 0 ? damping * vy : 0;
      const acc  = g > 0 ? (buoyancy - m * g - drag) / m : 0;
      vy += acc * dt;
      y  += vy * dt;
      if (y - L / 2 < floorBottom) { y = floorBottom + L / 2; vy = 0; }
    }
  }

  return { points: pts, tEnd: TEND, ...a };
}

// ─── MODE 2: DINAMÓMETRO (peso aparente) ──────────────────────────────────────

function scaleAnalytics(rhoObj, V, rhoFluid, g) {
  const L      = cubeSide(V);
  const m      = rhoObj * V;
  const weight = m * g;
  const buoyMax = rhoFluid * V * g;   // empuje totalmente sumergido
  return { L, m, weight, buoyMax, apparentMin: weight - buoyMax };
}

// f = fracción de altura sumergida, 0 (en el aire, tocando la superficie) a
// 1 (totalmente sumergido). Al ser sección constante, fracción de volumen =
// fracción de altura.
function scaleReading(rhoObj, V, rhoFluid, g, f) {
  const clamped = Math.max(0, Math.min(1, f));
  const { weight, buoyMax } = scaleAnalytics(rhoObj, V, rhoFluid, g);
  const buoyancy = buoyMax * clamped;
  return { buoyancy, reading: weight - buoyancy };
}
