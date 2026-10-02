// ============================================================================
//  carga_masiva_objeciones.mjs  — modo AGREGAR-SOLO (no toca lo existente)
//  Inserta objeciones universales y de categoría (proyector, dashcam, smartwatch)
//  SOLO si no existen (por su id). Si ya están, las omite. Nunca sobrescribe.
//
//  Esquemas REALES de la rama feature/objeciones-tres-capas:
//   - universales: { id, titulo, respuesta, order, ownerId, createdAt, updatedAt }
//   - categoría:   { id, categorySlug, pregunta, respuesta, orden }
//  Doc ID = el id (ej. "manta"), igual que el seed/CRUD del proyecto.
//
//  Uso:
//    npm i firebase-admin
//    export GOOGLE_APPLICATION_CREDENTIALS="ruta/serviceAccount.json"
//    node carga_masiva_objeciones.mjs            # PRUEBA (no escribe)
//    node carga_masiva_objeciones.mjs --apply    # aplica (solo lo que falta)
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'),
);
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)';
const PROJECT_ID  = cfg.projectId;
const APPLY = process.argv.includes('--apply');

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

console.log(`[carga-masiva] projectId=${PROJECT_ID} database=${DATABASE_ID} apply=${APPLY}`);
const now = Date.now();

// --- UNIVERSALES (toda la tienda) -> objeciones_universales ------------------
// Campos: titulo / respuesta / order (+ ownerId, createdAt, updatedAt)
const UNIVERSALES = [
  { id: 'garantia', order: 1, titulo: '¿Tiene garantía / es original?', respuesta: 'Sí, es original y tiene 3 meses de garantía, que se indica en su factura. Compramos directo al proveedor, sin intermediarios, y damos soporte directo.' },
  { id: 'factura', order: 2, titulo: '¿Dan factura membretada?', respuesta: 'Sí, estamos registrados. Entregamos factura membretada donde se indican los términos de la garantía.' },
  { id: 'pago', order: 3, titulo: '¿Qué formas de pago aceptan?', respuesta: 'Aceptamos efectivo, transferencia y tarjeta. Si paga en efectivo o transferencia, según el modelo puede aplicar un descuento.' },
  { id: 'envio', order: 4, titulo: '¿Hacen envíos?', respuesta: 'Hacemos envíos a todo el país: en Managua con delivery propio, y a los departamentos por Cargotrans o buses interlocales. El costo depende del destino.' },
];

