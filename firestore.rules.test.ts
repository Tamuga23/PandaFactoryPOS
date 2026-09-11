/**
 * Tests de las reglas de Firestore.
 *
 * Cubren el corte de seguridad completo (Fase 0):
 *   PASO 1 — lectura pública de catalogo_publico, objeciones y config.
 *   PASO 3 — products, sales, purchases, customers, suppliers, movimientos,
 *            counters y company detrás del claim `admin` (isStaff()).
 *
 * LA IDEA CENTRAL: antes, "tener sesión" alcanzaba para leer todo, y el POS
 * entraba con `signInAnonymously`. Así que cualquier visitante podía sacar un
 * token anónimo con la API key pública y leer costos, ventas y cédulas de
 * clientes. Ahora el que manda es el custom claim `admin`, que una sesión
 * anónima NUNCA puede tener.
 *
 * Cómo correrlos (necesita firebase-tools y Java):
 *   npm run test:rules
 *   (equivale a: firebase emulators:exec --only firestore "vitest run")
 *
 * Los tests del grupo "CIERRA" fallan contra las reglas viejas y pasan con las
 * nuevas. Los de "REGRESIÓN" tienen que pasar con las dos.
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
