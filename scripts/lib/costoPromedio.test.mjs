// Pruebas del costo promedio ponderado y de su reversión.
//   npm run costo:test
//
// Corre src/lib/costoPromedio.ts REAL, no una copia a mano: si el módulo
// cambia, el test corre el cambio. El archivo no importa nada, así que no hace
// falta el baile de reescribir especificadores que sí necesita financiamiento.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib');
const { costoAlRecibir, costoAlRevertir } = await import(
  pathToFileURL(join(LIB, 'costoPromedio.ts')).href
);

let fallos = 0;
const ok = (nombre, condicion, detalle) => {
  if (condicion) {
    console.log(`ok     ${nombre}${detalle ? '  ' + detalle : ''}`);
  } else {
    fallos++;
    console.log(`FALLA  ${nombre}${detalle ? '  ' + detalle : ''}`);
  }
};
const casi = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// Simula recibir una caja y devuelve lo que la aplicación guarda en ella.
const recibir = (stock, costo, unidades, costoUnitarioReal) => {
  const nuevoCosto = costoAlRecibir(stock, costo, unidades, costoUnitarioReal);
  const nuevoStock = stock + unidades;
  return {
    stock: nuevoStock,
    costo: nuevoCosto,
    caja: {
      unidades,
      costoUnitarioReal,
      costoPrevio: costo,
      costoDespues: nuevoCosto,
      stockDespues: nuevoStock,
    },
  };
};
const revertir = (stock, costo, caja) => {
  const r = costoAlRevertir(stock, costo, caja);
  return {
    stock: Math.max(0, stock - caja.unidades),
    costo: r.costo === null ? costo : r.costo,
    via: r.via,
  };
};

// --------------------------------------------------------------------------
// El promedio al recibir
// --------------------------------------------------------------------------
ok('recibir sobre inventario vacío toma el costo de la caja',
   casi(costoAlRecibir(0, 0, 10, 16), 16));
ok('recibir mezcla en proporción',
   casi(costoAlRecibir(5, 10, 10, 16), 14),
   '(5×10 + 10×16) / 15 = 14');
ok('recibir 0 unidades no mueve nada',
   casi(costoAlRecibir(5, 10, 0, 99), 10));

// --------------------------------------------------------------------------
// La reversión
// --------------------------------------------------------------------------
{
  const a = recibir(5, 10, 10, 16);
  const b = revertir(a.stock, a.costo, a.caja);
  ok('ida y vuelta devuelve el costo original',
     casi(b.costo, 10) && b.stock === 5 && b.via === 'exacto', `${b.via} ${b.costo}`);
}
{
  // Vender NO mueve el promedio, así que el camino exacto sigue siendo válido.
  const a = recibir(5, 10, 10, 16);
  const b = revertir(a.stock - 4, a.costo, a.caja);
  ok('con ventas en el medio sigue siendo exacto',
     casi(b.costo, 10) && b.stock === 1 && b.via === 'exacto', `${b.via} ${b.costo}`);
}
{
  // Otra caja después: el costo cambió, se va por la inversa, y da exacto.
  const a = recibir(5, 10, 10, 16);
  const a2 = recibir(a.stock, a.costo, 6, 20);
  const b = revertir(a2.stock, a2.costo, a.caja);
  const esperado = recibir(5, 10, 6, 20);
  ok('otra caja después: la inversa da el contrafáctico exacto',
     casi(b.costo, esperado.costo) && b.via === 'inversa',
     `${b.via} ${b.costo.toFixed(4)} = ${esperado.costo.toFixed(4)}`);
}
{
  // El caso que engañaba al heurístico del costo solo: otra caja que cae
  // justo en el mismo promedio. El stock es lo que lo delata.
  const a = recibir(5, 10, 10, 16);
  const a2 = recibir(a.stock, a.costo, 10, 14);
  const b = revertir(a2.stock, a2.costo, a.caja);
  const esperado = recibir(5, 10, 10, 14);
  ok('otra caja al MISMO promedio: el stock la delata',
     casi(b.costo, esperado.costo) && b.via === 'inversa',
     `${b.via} ${b.costo.toFixed(4)} = ${esperado.costo.toFixed(4)}`);
}
{
  // El ciclo que inflaba el costo para siempre.
  let a = recibir(5, 10, 10, 16);
  for (let i = 0; i < 5; i++) {
    const r = revertir(a.stock, a.costo, a.caja);
    a = recibir(r.stock, r.costo, 10, 16);
  }
  ok('cinco ciclos revertir/re-recibir no mueven el costo',
     casi(a.costo, 14), `${a.costo.toFixed(6)} (antes escalaba hacia 16)`);
}
{
  const b = costoAlRevertir(10, 14, { unidades: 10 });
  ok('caja vieja sin datos: no se inventa un costo',
     b.costo === null && b.via === 'ninguno', b.via);
}
{
  const b = costoAlRevertir(10, 16, {
    unidades: 10, costoUnitarioReal: 16, costoPrevio: 10, costoDespues: 14, stockDespues: 15,
  });
  ok('sin stock contra el cual promediar, vuelve al costo previo',
     b.via === 'previo' && casi(b.costo, 10), `${b.via} ${b.costo}`);
}
{
  const a = recibir(0, 0, 10, 16);
  const b = revertir(a.stock, a.costo, a.caja);
  ok('producto que arrancaba en cero vuelve a cero',
     b.stock === 0 && casi(b.costo, 0), `${b.via} ${b.costo}`);
}
{
  // Dos líneas de la misma caja tocando el mismo producto: los promedios
  // intermedios no sirven, tiene que ir por la inversa.
  const b = costoAlRevertir(20, 14, {
    unidades: 10, costoUnitarioReal: 16, costoPrevio: 10, costoDespues: 14, stockDespues: 20, lineas: 2,
  });
  ok('dos líneas del mismo producto van por la inversa', b.via === 'inversa', b.via);
}
{
  /*
    EL CASO QUE NO SE PUEDE RESOLVER, documentado en el módulo: otra caja al
    mismo promedio Y ventas que bajan el stock por debajo del que dejó ésta.
    No se puede distinguir sin un libro de costos. Lo que sí se prueba es que
    el número que sale es el MÁS CERCANO al real de los dos que sabemos
    calcular — o sea, que la elección de camino no empeora las cosas.
  */
  const a = recibir(5, 10, 10, 16);
  const a2 = recibir(a.stock, a.costo, 10, 14);
  const stockHoy = a2.stock - 12;
  const b = revertir(stockHoy, a2.costo, a.caja);
  const real = recibir(5, 10, 10, 14).costo;           // como si ésta nunca hubiera llegado
  const inversa = (stockHoy * a2.costo - 10 * 16) / (stockHoy - 10);
  ok('caso irrecuperable: se elige el número más cercano al real',
     Math.abs(b.costo - real) < Math.abs(inversa - real),
     `nuestro=${b.costo.toFixed(2)} inversa=${inversa.toFixed(2)} real=${real.toFixed(2)}`);
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
