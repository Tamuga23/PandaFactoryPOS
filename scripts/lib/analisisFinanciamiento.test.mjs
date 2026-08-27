// Pruebas de los cálculos del reporte de financiamiento.
// Se decide plata con estos números, así que van testeados.
//   node scripts/lib/analisisFinanciamiento.test.mjs
import {
  costoBanco,
  precioGrossUp,
  precioConTraspaso,
  agruparPorCategoria,
  costoFinanciamiento,
  palancas,
} from './analisisFinanciamiento.mjs';

let fallas = 0;
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) < tol;
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  OK  ' : 'FALLA '} ${nombre}${detalle ? `  → ${detalle}` : ''}`);
  if (!cond) fallas++;
};

console.log('--- La matemática del banco ---');
ok('retención de 9% sobre 100 = 9', cerca(costoBanco(100, 9), 9));
ok('para netear 100 con 9% hay que cobrar 109.89', cerca(precioGrossUp(100, 9), 109.89));
ok('un recargo del 9% (=109) deja corto', cerca(109 * 0.91, 99.19),
  `109 × 0.91 = ${(109 * 0.91).toFixed(2)}`);
ok('el gross-up sí netea exacto', cerca(precioGrossUp(100, 9) * 0.91, 100));
ok('a 3 meses (6%) hay que cobrar 106.38', cerca(precioGrossUp(100, 6), 106.38));
ok('traspaso 0% = precio sin tocar', cerca(precioConTraspaso(100, 9, 0), 100));
ok('traspaso 100% = gross-up completo', cerca(precioConTraspaso(100, 9, 100), 109.89));
ok('traspaso 50% = mitad del costo', cerca(precioConTraspaso(100, 9, 50), 104.95));

console.log('\n--- El plan del usuario (3% y 6%) contra el costo real ---');
const con6 = 106 * 0.91;
ok('+6% a 6 meses sigue perdiendo 3.54 sobre 100', cerca(100 - con6, 3.54), `neteás ${con6.toFixed(2)}`);
const con3 = 103 * 0.94;
ok('+3% a 3 meses sigue perdiendo 3.18 sobre 100', cerca(100 - con3, 3.18), `neteás ${con3.toFixed(2)}`);

console.log('\n--- Agrupación por categoría ---');
const ventas = [
  // Proyector $200 con tarjeta, costo 120 → margen 80 (40%)
  { status: 'completed', paymentMethod: 'TARJETA',
    items: [{ category: 'Proyector', price: 200, cost: 120, quantity: 1 }] },
  // Proyector $200 en efectivo
  { status: 'completed', paymentMethod: 'EFECTIVO',
    items: [{ category: 'Proyector', price: 200, cost: 120, quantity: 1 }] },
  // Smartwatch $80 con tarjeta — POR DEBAJO del umbral de 100
  { status: 'completed', paymentMethod: 'TARJETA',
    items: [{ category: 'Smartwatch', price: 80, cost: 64, quantity: 1 }] },
  // Smartwatch $150 con tarjeta, costo 120 → margen 30 (20%)
  { status: 'completed', paymentMethod: 'TARJETA',
    items: [{ category: 'Smartwatch', price: 150, cost: 120, quantity: 1 }] },
  // Venta cancelada: no debe contar
  { status: 'cancelled', paymentMethod: 'TARJETA',
    items: [{ category: 'Smartwatch', price: 999, cost: 1, quantity: 1 }] },
];
const cats = agruparPorCategoria(ventas, { umbralUsd: 100 });
const proy = cats.find((c) => c.categoria === 'Proyector');
const sw = cats.find((c) => c.categoria === 'Smartwatch');

ok('ignora ventas canceladas', sw.ingreso === 230, `ingreso smartwatch = ${sw.ingreso}`);
ok('margen de proyector 40%', cerca(proy.margenPct, 40));
ok('margen de smartwatch 20%', cerca(sw.margenPct, 20), `${sw.margenPct.toFixed(1)}%`);
ok('participación de tarjeta en proyector 50%', cerca(proy.participacionTarjetaPct, 50));
ok('participación de tarjeta en smartwatch 100%', cerca(sw.participacionTarjetaPct, 100));
ok('separa lo que está sobre el umbral', sw.ingresoTarjetaSobreUmbral === 150,
  `de ${sw.ingresoTarjeta} con tarjeta, ${sw.ingresoTarjetaSobreUmbral} sobre umbral`);

