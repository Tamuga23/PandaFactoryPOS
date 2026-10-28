/**
 * Tests de las reglas de Firestore.
 *
 * Cubren el corte de seguridad completo (Fase 0):
 *   PASO 1 — lectura pública de catalogo_publico, objeciones y config.
 *   PASO 3 — products, sales, purchases, customers, suppliers, movimientos,
 *            counters y company detrás del claim `admin` (isStaff()).
 * Y los apartados (2026-10): la colección nueva, su política en
 * config/apartados y lo que les sumaron a products, sales y movimientos.
 *
 * LA IDEA CENTRAL: antes, "tener sesión" alcanzaba para leer todo, y el POS
 * entraba con `signInAnonymously`. Así que cualquier visitante podía sacar un
 * token anónimo con la API key pública y leer costos, ventas y cédulas de
 * clientes. Ahora el que manda es el custom claim `admin`, que una sesión
 * anónima NUNCA puede tener.
 *
 * Cómo correrlos (necesita firebase-tools y Java 21 o más nuevo: con un Java
 * más viejo el emulador no arranca):
 *   npm run test:rules
 *   (equivale a: firebase emulators:exec --only firestore "vitest run")
 *
 * Los tests del grupo "CIERRA" fallan contra las reglas viejas y pasan con las
 * nuevas. Los de "REGRESIÓN" tienen que pasar con las dos. Los de "APARTADOS"
 * cubren la colección nueva: ver el comentario antes de ese grupo.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let env: RulesTestEnvironment;

/** Visitante de PandaWEB: ninguna sesión de Firebase. */
const visitante = () => env.unauthenticatedContext().firestore();
/**
 * Sesión anónima: la tablet PandaLink, el servidor de PandaWEB y —hasta este
 * cambio— también el POS. Es exactamente el token que cualquiera puede sacar
 * con la API key pública, así que es el atacante del modelo de amenaza.
 */
const anonimo = () => env.authenticatedContext('sesion-anonima').firestore();
/**
 * Staff real: sesión con el custom claim `admin`, que solo se otorga a mano
 * con `node scripts/set_admin_claim.mjs <email>`.
 */
const staff = () => env.authenticatedContext('staff-uid', { admin: true }).firestore();
/**
 * Cuenta con email/password pero SIN el claim. Modela a alguien que se
 * auto-registra con la API key pública: no debe poder leer nada sensible.
 */
const registradoSinClaim = () => env.authenticatedContext('colado-uid', { email: 'colado@x.com' }).firestore();

const OBJ_UNIVERSAL_VALIDA = {
  titulo: 'Tiene garantia?',
  respuesta: 'Si, 3 meses con la factura.',
  ownerId: 'carlos',
};

// --- Apartados: datos de prueba ----------------------------------------------
// Con la forma que escriben las transacciones de useStoreData.ts. Las fechas
// son números chicos: las reglas sólo piden que sean `number`.

const DIA = 86_400_000;

/** La línea de un apartado: igual que la de una venta, sin la foto. */
const LINEA_TV = {
  id: 'p-tv', sku: 'TV55', name: 'Smart TV 55', price: 400, quantity: 1, cost: 250, category: 'tv',
};

/** Lo pactado al apartar. Las reglas no dejan cambiarlo nunca. */
const PACTADO = {
  fecha: 1_000,
  fechaLimite: 1_000 + 30 * DIA,
  items: [LINEA_TV],
  subtotal: 400,
  tax: 0,
  total: 400,
  exchangeRate: 36.6243,
  totalNio: 14_650,
  customerName: 'María López',
  customerPhone: '50588887777',
  ownerId: 'shared_store',
};

const PRIMA = { id: 'abono-prima', fecha: 1_000, montoNio: 3_000, metodo: 'EFECTIVO' };
const SEGUNDO_ABONO = {
  id: 'abono-2', fecha: 2_000, montoNio: 2_000, metodo: 'TRANSFERENCIA', referencia: 'BAC-778812',
};
/** El segundo abono se cargó mal: no se borra, se anula y queda impreso tachado. */
const ANULACION_SEGUNDO = { abonoId: 'abono-2', motivo: 'La transferencia rebotó', fecha: 2_500 };
/** El abono que el operador está registrando ahora. */
const ABONO_NUEVO = {
  id: 'abono-3', fecha: 3_000, montoNio: 1_500, metodo: 'TARJETA', referencia: 'VOUCHER-0042',
};
/** La anulación que el operador está registrando ahora. */
const ANULACION_PRIMA = { abonoId: 'abono-prima', motivo: 'El billete era falso', fecha: 3_000 };

/** Lo que escribe crearApartado: activo, con la prima como único abono. */
const apartadoNuevo = (id: string, numero: string) => ({
  ...PACTADO, id, numero, abonos: [PRIMA], anulaciones: [], status: 'activo', updatedAt: 1_000,
});

