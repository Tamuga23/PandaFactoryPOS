#!/usr/bin/env node
/**
 * REPORTE DE FINANCIAMIENTO por categoría. SOLO LEE, nunca escribe.
 *
 * Responde la pregunta de plata: ¿qué categorías aguantan regalar el 0% de
 * interés y cuáles no? Cruza el margen bruto REAL de cada categoría (precio y
 * costo congelados al momento de cada venta) contra lo que retiene el banco.
 *
 * Uso:
 *   node scripts/reporte_financiamiento.mjs
 *   node scripts/reporte_financiamiento.mjs --meses 6
 *   node scripts/reporte_financiamiento.mjs --tasas 6/9 --mezcla 50/50 --piso 150
 *   node scripts/reporte_financiamiento.mjs --csv > financiamiento.csv
 *
 * Opciones:
 *   --meses N      ventana de análisis hacia atrás (por defecto 12)
 *   --tasas A/B    lo que retiene el banco a 3 y a 6 meses (por defecto 6/9)
 *   --mezcla A/B   % de ventas con tarjeta que van a 3 y a 6 meses (por defecto 50/50)
 *   --umbral N     monto desde el que hoy se ofrecen cuotas (por defecto 100)
 *   --piso N       piso a simular para la palanca "subir el mínimo" (por defecto 150)
 *   --csv          salida en CSV
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  agruparPorCategoria,
  costoFinanciamiento,
  palancas,
  precioConTraspaso,
} from './lib/analisisFinanciamiento.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const arg = (nombre, def) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const par = (v, def) => {
  const [a, b] = String(v).split('/').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : def;
};

const MESES = Number(arg('meses', 12));
const [T3, T6] = par(arg('tasas', '6/9'), [6, 9]);
const [M3, M6] = par(arg('mezcla', '50/50'), [50, 50]);
const UMBRAL = Number(arg('umbral', 100));
const PISO = Number(arg('piso', 150));
const CSV = process.argv.includes('--csv');

const tasas = { 3: T3, 6: T6 };
const mezcla = { tres: M3 / 100, seis: M6 / 100 };

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const saCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  join(ROOT, 'gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json'),
].filter(Boolean);
const saPath = saCandidates.find((p) => { try { return existsSync(p); } catch { return false; } });
initializeApp({
  credential: saPath ? cert(JSON.parse(readFileSync(saPath, 'utf8'))) : applicationDefault(),
  projectId: cfg.projectId,
});
const db = getFirestore(DATABASE_ID);

const desde = Date.now() - MESES * 30 * 24 * 60 * 60 * 1000;
const snap = await db.collection('sales').get();
const todas = snap.docs.map((d) => d.data());
const ventas = todas.filter((v) => (v.date ?? 0) >= desde);
const completadas = ventas.filter((v) => !v.status || v.status === 'completed');

const cats = agruparPorCategoria(completadas, { umbralUsd: UMBRAL });
const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${n.toFixed(1)}%`;

// --- CSV -------------------------------------------------------------------
if (CSV) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  console.log(['categoria', 'ingresoUSD', 'costoUSD', 'margenUSD', 'margenPct', 'ingresoTarjetaUSD',
    'participacionTarjetaPct', 'ticketPromTarjetaUSD', 'costoBancoUSD', 'pctDelMargen', 'margenNetoPct']
    .map(esc).join(','));
  for (const c of cats) {
    const f = costoFinanciamiento(c, { costoBanco: tasas, mezcla });
    console.log([c.categoria, c.ingreso.toFixed(2), c.costo.toFixed(2), c.margen.toFixed(2),
      c.margenPct.toFixed(1), c.ingresoTarjeta.toFixed(2), c.participacionTarjetaPct.toFixed(1),
      c.ticketPromedioTarjeta.toFixed(2), f.costo.toFixed(2),
      Number.isFinite(f.pctDelMargen) ? f.pctDelMargen.toFixed(1) : '', f.margenNetoPct.toFixed(1)]
      .map(esc).join(','));
  }
  process.exit(0);
}

// --- Encabezado ------------------------------------------------------------
console.log('═'.repeat(80));
console.log('REPORTE DE FINANCIAMIENTO POR CATEGORÍA');
console.log('═'.repeat(80));
console.log(`ventana: últimos ${MESES} meses · ${completadas.length} ventas completadas de ${todas.length} totales`);
console.log(`supuestos: banco retiene ${T3}% a 3 meses y ${T6}% a 6 meses`);
console.log(`           mezcla asumida ${M3}% a 3 meses / ${M6}% a 6 meses · umbral de cuotas ${usd(UMBRAL)}`);
console.log('montos en USD (precio y costo congelados al momento de cada venta)');

if (completadas.length === 0) {
  console.log('\nNo hay ventas en la ventana. Probá con --meses 24.');
  process.exit(0);
}

// --- Advertencia sobre el vacío de datos -----------------------------------
const conTarjeta = completadas.filter((v) => v.paymentMethod === 'TARJETA').length;
const conPlazo = completadas.filter(
  (v) => v.paymentMethod === 'FINANCIAMIENTO' && v.financiamiento,
).length;

if (conTarjeta === 0 && conPlazo > 0) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`MEDIDO, NO ESTIMADO: las ${conPlazo} ventas financiadas del período tienen el`);
  console.log('plazo registrado. Los costos de abajo son reales, no dependen de ningún supuesto.');
  console.log('='.repeat(80));
} else {
  console.log(`\n${'!'.repeat(80)}`);
  console.log(`Ventas con plazo REGISTRADO (forma de pago FINANCIAMIENTO): ${conPlazo}`);
  console.log(`Ventas con TARJETA sin plazo (registro viejo, ambiguo):      ${conTarjeta}`);
  if (conTarjeta > 0) {
    console.log('');
    console.log('En las de TARJETA no se puede saber si fueron a 3 meses, a 6, o un swipe');
    console.log('normal sin cuotas (que no te cuesta nada). Esa parte se estima con la mezcla');
    console.log('asumida arriba; correlo también así para ver el rango real:');
    console.log('  --mezcla 100/0   (optimista: todo a 3 meses)');
    console.log('  --mezcla 0/100   (pesimista: todo a 6 meses)');
    console.log('');
    console.log('Cada venta nueva cobrada como FINANCIAMIENTO encoge esa incertidumbre.');
  }
  console.log('!'.repeat(80));
}

// --- Mix de pago global ----------------------------------------------------
const mixGlobal = {};
for (const v of completadas) {
  const m = v.paymentMethod || 'DESCONOCIDO';
  mixGlobal[m] = (mixGlobal[m] ?? 0) + 1;
}
console.log('\nMÉTODOS DE PAGO (todas las categorías)');
for (const [m, n] of Object.entries(mixGlobal).sort((a, b) => b[1] - a[1])) {
  const p = (n / completadas.length) * 100;
  console.log(`  ${m.padEnd(14)} ${String(n).padStart(4)} ventas  ${pct(p).padStart(6)}  ${'█'.repeat(Math.round(p / 2))}`);
}

// --- Tabla por categoría ---------------------------------------------------
console.log(`\n${'═'.repeat(80)}`);
console.log('MARGEN REAL Y PESO DEL BANCO');
console.log('═'.repeat(80));
console.log(
  'categoría'.padEnd(20) + 'ingreso'.padStart(11) + 'margen'.padStart(9) +
  '%tarj'.padStart(8) + 'costo bco'.padStart(11) + '%margen'.padStart(9) +
  'medido'.padStart(8) + '  señal',
);
console.log('─'.repeat(80));

const analisis = [];
for (const c of cats) {
  const f = costoFinanciamiento(c, { costoBanco: tasas, mezcla });
  const p = palancas(c, { costoBanco: tasas, mezcla, nuevoPisoUsd: PISO, umbralUsd: UMBRAL });
  // Cuánto del margen se lleva el banco decide la señal.
  const señal = !Number.isFinite(f.pctDelMargen) || f.pctDelMargen > 25 ? 'ROJO'
    : f.pctDelMargen > 10 ? 'AMARILLO' : 'verde';
  analisis.push({ c, f, p, señal });

  console.log(
    c.categoria.slice(0, 19).padEnd(20) +
    usd(c.ingreso).padStart(11) +
    pct(c.margenPct).padStart(9) +
    pct(c.participacionTarjetaPct).padStart(8) +
    usd(f.costo).padStart(11) +
    (Number.isFinite(f.pctDelMargen) ? pct(f.pctDelMargen) : 's/margen').padStart(9) +
    pct(f.confiabilidadPct).padStart(8) +
    '  ' + señal,
  );
}

console.log('─'.repeat(80));
console.log('%margen = qué tajada del margen bruto de esa categoría se lleva el banco.');
console.log('medido  = qué parte del costo sale de ventas con plazo registrado (el resto se estima).');
console.log('verde <10%  ·  AMARILLO 10-25%  ·  ROJO >25% (o la categoría vende bajo costo)');

// --- Detalle y palancas por categoría --------------------------------------
console.log(`\n${'═'.repeat(80)}`);
console.log('QUÉ HACER EN CADA CATEGORÍA');
console.log('═'.repeat(80));

for (const { c, f, p, señal } of analisis) {
  console.log(`\n${c.categoria}  [${señal}]`);
  console.log(`  ingreso ${usd(c.ingreso)} · margen ${usd(c.margen)} (${pct(c.margenPct)}) · ${c.unidades} unidades`);
  console.log(`  con tarjeta: ${usd(c.ingresoTarjeta)} (${pct(c.participacionTarjetaPct)} del ingreso) · ticket promedio ${usd(c.ticketPromedioTarjeta)}`);
  if (c.ingresoTarjeta > c.ingresoTarjetaSobreUmbral) {
    console.log(`  de eso, ${usd(c.ingresoTarjeta - c.ingresoTarjetaSobreUmbral)} quedó bajo el umbral de ${usd(UMBRAL)} (no aplicaba a cuotas)`);
  }
  console.log(`  costo del banco: ${usd(f.costo)}  →  margen neto ${pct(f.margenNetoPct)} (era ${pct(c.margenPct)})`);
  if (f.costoExacto > 0 || f.costoEstimado > 0) {
    console.log(
      `    de eso: ${usd(f.costoExacto)} medido (plazo registrado) + ${usd(f.costoEstimado)} estimado`,
    );
  }

  if (f.costo === 0) {
    console.log('  · sin ventas financiadas en la ventana: no hay nada que optimizar acá');
    continue;
  }

  const lbl = (t) => `    ${t.padEnd(32)}→  `;
  console.log('  palancas:');
  console.log(lbl('cerrar el plazo de 6 meses') +
    `ahorra ${usd(p.cerrarSeis.ahorro)}  (costo baja a ${usd(p.cerrarSeis.costo)})`);

  if (p.subirPiso.aplica) {
    console.log(lbl(`subir el piso a ${usd(PISO)}`) +
      `ahorra ${usd(p.subirPiso.ahorro)}, pero expone ${usd(p.subirPiso.ventaExpuesta)} ` +
      `en ${p.subirPiso.ventasAfectadas} venta(s)`);
  } else {
    console.log(lbl(`subir el piso a ${usd(PISO)}`) +
      'no cambia nada (ninguna venta financiada queda debajo)');
  }

  // El costo lo generan solo las ventas financiadas, pero la subida de lista la
  // pagan todos los clientes de la categoría. Ese es el número honesto.
  console.log(lbl('subir la lista de la categoría') +
    `+${p.subirLista.pct.toFixed(2)}% recupera el costo (lo pagan los ${pct(100 - c.participacionTarjetaPct)} que no financian también)`);

  if (señal === 'verde') {
    console.log('  → el margen aguanta el 0%. No la toques.');
  } else if (señal === 'AMARILLO') {
    console.log(p.subirPiso.aplica
      ? '  → empezá cerrando el plazo de 6 meses. Si no alcanza, subí el piso.'
      : '  → cerrá el plazo de 6 meses. El piso no es palanca acá: los tickets ya son altos.');
  } else {
    console.log(p.subirPiso.aplica
      ? '  → cerrá el 6 meses Y subí el piso antes de pensar en tocar precios.'
      : `  → el piso no ayuda (tickets altos). Cerrá el 6 meses; si no alcanza, la única salida es precio (+${p.subirLista.pct.toFixed(2)}%).`);
  }
}

// --- Cierre ----------------------------------------------------------------
const costoTotal = analisis.reduce((s, a) => s + a.f.costo, 0);
const margenTotal = cats.reduce((s, c) => s + c.margen, 0);
const ahorroCerrarSeis = analisis.reduce((s, a) => s + a.p.cerrarSeis.ahorro, 0);

console.log(`\n${'═'.repeat(80)}`);
console.log('TOTAL');
console.log('═'.repeat(80));
console.log(`margen bruto del período:      ${usd(margenTotal)}`);
console.log(`costo estimado del banco:      ${usd(costoTotal)}  (${pct(margenTotal > 0 ? (costoTotal / margenTotal) * 100 : 0)} del margen)`);
console.log(`si cerrás el 6 meses en todo:  ahorrás ${usd(ahorroCerrarSeis)}`);
const costoMedido = analisis.reduce((s, a) => s + a.f.costoExacto, 0);
console.log(
  `de ese costo, ${usd(costoMedido)} es dato medido y ${usd(costoTotal - costoMedido)} estimado` +
    ` (${pct(costoTotal > 0 ? (costoMedido / costoTotal) * 100 : 100)} medido)`,
);
console.log(`\nEscala a 12 meses: ${usd((costoTotal / MESES) * 12)} al año en costo de financiamiento.`);

// --- Referencia: por qué un recargo del X% no recupera el X% ---------------
console.log(`\n${'═'.repeat(80)}`);
console.log('SI ALGÚN DÍA TRASLADÁS EL COSTO AL PRECIO: DIVIDÍ, NO MULTIPLIQUES');
console.log('═'.repeat(80));
console.log('El banco no retiene un % de tu precio: retiene un % de lo que le cobra al cliente.');
console.log('Sobre un producto de $100:\n');
console.log(
  'plazo'.padEnd(9) + 'banco'.padStart(7) + 'recargo simple'.padStart(16) +
  'neteás'.padStart(9) + 'gross-up'.padStart(11) + 'neteás'.padStart(9),
);
console.log('─'.repeat(61));
for (const [meses, tasa] of [[3, T3], [6, T6]]) {
  const simple = 100 * (1 + tasa / 100);
  const gross = precioConTraspaso(100, tasa, 100);
  console.log(
    `${meses} meses`.padEnd(9) +
    `${tasa}%`.padStart(7) +
    usd(simple).padStart(16) +
    usd(simple * (1 - tasa / 100)).padStart(9) +
    usd(gross).padStart(11) +
    usd(gross * (1 - tasa / 100)).padStart(9),
  );
}
console.log('─'.repeat(61));
console.log('El recargo simple SIEMPRE deja corto. Solo el gross-up netea el precio objetivo.');

console.log('\nCorrelo también con --mezcla 100/0 y --mezcla 0/100 para ver el rango real.');
process.exit(0);
