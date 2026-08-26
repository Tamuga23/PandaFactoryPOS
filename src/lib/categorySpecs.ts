// ---------------------------------------------------------------------------
// Ficha técnica por categoría — FUENTE DE VERDAD COMPARTIDA
//
// Este archivo está DUPLICADO A PROPÓSITO, idéntico, en los tres repos:
//   PandaFactoryPOS-main/src/lib/categorySpecs.ts   → el POS las EDITA
//   PandaLink/src/lib/categorySpecs.ts              → la tablet las MUESTRA al asesor
//   PandaWEB/src/lib/categorySpecs.ts               → la web las MUESTRA al cliente
//
// Si tocás uno, copiá el archivo tal cual a los otros dos. No tiene imports ni
// dependencias justamente para que se pueda copiar sin adaptar nada.
//
// DÓNDE SE GUARDAN: en Firestore siguen viviendo dentro de `specsProyector`.
// El nombre es histórico (nació para proyectores) pero hoy sirve a todas las
// categorías. Se mantiene porque firestore.rules, la Cloud Function
// `onProductWritten` y los dos normalizadores ya lo soportan: renombrarlo
// obligaría a un deploy de reglas + functions + backfill sin ganar nada visible.
//
// LAS CLAVES DE PROYECTOR NO SE RENOMBRAN NUNCA (ansi, throwRatio,
// distMinEnfoque, resolucion, autofoco): hay productos en producción con esos
// datos cargados y renombrarlas los haría desaparecer de la ficha sin aviso.
//
// CRITERIO DE REDACCIÓN: las etiquetas se leen tanto en la tablet (frente al
// cliente) como en la web. Se escriben en lenguaje de cliente, no de ficha
// técnica de fábrica: "Resistencia al agua → Apto para nadar (5 ATM)", no
// "WR: 5ATM". Si un dato solo lo entiende un técnico, no va acá: va en la
// descripción o en una objeción.
// ---------------------------------------------------------------------------

/** Cómo se edita el campo en el POS y cómo se muestra después. */
export type SpecFieldType =
  /** Texto libre corto. */
  | 'text'
  /** Número. Se muestra con `unit` si está definida. */
  | 'number'
  /** Sí / No. Si es `false` la fila NO se muestra (no se anuncia lo que no tiene). */
  | 'bool'
  /** Una opción de una lista cerrada, ya redactada en lenguaje de cliente. */
  | 'select'
  /** Varios valores separados por coma. Se guarda como arreglo de strings. */
  | 'list';

export interface SpecField {
  /** Clave con la que se guarda dentro de `specsProyector`. No cambiar. */
  key: string;
  /** Etiqueta visible en la tablet y en la web. */
  label: string;
  type: SpecFieldType;
  /** Ejemplo dentro del input del POS. */
  placeholder?: string;
  /** Opciones para `select`, ya redactadas para el cliente. */
  options?: string[];
  /** Sufijo al mostrar un `number` (ej. "lúmenes ANSI", "meses"). */
  unit?: string;
  /** Aclaración corta bajo el input del POS, para quien carga los datos. */
  help?: string;
}

// ---------------------------------------------------------------------------
// Campos comunes al final de toda ficha. Se agregan a cada categoría para no
// repetirlos siete veces.
// ---------------------------------------------------------------------------
const GARANTIA: SpecField = {
  key: 'garantiaMeses',
  label: 'Garantía',
  type: 'number',
  unit: 'meses',
  placeholder: 'Ej. 3',
  help: 'Dejalo vacío si aplica la garantía estándar de la tienda.',
};

const CONECTIVIDAD = (placeholder: string): SpecField => ({
  key: 'conectividad',
  label: 'Conexiones',
  type: 'list',
  placeholder,
  help: 'Separá con comas. Se muestran como lista.',
});

const RESISTENCIA_AGUA = (label: string, options: string[]): SpecField => ({
  key: 'resistenciaAgua',
  label,
  type: 'select',
  options,
});