/** Activo y con historia: la prima, un segundo abono y la anulación de ese segundo. */
const AP_ACTIVO = {
  ...PACTADO, id: 'ap-activo', numero: 'AP-000001',
  abonos: [PRIMA, SEGUNDO_ABONO], anulaciones: [ANULACION_SEGUNDO],
  status: 'activo', updatedAt: 2_500,
};
const AP_ENTREGADO = {
  ...PACTADO, id: 'ap-entregado', numero: 'AP-000002',
  abonos: [PRIMA, { id: 'abono-saldo', fecha: 4_000, montoNio: 11_650, metodo: 'EFECTIVO' }],
  anulaciones: [],
  status: 'entregado', saleId: 'venta-ap-entregado', invoiceNumber: 'A-000400', entregadoEn: 5_000,
  updatedAt: 5_000,
};
const AP_CANCELADO = {
  ...PACTADO, id: 'ap-cancelado', numero: 'AP-000003',
  abonos: [PRIMA], anulaciones: [],
  status: 'cancelado', canceladoEn: 5_000, devueltoNio: 1_000, motivoCancelacion: 'Ya no lo quiere',
  updatedAt: 5_000,
};

/** La factura que emite entregarApartado para AP_ACTIVO (ver armarVentaDeApartado). */
const VENTA_DE_AP_ACTIVO = {
  id: 'venta-ap-activo',
  date: 6_000,
  items: [LINEA_TV],
  subtotal: 400,
  tax: 0,
  total: 400,
  documentType: 'RECIBO_OFICIAL',
  clientDocumentType: 'NINGUNO',
  customerName: 'María López',
  customerPhone: '50588887777',
  invoiceNumber: 'A-000413',
  currency: 'USD',
  exchangeRate: 36.6243,
  paymentMethod: 'EFECTIVO',
  paymentReference: 'Apartado AP-000001',
  notes: 'Prima C$ 3,000 efectivo',
  status: 'completed',
  apartadoId: 'ap-activo',
  ownerId: 'shared_store',
};

/** Lo que entregarApartado escribe en el apartado: sólo los datos de esa factura. */
const ENTREGA_AP_ACTIVO = {
  status: 'entregado', saleId: 'venta-ap-activo', invoiceNumber: 'A-000413', entregadoEn: 6_000, updatedAt: 6_000,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-panda-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('catalogo_publico').doc('HY310X').set({
      sku: 'HY310X', name: 'Proyector HY310X', precio: { actual: 120 },
    });
    await db.collection('objeciones_universales').doc('garantia').set(OBJ_UNIVERSAL_VALIDA);
    await db.collection('objeciones_categoria').doc('proyector-luz').set({
      categorySlug: 'proyector', pregunta: 'Se ve de dia?', respuesta: 'Con 900 ANSI si.', orden: 1,
    });
    await db.collection('products').doc('p1').set({
      sku: 'HY310X', name: 'Proyector', price: 120, cost: 62, stock: 3,
      minStockAlert: 1, category: 'proyector', createdAt: 1, updatedAt: 1, ownerId: 'carlos',
    });
    await db.collection('sales').doc('s1').set({
      invoiceNumber: 'A-000001', total: 4400, customerId: 'c1', ownerId: 'carlos',
    });
    await db.collection('purchases').doc('co1').set({
      date: 1, items: [], totalCost: 900, ownerId: 'carlos', currency: 'USD',
      exchangeRate: 36.6243, trackings: [], freightCost: 120, customsTaxes: 80,
    });
    await db.collection('customers').doc('c1').set({
      fullName: 'Cliente', phone: '50588888888', documentNumber: '001-010180-0001A',
      createdAt: 1, ownerId: 'carlos',
    });
    await db.collection('suppliers').doc('prov1').set({
      name: 'MagCubic', contactName: 'Andy', createdAt: 1, ownerId: 'carlos',
    });
    await db.collection('movimientos').doc('m1').set({
      productId: 'p1', tipo: 'venta', delta: -1, fecha: 1, ownerId: 'carlos',
    });
    await db.collection('counters').doc('invoices').set({ value: 412, updatedAt: 1 });
    // `company` es mono-tenant: el POS siempre escribe en el doc fijo shared_store.
    await db.collection('company').doc('shared_store').set({
      name: 'Panda Store', phone: 'x', address: 'y', email: 'z@z.com',
      ownerId: 'shared_store', defaultExchangeRate: 36.6243,
    });
    await db.collection('config').doc('financiamiento').set({
      minUsd: 100, plazos: [3, 6], recargoPorDefecto: { 3: 3, 6: 6 },
    });
    // Apartados: el producto con la unidad que tiene apartada AP_ACTIVO, un
    // apartado en cada estado guardado, y la política por defecto.
    await db.collection('products').doc('p-tv').set({
      sku: 'TV55', name: 'Smart TV 55', price: 400, cost: 250, stock: 2, apartadas: 1,
      minStockAlert: 1, category: 'tv', createdAt: 1, updatedAt: 1, ownerId: 'shared_store',
    });
    await db.collection('apartados').doc('ap-activo').set(AP_ACTIVO);
    // Recién creado: la prima sola y la lista de anulaciones VACÍA. Es el caso
    // borde del chequeo de prefijo (`nuevo[0:0] == []`).
    await db.collection('apartados').doc('ap-recien').set(apartadoNuevo('ap-recien', 'AP-000004'));
    await db.collection('apartados').doc('ap-entregado').set(AP_ENTREGADO);
    await db.collection('apartados').doc('ap-cancelado').set(AP_CANCELADO);
    await db.collection('config').doc('apartados').set({ primaMinimaPct: 0, plazoDias: 30 });
  });
});

