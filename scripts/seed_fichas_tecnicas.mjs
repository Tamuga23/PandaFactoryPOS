#!/usr/bin/env node
/**
 * Carga la FICHA TÉCNICA (`specsProyector`) y, opcionalmente, bullets de venta,
 * desde scripts/fichas_tecnicas.json a la colección `products`.
 *
 * Es idempotente y conservador a propósito:
 *   - Las specs se MEZCLAN con las que ya tiene el producto. Un valor que ya
 *     está cargado NO se pisa, salvo que se pase --pisar-specs.
 *   - Los bullets solo se escriben si el producto NO tiene ninguno, salvo que
 *     se pase --pisar-bullets. Nunca se borra contenido escrito a mano.
 *   - NUNCA toca precio, costo, stock, categoría ni publicación.
 *
 * Valida que cada clave de `specs` exista en src/lib/categorySpecs.ts: una
 * clave con typo no se guarda en silencio, se reporta y se omite.
 *
 * Uso:
 *   node scripts/seed_fichas_tecnicas.mjs                  # PRUEBA (no escribe)
 *   node scripts/seed_fichas_tecnicas.mjs --apply          # aplica
 *   node scripts/seed_fichas_tecnicas.mjs --apply --pisar-specs
 *
 * Después de aplicar: la Cloud Function `onProductWritten` reconstruye
 * `catalogo_publico` sola. Si no está desplegada, corré
 * `node scripts/backfill_catalogo_publico.mjs` para que la tablet y la web lo vean.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { leerCatalogoSpecs, resolverCategoriaSpec } from './lib/leerCatalogoSpecs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const PISAR_SPECS = process.argv.includes('--pisar-specs');
const PISAR_BULLETS = process.argv.includes('--pisar-bullets');

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const DATA = JSON.parse(readFileSync(join(__dirname, 'fichas_tecnicas.json'), 'utf8'));

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
db.settings({ ignoreUndefinedProperties: true });

const { campos: CAMPOS_POR_CATEGORIA, todasLasClaves } = leerCatalogoSpecs();

console.log(
  `[fichas-tecnicas] base=${DATABASE_ID} apply=${APPLY} pisarSpecs=${PISAR_SPECS} pisarBullets=${PISAR_BULLETS}`,
);
console.log(`[fichas-tecnicas] credenciales: ${saPath ? 'service account del repo' : 'applicationDefault()'}`);

/** Igual que el resolutor del seed de fichas: por doc id, sku o nombre. */
async function resolverDoc(m) {
  if (m.id) {
    const ref = db.collection('products').doc(m.id);
    const snap = await ref.get();
    return snap.exists ? { ref, data: snap.data() } : null;
  }
  const all = await db.collection('products').get();
  let hits = [];
  all.forEach((d) => {
    const x = d.data();
    const nameOk = m.nameContains
      ? String(x.name || '').toLowerCase().includes(m.nameContains.toLowerCase())
      : false;
    const skuOk = m.sku ? String(x.sku || '').toLowerCase() === String(m.sku).toLowerCase() : false;
    if (nameOk || skuOk) hits.push({ ref: d.ref, data: x });
  });
  if (hits.length > 1 && m.category) {
    const c = m.category.toLowerCase();
    const narrowed = hits.filter(
      (h) =>
        String(h.data.category || '').toLowerCase().includes(c) ||
        String(h.data.categorySlug || '').toLowerCase().includes(c),
    );
    if (narrowed.length === 1) hits = narrowed;
  }
  if (hits.length === 0) return null;
  return hits.length === 1 ? hits[0] : { ambiguous: hits };
}

const cargado = (v) =>
  v !== undefined && v !== null && v !== '' && v !== false &&
  !(Array.isArray(v) && v.length === 0);

const muestra = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

const now = Date.now();
let actualizados = 0, sinCambios = 0, noEncontrados = 0, ambiguos = 0;
const avisos = [];

