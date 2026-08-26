// ---------------------------------------------------------------------------
// Lee `src/lib/categorySpecs.ts` desde un script .mjs.
//
// Los scripts de mantenimiento (auditoría, seed) necesitan saber qué campos
// tiene cada categoría, pero el catálogo vive en TypeScript porque lo importan
// las tres apps. En vez de duplicar la lista acá (que se desincronizaría al
// primer cambio), se extrae del archivo real por análisis de texto.
//
// LÍMITE CONOCIDO: es un parser de texto, no un compilador de TS. Reconoce
// `key: 'x'` y los tres helpers compartidos (GARANTIA, CONECTIVIDAD,
// RESISTENCIA_AGUA). Si algún día se agrega otro helper con nombre, hay que
// sumarlo a HELPERS de abajo o su campo no aparecerá en los reportes.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUTA_CATALOGO = join(__dirname, '..', '..', 'src', 'lib', 'categorySpecs.ts');

/** Helpers del catálogo que no escriben `key:` literal. */
const HELPERS = {
  GARANTIA: 'garantiaMeses',
  'CONECTIVIDAD(': 'conectividad',
  'RESISTENCIA_AGUA(': 'resistenciaAgua',
};

/**
 * @returns {{ campos: Record<string, string[]>, todasLasClaves: Set<string> }}
 *   `campos`: categoría → claves en orden de presentación.
 *   `todasLasClaves`: unión de todas, para detectar typos.
 */
export function leerCatalogoSpecs() {
  const src = readFileSync(RUTA_CATALOGO, 'utf8');

  const inicio = src.indexOf('export const SPECS_POR_CATEGORIA');
  if (inicio === -1) {
    throw new Error(
      'No se encontró SPECS_POR_CATEGORIA en src/lib/categorySpecs.ts. ' +
        '¿Se renombró? Actualizá scripts/lib/leerCatalogoSpecs.mjs.',
    );
  }
  // El bloque termina en la primera línea que sea exactamente "};".
  const resto = src.slice(inicio);
  const fin = resto.search(/^\};$/m);
  const bloque = fin === -1 ? resto : resto.slice(0, fin);

  const campos = {};
  let actual = null;

  for (const linea of bloque.split('\n')) {
    // Inicio de categoría: dos espacios de sangría + nombre + ": ["
    const mCat = linea.match(/^ {2}([a-zA-Z0-9_]+): \[/);
    if (mCat) {
      actual = mCat[1];
      campos[actual] = [];
      continue;
    }
    if (!actual) continue;

    const mKey = linea.match(/key: '([^']+)'/);
    if (mKey) {
      campos[actual].push(mKey[1]);
      continue;
    }
    for (const [marca, clave] of Object.entries(HELPERS)) {
      if (linea.includes(marca)) {
        campos[actual].push(clave);
        break;
      }
    }
  }

  // Sanidad: si el parser no encontró nada, es mejor fallar que reportar de más.
  const total = Object.values(campos).reduce((n, l) => n + l.length, 0);
  if (total === 0) {
    throw new Error('El catálogo de specs se leyó vacío. Revisá el formato de categorySpecs.ts.');
  }

  const todasLasClaves = new Set(Object.values(campos).flat());
  return { campos, todasLasClaves };
}

/**
 * Categoría o slug del POS → clave del catálogo. Réplica de
 * `resolverCategoriaSpec` de categorySpecs.ts (mismos alias).
 */
const ALIAS = {
  proyector: ['proyector', 'proyectores', 'projector', 'projectors', 'videobeam', 'video-beam', 'proyeccion'],
  smartwatch: ['smartwatch', 'smartwatches', 'smart-watch', 'reloj', 'relojes', 'reloj-inteligente', 'watch', 'smart-band', 'smartband'],
  camara: ['camara', 'camaras', 'security-cam', 'securitycam', 'security-camera', 'seguridad', 'camara-de-seguridad', 'camara-seguridad', 'ip-cam', 'ipcam', 'cctv'],
  dashcam: ['dashcam', 'dashcams', 'dash-cam', 'camara-de-carro', 'camara-para-carro', 'camara-vehicular'],
  parlante: ['parlante', 'parlantes', 'speaker', 'speakers', 'bocina', 'bocinas', 'altavoz', 'audio'],
  smarthome: ['smarthome', 'smart-home', 'hogar', 'hogar-inteligente', 'domotica', 'casa-inteligente'],
  smarttv: ['smarttv', 'smart-tv', 'smarttv-device', 'tv', 'tvbox', 'tv-box', 'streaming', 'smart-tv-box'],
};

const INDICE = (() => {
  const idx = {};
  for (const [canon, lista] of Object.entries(ALIAS)) {
    idx[canon] = canon;
    for (const a of lista) idx[a] = canon;
  }
  return idx;
})();

export function slugSimple(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolverCategoriaSpec(categoria) {
  const s = slugSimple(categoria);
  if (!s) return undefined;
  if (INDICE[s]) return INDICE[s];
  for (const [alias, canon] of Object.entries(INDICE)) {
    if (alias.length >= 5 && s.includes(alias)) return canon;
  }
  return undefined;
}