describe('PÚBLICO · lo que se lee sin ninguna sesión', () => {
  it('un visitante lee una ficha y el catálogo público completo', async () => {
    await assertSucceeds(visitante().collection('catalogo_publico').doc('HY310X').get());
    await assertSucceeds(visitante().collection('catalogo_publico').get());
  });

  it('un visitante lee las objeciones universales y por categoría', async () => {
    await assertSucceeds(visitante().collection('objeciones_universales').get());
    await assertSucceeds(visitante().collection('objeciones_categoria').get());
  });

  it('un visitante lee config/financiamiento — son las cuotas que se le muestran al cliente', async () => {
    await assertSucceeds(visitante().collection('config').doc('financiamiento').get());
    await assertSucceeds(visitante().collection('config').get());
  });

  it('un visitante lee company/shared_store para la tasa de cambio, sin sesión', async () => {
    await assertSucceeds(visitante().collection('company').doc('shared_store').get());
  });
});

describe('PÚBLICO · lo que sigue cerrado a quien no tiene sesión', () => {
  it('no se puede escribir el catálogo público — solo lo toca el Admin SDK', async () => {
    await assertFails(visitante().collection('catalogo_publico').doc('HY310X').set({ precio: { actual: 1 } }));
    await assertFails(anonimo().collection('catalogo_publico').doc('HY310X').set({ precio: { actual: 1 } }));
    await assertFails(staff().collection('catalogo_publico').doc('HY310X').delete());
  });

  it('company NO se puede listar: solo es público el doc shared_store', async () => {
    await assertFails(visitante().collection('company').get());
    await assertFails(visitante().collection('company').doc('otro_uid').get());
  });

  it('nadie sin claim puede escribir config, ni siquiera con sesión', async () => {
    await assertFails(visitante().collection('config').doc('financiamiento').set({
      minUsd: 0, plazos: [3], recargoPorDefecto: {},
    }));
    await assertFails(anonimo().collection('config').doc('financiamiento').set({
      minUsd: 0, plazos: [3], recargoPorDefecto: {},
    }));
  });
});

describe('CIERRA · el agujero: una sesión anónima ya no lee nada sensible', () => {
  it('products (que lleva el costo) no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('products').doc('p1').get());
    await assertFails(anonimo().collection('products').get());
  });

  it('sales no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('sales').get());
    await assertFails(anonimo().collection('sales').doc('s1').get());
  });

  it('purchases (costo de importación, flete, aduana) no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('purchases').get());
  });

  it('customers (PII y cédula) no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('customers').get());
    await assertFails(anonimo().collection('customers').doc('c1').get());
  });

  it('suppliers no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('suppliers').get());
  });

  it('movimientos (kardex: velocidad de venta por SKU) no se lee con sesión anónima', async () => {
    await assertFails(anonimo().collection('movimientos').get());
  });

  it('counters no se lee con sesión anónima — delataba el volumen total de facturas', async () => {
    await assertFails(anonimo().collection('counters').doc('invoices').get());
  });

  it('company no se lista con sesión anónima', async () => {
    await assertFails(anonimo().collection('company').get());
  });

  it('una sesión anónima tampoco puede BORRAR nada', async () => {
    await assertFails(anonimo().collection('products').doc('p1').delete());
    await assertFails(anonimo().collection('sales').doc('s1').delete());
    await assertFails(anonimo().collection('customers').doc('c1').delete());
  });

  it('una sesión anónima ya no puede reescribir las objeciones que ve el cliente', async () => {
    await assertFails(anonimo().collection('objeciones_universales').doc('garantia').set({
      titulo: 'Hackeado', respuesta: 'Texto falso', ownerId: 'atacante',
    }));
    await assertFails(anonimo().collection('objeciones_universales').doc('garantia').delete());
    await assertFails(anonimo().collection('objeciones_categoria').doc('proyector-luz').delete());
  });
});

describe('CIERRA · auto-registrarse con email/password no alcanza', () => {
  it('una cuenta sin el claim admin no lee products ni sales', async () => {
    await assertFails(registradoSinClaim().collection('products').get());
    await assertFails(registradoSinClaim().collection('sales').get());
    await assertFails(registradoSinClaim().collection('customers').get());
  });
});

describe('REGRESIÓN · el staff con claim admin sigue trabajando igual', () => {
  it('lee todas las colecciones del negocio', async () => {
    await assertSucceeds(staff().collection('products').get());
    await assertSucceeds(staff().collection('sales').get());
    await assertSucceeds(staff().collection('purchases').get());
    await assertSucceeds(staff().collection('customers').get());
    await assertSucceeds(staff().collection('suppliers').get());
    await assertSucceeds(staff().collection('movimientos').get());
  });

  it('lee company por colección — el POS usa snapshot.docs[0]', async () => {
    await assertSucceeds(staff().collection('company').get());
    await assertSucceeds(staff().collection('company').doc('shared_store').get());
  });

  it('lee el contador de facturas para numerar la próxima venta', async () => {
    await assertSucceeds(staff().collection('counters').doc('invoices').get());
  });

  it('sigue leyendo el catálogo y las objeciones', async () => {
    await assertSucceeds(staff().collection('catalogo_publico').get());
    await assertSucceeds(staff().collection('objeciones_universales').get());
    await assertSucceeds(staff().collection('objeciones_categoria').get());
  });

  it('crea una objeción universal válida y rechaza una mal formada', async () => {
    await assertSucceeds(
      staff().collection('objeciones_universales').doc('factura').set(OBJ_UNIVERSAL_VALIDA),
    );
    await assertFails(
      staff().collection('objeciones_universales').doc('rota').set({ titulo: 'sin respuesta', ownerId: 'carlos' }),
    );
  });

  it('escribe la configuración de financiamiento', async () => {
    await assertSucceeds(staff().collection('config').doc('financiamiento').set({
      minUsd: 150, plazos: [3, 6], recargoPorDefecto: { 3: 3, 6: 6 },
    }));
  });

  it('sigue sin poder romper el kardex: es un ledger inmutable', async () => {
    await assertFails(staff().collection('movimientos').doc('m1').delete());
    await assertFails(staff().collection('movimientos').doc('m1').update({ delta: 99 }));
  });

  it('una colección no declarada sigue cerrada para todos', async () => {
    await assertFails(visitante().collection('coleccion_inventada').get());
    await assertFails(anonimo().collection('coleccion_inventada').get());
    await assertFails(staff().collection('coleccion_inventada').get());
  });
});

