#!/usr/bin/env node
/**
 * AUDITORÍA de fichas comerciales. SOLO LEE, nunca escribe.
 *
 * Responde tres preguntas de un tiro:
 *   1. ¿Qué productos no tienen bullets de venta? (quedan con la ficha de la
 *      tablet y la sección "Por qué te sirve" de la web vacías)
 *   2. ¿Qué campos de la ficha técnica de su categoría les faltan?
 *   3. ¿Hay productos con la categoría mal puesta o sin ficha definida?
 *
 * Los campos de cada categoría se leen de src/lib/categorySpecs.ts, así que el
 * reporte se mantiene al día solo.
 *
 * Uso:
 *   node scripts/auditoria_fichas.mjs                 # reporte completo
 *   node scripts/auditoria_fichas.mjs --faltantes     # solo lo que falta
 *   node scripts/auditoria_fichas.mjs --csv > x.csv   # para abrir en Excel
 *
 * Credenciales: service account del repo si está presente; si no,
 * applicationDefault() (GOOGLE_APPLICATION_CREDENTIALS o `gcloud auth
 * application-default login`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { leerCatalogoSpecs, resolverCategoriaSpec } from './lib/leerCatalogoSpecs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOLO_FALTANTES = process.argv.includes('--faltantes');
const CSV = process.argv.includes('--csv');

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';

const saCandidates = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  join(ROOT, 'gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json'),
].filter(Boolean);
const saPath = saCandidates.find((p) => { try { return existsSync(p); } catch { return false; } });
initializeApp({
  credential: saPath ? cert(JSON.parse(readFileSync(saPath, 'utf8'))) : applicationDefault(),
  projectId: cfg.projectId,
});
const db = getFirestore(DATABASE_ID);

const { campos: CAMPOS_POR_CATEGORIA } = leerCatalogoSpecs();

/** Un valor "cargado" no es vacío ni `false` (false = no lo tiene). */
const cargado = (v) =>
  v !== undefined && v !== null && v !== '' && v !== false &&
  !(Array.isArray(v) && v.length === 0);

const snap = await db.collection('products').get();

const filas = snap.docs.map((d) => {
  const x = d.data();
  const categoria = x.category || '';
  const fichaCat = resolverCategoriaSpec(x.categorySlug || categoria);
  const esperados = fichaCat ? CAMPOS_POR_CATEGORIA[fichaCat] ?? [] : [];
  const specs = x.specsProyector && typeof x.specsProyector === 'object' ? x.specsProyector : {};

  const cargadas = esperados.filter((k) => cargado(specs[k]));
  const faltantes = esperados.filter((k) => !cargado(specs[k]));
  const ajenas = Object.keys(specs).filter((k) => cargado(specs[k]) && !esperados.includes(k));

  return {
    docId: d.id,
    sku: x.sku || '',
    nombre: x.name || x.description || '(sin nombre)',
    categoria,
    fichaCat: fichaCat || '',
    publicado: x.publicar !== false,
    stock: typeof x.stock === 'number' ? x.stock : null,
    bullets: Array.isArray(x.bullets) ? x.bullets.filter((b) => b && (b.text || b.texto)).length : 0,
    beneficio: !!x.beneficio,
    objeciones: Array.isArray(x.objecionesOverride) ? x.objecionesOverride.length : 0,
    foto: !!(x.media?.heroImage || x.imageBase64),
    especperados: esperados.length,
    cargadas,
    faltantes,
    ajenas,
  };
});

// --- CSV -------------------------------------------------------------------
if (CSV) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  console.log(
    ['sku', 'nombre', 'categoria', 'fichaCategoria', 'publicado', 'stock', 'bullets', 'beneficio', 'specsCargadas', 'specsEsperadas', 'specsFaltantes']
      .map(esc).join(','),
  );
  for (const f of filas) {
    console.log([
      f.sku, f.nombre, f.categoria, f.fichaCat, f.publicado ? 'si' : 'no',
      f.stock ?? '', f.bullets, f.beneficio ? 'si' : 'no',
      f.cargadas.length, f.especperados, f.faltantes.join(' '),
    ].map(esc).join(','));
  }
  process.exit(0);
}

