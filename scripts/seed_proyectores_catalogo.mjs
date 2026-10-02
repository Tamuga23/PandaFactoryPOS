#!/usr/bin/env node
/**
 * Seed de campos de catálogo para proyectores MagCubic.
 *
 * Por cada modelo actualiza: beneficio, bullets, objecionesOverride.
 * También agrega las objeciones de categoría "luz" y "enfoque" si no existen.
 * Nunca toca precio, stock ni ningún campo de POS.
 *
 * Uso:
 *   node scripts/seed_proyectores_catalogo.mjs            # prueba (no escribe)
 *   node scripts/seed_proyectores_catalogo.mjs --apply    # aplica
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !process.argv.includes('--apply');

const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID = cfg.projectId;

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

console.log(`[proyectores] projectId=${PROJECT_ID} database=${DATABASE_ID} apply=${!DRY_RUN}`);

// ---------------------------------------------------------------------------
// 1. Nuevas objeciones de categoría "proyector"
// ---------------------------------------------------------------------------
const NUEVAS_CAT = [
  {
    id: 'luz',
    categorySlug: 'proyector',
    pregunta: '¿Con cuánta luz se ve bien?',
    respuesta: 'Depende del modelo: los de menor ANSI rinden en cuarto oscuro; los de mayor ANSI aguantan luz ambiental. Consultanos y te orientamos según el espacio.',
    orden: 4,
  },
  {
    id: 'enfoque',
    categorySlug: 'proyector',
    pregunta: '¿Tiene autofoco?',
    respuesta: 'La mayoría tiene autofoco que se ajusta automáticamente al encender. Los modelos de entrada usan enfoque manual con perilla.',
    orden: 5,
  },
];

// ---------------------------------------------------------------------------
// 2. Datos de catálogo por producto (id = doc ID en Firestore)
// ---------------------------------------------------------------------------
const MODELOS = [
  {
    id: '5a41ba3b-0e5f-434c-a5c6-89f429a7fe72',
    label: 'HY300 Pro+',
    beneficio: 'Tu primer cine en casa: compacto, económico y fácil de llevar.',
    bullets: [
      { text: 'Resolución: HD 720p, reproduce hasta 4K', order: 1 },
      { text: 'Portátil: liviano, lo llevás a cualquier cuarto', order: 2 },
      { text: 'Smart: Android 14 con Netflix y YouTube', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: 'Brillo de entrada (290 ANSI): rinde en cuarto oscuro. Para usar con luz, suba a un Full HD brillante.' },
      { objId: 'enfoque', respuesta: 'El enfoque es manual, se ajusta con la perilla del proyector.' },
      { objId: 'apps', respuesta: 'Netflix preinstalado y YouTube funcionan. En este modelo HBO Max no está confirmado.' },
    ],
  },
  {
    id: 'f5c6e608-3d3d-45bd-b9a1-6748b24b617b',
    label: 'HY300 MAX',
    beneficio: 'Compacto con autofoco y tiro corto: pantalla grande en poco espacio.',
    bullets: [
      { text: 'Enfoque: autofoco, se ajusta solo', order: 1 },
      { text: 'Tiro corto: imagen grande a poca distancia, ideal para cuartos chicos', order: 2 },
      { text: 'Smart: Android 14, HD 720p (reproduce hasta 4K)', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '400 ANSI: ideal en penumbra. Con mucha luz, suba al L018 o superior.' },
    ],
  },
  {
    id: '5311256c-fa23-40b2-9c2e-155abb6a2a25',
    label: 'HY310X',
    beneficio: 'Full HD de tiro corto: imagen nítida y grande en espacios pequeños.',
    bullets: [
      { text: 'Resolución: 1080p Full HD nativo', order: 1 },
      { text: 'Tiro corto: pantalla grande a poca distancia', order: 2 },
      { text: 'Enfoque: autofoco automático', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '420 ANSI: mejor en penumbra. Si el lugar tiene luz, suba al L018 o HY350 Max.' },
    ],
  },
  {
    id: '651ffc08-4c3c-44b7-adfa-e61139da807b',
    label: 'L018',
    beneficio: 'Full HD que ya se defiende con algo de luz, a buen precio.',
    bullets: [
      { text: 'Brillo: 650 ANSI, aguanta algo de luz ambiental', order: 1 },
      { text: 'Resolución: 1080p Full HD nativo', order: 2 },
      { text: 'Smart: autofoco + Android 14', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '650 ANSI: ya rinde con algo de luz ambiental. Para máximo brillo, el HY350 Max o HY450 Max.' },
    ],
  },
  {
    id: '28aeba65-5d25-4e30-9b6f-ba672b5debcf',
    label: 'HY350 MAX',
    beneficio: 'El más vendido: mucho brillo, sonido potente y precio equilibrado.',
    bullets: [
      { text: 'Brillo: 900 ANSI, se ve muy bien con luz ambiental', order: 1 },
      { text: 'Sonido: parlante 15W potente, sin bocina extra', order: 2 },
      { text: 'Inteligente: autofoco + evita obstáculos + reconoce pantalla', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '900 ANSI: se ve muy bien con luz ambiental. Top en su rango.' },
    ],
  },
  {
    id: '49a576b4-5231-43ef-bdc6-b1b85b61fa78',
    label: 'X7',
    beneficio: 'Brillo alto y compacto, con salida AUX para tu propio sonido.',
    bullets: [
      { text: 'Brillo: 1,000 ANSI, excelente con luz', order: 1 },
      { text: 'Audio: salida AUX para conectar tu equipo de sonido', order: 2 },
      { text: 'Inteligente: autofoco + evita obstáculos', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '1,000 ANSI: excelente con luz ambiental, hasta en lugares bien iluminados.' },
    ],
  },
  {
    id: '9b7b26de-ac11-4c4a-bdba-83b3e1ce5e66',
    label: 'HY450 MAX',
    beneficio: 'El más potente y brillante: imagen grande y nítida incluso con luz.',
    bullets: [
      { text: 'Brillo: 1,100 ANSI, el más brillante de la línea', order: 1 },
      { text: 'Sonido: parlante 15W potente', order: 2 },
      { text: 'Inteligente: autofoco + evita obstáculos + reconoce pantalla', order: 3 },
    ],
    objecionesOverride: [
      { objId: 'luz', respuesta: '1,100 ANSI: el más brillante, funciona incluso en lugares bien iluminados.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Ejecutar
// ---------------------------------------------------------------------------

// 1. Objeciones de categoría nuevas
console.log('\n── Objeciones de categoría nuevas ──');
for (const o of NUEVAS_CAT) {
  const ref = db.collection('objeciones_categoria').doc(o.id);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`  ~ [${o.categorySlug}/${o.id}] ya existe, se omite`);
    continue;
  }
  console.log(`  + [${o.categorySlug}/${o.id}] "${o.pregunta}"`);
  if (!DRY_RUN) await ref.set({ id: o.id, categorySlug: o.categorySlug, pregunta: o.pregunta, respuesta: o.respuesta, orden: o.orden });
}

// 2. Campos de catálogo por producto
console.log('\n── Productos ──');
for (const m of MODELOS) {
  const ref = db.collection('products').doc(m.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ✗ [${m.label}] producto no encontrado (id=${m.id})`);
    continue;
  }
  const current = snap.data();
  console.log(`  → [${m.label}] "${current.name}"`);
  console.log(`     beneficio: "${m.beneficio.slice(0, 60)}..."`);
  console.log(`     bullets: ${m.bullets.length} items`);
  console.log(`     overrides: ${m.objecionesOverride.map(o => o.objId).join(', ')}`);
  if (!DRY_RUN) {
    await ref.update({
      beneficio: m.beneficio,
      bullets: m.bullets,
      objecionesOverride: m.objecionesOverride,
      updatedAt: Date.now(),
    });
  }
}

console.log(`\n${DRY_RUN ? 'PRUEBA (sin escribir) — corré con --apply para aplicar' : 'APLICADO correctamente'}`);
process.exit(0);