console.log('\n--- Costo del banco y peso sobre el margen ---');
const tasas = { 3: 6, 6: 9 };
const mezcla = { tres: 0.5, seis: 0.5 };
const cProy = costoFinanciamiento(proy, { costoBanco: tasas, mezcla });
const cSw = costoFinanciamiento(sw, { costoBanco: tasas, mezcla });

// Proyector: 200 sobre umbral → 100 a 3m (6) + 100 a 6m (9) = 15
ok('costo proyector = 15', cerca(cProy.costo, 15), `$${cProy.costo.toFixed(2)}`);
ok('el banco se lleva 9.4% del margen de proyector', cerca(cProy.pctDelMargen, 9.375),
  `${cProy.pctDelMargen.toFixed(1)}%`);
// Smartwatch: 150 sobre umbral → 75 a 3m (4.5) + 75 a 6m (6.75) = 11.25
ok('costo smartwatch = 11.25', cerca(cSw.costo, 11.25), `$${cSw.costo.toFixed(2)}`);
ok('el banco se lleva 24.5% del margen de smartwatch', cerca(cSw.pctDelMargen, 24.46),
  `${cSw.pctDelMargen.toFixed(1)}% ← acá está el problema`);
ok('margen neto de smartwatch cae de 20% a 15.1%', cerca(cSw.margenNetoPct, 15.11),
  `${cSw.margenNetoPct.toFixed(1)}%`);

console.log('\n--- Palancas ---');
const pSw = palancas(sw, { costoBanco: tasas, mezcla, nuevoPisoUsd: 200, umbralUsd: 100 });
// todo a 3 meses: 150 × 6% = 9 (vs 11.25)
ok('cerrar el plazo de 6 meses ahorra 2.25', cerca(pSw.cerrarSeis.ahorro, 2.25),
  `de $${pSw.hoy.toFixed(2)} a $${pSw.cerrarSeis.costo.toFixed(2)}`);
ok('un piso de 200 saca la venta de 150', cerca(pSw.subirPiso.costo, 0) && pSw.subirPiso.aplica);
ok('expone solo la venta de 150, no la de 80', pSw.subirPiso.ventaExpuesta === 150,
  `$${pSw.subirPiso.ventaExpuesta} expuestos (la de $80 ya estaba fuera del umbral)`);
ok('cuenta 1 venta afectada', pSw.subirPiso.ventasAfectadas === 1);

// EL CASO QUE ROMPÍA CON EL PROMEDIO: tickets de 80 y 150, promedio 115.
// Un piso de 120 solo debe sacar la de 80 — que además ya estaba bajo el umbral.
const pSwMedio = palancas(sw, { costoBanco: tasas, mezcla, nuevoPisoUsd: 120, umbralUsd: 100 });
ok('un piso de 120 NO toca la venta de 150', cerca(pSwMedio.subirPiso.costo, pSwMedio.hoy),
  `costo sigue en $${pSwMedio.subirPiso.costo.toFixed(2)} (el promedio habría dicho $0)`);
ok('y no expone nada', pSwMedio.subirPiso.ventaExpuesta === 0);

const pProy = palancas(proy, { costoBanco: tasas, mezcla, nuevoPisoUsd: 100, umbralUsd: 100 });
ok('un piso que no aplica no ahorra nada', !pProy.subirPiso.aplica && cerca(pProy.subirPiso.ahorro, 0));

// Subir la lista: el costo lo generan solo las financiadas, la subida la pagan todos.
ok('subir la lista de smartwatch ~4.9% recupera el costo', cerca(pSw.subirLista.pct, 4.89, 0.05),
  `${pSw.subirLista.pct.toFixed(2)}% sobre $${sw.ingreso} de ingreso total`);
