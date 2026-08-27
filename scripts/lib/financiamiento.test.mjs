// Pruebas del módulo compartido de financiamiento.
//   npm run financiamiento:cuotas
//
// Corre src/lib/financiamiento.ts REAL, no una copia a mano. Node necesita la
// extensión en los import (`./categorySpecs.ts`) y los bundlers de Vite y Next
// no la quieren, así que los archivos se copian a una carpeta temporal
// reescribiendo SOLO el especificador del import. Todo lo demás es idéntico:
// si el módulo cambia, el test corre el cambio.
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib');
const tmp = mkdtempSync(join(tmpdir(), 'panda-fin-'));
copyFileSync(join(LIB, 'categorySpecs.ts'), join(tmp, 'categorySpecs.ts'));
writeFileSync(
  join(tmp, 'financiamiento.ts'),
  readFileSync(join(LIB, 'financiamiento.ts'), 'utf8')
    .replace("from './categorySpecs'", "from './categorySpecs.ts'"),
);

const {
  CONFIG_FINANCIAMIENTO_DEFAULT: DEF,
  calcularPlanes,
  esCategoriaSinInteres,
  normalizarConfig,
  normalizarOverride,
  planMasBajo,
  planesParaVenta,
  reglaEfectiva,
  tieneSinInteres,
  todosSinInteres,
} = await import(pathToFileURL(join(tmp, 'financiamiento.ts')).href);

const TASA = 36.6243;
let fallas = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  OK  ' : 'FALLA '} ${nombre}${detalle ? `  → ${detalle}` : ''}`);
  if (!cond) fallas++;
};
const plan = (planes, meses) => planes.find((p) => p.meses === meses);

console.log('--- El precio de lista NUNCA se toca ---');
// $200 a 3 meses con 3%: total = 200 × 1.03 = $206
const sw = calcularPlanes(200, TASA, { config: DEF, categoria: 'smartwatch' });
const precioNio = Math.round(200 * TASA);
ok('el precio de contado sigue siendo el mismo', precioNio === 7325, `C$${precioNio}`);
ok('el total a 3 meses es mayor que el de contado',
  plan(sw, 3).totalNio > precioNio,
  `C$${plan(sw, 3).totalNio} vs C$${precioNio} de contado`);
ok('el recargo a 3 meses es 3%', plan(sw, 3).recargoPct === 3);
ok('el recargo a 6 meses es 6%', plan(sw, 6).recargoPct === 6);
ok('smartwatch no es sin interés', !tieneSinInteres(sw));

console.log('\n--- El total SIEMPRE cuadra con la cuota ---');
// Esto es lo que evita que la tablet y la web muestren números distintos.
for (const p of sw) {
  ok(`${p.meses} meses: cuota × meses = total`,
    p.cuotaNio * p.meses === p.totalNio,
    `C$${p.cuotaNio} × ${p.meses} = C$${p.totalNio}`);
}
ok('la cuota se redondea hacia arriba (nunca en contra de la tienda)',
  plan(sw, 3).totalNio >= 200 * 1.03 * TASA,
  `C$${plan(sw, 3).totalNio} ≥ C$${(200 * 1.03 * TASA).toFixed(2)} exacto`);

console.log('\n--- Proyectores siguen en 0% de verdad ---');
const proy = calcularPlanes(200, TASA, { config: DEF, categoria: 'Proyector' });
ok('todos los plazos sin interés', todosSinInteres(proy));
ok('el total a plazos = el precio de contado (salvo redondeo)',
  plan(proy, 3).sobrePrecioNio <= 3,
  `diferencia de C$${plan(proy, 3).sobrePrecioNio} por redondeo de cuota`);
ok('recargo 0 en ambos plazos',
  plan(proy, 3).recargoPct === 0 && plan(proy, 6).recargoPct === 0);

console.log('\n--- Slugs: el POS guarda español, PandaLink traduce a inglés ---');
for (const s of ['proyector', 'projector', 'Proyectores Magcubic']) {
  ok(`"${s}" resuelve a 0%`, todosSinInteres(calcularPlanes(200, TASA, { config: DEF, categoria: s })));
}
for (const s of ['smartwatch', 'security-cam', 'camara', 'speaker', 'dashcam']) {
  const p = calcularPlanes(200, TASA, { config: DEF, categoria: s });
  ok(`"${s}" lleva recargo`, !tieneSinInteres(p), `3m ${plan(p, 3).recargoPct}% / 6m ${plan(p, 6).recargoPct}%`);
}