// ---------------------------------------------------------------------------
// Catálogo de campos por categoría. El orden del arreglo ES el orden en que se
// editan en el POS y en que se muestran en la tablet y en la web.
// ---------------------------------------------------------------------------
export const SPECS_POR_CATEGORIA: Record<string, SpecField[]> = {
  // -------------------------------------------------------------------------
  proyector: [
    { key: 'ansi', label: 'Brillo', type: 'number', unit: 'lúmenes ANSI', placeholder: 'Ej. 900', help: 'Más ANSI = se ve mejor con luz en el cuarto.' },
    { key: 'resolucion', label: 'Resolución', type: 'text', placeholder: 'Ej. 1080p Full HD' },
    { key: 'throwRatio', label: 'Relación de proyección', type: 'text', placeholder: 'Ej. 1.2:1', help: 'Más bajo = pantalla grande en menos espacio. Alimenta la calculadora de distancia de la tablet.' },
    { key: 'distMinEnfoque', label: 'Distancia mínima para enfocar', type: 'text', unit: 'm', placeholder: 'Ej. 1.5 m', help: 'Debajo de esta distancia la imagen sale borrosa. Evita devoluciones.' },
    { key: 'autofoco', label: 'Enfoque automático', type: 'bool' },
    { key: 'contraste', label: 'Contraste', type: 'text', placeholder: 'Ej. 2000:1' },
    { key: 'audio', label: 'Parlante integrado', type: 'text', placeholder: 'Ej. 12 W, suficiente para una sala' },
    { key: 'memoria', label: 'Memoria y almacenamiento', type: 'text', placeholder: 'Ej. 2 GB + 16 GB' },
    { key: 'sistema', label: 'Sistema y apps', type: 'text', placeholder: 'Ej. Android 11, Netflix preinstalado' },
    { key: 'alimentacion', label: 'Alimentación', type: 'select', options: ['Corriente (enchufe)', 'Corriente o 12V (power bank compatible)', 'Batería recargable interna'] },
    CONECTIVIDAD('Wi-Fi, HDMI, USB, Bluetooth'),
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  smartwatch: [
    { key: 'tamanoPantalla', label: 'Tamaño de la pantalla', type: 'text', placeholder: 'Ej. 1.96"' },
    { key: 'tipoPantalla', label: 'Tipo de pantalla', type: 'text', placeholder: 'Ej. AMOLED, se ve bien al sol' },
    RESISTENCIA_AGUA('Resistencia al agua', [
      'No resiste agua',
      'Resiste salpicaduras y sudor (IP54)',
      'Resiste lluvia y lavarse las manos (IP68)',
      'Apto para nadar (5 ATM)',
      'Apto para nadar y buceo ligero (10 ATM)',
    ]),
    { key: 'duracionBateria', label: 'Duración de la batería', type: 'text', placeholder: 'Ej. 10 días de uso normal', help: 'Poné días u horas reales de uso, no el máximo de fábrica.' },
    { key: 'almacenamiento', label: 'Almacenamiento', type: 'text', placeholder: 'Ej. 4 GB para música sin celular' },
    { key: 'salud', label: 'Mide', type: 'list', placeholder: 'Ritmo cardíaco, oxígeno, sueño, pasos, estrés', help: 'Separá con comas.' },
    { key: 'llamadas', label: 'Llamadas desde el reloj', type: 'bool', help: 'Solo si tiene parlante y micrófono propios.' },
    { key: 'gps', label: 'GPS integrado', type: 'bool', help: 'Marca la ruta sin llevar el celular.' },
    { key: 'deportes', label: 'Modos deportivos', type: 'text', placeholder: 'Ej. más de 100 deportes' },
    { key: 'compatibilidad', label: 'Compatible con', type: 'text', placeholder: 'Ej. Android e iPhone' },
    { key: 'correa', label: 'Correa', type: 'text', placeholder: 'Ej. Silicona intercambiable de 22 mm' },
    { key: 'carga', label: 'Carga', type: 'text', placeholder: 'Ej. Magnética, 2 horas para carga completa' },
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  camara: [
    { key: 'resolucion', label: 'Resolución', type: 'text', placeholder: 'Ej. 2K (3 MP)' },
    { key: 'uso', label: 'Para usar', type: 'select', options: ['Interior', 'Exterior', 'Interior y exterior'] },
    { key: 'visionNocturna', label: 'Visión nocturna', type: 'select', options: ['No tiene', 'En blanco y negro', 'A color'] },
    { key: 'campoVision', label: 'Ángulo de visión', type: 'text', placeholder: 'Ej. 360° girando desde la app' },
    { key: 'almacenamiento', label: 'Dónde guarda la grabación', type: 'text', placeholder: 'Ej. microSD hasta 128 GB (no incluida) o nube' },
    { key: 'deteccionMovimiento', label: 'Avisa al celular cuando detecta movimiento', type: 'bool' },
    { key: 'audioDoble', label: 'Hablar y escuchar desde la app', type: 'bool' },
    { key: 'sirena', label: 'Alarma o sirena', type: 'bool' },
    RESISTENCIA_AGUA('Resistencia al agua', [
      'Solo interior, no resiste agua',
      'Resiste salpicaduras (IP54)',
      'Resiste lluvia (IP65)',
      'Sumergible (IP67)',
    ]),
    { key: 'alimentacion', label: 'Alimentación', type: 'select', options: ['Corriente (enchufe)', 'Batería recargable', 'Batería con panel solar', 'Cable de red (PoE)'] },
    CONECTIVIDAD('Wi-Fi 2.4 GHz, cable de red'),
    { key: 'app', label: 'App para el celular', type: 'text', placeholder: 'Ej. Tuya Smart / iCSee (Android e iPhone)' },
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  dashcam: [
    { key: 'resolucion', label: 'Resolución de grabación', type: 'text', placeholder: 'Ej. 2K, se lee la placa del carro de adelante' },
    { key: 'camaras', label: 'Cámaras', type: 'select', options: ['Solo frontal', 'Frontal y trasera', 'Frontal e interior', 'Frontal, interior y trasera'] },
    { key: 'campoVision', label: 'Ángulo de visión', type: 'text', placeholder: 'Ej. 150°, cubre los tres carriles' },
    { key: 'visionNocturna', label: 'Grabación de noche', type: 'select', options: ['Estándar', 'Visión nocturna reforzada', 'Visión nocturna a color'] },
    { key: 'almacenamiento', label: 'Memoria', type: 'text', placeholder: 'Ej. microSD hasta 128 GB (no incluida)' },
    { key: 'modoEstacionamiento', label: 'Graba con el carro estacionado', type: 'bool', help: 'Si necesita cable extra para esto, aclaralo en una objeción.' },
    { key: 'gps', label: 'GPS (guarda ruta y velocidad)', type: 'bool' },
    { key: 'app', label: 'Ver y descargar los videos desde el celular', type: 'bool' },
    { key: 'pantalla', label: 'Pantalla', type: 'text', placeholder: 'Ej. 3" a color, o sin pantalla (se usa por app)' },
    { key: 'instalacion', label: 'Instalación', type: 'select', options: ['Se pega al parabrisas y va al encendedor', 'Se pega al parabrisas, cableado escondido', 'Requiere instalación con un técnico'] },
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  parlante: [
    { key: 'potencia', label: 'Potencia', type: 'text', placeholder: 'Ej. 20 W, alcanza para un patio' },
    { key: 'duracionBateria', label: 'Duración de la batería', type: 'text', placeholder: 'Ej. 24 horas de música' },
    { key: 'tamano', label: 'Tamaño', type: 'select', options: ['De bolsillo', 'Portátil, entra en la mochila', 'Grande, para fiesta'] },
    RESISTENCIA_AGUA('Resistencia al agua', [
      'No resiste agua',
      'Resiste salpicaduras (IPX4)',
      'Resiste chorros de agua (IPX6)',
      'Sumergible, aguanta caer a la piscina (IPX7)',
    ]),
    { key: 'microfono', label: 'Micrófono para contestar llamadas', type: 'bool' },
    { key: 'luces', label: 'Luces de colores', type: 'bool' },
    { key: 'emparejamiento', label: 'Se une con otro igual para sonido estéreo', type: 'bool' },
    { key: 'manosLibres', label: 'Entrada para micrófono o karaoke', type: 'bool' },
    CONECTIVIDAD('Bluetooth 5.3, AUX, USB, microSD, radio FM'),
    { key: 'carga', label: 'Carga', type: 'text', placeholder: 'Ej. USB-C, 3 horas para carga completa' },
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  smarthome: [
    { key: 'funcion', label: 'Para qué sirve', type: 'text', placeholder: 'Ej. Prender y apagar la luz desde el celular' },
    { key: 'controlApp', label: 'Se controla desde el celular', type: 'bool' },
    { key: 'asistentes', label: 'Funciona con', type: 'list', placeholder: 'Alexa, Google Home', help: 'Separá con comas.' },
    { key: 'rutinas', label: 'Permite horarios y rutinas automáticas', type: 'bool' },
    { key: 'alimentacion', label: 'Alimentación', type: 'select', options: ['Corriente (enchufe)', 'Pilas', 'Batería recargable', 'Cableado eléctrico'] },
    { key: 'instalacion', label: 'Instalación', type: 'select', options: ['Se instala solo, sin herramientas', 'Se pega o se atornilla', 'Necesita instalación eléctrica'] },
    RESISTENCIA_AGUA('Uso en exterior', ['Solo interior', 'Resiste salpicaduras (IP54)', 'Apto para exterior (IP65)']),
    CONECTIVIDAD('Wi-Fi 2.4 GHz, Bluetooth'),
    { key: 'app', label: 'App para el celular', type: 'text', placeholder: 'Ej. Tuya Smart / Smart Life' },
    GARANTIA,
  ],

  // -------------------------------------------------------------------------
  smarttv: [
    { key: 'resolucion', label: 'Resolución máxima', type: 'text', placeholder: 'Ej. 4K HDR' },
    { key: 'sistema', label: 'Sistema', type: 'text', placeholder: 'Ej. Android TV 11 con Google Play' },
    { key: 'memoria', label: 'Memoria y almacenamiento', type: 'text', placeholder: 'Ej. 2 GB + 16 GB' },
    { key: 'apps', label: 'Apps incluidas', type: 'list', placeholder: 'Netflix, YouTube, Disney+, Prime Video', help: 'Separá con comas.' },
    { key: 'control', label: 'Control remoto', type: 'select', options: ['Control común', 'Control con micrófono para buscar por voz', 'Control por voz con puntero'] },
    { key: 'espejo', label: 'Espejo de pantalla del celular', type: 'bool' },
    CONECTIVIDAD('HDMI, USB, Wi-Fi, Bluetooth'),
    GARANTIA,
  ],
};

// ---------------------------------------------------------------------------
// Resolución de categoría → clave del catálogo
//
// Los tres repos manejan el slug distinto: el POS guarda español ("proyector"),
// PandaLink lo traduce a inglés ("projector", "security-cam", "speaker") y
// PandaWEB lo canoniza de vuelta a español. Este índice acepta las tres formas
// para que el MISMO archivo funcione en los tres lados sin ramas por repo.
// ---------------------------------------------------------------------------
const ALIAS: Record<string, string[]> = {
  proyector: ['proyector', 'proyectores', 'projector', 'projectors', 'videobeam', 'video-beam', 'proyeccion'],
  smartwatch: ['smartwatch', 'smartwatches', 'smart-watch', 'reloj', 'relojes', 'reloj-inteligente', 'watch', 'smart-band', 'smartband'],
  camara: ['camara', 'camaras', 'security-cam', 'securitycam', 'security-camera', 'seguridad', 'camara-de-seguridad', 'camara-seguridad', 'ip-cam', 'ipcam', 'cctv'],
  dashcam: ['dashcam', 'dashcams', 'dash-cam', 'camara-de-carro', 'camara-para-carro', 'camara-vehicular'],
  parlante: ['parlante', 'parlantes', 'speaker', 'speakers', 'bocina', 'bocinas', 'altavoz', 'audio'],
  smarthome: ['smarthome', 'smart-home', 'hogar', 'hogar-inteligente', 'domotica', 'casa-inteligente'],
  smarttv: ['smarttv', 'smart-tv', 'smarttv-device', 'tv', 'tvbox', 'tv-box', 'streaming', 'smart-tv-box'],
};

const INDICE_ALIAS: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const [canon, lista] of Object.entries(ALIAS)) {
    idx[canon] = canon;
    for (const a of lista) idx[a] = canon;
  }
  return idx;
})();

/** Slug simple y sin acentos. Réplica local de `slugify` para no depender de nada. */
function slugSimple(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Devuelve la clave canónica del catálogo para una categoría o slug cualquiera.
 * `undefined` si la categoría no tiene ficha definida (ahí se muestra lo que
 * haya cargado, con etiquetas genéricas: un campo nuevo nunca desaparece).
 */
export function resolverCategoriaSpec(categoria?: string | null): string | undefined {
  if (!categoria) return undefined;
  const s = slugSimple(String(categoria));
  if (!s) return undefined;
  if (INDICE_ALIAS[s]) return INDICE_ALIAS[s];
  // Categorías compuestas ("Proyectores Magcubic", "Smart Watch Amazfit").
  for (const [alias, canon] of Object.entries(INDICE_ALIAS)) {
    if (alias.length >= 5 && s.includes(alias)) return canon;
  }
  return undefined;
}

/** Campos definidos para una categoría. Arreglo vacío si no hay ficha. */
export function camposDeCategoria(categoria?: string | null): SpecField[] {
  const canon = resolverCategoriaSpec(categoria);
  return canon ? SPECS_POR_CATEGORIA[canon] : [];
}

/** Definición de un campo puntual, buscando primero en su categoría. */
export function campoSpec(categoria: string | null | undefined, key: string): SpecField | undefined {
  const propios = camposDeCategoria(categoria);
  const encontrado = propios.find((f) => f.key === key);
  if (encontrado) return encontrado;
  // Fuera de su categoría: cualquier definición del mismo `key` sirve para la
  // etiqueta y el formato (así una spec cargada en la categoría equivocada
  // igual se muestra bien redactada).
  for (const lista of Object.values(SPECS_POR_CATEGORIA)) {
    const f = lista.find((x) => x.key === key);
    if (f) return f;
  }
  return undefined;
}

/** camelCase → "Camel case", para claves sin definición. */
function etiquetaGenerica(key: string): string {
  const conEspacios = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

/** Etiqueta visible de una spec. Nunca devuelve vacío. */
export function etiquetaDeSpec(categoria: string | null | undefined, key: string): string {
  return campoSpec(categoria, key)?.label ?? etiquetaGenerica(key);
}

/** Valor de una spec ya listo para mostrar. */
export function formatearSpec(
  categoria: string | null | undefined,
  key: string,
  valor: unknown,
): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean).join(', ');
  if (typeof valor === 'object') return '';

  const def = campoSpec(categoria, key);
  const texto = String(valor).trim();
  if (!texto) return '';
  if (!def?.unit) return texto;

  // La unidad existe para COMPLETAR un número suelto: "3" → "3 meses",
  // "1.2" → "1.2 m". Si quien cargó el dato escribió alguna palabra, ya dijo la
  // unidad a su manera ("3 meses", "1.2 metros", "900 lumenes ANSI") y se
  // respeta tal cual. Buscar la unidad dentro del texto no sirve: "metros"
  // empieza con "m" y "lumenes" no lleva tilde como "lúmenes".
  const soloNumero = /^[\d.,\s+/×x-]+$/.test(texto);
  return soloNumero ? `${texto} ${def.unit}` : texto;
}

/** Una fila lista para renderizar. */
export interface FilaSpec {
  key: string;
  label: string;
  valor: string;
}

/**
 * Convierte el objeto de specs guardado en filas listas para mostrar. Es la
 * ÚNICA función que deberían usar la tablet y la web: garantiza que las dos
 * muestren lo mismo, en el mismo orden y con el mismo texto.
 *
 * Reglas:
 *   - Orden: primero los campos definidos para la categoría, en el orden del
 *     catálogo; después cualquier clave extra, alfabética (un campo nuevo del
 *     POS aparece igual en vez de desaparecer sin aviso).
 *   - Se descartan vacíos, y los booleanos en `false`: no se le anuncia al
 *     cliente lo que el producto NO tiene.
 *   - `extra` (mapa clave→valor del POS) se expande como filas propias.
 */
export function filasDeSpecs(
  categoria: string | null | undefined,
  specs: Record<string, unknown> | null | undefined,
): FilaSpec[] {
  if (!specs || typeof specs !== 'object') return [];

  // Aplanar: `extra` sube al mismo nivel; `lumens` es el alias viejo de `ansi`.
  const plano: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(specs)) {
    if (k === 'extra') {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
          if (plano[ek] === undefined) plano[ek] = ev;
        }
      }
      continue;
    }
    if (k === 'lumens' && (specs.ansi !== undefined && specs.ansi !== null && specs.ansi !== '')) continue;
    plano[k === 'lumens' ? 'ansi' : k] = v;
  }

  const orden = camposDeCategoria(categoria).map((f) => f.key);
  const claves = Object.keys(plano).sort((a, b) => {
    const ia = orden.indexOf(a);
    const ib = orden.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'es');
  });

  const filas: FilaSpec[] = [];
  const etiquetasVistas = new Set<string>();
  for (const key of claves) {
    const valor = plano[key];
    if (valor === false) continue; // no se anuncia lo que no tiene
    const texto = formatearSpec(categoria, key, valor);
    if (!texto) continue;
    const label = etiquetaDeSpec(categoria, key);
    if (etiquetasVistas.has(label)) continue; // ansi/lumens y similares
    etiquetasVistas.add(label);
    filas.push({ key, label, valor: texto });
  }
  return filas;
}