ok('proyector necesita menos subida', pProy.subirLista.pct < pSw.subirLista.pct,
  `${pProy.subirLista.pct.toFixed(2)}% vs ${pSw.subirLista.pct.toFixed(2)}%`);

console.log('\n--- Dato MEDIDO vs estimado ---');
// Con `paymentMethod: FINANCIAMIENTO` + el plan guardado, el costo NO se estima:
// sale del plazo real que se cobró.
const ventasMedidas = [
  { status: 'completed', paymentMethod: 'FINANCIAMIENTO',
    financiamiento: { plazoMeses: 3, recargoPct: 3, cuotaNio: 100, totalNio: 300 },
    items: [{ category: 'Smartwatch', price: 200, cost: 160, quantity: 1 }] },
  { status: 'completed', paymentMethod: 'FINANCIAMIENTO',
    financiamiento: { plazoMeses: 6, recargoPct: 6, cuotaNio: 100, totalNio: 600 },
    items: [{ category: 'Smartwatch', price: 200, cost: 160, quantity: 1 }] },
];
const medidas = agruparPorCategoria(ventasMedidas, { umbralUsd: 100 });
const fMed = costoFinanciamiento(medidas[0], { costoBanco: tasas, mezcla });
// 200 a 3 meses (6%) = 12 · 200 a 6 meses (9%) = 18 → 30, sin ningún supuesto
ok('el costo sale del plazo real, no de la mezcla', cerca(fMed.costo, 30), `$${fMed.costo.toFixed(2)}`);
ok('todo el costo es medido', cerca(fMed.costoExacto, 30) && cerca(fMed.costoEstimado, 0));
ok('confiabilidad 100%', cerca(fMed.confiabilidadPct, 100), `${fMed.confiabilidadPct.toFixed(0)}%`);
ok('la mezcla asumida ya no cambia el resultado',
  cerca(costoFinanciamiento(medidas[0], { costoBanco: tasas, mezcla: { tres: 1, seis: 0 } }).costo, 30),
  'con mezcla 100/0 da el mismo número');

// Mezcla de registro viejo (TARJETA) y nuevo (FINANCIAMIENTO)
const ventasMixtas = [
  ...ventasMedidas,
  { status: 'completed', paymentMethod: 'TARJETA',
    items: [{ category: 'Smartwatch', price: 200, cost: 160, quantity: 1 }] },
];
const mixtas = agruparPorCategoria(ventasMixtas, { umbralUsd: 100 });
const fMix = costoFinanciamiento(mixtas[0], { costoBanco: tasas, mezcla });
ok('la parte vieja se sigue estimando', fMix.costoEstimado > 0,
  `medido $${fMix.costoExacto.toFixed(2)} + estimado $${fMix.costoEstimado.toFixed(2)}`);
ok('la confiabilidad baja a 2/3', cerca(fMix.confiabilidadPct, 66.67, 0.1),
  `${fMix.confiabilidadPct.toFixed(1)}% medido`);

// Un plazo sin tasa configurada no se inventa
const ventas12 = [{ status: 'completed', paymentMethod: 'FINANCIAMIENTO',
  financiamiento: { plazoMeses: 12, recargoPct: 12, cuotaNio: 50, totalNio: 600 },
  items: [{ category: 'Smartwatch', price: 200, cost: 160, quantity: 1 }] }];
const f12 = costoFinanciamiento(agruparPorCategoria(ventas12, { umbralUsd: 100 })[0],
  { costoBanco: tasas, mezcla });
ok('un plazo sin tasa configurada cuenta 0 en vez de inventar', cerca(f12.costo, 0));

console.log('\n--- Bordes ---');
ok('sin ventas no explota', agruparPorCategoria([]).length === 0);
ok('renglones sin costo no rompen el margen',
  agruparPorCategoria([{ status: 'completed', paymentMethod: 'EFECTIVO',
    items: [{ category: 'X', price: 100, quantity: 1 }] }])[0].margen === 100);
ok('categoría sin nombre se agrupa aparte',
  agruparPorCategoria([{ status: 'completed', paymentMethod: 'EFECTIVO',
    items: [{ price: 10, cost: 5, quantity: 1 }] }])[0].categoria === '(sin categoría)');

console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