// =============================================================================
// APARTADOS (2026-10)
//
// Prueban las tres garantías del bloque de apartados en firestore.rules: los
// abonos y las anulaciones sólo crecen al final y de a uno, cada transición
// toca sólo sus campos, y entregado y cancelado son terminales.
//
// Lo que NO se prueba, porque las reglas no lo pueden ver: las cuentas. Sin
// bucles no se suman los abonos, así que "se entrega con el saldo en cero",
// "un abono no se pasa del saldo" y "no se devuelve más de lo abonado" los
// cuida la transacción del hook contra el servidor (useStoreData.ts). Por eso
// acá AP_ACTIVO se entrega sin estar pagado: las reglas lo dejan, el hook no.
// =============================================================================

describe('APARTADOS · sólo el staff los lee y los crea, y nadie los borra', () => {
  it('nadie sin el claim admin lee, lista ni crea apartados — nombre, teléfono y plata del cliente', async () => {
    await assertFails(visitante().collection('apartados').doc('ap-activo').get());
    await assertFails(visitante().collection('apartados').get());
    await assertFails(anonimo().collection('apartados').doc('ap-activo').get());
    await assertFails(anonimo().collection('apartados').get());
    await assertFails(registradoSinClaim().collection('apartados').get());
    await assertFails(
      anonimo().collection('apartados').doc('ap-nuevo').set(apartadoNuevo('ap-nuevo', 'AP-000005')),
    );
  });

  it('el staff los lee y los lista', async () => {
    await assertSucceeds(staff().collection('apartados').doc('ap-activo').get());
    await assertSucceeds(staff().collection('apartados').get());
  });

  it('el staff crea uno válido: activo, con la prima como único abono y sin anulaciones', async () => {
    await assertSucceeds(
      staff().collection('apartados').doc('ap-nuevo').set(apartadoNuevo('ap-nuevo', 'AP-000005')),
    );
  });

  it('no nace con dos abonos, ni entregado, ni con una factura colgada', async () => {
    const nuevo = staff().collection('apartados').doc('ap-nuevo');
    const base = apartadoNuevo('ap-nuevo', 'AP-000005');
    // Al apartar entra la prima y nada más.
    await assertFails(nuevo.set({ ...base, abonos: [PRIMA, ABONO_NUEVO] }));
    await assertFails(nuevo.set({ ...base, status: 'entregado' }));
    await assertFails(nuevo.set({ ...base, saleId: 'venta-ap-nuevo' }));
  });

  it('nadie lo borra, ni el staff: es un registro de plata, igual que el kardex', async () => {
    await assertFails(staff().collection('apartados').doc('ap-activo').delete());
    // Un cancelado tampoco: se queda con lo que se le devolvió al cliente.
    await assertFails(staff().collection('apartados').doc('ap-cancelado').delete());
  });
});

describe('APARTADOS · los abonos sólo crecen al final, de a uno', () => {
  const abonar = (abonos: unknown[], id = 'ap-activo') =>
    staff().collection('apartados').doc(id).update({ abonos, updatedAt: 3_000 });

  it('agregar UN abono válido al final pasa: el primero después de la prima y los siguientes', async () => {
    await assertSucceeds(abonar([PRIMA, ABONO_NUEVO], 'ap-recien'));
    await assertSucceeds(abonar([PRIMA, SEGUNDO_ABONO, ABONO_NUEVO]));
  });

  it('un abono con FINANCIAMIENTO falla: las cuotas las paga el banco al vender, y un apartado no es una venta', async () => {
    await assertFails(abonar([PRIMA, SEGUNDO_ABONO, { ...ABONO_NUEVO, metodo: 'FINANCIAMIENTO' }]));
  });

  it('un abono de C$ 0 o con un campo de más no entra', async () => {
    await assertFails(abonar([PRIMA, SEGUNDO_ABONO, { ...ABONO_NUEVO, montoNio: 0 }]));
    await assertFails(abonar([PRIMA, SEGUNDO_ABONO, { ...ABONO_NUEVO, cajero: 'Carlos' }]));
  });

  it('dos abonos en la misma escritura no entran', async () => {
    await assertFails(abonar([PRIMA, SEGUNDO_ABONO, ABONO_NUEVO, { ...ABONO_NUEVO, id: 'abono-4' }]));
  });

  it('reescribir un abono ya registrado falla, aunque la lista crezca', async () => {
    // Bajarle la prima y, en la misma escritura, agregar uno válido: el tamaño
    // da +1 y el último es válido. Lo frena sólo el chequeo de prefijo.
    await assertFails(abonar([{ ...PRIMA, montoNio: 300 }, SEGUNDO_ABONO, ABONO_NUEVO]));
    await assertFails(abonar([{ ...PRIMA, montoNio: 300 }, SEGUNDO_ABONO]));
  });

  it('el abono nuevo va AL FINAL: meterlo adelante falla', async () => {
    await assertFails(abonar([ABONO_NUEVO, PRIMA, SEGUNDO_ABONO]));
  });

  it('sacar un abono falla: uno mal cargado se anula, no se borra', async () => {
    await assertFails(abonar([PRIMA]));
    await assertFails(abonar([SEGUNDO_ABONO]));
  });
});