// --- Reporte legible -------------------------------------------------------
console.log(`AUDITORÍA DE FICHAS — ${snap.size} productos en \`products\``);
console.log(`base: ${DATABASE_ID}`);
console.log(`credenciales: ${saPath ? 'service account del repo' : 'applicationDefault()'}`);

const porCategoria = {};
for (const f of filas) {
  const k = f.categoria || '(sin categoría)';
  (porCategoria[k] = porCategoria[k] || []).push(f);
}

for (const [cat, lista] of Object.entries(porCategoria).sort()) {
  const fichaCat = lista[0].fichaCat;
  const sinBullets = lista.filter((f) => f.bullets === 0).length;
  console.log(`\n${'='.repeat(76)}`);
  console.log(`${cat}  (${lista.length} productos)`);
  console.log(
    fichaCat
      ? `ficha técnica: "${fichaCat}" — ${CAMPOS_POR_CATEGORIA[fichaCat].length} campos definidos`
      : 'SIN FICHA TÉCNICA DEFINIDA para esta categoría. Agregala en src/lib/categorySpecs.ts',
  );
  if (sinBullets > 0) console.log(`sin bullets de venta: ${sinBullets} de ${lista.length}`);
  console.log('='.repeat(76));

  for (const f of lista.sort((a, b) => String(a.sku).localeCompare(String(b.sku)))) {
    const problemas = [];
    if (f.bullets === 0) problemas.push('SIN BULLETS');
    if (!f.beneficio) problemas.push('sin beneficio');
    if (!f.foto) problemas.push('sin foto');
    if (f.especperados > 0 && f.cargadas.length === 0) problemas.push('SIN FICHA TÉCNICA');
    if (SOLO_FALTANTES && problemas.length === 0 && f.faltantes.length === 0) continue;

    console.log(
      `\n  [${f.sku || '—'}] ${f.nombre}` +
        `${f.publicado ? '' : '  (no publicado)'}${f.stock === 0 ? '  (agotado)' : ''}`,
    );
    console.log(`      docId: ${f.docId}`);
    console.log(
      `      bullets: ${f.bullets} · beneficio: ${f.beneficio ? 'sí' : 'NO'} · ` +
        `objeciones: ${f.objeciones} · ficha: ${f.cargadas.length}/${f.especperados}`,
    );
    if (problemas.length > 0) console.log(`      ⚠ ${problemas.join(' · ')}`);
    if (f.faltantes.length > 0) console.log(`      faltan: ${f.faltantes.join(', ')}`);
    if (f.ajenas.length > 0) console.log(`      campos de otra categoría: ${f.ajenas.join(', ')}`);
  }
}

// --- Resumen ---------------------------------------------------------------
const sinBullets = filas.filter((f) => f.bullets === 0);
const sinFicha = filas.filter((f) => f.especperados > 0 && f.cargadas.length === 0);
const sinCategoriaDefinida = filas.filter((f) => !f.fichaCat);

console.log(`\n${'='.repeat(76)}\nRESUMEN\n${'='.repeat(76)}`);
console.log(`productos: ${filas.length}`);
console.log(`sin bullets de venta: ${sinBullets.length}${sinBullets.length ? ' → ' + sinBullets.map((f) => f.sku || f.docId).join(', ') : ''}`);
console.log(`sin ningún dato de ficha técnica: ${sinFicha.length}${sinFicha.length ? ' → ' + sinFicha.map((f) => f.sku || f.docId).join(', ') : ''}`);
console.log(`categorías sin ficha definida: ${sinCategoriaDefinida.length}${sinCategoriaDefinida.length ? ' → ' + [...new Set(sinCategoriaDefinida.map((f) => f.categoria || '(vacía)'))].join(', ') : ''}`);
console.log('\nPegá esta salida en el chat y se escribe el contenido que falta.');
process.exit(0);
