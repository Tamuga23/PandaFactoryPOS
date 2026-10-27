// Pruebas de la cuenta de los apartados.
//   npm run apartados:test
//
// Corre src/lib/apartados.ts REAL, no una copia a mano. Importa `./utils` y
// `./etiquetas`, y Node necesita la extensión en los import, que Vite no
// quiere: se copian los tres archivos a una carpeta temporal reescribiendo SOLO
// esos especificadores, igual que financiamiento.test.mjs. Lo demás es idéntico.
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib');
const tmp = mkdtempSync(join(tmpdir(), 'panda-apartados-'));
copyFileSync(join(LIB, 'utils.ts'), join(tmp, 'utils.ts'));
copyFileSync(join(LIB, 'etiquetas.ts'), join(tmp, 'etiquetas.ts'));
writeFileSync(
  join(tmp, 'apartados.ts'),
  readFileSync(join(LIB, 'apartados.ts'), 'utf8')
    .replace("from './utils'", "from './utils.ts'")
    .replace("from './etiquetas'", "from './etiquetas.ts'"),
);

const A = await import(pathToFileURL(join(tmp, 'apartados.ts')).href);
const { formatCurrencyNIO } = await import(pathToFileURL(join(tmp, 'utils.ts')).href);

const TASA = 36.6243;
let fallas = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  OK  ' : 'FALLA '} ${nombre}${detalle ? `  → ${detalle}` : ''}`);
  if (!cond) fallas++;
};