for (const m of DATA.productContent) {
  console.log(`\n${'─'.repeat(74)}\n[${m.label}]`);

  const found = await resolverDoc(m.matchBy);
  if (!found) {
    console.log('  ✗ producto NO encontrado — se omite (¿cambió el SKU o el nombre?)');
    noEncontrados++;
    continue;
  }
  if (found.ambiguous) {
    console.log(`  ! ${found.ambiguous.length} coincidencias, ambiguo — se omite:`);
    found.ambiguous.forEach((h) => console.log(`      - ${h.ref.id} "${h.data.name}" sku=${h.data.sku || ''}`));
    ambiguos++;
    continue;
  }

  const { ref, data } = found;
  const fichaCat = resolverCategoriaSpec(data.categorySlug || data.category);
  const permitidos = fichaCat ? CAMPOS_POR_CATEGORIA[fichaCat] ?? [] : [];
  console.log(`  doc=${ref.id} "${data.name}" · categoría="${data.category || '?'}" → ficha "${fichaCat || 'ninguna'}"`);

  const previas = data.specsProyector && typeof data.specsProyector === 'object' ? data.specsProyector : {};
  const nuevas = { ...previas };
  let cambios = 0;

  for (const [key, valor] of Object.entries(m.specs ?? {})) {
    // Typo: la clave no existe en NINGUNA categoría del catálogo.
    if (!todasLasClaves.has(key)) {
      console.log(`      ✗ "${key}" no existe en categorySpecs.ts — se omite (¿typo?)`);
      avisos.push(`${m.label}: clave desconocida "${key}"`);
      continue;
    }
    // Existe, pero no en la ficha de esta categoría: se carga igual (la ficha
    // la muestra) pero se avisa, porque suele indicar categoría mal puesta.
    if (permitidos.length > 0 && !permitidos.includes(key)) {
      avisos.push(`${m.label}: "${key}" no pertenece a la ficha de "${fichaCat}" (se carga igual)`);
    }

    if (cargado(previas[key]) && !PISAR_SPECS) {
      if (muestra(previas[key]) !== muestra(valor)) {
        console.log(`      = ${key}: ya tiene "${muestra(previas[key])}" — se respeta (usá --pisar-specs para cambiarlo)`);
      }
      continue;
    }
    const antes = cargado(previas[key]) ? `"${muestra(previas[key])}" → ` : '';
    console.log(`      + ${key}: ${antes}"${muestra(valor)}"`);
    nuevas[key] = valor;
    cambios++;
  }

  // --- Bullets (solo si no tiene, salvo --pisar-bullets) ---
  const bulletsActuales = Array.isArray(data.bullets)
    ? data.bullets.filter((b) => b && (b.text || b.texto))
    : [];
  let bulletsNuevos = null;
  if (Array.isArray(m.bullets) && m.bullets.length > 0) {
    if (bulletsActuales.length > 0 && !PISAR_BULLETS) {
      console.log(`      = bullets: ya tiene ${bulletsActuales.length} — se respetan (usá --pisar-bullets para reemplazarlos)`);
    } else {
      bulletsNuevos = m.bullets.map((b, i) => ({
        text: b.text,
        etiqueta: b.etiqueta,
        order: b.order ?? i + 1,
      }));
      console.log(`      + bullets: ${bulletsNuevos.length}${bulletsActuales.length ? ` (reemplazan ${bulletsActuales.length})` : ''}`);
      cambios++;
    }
  } else if (bulletsActuales.length === 0) {
    console.log('      ⚠ este producto NO tiene bullets y el JSON no trae ninguno: la ficha de la tablet y la web quedan vacías');
    avisos.push(`${m.label}: sigue sin bullets de venta`);
  }

  if (m.notas) console.log(`      ℹ ${m.notas}`);

  if (cambios === 0) {
    console.log('      (sin cambios)');
    sinCambios++;
    continue;
  }

  const update = { specsProyector: nuevas, updatedAt: now };
  if (bulletsNuevos) update.bullets = bulletsNuevos;
  if (APPLY) await ref.update(update);
  actualizados++;
}

console.log(`\n${'═'.repeat(74)}`);
console.log(APPLY ? 'APLICADO' : 'PRUEBA — no se escribió nada. Corré con --apply para aplicar.');
console.log(
  `productos → actualizados: ${actualizados} · sin cambios: ${sinCambios} · ` +
    `no encontrados: ${noEncontrados} · ambiguos: ${ambiguos}`,
);
if (avisos.length > 0) {
  console.log('\nAVISOS:');
  for (const a of avisos) console.log(`  · ${a}`);
}
if (APPLY && actualizados > 0) {
  console.log(
    '\nSiguiente paso: si la Cloud Function `onProductWritten` está desplegada, el espejo\n' +
      '`catalogo_publico` ya se actualizó solo. Si no, corré:\n' +
      '  node scripts/backfill_catalogo_publico.mjs --dry-run   (y después sin el flag)',
  );
}
process.exit(0);
