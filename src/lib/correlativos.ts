import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './db';

/*
  El número de factura más alto que ya se entregó a un cliente.

  Esto existe porque `recordSale` asigna el correlativo haciendo `contador + 1`
  y NO verifica si ese número ya se usó: la venta se guarda bajo su uuid, así
  que Firestore acepta sin chistar dos ventas con el mismo `invoiceNumber`. El
  único freno es no dejar que el contador se ponga por debajo del máximo ya
  emitido — y ese freno depende de este número.

  El cálculo anterior era:

      orderBy('invoiceNumber', 'desc'), limit(30)
      ...descartar lo que no empiece con 'A'

  con un comentario que explicaba que, al llevar ceros a la izquierda, el orden
  lexicográfico coincide con el numérico. Coincide, pero sólo entre números del
  mismo prefijo, y ahí está la falla: las PROFORMAS se numeran con 'P', y
  'P' (0x50) > 'A' (0x41). En orden descendente, TODA proforma va por encima de
  TODA factura. Con treinta proformas emitidas, las treinta filas de la ventana
  son proformas, el filtro las descarta una por una, el máximo queda en 0 y la
  validación "no podés bajar el contador" pasa cualquier número. El guard se
  apagaba solo, en silencio, justo en la tienda que más vende.

  El mismo orden rompe con los dos formatos de factura: '0' (0x30) > '-'
  (0x2D), así que el legacy 'A001543' se ordena por encima del nuevo
  'A-001543'.

  Acá se calcula de dos fuentes que no dependen del orden de los strings:

    1. El CONTADOR, que es la autoridad real. `recordSale` lo lee y lo escribe
       dentro de la misma transacción que la venta, así que su valor es el
       último número que se entregó. Cubre todo lo emitido por el sistema.

    2. Dos barridos por RANGO sobre `invoiceNumber`, uno por formato, para lo
       que se haya importado antes de que el contador existiera. El rango
       restringe la consulta a un solo prefijo, así que adentro de cada uno el
       orden lexicográfico sí es el numérico.

  Los rangos: los dígitos van de '0' (0x30) a '9' (0x39), y ':' es 0x3A; el
  guion es 0x2D y el punto 0x2E. De ahí ['A0','A:') y ['A-','A.').
*/

const numeroDe = (inv: string): number => {
  const m = inv.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
};

/** Máximo dentro de un rango de prefijo. Un solo campo: no hace falta índice compuesto. */
const maximoEnRango = async (desde: string, hasta: string): Promise<number> => {
  const snap = await getDocs(query(
    collection(db, 'sales'),
    where('invoiceNumber', '>=', desde),
    where('invoiceNumber', '<', hasta),
    orderBy('invoiceNumber', 'desc'),
    limit(5),
  ));
  let max = 0;
  snap.docs.forEach((d) => {
    max = Math.max(max, numeroDe(String((d.data() as any).invoiceNumber || '')));
  });
  return max;
};

/**
 * El correlativo de factura más alto ya emitido. Devuelve 0 si no hay ninguno.
 * Nunca lanza por el barrido: si las consultas fallan, se queda con el contador,
 * que es la fuente que importa.
 */
export const maximoFacturaEmitido = async (): Promise<number> => {
  let max = 0;

  const cont = await getDoc(doc(db, 'counters', 'invoices'));
  if (cont.exists()) {
    max = Math.max(max, Number((cont.data() as any).value) || 0);
  }

  try {
    const [legacy, nuevo] = await Promise.all([
      maximoEnRango('A0', 'A:'),  // A001543
      maximoEnRango('A-', 'A.'),  // A-001543
    ]);
    max = Math.max(max, legacy, nuevo);
  } catch {
    // Un índice que falta o una regla que rechaza el rango no pueden dejar sin
    // protección al contador: con el valor del contador ya alcanza para el caso
    // normal, y es mejor proteger de más que de menos.
  }

  return max;
};