describe('APARTADOS · las anulaciones tampoco se reescriben', () => {
  const anular = (anulaciones: unknown[], id = 'ap-activo') =>
    staff().collection('apartados').doc(id).update({ anulaciones, updatedAt: 3_000 });

  it('agregar una anulación válida al final pasa', async () => {
    await assertSucceeds(anular([ANULACION_SEGUNDO, ANULACION_PRIMA]));
  });

  it('la PRIMERA anulación también pasa: el prefijo que se compara es la lista vacía', async () => {
    // En el motor de reglas `lista[0:0]` no da la lista vacía: tira "Index out
    // of bound error. Index: [-1]". Si el chequeo de prefijo no aparta el caso
    // `viejo.size() == 0`, ningún apartado registra su primera anulación, y sin
    // la primera no hay ninguna. (Visto en el emulador el 2026-10-27.)
    await assertSucceeds(anular([ANULACION_PRIMA], 'ap-recien'));
  });

  it('una anulación sin motivo no entra: el motivo es lo que explica el tachado en el papel', async () => {
    await assertFails(anular([ANULACION_SEGUNDO, { ...ANULACION_PRIMA, motivo: '' }]));
  });

  it('reescribir o sacar una anulación existente falla', async () => {
    await assertFails(anular([{ ...ANULACION_SEGUNDO, motivo: 'Otro motivo' }]));
    await assertFails(anular([{ ...ANULACION_SEGUNDO, motivo: 'Otro motivo' }, ANULACION_PRIMA]));
    await assertFails(anular([]));
  });
});

describe('APARTADOS · lo pactado al apartar no se toca', () => {
  const cambiar = (campos: Record<string, unknown>) =>
    staff().collection('apartados').doc('ap-activo').update({ ...campos, updatedAt: 3_000 });

  it('cambiar las líneas, el total, el total en córdobas, la tasa o el número falla', async () => {
    await assertFails(cambiar({ items: [{ ...LINEA_TV, price: 1 }] }));
    await assertFails(cambiar({ total: 1 }));
    await assertFails(cambiar({ totalNio: 1 }));
    await assertFails(cambiar({ exchangeRate: 40 }));
    await assertFails(cambiar({ numero: 'AP-000999' }));
  });

  it('activo: mover la fecha límite y corregir la nota o el teléfono sí pasa', async () => {
    await assertSucceeds(cambiar({
      fechaLimite: 1_000 + 45 * DIA, notes: 'Paga los viernes', customerPhone: '50588880000',
    }));
  });
});

describe('APARTADOS · entregar y cancelar', () => {
  const apActivo = () => staff().collection('apartados').doc('ap-activo');

  it('activo → entregado sin la venta escrita falla: no hay entrega sin factura', async () => {
    await assertFails(apActivo().update(ENTREGA_AP_ACTIVO));
  });

  it('activo → entregado con la venta escrita en el MISMO batch pasa', async () => {
    // existsAfter mira cómo queda la base al terminar la escritura entera.
    const db = staff();
    const batch = db.batch();
    batch.set(db.collection('sales').doc('venta-ap-activo'), VENTA_DE_AP_ACTIVO);
    batch.update(db.collection('apartados').doc('ap-activo'), ENTREGA_AP_ACTIVO);
    await assertSucceeds(batch.commit());
  });

  it('activo → entregado con la venta ya escrita por un intento anterior pasa', async () => {
    // El camino de entregarApartado cuando la venta ya existe: no emite otra,
    // sólo cierra el apartado.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('sales').doc('venta-ap-activo').set(VENTA_DE_AP_ACTIVO);
    });
    await assertSucceeds(apActivo().update(ENTREGA_AP_ACTIVO));
  });

  it('activo → entregado apuntando a una venta AJENA falla: la factura tiene que ser la de este apartado', async () => {
    // Antes bastaba con que `saleId` existiera: cualquier venta vieja daba el
    // apartado por entregado sin emitir su factura. Ahora la venta tiene que
    // llevar el `apartadoId` de este apartado.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { apartadoId: _sinApartado, ...ajena } = VENTA_DE_AP_ACTIVO;
      await ctx.firestore().collection('sales').doc('venta-ap-activo').set(ajena);
      await ctx.firestore().collection('sales').doc('venta-de-otro').set({ ...VENTA_DE_AP_ACTIVO, apartadoId: 'ap-recien' });
    });
    await assertFails(apActivo().update(ENTREGA_AP_ACTIVO));
    await assertFails(apActivo().update({ ...ENTREGA_AP_ACTIVO, saleId: 'venta-de-otro' }));
  });

  it('activo → cancelado con lo devuelto pasa, aunque sea 0', async () => {
    await assertSucceeds(apActivo().update({
      status: 'cancelado', canceladoEn: 6_000, devueltoNio: 0,
      motivoCancelacion: 'No volvió a pagar', updatedAt: 6_000,
    }));
  });

  it('activo → cancelado sin decir cuánto se devolvió falla', async () => {
    await assertFails(apActivo().update({ status: 'cancelado', canceladoEn: 6_000, updatedAt: 6_000 }));
  });
});