console.log('\n--- Umbral mínimo ---');
ok('$99 no ofrece cuotas', calcularPlanes(99, TASA, { config: DEF, categoria: 'smartwatch' }).length === 0);
ok('$100 sí ofrece cuotas', calcularPlanes(100, TASA, { config: DEF, categoria: 'smartwatch' }).length === 2);
ok('precio nulo no rompe', calcularPlanes(null, TASA, { config: DEF }).length === 0);
ok('precio 0 no rompe', calcularPlanes(0, TASA, { config: DEF }).length === 0);
ok('tasa inválida no rompe', calcularPlanes(200, 0, { config: DEF }).length === 0);

console.log('\n--- Override por producto ---');
const cero = calcularPlanes(200, TASA, {
  config: DEF, categoria: 'smartwatch', override: { sinInteres: true },
});
ok('sinInteres:true fuerza 0% en un smartwatch', todosSinInteres(cero));

const puntual = calcularPlanes(200, TASA, {
  config: DEF, categoria: 'smartwatch', override: { recargo: { '6': 4 } },
});
ok('un recargo puntual gana sobre la categoría', plan(puntual, 6).recargoPct === 4);
ok('y no afecta al otro plazo', plan(puntual, 3).recargoPct === 3);

ok('habilitado:false saca el producto del financiamiento',
  calcularPlanes(200, TASA, { config: DEF, categoria: 'proyector', override: { habilitado: false } }).length === 0);
ok('plazos por producto: solo 3 meses',
  calcularPlanes(200, TASA, { config: DEF, categoria: 'smartwatch', override: { plazos: [3] } }).length === 1);
ok('un override puede QUITAR el 0% de un proyector',
  !tieneSinInteres(calcularPlanes(200, TASA, {
    config: DEF, categoria: 'proyector', override: { recargo: { '3': 3, '6': 6 } } })));

console.log('\n--- Regla efectiva: default ← categoría ← override ---');
const r = reglaEfectiva(DEF, 'smartwatch', { minUsd: 150 });
ok('el override manda en minUsd', r.minUsd === 150);
ok('los plazos caen al default', JSON.stringify(r.plazos) === '[3,6]');

console.log('\n--- Config desde Firestore: un doc roto no debe mentir ---');
ok('doc vacío cae al default', normalizarConfig({}).recargoPorDefecto['3'] === 3);
ok('null cae al default', normalizarConfig(null).banco === 'Banpro');
ok('recargo negativo se descarta', normalizarConfig({ recargoPorDefecto: { '3': -5 } }).recargoPorDefecto['3'] === 3);
ok('recargo > 100 se descarta', normalizarConfig({ recargoPorDefecto: { '3': 500 } }).recargoPorDefecto['3'] === 3);
ok('plazos vacíos caen al default',
  JSON.stringify(normalizarConfig({ plazos: [] }).plazos) === '[3,6]');
ok('plazos basura caen al default',
  JSON.stringify(normalizarConfig({ plazos: ['x', -1] }).plazos) === '[3,6]');
const cfgOk = normalizarConfig({
  banco: 'Banpro', minUsd: 120, plazos: [3, 6, 12],
  recargoPorDefecto: { '3': 3, '6': 6, '12': 12 },
  porCategoria: { PROYECTOR: { recargo: { '3': 0, '6': 0, '12': 0 } } },
});
ok('lee un doc válido completo', cfgOk.minUsd === 120 && cfgOk.plazos.length === 3);
ok('la clave de categoría se normaliza a minúsculas', !!cfgOk.porCategoria.proyector);
const p12 = calcularPlanes(200, TASA, { config: cfgOk, categoria: 'proyector' });
ok('un plazo nuevo (12 meses) funciona sin tocar código', p12.length === 3 && todosSinInteres(p12));

console.log('\n--- Override crudo desde Firestore ---');
ok('override vacío es undefined', normalizarOverride({}) === undefined);
ok('override basura es undefined', normalizarOverride('x') === undefined);
ok('sinInteres:false no genera override', normalizarOverride({ sinInteres: false }) === undefined);
ok('lee sinInteres:true', normalizarOverride({ sinInteres: true })?.sinInteres === true);
ok('descarta recargo inválido', normalizarOverride({ recargo: { '3': 'x' } }) === undefined);

console.log('\n--- Gancho "desde C$X al mes" ---');
const bajo = planMasBajo(sw);
ok('el plan más bajo es el de más meses', bajo.meses === 6, `C$${bajo.cuotaNio}/mes a ${bajo.meses} meses`);
ok('sin planes devuelve null', planMasBajo([]) === null);

console.log('\n--- Carrito del POS: recargo ponderado por monto ---');
const linea = (categoria, montoUsd, override) => ({ categoria, montoUsd, override });

// Carrito con un solo smartwatch: igual que calcularPlanes.
const soloSw = planesParaVenta([linea('smartwatch', 200)], TASA, DEF);
ok('un solo producto da lo mismo que calcularPlanes',
  plan(soloSw, 3).cuotaNio === plan(sw, 3).cuotaNio, `C$${plan(soloSw, 3).cuotaNio}`);

