#!/usr/bin/env node
/**
 * Seed de objeciones_categoria.
 *
 * Inserta los documentos base solo si NO existen (idempotente).
 * Usa la base de datos nombrada del proyecto (firestoreDatabaseId del config).
 *
 * Requisitos:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json
 *   o bien `gcloud auth application-default login`.
 *
 * Uso:
 *   node scripts/seed_objeciones_categoria.mjs            # escribe
 *   node scripts/seed_objeciones_categoria.mjs --dry-run  # sólo muestra
 *
 * Nota: la consulta en la app usa un índice compuesto (categorySlug ASC + orden ASC).
 * Si aún no existe, Firestore mostrará en consola el enlace para crearlo.
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

/** Objeciones por categoría a sembrar. */
const SEEDS = [
  {
    id: 'manta',
    categorySlug: 'proyector',
    pregunta: '¿Incluye manta / pantalla?',
    respuesta:
      'No necesita manta: una pared blanca y lisa funciona muy bien. Hay mantas reflectivas para mejorar el contraste, pero solo se nota de frente y por ahora van por encargo.',
    orden: 1,
  },
  {
    id: 'apps',
    categorySlug: 'proyector',
    pregunta: '¿Sirve con Netflix / YouTube / HBO?',
    respuesta:
      'Netflix viene preinstalado y YouTube funciona. HBO Max y otras apps se descargan desde la tienda de aplicaciones.',
    orden: 2,
  },
  {
    id: 'conexion',
    categorySlug: 'proyector',
    pregunta: '¿Cómo conecto mi celular o laptop?',
    respuesta:
      'Por pantalla inalámbrica o cable HDMI; al iPhone con adaptador. Y por Bluetooth conecta bocinas o teatro en casa.',
    orden: 3,
  },
];

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(DATABASE_ID);
  db.settings({ ignoreUndefinedProperties: true });

  console.log(`[seed-categoria] projectId=${PROJECT_ID} database=${DATABASE_ID} dryRun=${DRY_RUN}`);

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const ref = db.collection('objeciones_categoria').doc(seed.id);
    const snap = await ref.get();

    if (snap.exists) {
      console.log(`  ~ ${seed.id} (${seed.categorySlug}) ya existe, se omite`);
      skipped++;
      continue;
    }

    const data = {
      id: seed.id,
      categorySlug: seed.categorySlug,
      pregunta: seed.pregunta,
      respuesta: seed.respuesta,
      orden: seed.orden,
    };

    console.log(`  + ${seed.id} [${seed.categorySlug}] → "${seed.pregunta.slice(0, 50)}…"`);
    if (!DRY_RUN) {
      await ref.set(data);
    }
    inserted++;
  }

  console.log(`[seed-categoria] listo. insertados=${inserted} omitidos=${skipped}`);
}

main().catch((err) => {
  console.error('[seed-categoria] ERROR', err);
  process.exit(1);
});