describe('APARTADOS · entregado y cancelado son terminales', () => {
  const ap = (id: string) => staff().collection('apartados').doc(id);

  it('cancelado: no recibe abonos, no anula abonos y no cambia lo devuelto', async () => {
    await assertFails(ap('ap-cancelado').update({ abonos: [PRIMA, ABONO_NUEVO], updatedAt: 6_000 }));
    await assertFails(ap('ap-cancelado').update({ anulaciones: [ANULACION_PRIMA], updatedAt: 6_000 }));
    await assertFails(ap('ap-cancelado').update({ devueltoNio: 3_000, updatedAt: 6_000 }));
  });

  it('cancelado: la nota se sigue pudiendo corregir', async () => {
    await assertSucceeds(ap('ap-cancelado').update({ notes: 'Se le devolvió en efectivo', updatedAt: 6_000 }));
  });

  it('cancelado no se reabre', async () => {
    await assertFails(ap('ap-cancelado').update({ status: 'activo', updatedAt: 6_000 }));
  });

  it('entregado: no recibe abonos, no cambia su factura y no se cancela', async () => {
    await assertFails(ap('ap-entregado').update({
      abonos: [...AP_ENTREGADO.abonos, ABONO_NUEVO], updatedAt: 6_000,
    }));
    await assertFails(ap('ap-entregado').update({ invoiceNumber: 'A-000999', updatedAt: 6_000 }));
    // Si el cliente devuelve el producto, se anula la factura en el Historial.
    await assertFails(ap('ap-entregado').update({
      status: 'cancelado', canceladoEn: 6_000, devueltoNio: 0, updatedAt: 6_000,
    }));
  });
});

describe('APARTADOS · config/apartados', () => {
  const POLITICA = { primaMinimaPct: 20, plazoDias: 30, actualizadoEn: 1_000 };

  it('se lee sin sesión, como financiamiento: es la condición que se le dice al cliente', async () => {
    await assertSucceeds(visitante().collection('config').doc('apartados').get());
  });

  it('nadie sin el claim la escribe, aunque los datos sean válidos', async () => {
    // Sin el paréntesis que envuelve las dos ramas (`isStaff() && A || B`), la
    // de apartados no pediría el claim y estos tres pasarían.
    await assertFails(visitante().collection('config').doc('apartados').set(POLITICA));
    await assertFails(anonimo().collection('config').doc('apartados').set(POLITICA));
    await assertFails(registradoSinClaim().collection('config').doc('apartados').set(POLITICA));
  });

  it('el staff escribe una política válida, con prima mínima o sin ella', async () => {
    await assertSucceeds(staff().collection('config').doc('apartados').set(POLITICA));
    await assertSucceeds(staff().collection('config').doc('apartados').set({ primaMinimaPct: 0, plazoDias: 30 }));
  });

  it('el plazo va en días enteros: 30.5 falla', async () => {
    await assertFails(staff().collection('config').doc('apartados').set({ ...POLITICA, plazoDias: 30.5 }));
  });

  it('cada doc con su forma: financiamiento se sigue escribiendo, y nada entra por el doc equivocado', async () => {
    const financiamiento = { minUsd: 150, plazos: [3, 6], recargoPorDefecto: { 3: 3, 6: 6 } };
    await assertSucceeds(staff().collection('config').doc('financiamiento').set(financiamiento));
    await assertFails(staff().collection('config').doc('financiamiento').set(POLITICA));
    await assertFails(staff().collection('config').doc('apartados').set(financiamiento));
    await assertFails(staff().collection('config').doc('otra_cosa').set(POLITICA));
  });
});

describe('APARTADOS · lo que sumaron a products, movimientos y sales', () => {
  it('el staff guarda las unidades apartadas de un producto; un número negativo falla', async () => {
    await assertSucceeds(
      staff().collection('products').doc('p1').update({ stock: 1, apartadas: 2, updatedAt: 2 }),
    );
    await assertFails(staff().collection('products').doc('p1').update({ apartadas: -1, updatedAt: 3 }));
  });

  it('el kardex acepta los tipos apartado y liberacion, y sigue rechazando uno inventado', async () => {
    const mov = (tipo: string, delta: number) => ({
      productId: 'p-tv', productName: 'Smart TV 55', sku: 'TV55', tipo, delta, stockDespues: 2 + delta,
      refId: 'ap-activo', motivo: 'Apartado AP-000001 · María López', fecha: 6_000, ownerId: 'shared_store',
    });
    await assertSucceeds(staff().collection('movimientos').add(mov('apartado', -1)));
    await assertSucceeds(staff().collection('movimientos').add(mov('liberacion', 1)));
    await assertFails(staff().collection('movimientos').add(mov('regalo', -1)));
  });

  it('una venta con apartadoId pasa; con un apartadoId que no es texto, no', async () => {
    await assertSucceeds(staff().collection('sales').doc('venta-ap-activo').set(VENTA_DE_AP_ACTIVO));
    await assertFails(
      staff().collection('sales').doc('venta-rara').set({ ...VENTA_DE_AP_ACTIVO, apartadoId: 42 }),
    );
  });

  it('una línea que arrastra `apartadas` se rechaza: por eso TABLET_ONLY_SALE_ITEM_FIELDS lo saca', async () => {
    // Es un dato del inventario, no de la línea vendida. isValidSaleItem no lo
    // permite, y las líneas de un apartado pasan por la misma función.
    const linea = { ...LINEA_TV, apartadas: 1 };
    await assertFails(
      staff().collection('sales').doc('venta-rara').set({ ...VENTA_DE_AP_ACTIVO, items: [linea] }),
    );
    await assertFails(staff().collection('apartados').doc('ap-nuevo').set({
      ...apartadoNuevo('ap-nuevo', 'AP-000005'), items: [linea],
    }));
  });
});

