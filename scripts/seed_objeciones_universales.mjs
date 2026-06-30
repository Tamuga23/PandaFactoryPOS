#!/usr/bin/env node
/**
 * Seed de objeciones_universales.
 *
 * Inserta los documentos base solo si NO existen (idempotente).
 * Usa la base de datos nombrada del proyecto (firestoreDatabaseId del config).
 *
 * Requisitos:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json
 *   o bien `gcloud auth application-default login`.
 *
 * Uso:
 *   node scripts/seed_objeciones_universales.mjs            # escribe
 *   node scripts/seed_objeciones_universales.mjs --dry-run  # sólo muestra
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

const cfg = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'),
);
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID = cfg.projectId;

const NOW = Date.now();

/** Objeciones universales a sembrar. Campo `titulo` = la pregunta del vendedor. */
const SEEDS = [
  {
    id: 'garantia',
    titulo: '¿Tiene garantía / es original?',
    respuesta:
      'Sí, es original y tiene 3 meses de garantía, que se indica en su factura. Compramos directo al proveedor, sin intermediarios, y damos soporte directo.',
    order: 1,
  },
  {
    id: 'factura',
    titulo: '¿Dan factura membretada?',
    respuesta:
      'Sí, estamos registrados. Entregamos factura membretada donde se indican los términos de la garantía.',
    order: 2,
  },
  {
    id: 'pago',
    titulo: '¿Qué formas de pago aceptan?',
    respuesta:
      'Aceptamos efectivo, transferencia y tarjeta. Si paga en efectivo o transferencia, según el modelo puede aplicar un descuento.',
    order: 3,
  },
  {
    id: 'envio',
    titulo: '¿Hacen envíos?',
    respuesta:
      'Hacemos envíos a todo el país: en Managua con delivery propio, y a los departamentos por Cargotrans o buses interlocales. El costo depende del destino.',
    order: 4,
  },
];

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });

  console.log(`[seed-universales] projectId=${PROJECT_ID} database=${DATABASE_ID} dryRun=${DRY_RUN}`);

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const ref = db.collection('objeciones_universales').doc(seed.id);
    const snap = await ref.get();

    if (snap.exists) {
      console.log(`  ~ ${seed.id} ya existe, se omite`);
      skipped++;
      continue;
    }

    const data = {
      id: seed.id,
      titulo: seed.titulo,
      respuesta: seed.respuesta,
      order: seed.order,
      ownerId: 'shared_store',
      createdAt: NOW,
      updatedAt: NOW,
    };

    console.log(`  + ${seed.id} → "${seed.titulo.slice(0, 50)}…"`);
    if (!DRY_RUN) {
      await ref.set(data);
    }
    inserted++;
  }

  console.log(`[seed-universales] listo. insertados=${inserted} omitidos=${skipped}`);
}

main().catch((err) => {
  console.error('[seed-universales] ERROR', err);
  process.exit(1);
});
