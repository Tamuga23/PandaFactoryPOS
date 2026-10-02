// ============================================================================
//  seed_productos_tablet.mjs  — v2: 5 bullets por modelo
//  Actualiza SOLO campos de tablet de tus 7 proyectores existentes:
//  specsProyector (throwRatio/ANSI numéricos), bullets (5 c/u), beneficio,
//  objecionesOverride, publicar=true, categorySlug='proyector'.
//
//  NO toca: cost, stock, sku, price, ownerId, createdAt.  (merge)
//
//  Uso:
//    export GOOGLE_APPLICATION_CREDENTIALS="ruta/serviceAccount.json"
//    node scripts/seed_productos_tablet.mjs            # PRUEBA (no escribe)
//    node scripts/seed_productos_tablet.mjs --apply    # aplica
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID  = cfg.projectId;
const APPLY = process.argv.includes('--apply');

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

console.log(`[seed-tablet] projectId=${PROJECT_ID} database=${DATABASE_ID} apply=${APPLY}`);

// 'match' = token que se busca dentro del NOMBRE del producto (normalizado).
const MODELOS = [
  { match: 'HY300PRO',
    beneficio: "Tu primer cine en casa: compacto, económico y fácil de llevar.",
    specsProyector: { ansi: 290, throwRatio: 0.9, distMinEnfoque: 0.75, resolucion: "HD 720p", autofoco: false },
    bullets: [
      { etiqueta: "Resolución", texto: "HD 720p, reproduce hasta 4K" },
      { etiqueta: "Smart", texto: "Android 14, Netflix y YouTube instalados" },
      { etiqueta: "Portátil", texto: "Liviano, lo llevás a cualquier cuarto" },
      { etiqueta: "Conexión", texto: "WiFi doble banda, Bluetooth 5.4 y HDMI" },
      { etiqueta: "Económico", texto: "La entrada perfecta al cine en casa" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "Brillo de entrada (290 ANSI): rinde en cuarto oscuro. Para usar con luz, suba a un Full HD brillante." },
      { id: "enfoque", pregunta: "¿El foco es automático?", respuesta: "El enfoque es manual, se ajusta con la perilla del proyector." },
      { id: "apps", pregunta: "¿Sirve con HBO Max?", respuesta: "Netflix preinstalado y YouTube funcionan. En este modelo HBO Max no está confirmado." }] },

  { match: 'HY300MAX',
    beneficio: "Compacto con autofoco y tiro corto: pantalla grande en poco espacio.",
    specsProyector: { ansi: 400, throwRatio: 0.8, distMinEnfoque: 0.6, resolucion: "HD 720p", autofoco: true },
    bullets: [
      { etiqueta: "Enfoque", texto: "Autofoco, la imagen se ajusta sola" },
      { etiqueta: "Tiro corto", texto: "Pantalla grande a poca distancia, ideal cuartos chicos" },
      { etiqueta: "Resolución", texto: "HD 720p, reproduce hasta 4K" },
      { etiqueta: "Smart", texto: "Android 14 con tus apps" },
      { etiqueta: "Imagen", texto: "Corrección de imagen automática (keystone)" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "400 ANSI: ideal en penumbra. Con mucha luz, suba al L018 o superior." }] },

  { match: 'HY310X',
    beneficio: "Full HD de tiro corto: imagen nítida y grande en espacios pequeños.",
    specsProyector: { ansi: 420, throwRatio: 0.8, distMinEnfoque: 0.6, resolucion: "1080p Full HD", autofoco: true },
    bullets: [
      { etiqueta: "Resolución", texto: "1080p Full HD nativo" },
      { etiqueta: "Tiro corto", texto: "Pantalla grande en poco espacio" },
      { etiqueta: "Enfoque", texto: "Autofoco automático" },
      { etiqueta: "Compatible", texto: "Conecta con iPhone y Android fácil" },
      { etiqueta: "Smart", texto: "Android 14, Netflix y YouTube" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "420 ANSI: mejor en penumbra. Si el lugar tiene luz, suba al L018 o HY350 Max." }] },

  { match: 'L018',
    beneficio: "Full HD que ya se defiende con algo de luz, a buen precio.",
    specsProyector: { ansi: 650, throwRatio: 1.2, distMinEnfoque: 1.05, resolucion: "1080p Full HD", autofoco: true },
    bullets: [
      { etiqueta: "Brillo", texto: "650 ANSI, ya se defiende con algo de luz" },
      { etiqueta: "Resolución", texto: "1080p Full HD nativo" },
      { etiqueta: "Inteligente", texto: "Evita obstáculos y reconoce la pantalla" },
      { etiqueta: "Enfoque", texto: "Autofoco automático" },
      { etiqueta: "Conexión", texto: "Android 14 + WiFi doble banda" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "650 ANSI: ya rinde con algo de luz ambiental. Para máximo brillo, el HY350 o HY450 Max." }] },

  { match: 'HY350MAX',
    beneficio: "El más vendido: mucho brillo, sonido potente y precio equilibrado.",
    specsProyector: { ansi: 900, throwRatio: 1.0, distMinEnfoque: 0.9, resolucion: "1080p Full HD", autofoco: true },
    bullets: [
      { etiqueta: "Brillo", texto: "900 ANSI, se ve muy bien con luz ambiental" },
      { etiqueta: "Sonido", texto: "Parlante 15W potente, sin bocina extra" },
      { etiqueta: "Inteligente", texto: "Autofoco, evita obstáculos y reconoce pantalla" },
      { etiqueta: "Resolución", texto: "1080p Full HD, soporta hasta 8K" },
      { etiqueta: "Popular", texto: "Nuestro modelo más vendido" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "900 ANSI: se ve muy bien con luz ambiental. Top en su rango." }] },

  { match: 'X7',
    beneficio: "Brillo alto y compacto, con salida AUX para tu propio sonido.",
    specsProyector: { ansi: 1000, throwRatio: 1.08, distMinEnfoque: 1.0, resolucion: "1080p Full HD", autofoco: true },
    bullets: [
      { etiqueta: "Brillo", texto: "1,000 ANSI, excelente con luz" },
      { etiqueta: "Audio", texto: "Salida AUX para conectar tu equipo de sonido" },
      { etiqueta: "Inteligente", texto: "Autofoco + evita obstáculos" },
      { etiqueta: "Resolución", texto: "1080p Full HD, soporta hasta 8K" },
      { etiqueta: "Compacto", texto: "Mucha potencia en tamaño pequeño" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "1,000 ANSI: excelente con luz ambiental, hasta en lugares bien iluminados." }] },

  { match: 'HY450MAX',
    beneficio: "El más potente y brillante: imagen grande y nítida incluso con luz.",
    specsProyector: { ansi: 1100, throwRatio: 1.0, distMinEnfoque: 0.9, resolucion: "1080p Full HD", autofoco: true },
    bullets: [
      { etiqueta: "Brillo", texto: "1,100 ANSI, el más brillante de la línea" },
      { etiqueta: "Sonido", texto: "Parlante 15W, potente y claro" },
      { etiqueta: "Control", texto: "Incluye control con Air Mouse" },
      { etiqueta: "Inteligente", texto: "Autofoco, evita obstáculos y reconoce pantalla" },
      { etiqueta: "Resolución", texto: "1080p Full HD, soporta hasta 8K" }],
    objecionesOverride: [
      { id: "luz", pregunta: "¿Se ve de día?", respuesta: "1,100 ANSI: el más brillante, funciona incluso en lugares bien iluminados." }] },
];