describe('APARTADOS · lo que escribe cada transacción del hook pasa entero', () => {
  // Cada transacción de useStoreData.ts escribe en varias colecciones, y basta
  // con que UNA escritura no pase para que no se aparte, no se entregue o no se
  // cancele nada. Un batch se evalúa con las mismas reglas que una transacción.

  it('crearApartado: contador de apartados, producto, kardex y apartado', async () => {
    const db = staff();
    const batch = db.batch();
    batch.set(db.collection('counters').doc('apartados'), { value: 5, updatedAt: 6_000 });
    batch.update(db.collection('products').doc('p-tv'), { stock: 1, apartadas: 2, updatedAt: 6_000 });
    batch.set(db.collection('movimientos').doc(), {
      productId: 'p-tv', productName: 'Smart TV 55', sku: 'TV55', tipo: 'apartado', delta: -1,
      stockDespues: 1, refId: 'ap-nuevo', fecha: 6_000, motivo: 'Apartado AP-000005 · María López',
      ownerId: 'shared_store',
    });
    batch.set(db.collection('apartados').doc('ap-nuevo'), apartadoNuevo('ap-nuevo', 'AP-000005'));
    await assertSucceeds(batch.commit());
  });

  it('entregarApartado: contador de facturas, venta, producto y apartado', async () => {
    const db = staff();
    const batch = db.batch();
    batch.set(db.collection('counters').doc('invoices'), { value: 413, updatedAt: 6_000 });
    batch.set(db.collection('sales').doc('venta-ap-activo'), VENTA_DE_AP_ACTIVO);
    // No toca `stock` (las unidades salieron al apartar); sí baja `apartadas`.
    batch.update(db.collection('products').doc('p-tv'), { apartadas: 0, updatedAt: 6_000 });
    batch.update(db.collection('apartados').doc('ap-activo'), ENTREGA_AP_ACTIVO);
    await assertSucceeds(batch.commit());
  });

  it('cancelarApartado: producto (stock, apartadas y costo promedio), kardex y apartado', async () => {
    const db = staff();
    const batch = db.batch();
    batch.update(db.collection('products').doc('p-tv'), { stock: 3, apartadas: 0, cost: 250, updatedAt: 6_000 });
    batch.set(db.collection('movimientos').doc(), {
      productId: 'p-tv', productName: 'Smart TV 55', sku: 'TV55', tipo: 'liberacion', delta: 1,
      stockDespues: 3, refId: 'ap-activo', fecha: 6_000,
      motivo: 'Apartado AP-000001 cancelado · No volvió a pagar', ownerId: 'shared_store',
    });
    batch.update(db.collection('apartados').doc('ap-activo'), {
      status: 'cancelado', canceladoEn: 6_000, devueltoNio: 3_000,
      motivoCancelacion: 'No volvió a pagar', updatedAt: 6_000,
    });
    await assertSucceeds(batch.commit());
  });
});

// =============================================================================
// ENCARGOS · apartar lo que todavía no llegó (2026-10-27)
//
// Un encargo es un apartado con unidades que no estaban en la tienda. Lo que
// no se reservó queda en `encargo` (no cambia nunca) y cada vez que una parte
// llega —o se revierte la recepción que la trajo— se agrega una entrada a
// `llegadas`, que sólo crece. El producto lleva `encargadas`: lo prometido que
// no está en la tienda.
// =============================================================================