// El TOTAL tal como lo calcula InvoicePreview.tsx: priceNIO = price × tasa
// (buildInvoiceDataFromSale), Σ priceNIO × cantidad, + envío − descuento, y el
// papel lo imprime con formatCurrencyNIO.
const totalDelPapel = (items, tasa, envio = 0, descuento = 0) => {
  const subtotal = items.map((i) => ({ priceNIO: i.price * tasa, quantity: i.quantity }))
    .reduce((acc, item) => acc + (item.priceNIO * item.quantity), 0);
  return formatCurrencyNIO(subtotal + envio - descuento);
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Un abono de prueba. Los ids hacen falta: las anulaciones apuntan a ellos.
let sec = 0;
const ab = (montoNio, metodo = 'EFECTIVO', fecha = ++sec, referencia) =>
  ({ id: `ab-${++sec}`, montoNio, metodo, fecha, ...(referencia ? { referencia } : {}) });

console.log('\n— El total guardado es el total impreso');
{
  // Control positivo: casos medidos donde round2 y el papel difieren. Si estos
  // OK dejaran de cumplirse, el resto del bloque no estaría probando nada.
  const casos = [
    { nombre: '3 × US$50 a 36.6243', items: [{ price: 50, quantity: 3 }], tasa: TASA, envio: 0, desc: 0 },
    { nombre: '1 × US$150 a 36.6243', items: [{ price: 150, quantity: 1 }], tasa: TASA, envio: 0, desc: 0 },
    // Éste va EN CONTRA de la tienda con round2: guarda menos de lo que imprime.
    { nombre: 'US$10.25 + envío C$150 a 36.7', items: [{ price: 10.25, quantity: 1 }], tasa: 36.7, envio: 150, desc: 0 },
  ];
  for (const c of casos) {
    const crudo = c.items.reduce((acc, i) => acc + (i.price * c.tasa) * i.quantity, 0) + c.envio - c.desc;
    const papel = totalDelPapel(c.items, c.tasa, c.envio, c.desc);
    ok(`control: round2 NO coincide con el papel en ${c.nombre}`,
      formatCurrencyNIO(round2(crudo)) !== papel, `${formatCurrencyNIO(round2(crudo))} vs ${papel}`);
    ok(`totalNioDe sí coincide en ${c.nombre}`,
      formatCurrencyNIO(A.totalNioDe(c.items, c.tasa, c.envio, c.desc)) === papel,
      String(A.totalNioDe(c.items, c.tasa, c.envio, c.desc)));
  }

  // El barrido compara contra el formatCurrencyNIO REAL, que arma un
  // Intl.NumberFormat nuevo en cada llamada: con paso de 7 centavos eran 342.696
  // totales y más de dos minutos. Con paso de 53 son unos 45.000 y segundos; los
  // casos que de verdad discrepan están fijados arriba como controles.
  let distintos = 0;
  let primero = '';
  let total = 0;
  for (let cents = 100; cents <= 200000; cents += 53) {
    for (const quantity of [1, 2, 3]) {
      for (const [envio, desc] of [[0, 0], [150, 0], [0, 100], [250, 333.33]]) {
        total++;
        const items = [{ price: cents / 100, quantity }, { price: 12.5, quantity: 1 }];
        const guardado = A.totalNioDe(items, TASA, envio, desc);
        const impreso = totalDelPapel(items, TASA, envio, desc);
        if (formatCurrencyNIO(guardado) !== impreso || A.redondearCordobas(guardado) !== guardado) {
          distintos++;
          if (!primero) primero = `${cents / 100}×${quantity} envío ${envio} desc ${desc}: ${guardado} vs ${impreso}`;
        }
      }
    }
  }
  ok(`barrido de ${total} totales: guardado === impreso`, distintos === 0, primero);
  ok('el -0 no llega al papel', Object.is(A.redondearCordobas(-0.001), 0));
  ok('NaN no se cuela como monto', A.redondearCordobas(NaN) === 0);
}

console.log('\n— Saldo, abonado y anulaciones');
{
  const a1 = ab(0.1);
  const a2 = ab(0.2);
  const error = ab(5000, 'TRANSFERENCIA');
  const ap = { totalNio: 10987.29, abonos: [a1, a2, error], anulaciones: [{ abonoId: error.id, motivo: 'cero de más', fecha: 9 }] };
  ok('0.1 + 0.2 abonados son 0.30 exactos', A.abonadoNio(ap) === 0.3, String(A.abonadoNio(ap)));
  ok('el anulado no cuenta para el saldo', A.saldoNio(ap) === 10986.99, String(A.saldoNio(ap)));
  ok('el anulado sigue en la lista de abonos (se imprime tachado)', ap.abonos.length === 3 && A.abonosVigentes(ap).length === 2);
  ok('no está pagado', !A.estaPagado(ap));
  ok('sin lista de anulaciones (doc viejo) no rompe', A.abonadoNio({ totalNio: 1, abonos: [a1] }) === 0.1);

  const pagado = { totalNio: 1000, abonos: [ab(333.33), ab(333.33), ab(333.34, 'TARJETA')], anulaciones: [] };
  ok('tres abonos que suman el total dejan saldo cero EXACTO', A.saldoNio(pagado) === 0 && A.estaPagado(pagado),
    String(A.saldoNio(pagado)));
  ok('progreso al 100%', A.progresoPct(pagado) === 100);
  ok('progreso sin total no divide por cero', A.progresoPct({ totalNio: 0, abonos: [] }) === 0);
  ok('apartado sin abonos tiene el total como saldo', A.saldoNio({ totalNio: 500, abonos: [] }) === 500);

  const ultimo = { totalNio: 100, abonos: [ab(10, 'EFECTIVO', 50), ab(10, 'EFECTIVO', 80)], anulaciones: [] };
  ok('último abono vigente', A.ultimoAbonoEn(ultimo) === 80);
  const ultimoAnulado = { ...ultimo, anulaciones: [{ abonoId: ultimo.abonos[1].id, motivo: 'x', fecha: 90 }] };
  ok('un abono anulado no cuenta como el último', A.ultimoAbonoEn(ultimoAnulado) === 50);
  ok('sin abonos no hay último', A.ultimoAbonoEn({ totalNio: 1, abonos: [] }) === null);
}

console.log('\n— Prima');
{
  ok('prima 0 se rechaza', A.validarPrima(0, 1000) !== null);
  ok('prima negativa se rechaza', A.validarPrima(-5, 1000) !== null);
  ok('prima NaN se rechaza', A.validarPrima(NaN, 1000) !== null);
  ok('prima mayor que el total se rechaza', A.validarPrima(1000.01, 1000) !== null);
  ok('prima igual al total se acepta (pagado, pendiente de retiro)', A.validarPrima(1000, 1000) === null);
  ok('sin mínimo, un centavo alcanza', A.validarPrima(0.01, 1000, 0) === null);
  ok('mínimo 30% de C$10,887.29 redondea HACIA ARRIBA a 3266.19',
    A.primaMinimaNio(10887.29, 30) === 3266.19, String(A.primaMinimaNio(10887.29, 30)));
  ok('mínimo exacto no sube un centavo (20% de C$1,000.00 = 200.00)', A.primaMinimaNio(1000, 20) === 200);
  ok('el atajo 20% de C$1,000.01 no choca con su propio mínimo',
    A.validarPrima(A.primaMinimaNio(1000.01, 20), 1000.01, 20) === null, String(A.primaMinimaNio(1000.01, 20)));
  ok('un centavo por debajo del mínimo se rechaza', A.validarPrima(3266.18, 10887.29, 30) !== null);
  ok('el mínimo justo se acepta', A.validarPrima(3266.19, 10887.29, 30) === null);
  ok('el mensaje dice cuánto es el mínimo', (A.validarPrima(100, 10887.29, 30) || '').includes('3,266.19'));
}

console.log('\n— Abonos y devoluciones');
{
  ok('abono 0 se rechaza', A.validarAbono(0, 500) !== null);
  ok('abono igual al saldo se acepta', A.validarAbono(500, 500) === null);
  ok('abono un centavo por encima del saldo se rechaza', A.validarAbono(500.01, 500) !== null);
  ok('con saldo cero no hay abono posible', A.validarAbono(1, 0) !== null);
  const msg = A.validarAbono(5000, 500) || '';
  ok('el mensaje de exceso pregunta primero si se tipeó bien', msg.startsWith('¿Lo tipeaste bien?'), msg);
  ok('y después dice qué hacer si de verdad dio de más', msg.includes('vuelto'));
  ok('devolver 0 se acepta', A.validarDevolucion(0, 3000) === null);
  ok('devolver todo se acepta', A.validarDevolucion(3000, 3000) === null);
  ok('devolver más de lo abonado se rechaza', A.validarDevolucion(3000.01, 3000) !== null);
  ok('devolución negativa se rechaza', A.validarDevolucion(-1, 3000) !== null);
}

console.log('\n— Teléfono');
{
  ok('8 dígitos locales sirven', A.validarTelefono('8765 9876') === null);
  ok('con +505 sirve', A.validarTelefono('+505 8765-9876') === null);
  ok('7 dígitos no sirven', A.validarTelefono('8765987') !== null);
  ok('vacío no sirve', A.validarTelefono('') !== null);
}

console.log('\n— Fechas');
{
  const base = new Date(2026, 9, 26, 10, 30).getTime(); // 26-oct-2026 10:30 local
  const limite = A.fechaLimiteDesde(base, 30);
  const d = new Date(limite);
  ok('30 días desde el 26-oct caen el 25-nov', d.getFullYear() === 2026 && d.getMonth() === 10 && d.getDate() === 25,
    d.toString());
  ok('la fecha límite es el FINAL del día', d.getHours() === 23 && d.getMinutes() === 59 && d.getMilliseconds() === 999);
  ok('el día de la fecha límite quedan 0 días', A.diasRestantes(limite, new Date(2026, 10, 25, 18, 0).getTime()) === 0);
  ok('el día anterior queda 1', A.diasRestantes(limite, new Date(2026, 10, 24, 23, 0).getTime()) === 1);
  ok('el día siguiente es -1', A.diasRestantes(limite, new Date(2026, 10, 26, 8, 0).getTime()) === -1);
  ok('finDelDia lee el input de fecha', A.finDelDia('2026-11-25') === limite);
  ok('finDelDia rechaza basura', A.finDelDia('25/11/2026') === null && A.finDelDia('') === null);
  ok('aFechaInput vuelve al formato del input', A.aFechaInput(limite) === '2026-11-25');
}

console.log('\n— Estado visible');
{
  const fechaLimite = new Date(2026, 10, 25, 23, 59, 59, 999).getTime();
  const despues = new Date(2026, 10, 27).getTime();
  const antes = new Date(2026, 10, 20).getTime();
  const conSaldo = { status: 'activo', fechaLimite, totalNio: 100, abonos: [ab(10)], anulaciones: [] };
  const pagado = { ...conSaldo, abonos: [ab(100)] };
  ok('activo con saldo, antes del límite', A.estadoVisible(conSaldo, antes) === 'activo');
  ok('activo con saldo, después del límite → vencido', A.estadoVisible(conSaldo, despues) === 'vencido');
  ok('pagado y vencido → listo (la tienda le debe el producto)', A.estadoVisible(pagado, despues) === 'listo');
  ok('entregado sigue entregado', A.estadoVisible({ ...pagado, status: 'entregado' }, despues) === 'entregado');
  ok('cancelado sigue cancelado', A.estadoVisible({ ...conSaldo, status: 'cancelado' }, despues) === 'cancelado');
}

console.log('\n— Forma de pago y nota de la factura final');
{
  const cuenta = (abonos, anulaciones = []) => ({ totalNio: 99999, numero: 'AP-000007', abonos, anulaciones });
  ok('gana el método con más plata', A.metodoPredominante(cuenta([
    ab(1000, 'EFECTIVO'), ab(3000, 'TRANSFERENCIA'), ab(1500, 'EFECTIVO'),
  ])) === 'TRANSFERENCIA');
  const tarjeta = ab(9000, 'TARJETA');
  ok('el anulado no vota', A.metodoPredominante(cuenta([ab(1000, 'EFECTIVO'), tarjeta],
    [{ abonoId: tarjeta.id, motivo: 'x', fecha: 1 }])) === 'EFECTIVO');
  ok('empate: el más reciente', A.metodoPredominante(cuenta([
    ab(500, 'EFECTIVO', 1), ab(500, 'CREDITO', 9999),
  ])) === 'CREDITO');
  ok('un método desconocido no se cuela a la factura', A.metodoPredominante(cuenta([
    ab(9000, 'FINANCIAMIENTO'), ab(10, 'TARJETA'),
  ])) === 'TARJETA');
  ok('sin abonos vigentes cae a EFECTIVO', A.metodoPredominante(cuenta([])) === 'EFECTIVO');

  const nota = A.resumenPagos(cuenta([
    ab(5000, 'TRANSFERENCIA', 1, '778899'), ab(1500, 'EFECTIVO', 2), ab(1500, 'EFECTIVO', 3),
    ab(1000, 'TRANSFERENCIA', 4, '112233'),
  ]));
  ok('la nota agrupa por método, de mayor a menor', nota.includes('Transferencia C$6,000.00 (ref. 778899, 112233) · Efectivo C$3,000.00'), nota);
  ok('la nota nombra el apartado y cuenta los abonos', nota.startsWith('Apartado AP-000007, pagado en 4 abonos'), nota);
  ok('un solo abono va en singular', A.resumenPagos(cuenta([ab(100)])).includes('en 1 abono:'));
  const anulado = ab(777, 'TARJETA');
  ok('el anulado no aparece en la nota', !A.resumenPagos(cuenta([ab(100), anulado],
    [{ abonoId: anulado.id, motivo: 'x', fecha: 1 }])).includes('777'));
}

console.log('\n— Agregados');
{
  const anulado = ab(50, 'EFECTIVO', 20);
  const aps = [
    { status: 'activo', numero: 'AP-1', customerName: 'Ana', items: [{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }],
      totalNio: 9999, abonos: [ab(100, 'EFECTIVO', 10), anulado], anulaciones: [{ abonoId: anulado.id, motivo: 'x', fecha: 21 }] },
    { status: 'activo', numero: 'AP-2', customerName: 'Beto', items: [{ id: 'p1', quantity: 1 }],
      totalNio: 9999, abonos: [ab(25.5, 'EFECTIVO', 15)], anulaciones: [] },
    { status: 'cancelado', numero: 'AP-3', customerName: 'Caro', items: [{ id: 'p1', quantity: 5 }],
      totalNio: 9999, abonos: [ab(999, 'EFECTIVO', 12)], anulaciones: [], canceladoEn: 14, devueltoNio: 400 },
  ];
  const conP1 = A.apartadosConProducto(aps, 'p1');
  ok('apartadosConProducto: sólo los activos, con sus unidades',
    conP1.length === 2 && conP1[0].unidades === 2 && conP1[1].unidades === 1 && conP1[0].apartado.numero === 'AP-1');
  const caja = A.cajaEntre(aps, 10, 15);
  ok('caja: recibido sin anulados, con el abono del cancelado (la plata entró)', caja.recibidoNio === 1124.5, String(caja.recibidoNio));
  ok('caja: la devolución del día se resta', caja.devueltoNio === 400 && caja.netoNio === 724.5, JSON.stringify(caja));
  ok('caja: cuenta los abonos', caja.abonos === 3);
  ok('caja: una devolución fuera del rango no se resta', A.cajaEntre(aps, 15, 99).devueltoNio === 0);
  ok('numeración AP-000001', A.numeroApartado(1) === 'AP-000001' && A.numeroApartado(1234567) === 'AP-1234567');
}

console.log('\n— Configuración');
{
  const D = A.CONFIG_APARTADOS_DEFAULT;
  ok('default: sin mínimo y 30 días', D.primaMinimaPct === 0 && D.plazoDias === 30);
  ok('basura → default', JSON.stringify(A.normalizarConfigApartados('x')) === JSON.stringify(D));
  ok('porcentaje fuera de rango → default', A.normalizarConfigApartados({ primaMinimaPct: 150, plazoDias: 15 }).primaMinimaPct === 0);
  ok('plazo no entero → default', A.normalizarConfigApartados({ primaMinimaPct: 20, plazoDias: 7.5 }).plazoDias === 30);
  const n = A.normalizarConfigApartados({ primaMinimaPct: 20, plazoDias: 15, actualizadoEn: 5 });
  ok('valores sanos se respetan', n.primaMinimaPct === 20 && n.plazoDias === 15 && n.actualizadoEn === 5);
}

console.log(fallas === 0 ? '\nTodo OK.' : `\n${fallas} FALLA(S).`);
process.exit(fallas === 0 ? 0 : 1);
