/**
 * Tests de las reglas de Firestore.
 *
 * Cubren el PASO 1 del corte de seguridad (Fase 0): abrir la lectura de
 * catalogo_publico y de las dos colecciones de objeciones, SIN abrir nada
 * más y SIN cerrar nada todavía.
 *
 * Cómo correrlos (necesita firebase-tools y Java):
 *   npm i -D firebase-tools
 *   npx firebase emulators:exec --only firestore --project demo-panda "npx vitest run"
 *
 * Los tests del grupo "ABRE" fallan contra las reglas viejas y pasan con las
 * nuevas. Los de "REGRESIÓN" tienen que pasar con las dos: son la prueba de
 * que este paso no le quitó el acceso a nadie.
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
/** La tablet y el POS de hoy: sesión anónima de Firebase. */
const conSesion = () => env.authenticatedContext('sesion-anonima').firestore();

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
    await db.collection('customers').doc('c1').set({
      name: 'Cliente', phone: '50588888888', ownerId: 'carlos',
    });
    await db.collection('company').doc('uid1').set({
      name: 'Panda Store', phone: 'x', address: 'y', email: 'z@z.com',
      ownerId: 'carlos', defaultExchangeRate: 36.6243,
    });
  });
});

describe('PASO 1 · lo que este cambio ABRE', () => {
  it('un visitante sin sesión lee una ficha del catálogo público', async () => {
    await assertSucceeds(visitante().collection('catalogo_publico').doc('HY310X').get());
  });

  it('un visitante sin sesión lista el catálogo público completo', async () => {
    await assertSucceeds(visitante().collection('catalogo_publico').get());
  });

  it('un visitante sin sesión lee las objeciones universales', async () => {
    await assertSucceeds(visitante().collection('objeciones_universales').get());
    await assertSucceeds(visitante().collection('objeciones_universales').doc('garantia').get());
  });

  it('un visitante sin sesión lee las objeciones por categoría', async () => {
    await assertSucceeds(visitante().collection('objeciones_categoria').get());
    await assertSucceeds(visitante().collection('objeciones_categoria').doc('proyector-luz').get());
  });

  it('el id del documento se sigue validando: un id con caracteres raros no se lee', async () => {
    await assertFails(visitante().collection('catalogo_publico').doc('id con espacios').get());
  });
});

describe('PASO 1 · lo que NO se abre (las escrituras)', () => {
  it('el catálogo público no se puede escribir sin sesión', async () => {
    await assertFails(visitante().collection('catalogo_publico').doc('HY310X').set({ precio: { actual: 1 } }));
  });

  it('el catálogo público tampoco se puede escribir CON sesión — solo lo toca el Admin SDK', async () => {
    await assertFails(conSesion().collection('catalogo_publico').doc('HY310X').set({ precio: { actual: 1 } }));
    await assertFails(conSesion().collection('catalogo_publico').doc('HY310X').delete());
  });

  it('un visitante sin sesión no puede crear ni borrar objeciones universales', async () => {
    await assertFails(visitante().collection('objeciones_universales').doc('falsa').set(OBJ_UNIVERSAL_VALIDA));
    await assertFails(visitante().collection('objeciones_universales').doc('garantia').delete());
  });

  it('un visitante sin sesión no puede crear ni borrar objeciones por categoría', async () => {
    await assertFails(visitante().collection('objeciones_categoria').doc('falsa').set({
      categorySlug: 'proyector', pregunta: 'p', respuesta: 'r', orden: 1,
    }));
    await assertFails(visitante().collection('objeciones_categoria').doc('proyector-luz').delete());
  });
});

describe('REGRESIÓN · lo sensible sigue cerrado a quien no tiene sesión', () => {
  it('products (que lleva el costo) no se lee sin sesión', async () => {
    await assertFails(visitante().collection('products').doc('p1').get());
    await assertFails(visitante().collection('products').get());
  });

  it('sales no se lee sin sesión', async () => {
    await assertFails(visitante().collection('sales').get());
  });

  it('customers no se lee sin sesión', async () => {
    await assertFails(visitante().collection('customers').get());
  });

  it('company no se lee sin sesión', async () => {
    await assertFails(visitante().collection('company').get());
  });

  it('una colección no declarada sigue cerrada para todos', async () => {
    await assertFails(visitante().collection('coleccion_inventada').get());
    await assertFails(conSesion().collection('coleccion_inventada').get());
  });
});

describe('REGRESIÓN · con sesión todo sigue igual que antes del cambio', () => {
  it('la tablet sigue leyendo el catálogo y las objeciones', async () => {
    await assertSucceeds(conSesion().collection('catalogo_publico').get());
    await assertSucceeds(conSesion().collection('objeciones_universales').get());
    await assertSucceeds(conSesion().collection('objeciones_categoria').get());
  });

  it('el POS sigue leyendo products, sales, customers y company', async () => {
    await assertSucceeds(conSesion().collection('products').get());
    await assertSucceeds(conSesion().collection('sales').get());
    await assertSucceeds(conSesion().collection('customers').get());
    await assertSucceeds(conSesion().collection('company').get());
  });

  it('el POS sigue pudiendo crear una objeción universal válida', async () => {
    await assertSucceeds(
      conSesion().collection('objeciones_universales').doc('factura').set(OBJ_UNIVERSAL_VALIDA),
    );
  });

  it('el POS sigue rechazando una objeción universal mal formada', async () => {
    await assertFails(
      conSesion().collection('objeciones_universales').doc('rota').set({ titulo: 'sin respuesta', ownerId: 'carlos' }),
    );
  });
});