describe('ENCARGOS · lo que el apartado registra de la mercadería que espera', () => {
  /** El apartado de un encargo recién creado: el TV no estaba, queda por llegar. */
  const encargoNuevo = (id: string, numero: string) => ({
    ...apartadoNuevo(id, numero), encargo: [{ productId: 'p-tv', cantidad: 1 }], llegadas: [],
  });
  const LLEGADA_TV = {
    productId: 'p-tv', cantidad: 1, fecha: 4_000, origen: 'compra', costoUnitario: 262.5,
    compraId: 'co1', trackingId: 'trk-1',
  };
  const sembrarEncargo = () => env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('apartados').doc('ap-encargo').set(encargoNuevo('ap-encargo', 'AP-000006'));
  });
  const apEncargo = () => staff().collection('apartados').doc('ap-encargo');

  it('el staff crea un encargo: con lo que falta en `encargo` y sin llegadas', async () => {
    await assertSucceeds(staff().collection('apartados').doc('ap-nuevo').set(encargoNuevo('ap-nuevo', 'AP-000005')));
  });

  it('no nace con llegadas, ni con un renglón de encargo en 0 o con un campo de más', async () => {
    const nuevo = staff().collection('apartados').doc('ap-nuevo');
    const base = encargoNuevo('ap-nuevo', 'AP-000005');
    await assertFails(nuevo.set({ ...base, llegadas: [LLEGADA_TV] }));
    await assertFails(nuevo.set({ ...base, encargo: [{ productId: 'p-tv', cantidad: 0 }] }));
    await assertFails(nuevo.set({ ...base, encargo: [{ productId: 'p-tv', cantidad: 1, orden: 'co1' }] }));
  });

  it('registrar que llegó pasa, y con la llegada se fija la fecha límite', async () => {
    await sembrarEncargo();
    await assertSucceeds(apEncargo().update({ llegadas: [LLEGADA_TV], fechaLimite: 4_000 + 30 * DIA, updatedAt: 4_000 }));
  });

  it('una caja puede traer hasta cinco productos del mismo apartado en una escritura, no seis', async () => {
    await sembrarEncargo();
    const varias = (n: number) => Array.from({ length: n }, (_, i) => ({ ...LLEGADA_TV, productId: `p-${i}` }));
    await assertFails(apEncargo().update({ llegadas: varias(6), updatedAt: 4_000 }));
    await assertSucceeds(apEncargo().update({ llegadas: varias(5), updatedAt: 4_000 }));
  });

  it('una llegada mal formada no entra, sea la primera o la última de la escritura', async () => {
    // Las reglas validan la primera y la última nuevas (ver llegadasSoloCrecen:
    // las cinco pasaban el tope de expresiones). Con dos, son todas.
    await sembrarEncargo();
    await assertFails(apEncargo().update({
      llegadas: [LLEGADA_TV, { ...LLEGADA_TV, origen: 'regalo' }], updatedAt: 4_000,
    }));
    await assertFails(apEncargo().update({
      llegadas: [{ ...LLEGADA_TV, origen: 'regalo' }, LLEGADA_TV], updatedAt: 4_000,
    }));
    await assertFails(apEncargo().update({ llegadas: [{ ...LLEGADA_TV, cantidad: 0 }], updatedAt: 4_000 }));
    await assertFails(apEncargo().update({ llegadas: [{ ...LLEGADA_TV, cantidad: 1.5 }], updatedAt: 4_000 }));
  });

  it('revertir la recepción agrega una llegada NEGATIVA; reescribir o sacar una llegada falla', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('apartados').doc('ap-encargo').set({
        ...encargoNuevo('ap-encargo', 'AP-000006'), llegadas: [LLEGADA_TV],
      });
    });
    const reversion = { ...LLEGADA_TV, cantidad: -1, origen: 'reversion', fecha: 5_000 };
    await assertSucceeds(apEncargo().update({ llegadas: [LLEGADA_TV, reversion], updatedAt: 5_000 }));
    await assertFails(apEncargo().update({ llegadas: [], updatedAt: 6_000 }));
    await assertFails(apEncargo().update({ llegadas: [{ ...LLEGADA_TV, cantidad: 2 }, reversion], updatedAt: 6_000 }));
  });

  it('lo encargado no se toca después de apartar', async () => {
    await sembrarEncargo();
    await assertFails(apEncargo().update({ encargo: [{ productId: 'p-tv', cantidad: 2 }], updatedAt: 4_000 }));
    await assertFails(apEncargo().update({ encargo: [], updatedAt: 4_000 }));
  });

  it('un apartado cerrado ya no registra llegadas', async () => {
    await assertFails(staff().collection('apartados').doc('ap-cancelado').update({
      llegadas: [LLEGADA_TV], updatedAt: 6_000,
    }));
    await assertFails(staff().collection('apartados').doc('ap-entregado').update({
      llegadas: [LLEGADA_TV], updatedAt: 6_000,
    }));
  });

  it('el producto guarda sus unidades encargadas; un número negativo falla', async () => {
    await assertSucceeds(staff().collection('products').doc('p-tv').update({ encargadas: 1, updatedAt: 2 }));
    await assertFails(staff().collection('products').doc('p-tv').update({ encargadas: -1, updatedAt: 3 }));
  });

  it('recibir la caja que trae un encargo: compra, producto, kardex y apartado en una escritura', async () => {
    await sembrarEncargo();
    const db = staff();
    const batch = db.batch();
    // La recepción suma 3 al stock y le reserva 1 al encargo: neto +2.
    batch.update(db.collection('products').doc('p-tv'), {
      stock: 4, apartadas: 2, encargadas: 0, cost: 262.5, updatedAt: 4_000,
    });
    batch.set(db.collection('movimientos').doc(), {
      productId: 'p-tv', productName: 'Smart TV 55', sku: 'TV55', tipo: 'compra', delta: 3,
      stockDespues: 5, refId: 'co1', fecha: 4_000, ownerId: 'shared_store',
    });
    batch.set(db.collection('movimientos').doc(), {
      productId: 'p-tv', productName: 'Smart TV 55', sku: 'TV55', tipo: 'apartado', delta: -1,
      stockDespues: 4, refId: 'ap-encargo', fecha: 4_000, motivo: 'Llegó para AP-000006 · María López',
      ownerId: 'shared_store',
    });
    batch.update(db.collection('apartados').doc('ap-encargo'), {
      llegadas: [LLEGADA_TV], fechaLimite: 4_000 + 30 * DIA, updatedAt: 4_000,
    });
    await assertSucceeds(batch.commit());
  });
});