// Mitad proyector (0%) + mitad smartwatch (3%) → recargo ponderado 1.5%
const mixto = planesParaVenta(
  [linea('proyector', 100), linea('smartwatch', 100)], TASA, DEF,
);
ok('mitad 0% + mitad 3% pondera a 1.5%', plan(mixto, 3).recargoPct === 1.5,
  `${plan(mixto, 3).recargoPct}%`);
ok('a 6 meses pondera 0% y 6% a 3%', plan(mixto, 6).recargoPct === 3,
  `${plan(mixto, 6).recargoPct}%`);
ok('el mixto sale más barato que todo smartwatch',
  plan(mixto, 3).totalNio < planesParaVenta([linea('smartwatch', 200)], TASA, DEF).find((p) => p.meses === 3).totalNio);
ok('y más caro que todo proyector',
  plan(mixto, 3).totalNio > planesParaVenta([linea('proyector', 200)], TASA, DEF).find((p) => p.meses === 3).totalNio);

// 75% proyector + 25% smartwatch → 0.75%
const mixto75 = planesParaVenta([linea('proyector', 300), linea('smartwatch', 100)], TASA, DEF);
ok('pondera por monto, no por cantidad de líneas', plan(mixto75, 3).recargoPct === 0.75,
  `${plan(mixto75, 3).recargoPct}% con 300 de proyector y 100 de smartwatch`);

ok('el total del carrito también cuadra con la cuota',
  mixto.every((p) => p.cuotaNio * p.meses === p.totalNio));

console.log('\n--- Carrito: bordes del lado prudente ---');
ok('un producto sin cuotas bloquea la venta entera',
  planesParaVenta([linea('proyector', 300), linea('smartwatch', 100, { habilitado: false })], TASA, DEF).length === 0);

ok('se exige el mínimo MÁS ALTO del carrito',
  planesParaVenta(
    [linea('proyector', 60), linea('smartwatch', 60, { minUsd: 150 })], TASA, DEF,
  ).length === 0,
  'total 120 < mínimo 150 del smartwatch');

ok('los plazos son la intersección',
  planesParaVenta(
    [linea('proyector', 150), linea('smartwatch', 150, { plazos: [3] })], TASA, DEF,
  ).length === 1,
  'una categoría con solo 3 meses cierra el de 6 para toda la venta');

ok('sin plazos en común no hay cuotas',
  planesParaVenta(
    [linea('proyector', 150, { plazos: [6] }), linea('smartwatch', 150, { plazos: [3] })], TASA, DEF,
  ).length === 0);

ok('el umbral se evalúa sobre el TOTAL, no por línea',
  planesParaVenta([linea('smartwatch', 60), linea('smartwatch', 60)], TASA, DEF).length === 2,
  'dos líneas de 60 suman 120 y sí califican');

ok('carrito vacío no rompe', planesParaVenta([], TASA, DEF).length === 0);
ok('montos en cero no rompen', planesParaVenta([linea('smartwatch', 0)], TASA, DEF).length === 0);
ok('un override de 0% en el carrito baja el ponderado',
  planesParaVenta([linea('smartwatch', 200, { sinInteres: true })], TASA, DEF)
    .every((p) => p.sinInteres));

console.log('\n--- esCategoriaSinInteres (copy de la web) ---');
ok('proyector sí', esCategoriaSinInteres(DEF, 'proyector'));
ok('projector (slug de PandaLink) también', esCategoriaSinInteres(DEF, 'projector'));
for (const c of ['smartwatch', 'camara', 'dashcam', 'parlante', 'smarthome', 'smarttv']) {
  ok(`${c} no`, !esCategoriaSinInteres(DEF, c));
}

console.log('\n--- Tabla de ejemplo ($200, tasa ' + TASA + ') ---');
console.log('categoría    plazo  recargo   cuota      total   vs contado');
for (const [cat, etiqueta] of [['proyector', 'Proyector'], ['smartwatch', 'Smartwatch']]) {
  for (const p of calcularPlanes(200, TASA, { config: DEF, categoria: cat })) {
    console.log(
      etiqueta.padEnd(13) + `${p.meses}m`.padStart(5) + `${p.recargoPct}%`.padStart(9) +
      `C$${p.cuotaNio.toLocaleString('es-NI')}`.padStart(11) +
      `C$${p.totalNio.toLocaleString('es-NI')}`.padStart(11) +
      (p.sobrePrecioNio > 3 ? `  +C$${p.sobrePrecioNio.toLocaleString('es-NI')}` : '  —'),
    );
  }
}

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