// --- POR CATEGORÍA -> objeciones_categoria -----------------------------------
// Campos: categorySlug / pregunta / respuesta / orden
// categorySlug DEBE coincidir con el de tus productos (proyector/dashcam/smartwatch).
const CATEGORIA = [
  // Proyector
  { categorySlug: 'proyector', id: 'manta', orden: 1, pregunta: '¿Incluye manta / pantalla?', respuesta: 'No necesita manta: una pared blanca y lisa funciona muy bien. Hay mantas reflectivas para mejorar el contraste, pero solo se nota de frente y por ahora van por encargo.' },
  { categorySlug: 'proyector', id: 'apps', orden: 2, pregunta: '¿Sirve con Netflix / YouTube / HBO?', respuesta: 'Netflix viene preinstalado y YouTube funciona. HBO Max y otras apps se descargan desde la tienda de aplicaciones.' },
  { categorySlug: 'proyector', id: 'conexion', orden: 3, pregunta: '¿Cómo conecto mi celular o laptop?', respuesta: 'Por pantalla inalámbrica o cable HDMI; al iPhone con adaptador. Y por Bluetooth conecta bocinas o teatro en casa.' },

  // Dashcam (70mai)
  { categorySlug: 'dashcam', id: 'resolucion', orden: 1, pregunta: '¿Qué tan nítido graba?', respuesta: 'Graba en alta definición; según el modelo, hasta 4K. La placa de los vehículos se lee con claridad.' },
  { categorySlug: 'dashcam', id: 'nocturno', orden: 2, pregunta: '¿Graba bien de noche?', respuesta: 'Sí, tiene visión nocturna: ajusta automáticamente para grabar con claridad en poca luz.' },
  { categorySlug: 'dashcam', id: 'memoria', orden: 3, pregunta: '¿Incluye memoria?', respuesta: 'Usa tarjeta microSD. Te recomendamos la capacidad según cuántas horas querés guardar; consultanos y te orientamos.' },
  { categorySlug: 'dashcam', id: 'instalacion', orden: 4, pregunta: '¿Es difícil de instalar?', respuesta: 'Es sencilla: se conecta al encendedor o se cablea oculto. Te explicamos el proceso y queda lista en minutos.' },
  { categorySlug: 'dashcam', id: 'estacionamiento', orden: 5, pregunta: '¿Graba estacionado?', respuesta: 'Según el modelo tiene modo estacionamiento: detecta movimiento o golpes y graba aunque el carro esté apagado.' },

  // Smartwatch
  { categorySlug: 'smartwatch', id: 'compatibilidad', orden: 1, pregunta: '¿Sirve con iPhone y Android?', respuesta: 'Sí, es compatible con ambos. Se vincula con una app gratuita que descargás desde tu tienda de aplicaciones.' },
  { categorySlug: 'smartwatch', id: 'llamadas', orden: 2, pregunta: '¿Puedo contestar llamadas?', respuesta: 'Según el modelo, sí: tiene Bluetooth para contestar y hacer llamadas desde el reloj.' },
  { categorySlug: 'smartwatch', id: 'salud', orden: 3, pregunta: '¿Mide presión, oxígeno y ritmo cardíaco?', respuesta: 'Sí, monitorea ritmo cardíaco, oxígeno y presión, además de pasos y sueño. Son datos de referencia, no de uso médico.' },
  { categorySlug: 'smartwatch', id: 'bateria', orden: 4, pregunta: '¿Cuánto dura la batería?', respuesta: 'Varía por modelo y uso, normalmente varios días con una carga. Carga rápido por imán.' },
  { categorySlug: 'smartwatch', id: 'agua', orden: 5, pregunta: '¿Resiste agua?', respuesta: 'Resiste salpicaduras y sudor para uso diario. No recomendado para nadar ni sumergir, salvo que el modelo lo indique.' },
];

let insU = 0, omU = 0, insC = 0, omC = 0;

// Universales (doc id = id). Esquema: titulo/respuesta/order + ownerId/createdAt/updatedAt
for (const o of UNIVERSALES) {
  const ref = db.collection('objeciones_universales').doc(o.id);
  if ((await ref.get()).exists) { console.log(`  ~ universal "${o.id}" ya existe, se omite`); omU++; continue; }
  console.log(`  + universal "${o.id}" → "${o.titulo}"`);
  if (APPLY) await ref.set({ id: o.id, titulo: o.titulo, respuesta: o.respuesta, order: o.order, ownerId: 'shared_store', createdAt: now, updatedAt: now });
  insU++;
}

// Categoría (doc id = id). Esquema: categorySlug/pregunta/respuesta/orden
for (const o of CATEGORIA) {
  const ref = db.collection('objeciones_categoria').doc(o.id);
  if ((await ref.get()).exists) { console.log(`  ~ ${o.categorySlug}/${o.id} ya existe, se omite`); omC++; continue; }
  console.log(`  + ${o.categorySlug}/${o.id} → "${o.pregunta}"`);
  if (APPLY) await ref.set({ id: o.id, categorySlug: o.categorySlug, pregunta: o.pregunta, respuesta: o.respuesta, orden: o.orden });
  insC++;
}

console.log(`\n${APPLY ? 'APLICADO' : 'PRUEBA (sin escribir)'}`);
console.log(`Universales → nuevas: ${insU}, ya existían: ${omU}`);
console.log(`Categoría   → nuevas: ${insC}, ya existían: ${omC}`);
if (!APPLY) console.log('\nSi la lista se ve bien, corré:  node carga_masiva_objeciones.mjs --apply');
process.exit(0);