const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9+]/g, '');

const snap = await db.collection('products').get();
let updated = 0, skipped = 0;
const sinMatch = [];

for (const d of snap.docs) {
  const p = d.data();
  const nombre = norm(p.name);
  const matches = MODELOS.filter((m) => nombre.includes(norm(m.match)));

  if (matches.length === 0) { sinMatch.push(p.name); continue; }
  if (matches.length > 1) { console.warn(`⚠️  "${p.name}" coincide con varios modelos, lo salto por seguridad.`); skipped++; continue; }

  const m = matches[0];
  const patch = {
    beneficio: m.beneficio,
    specsProyector: m.specsProyector,
    bullets: m.bullets,
    objecionesOverride: m.objecionesOverride,
    categorySlug: 'proyector',
    publicar: true,
    updatedAt: Date.now(),
  };

  console.log(`✓ ${p.name}  →  ${m.match}  (${m.bullets.length} bullets, ${m.specsProyector.ansi} ANSI)`);
  if (APPLY) await d.ref.set(patch, { merge: true });
  updated++;
}

console.log(`\n${APPLY ? 'APLICADO' : 'PRUEBA (sin escribir)'} — actualizables: ${updated}, saltados: ${skipped}`);
if (sinMatch.length) console.log('Sin coincidencia (no son proyectores o nombre distinto):\n  - ' + sinMatch.join('\n  - '));
if (!APPLY) console.log('\nSi la lista se ve bien, corré:  node scripts/seed_productos_tablet.mjs --apply');
process.exit(0);
