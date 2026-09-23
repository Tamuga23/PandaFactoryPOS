import React, { useState, useMemo, useEffect, ChangeEvent, FormEvent } from 'react';
import { PackagePlus, Edit, Save, Image as ImageIcon, Loader2, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import ConfirmarBorrado from './ConfirmarBorrado';
import { toast } from './Toast';
import type { SalesBullet, ObjectionOverride, ProjectorSpecs, TabletMedia } from '../types';
import type { FinanciamientoOverride } from '../lib/financiamiento';
import {
  camposDeCategoria,
  resolverCategoriaSpec,
  type SpecField,
} from '../lib/categorySpecs';

// ---------------------------------------------------------------------------
// Ficha técnica: los campos que se editan salen de `categorySpecs.ts` según la
// categoría del producto (proyector → brillo/throw ratio; smartwatch →
// resistencia al agua/batería; etc.). Antes estaba hardcodeado a proyectores.
//
// El estado del form guarda TODO como string o boolean (es lo que devuelven los
// inputs); la conversión a número / arreglo se hace recién al guardar.
// ---------------------------------------------------------------------------
type SpecFormValues = Record<string, string | boolean>;

/** Specs guardadas en Firestore → valores editables en el form. */
const toFormSpecs = (specs?: ProjectorSpecs): SpecFormValues => {
  const out: SpecFormValues = {};
  for (const [k, v] of Object.entries(specs ?? {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.join(', ');
    else if (typeof v === 'object') continue; // `extra` se maneja aparte
    else out[k] = String(v);
  }
  return out;
};

/**
 * Valores del form → objeto para Firestore, tipando cada campo según su
 * definición. Los vacíos se omiten (no se escriben filas en blanco) y las
 * claves que no pertenecen a la categoría actual se CONSERVAN: si alguien
 * cambia la categoría por error, o un script cargó un campo que todavía no está
 * en el catálogo, el dato no se pierde en silencio.
 */
const toFirestoreSpecs = (
  values: SpecFormValues,
  campos: SpecField[],
  previas?: ProjectorSpecs,
): ProjectorSpecs | undefined => {
  const out: Record<string, unknown> = {};
  const conocidos = new Set(campos.map((f) => f.key));

  for (const campo of campos) {
    const raw = values[campo.key];
    if (raw === undefined) continue;

    if (campo.type === 'bool') {
      if (raw === true) out[campo.key] = true; // `false` no se guarda: es la ausencia
      continue;
    }
    const texto = String(raw).trim();
    if (!texto) continue;

    if (campo.type === 'number') {
      const n = Number(texto);
      if (Number.isFinite(n)) out[campo.key] = n;
      continue;
    }
    if (campo.type === 'list') {
      const items = texto.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length > 0) out[campo.key] = items;
      continue;
    }
    out[campo.key] = texto; // text | select
  }

  // Claves ajenas a esta categoría: se preservan tal como estaban.
  for (const [k, v] of Object.entries(previas ?? {})) {
    if (conocidos.has(k) || v === undefined || v === null || v === '') continue;
    out[k] = v;
  }

  return Object.keys(out).length > 0 ? (out as ProjectorSpecs) : undefined;
};

// Galería de la tablet: el form maneja SIEMPRE 2 filas {url, label} (fotos
// complementarias, ej. proyector "A oscuras" / "Con luz"). Acepta docs viejos
// donde gallery era string[].
const toFormMedia = (media?: TabletMedia) => {
  const rows = (media?.gallery ?? [])
    .slice(0, 2)
    .map((g) => (typeof g === 'string' ? { url: g, label: '' } : { url: g.url || '', label: g.label || '' }));
  while (rows.length < 2) rows.push({ url: '', label: '' });
  /*
    `heroImage` puede ser una URL que pegó el operador o el data URI que el
    sistema derivó de la foto subida. En el campo de texto SOLO va la primera:
    mostrar un data URI de 30 KB en un input sería ilegible, y además el
    operador creería que lo escribió él y que puede editarlo.
  */
  const hero = media?.heroImage || '';
  return {
    heroImage: hero.startsWith('data:') ? '' : hero,
    videoUrl: media?.videoUrl || '',
    gallery: rows,
  };
};

export interface CatalogProduct {
  id: string; // id del documento (uuid en productos nuevos; SKU en legacy)
  sku?: string; // P3.5: el SKU ahora es campo propio, ya no es el id
  /** El nombre: lo que ven el POS, el Inventario y la factura (`name`). */
  nombre: string;
  /** El párrafo que la tablet muestra debajo del nombre (`description`). */
  descripcion?: string;
  priceUSD: number;
  category: string;
  status: 'Activo' | 'Inactivo' | string;
  imageUrl?: string;
  // P3.5: datos POS para que este form sea la ficha COMPLETA
  cost?: number;
  stock?: number;
  minStockAlert?: number;
  publicar?: boolean;
  precioPromo?: number;
  descEfectivoPct?: number;
  campania?: string;
  beneficio?: string;
  bullets?: SalesBullet[];
  objecionesOverride?: ObjectionOverride[];
  specsProyector?: ProjectorSpecs;
  media?: TabletMedia;
  financiamientoOverride?: FinanciamientoOverride;
}

export interface ProductCatalogProps {
  catalog: CatalogProduct[];
  onAddProduct: (productData: any) => Promise<void>;
  onUpdateProduct: (id: string, productData: any) => Promise<void>;
  onSuccess?: () => void;
  /** Abre la ficha directamente en modo edición sobre este producto. Lo usa el
   *  botón "Ficha completa" de Inventario, que es donde de verdad se busca. */
  productoInicialId?: string | null;
  /** Las objeciones generales que existen, para elegir cuál se sobreescribe en
   *  vez de tipear su identificador de memoria. */
  objecionesDisponibles?: { id: string; titulo: string }[];
}

/*
  Comparacion estable de dos estados del formulario.

  `JSON.stringify` a secas depende del ORDEN de las claves, y los dos objetos
  que se comparan se arman por caminos distintos: `INITIAL_FORM_DATA` es un
  literal y el que sale de `cargarProducto` es otro. Con las claves ordenadas,
  dos formularios iguales dan la misma cadena vengan de donde vengan.

  `imageFile` queda afuera porque es un `File`, que no se serializa: se compara
  aparte, y basta con que exista para saber que hay una foto sin guardar.
*/
const huella = (valor: unknown): string =>
  JSON.stringify(valor, (_clave, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = v[k]; return acc; }, {})
      : v,
  );

interface FormData {
  id: string;
  sku: string;
  cost: number | string;
  stock: number | string;
  minStockAlert: number | string;
  nombre: string;
  descripcion: string;
  priceUSD: number | string;
  category: string;
  status: 'Activo' | 'Inactivo' | string;
  imageFile: File | null;
  /** El operador pidió sacar la foto que ya tiene el producto. */
  quitarImagen: boolean;
  publicar: boolean;
  precioPromo: number | string;
  descEfectivoPct: number | string;
  campania: string;
  beneficio: string;
  bullets: SalesBullet[];
  objecionesOverride: ObjectionOverride[];
  /**
   * Excepción de financiamiento. Solo los tres casos que se usan en la práctica;
   * el ajuste fino de recargos por plazo se hace en Configuración, por categoría.
   */
  financiamiento: 'categoria' | 'sin-interes' | 'sin-cuotas';
  /** Valores editables de la ficha técnica (strings/booleanos del form). */
  specsProyector: SpecFormValues;
  /**
   * Specs tal como vinieron de Firestore. Sirven para no perder campos que no
   * pertenecen a la categoría actual al guardar (ver `toFirestoreSpecs`).
   */
  specsOriginal?: ProjectorSpecs;
  media: any;
}

const INITIAL_FORM_DATA: FormData = {
  id: '',
  sku: '',
  cost: '',
  stock: '',
  minStockAlert: '',
  nombre: '',
  descripcion: '',
  priceUSD: '',
  category: '',
  status: 'Activo',
  imageFile: null,
  quitarImagen: false,
  publicar: true,
  precioPromo: '',
  descEfectivoPct: '',
  campania: '',
  beneficio: '',
  bullets: [],
  objecionesOverride: [],
  financiamiento: 'categoria',
  specsProyector: {},
  media: toFormMedia(undefined),
};

export default function ProductCatalog({
  catalog,
  onAddProduct,
  onUpdateProduct,
  onSuccess,
  productoInicialId,
  objecionesDisponibles = [],
}: ProductCatalogProps) {
  // 2. ESTADOS REQUERIDOS
  const [isEditing, setIsEditing] = useState<boolean>(false);
  /*
    Buscador de producto. Antes esto era un <select> con los 31 productos, que
    mostraba SOLO el nombre: para editar "MagCubic Proyector Portatil HY450MAX
    1100 ANSI" había que reconocerlo entre otros seis MagCubic de nombre casi
    idéntico, sin ver el SKU ni el precio y sin poder escribir para filtrar.
    Es el mismo patrón de combobox que ya funciona en el POS.
  */
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [opcionActiva, setOpcionActiva] = useState(-1);
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  /*
    Este componente tenía su PROPIO sistema de avisos —un banner con estado,
    con su tipografía y su paleta— que era el TERCERO del proyecto, después del
    Toast global y del que tenía Configuración. Y pintaba el ÉXITO en CYAN: el
    color que el sistema reserva para el dinero y la próxima acción, no para
    confirmar. Confirmar es esmeralda.

    Migrado al Toast global. Se gana además que los errores no se autodestruyen
    y que se anuncian a un lector de pantalla, que es lo que le interesa a
    alguien que acaba de guardar una ficha de veinte campos y necesita saber si
    quedó.
  */
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  /*
    Como estaba el formulario la ultima vez que se cargo o se guardo. Sirve para
    saber si hay trabajo sin guardar antes de tirarlo.

    Habia CUATRO caminos que borraban el formulario entero sin preguntar: las
    dos pestanas de modo, el boton "Cancelar / Limpiar" y elegir otro producto
    en el buscador. Son 31 campos, y varios son parrafos: los bullets, las
    respuestas a objeciones, la ficha tecnica. Un clic de mas en "Crear" y no
    quedaba nada, sin un aviso.
  */
  const [referencia, setReferencia] = useState<FormData>(INITIAL_FORM_DATA);
  /** Lo que hay que hacer si el operador confirma que quiere descartar. */
  const [descartarY, setDescartarY] = useState<{ accion: () => void } | null>(null);

  // Extraer categorías únicas para el dropdown
  const uniqueCategories = useMemo(() => {
    const cats = catalog.map((p) => p.category).filter(Boolean);
    return Array.from(new Set(cats));
  }, [catalog]);

  // --- Ficha técnica: campos aplicables a la categoría elegida ---
  const specFields = useMemo(() => camposDeCategoria(formData.category), [formData.category]);
  const specCategoryLabel = useMemo(
    () => resolverCategoriaSpec(formData.category) ?? formData.category,
    [formData.category],
  );
  /*
    Specs que quedaron de OTRA categoría.

    `toFirestoreSpecs` preserva a propósito las claves que no pertenecen a la
    categoría actual, para que cambiar de categoría por error —o volver— no
    pierda lo cargado. La decisión es buena; lo que faltaba es que se viera.

    Porque al espejo de la tablet viajan TODAS: el backfill hace
    `if (p.specsProyector) doc.specsProyector = p.specsProyector`, sin filtrar.
    Así que un smartwatch que alguna vez fue proyector le puede llegar al
    cliente con "brillo: 800 lúmenes", y desde este formulario no había forma
    de enterarse, porque sólo se dibujan los campos de la categoría de ahora.
  */
  const specsDeOtraCategoria = useMemo(() => {
    const conocidos = new Set(specFields.map((f) => f.key));
    return Object.entries(formData.specsOriginal ?? {})
      .filter(([k, v]) => !conocidos.has(k) && v !== undefined && v !== null && v !== '')
      .map(([k, v]) => ({ clave: k, valor: Array.isArray(v) ? v.join(', ') : String(v) }));
  }, [specFields, formData.specsOriginal]);

  /** Cuántos campos de la categoría tienen dato: da feedback de qué falta cargar. */
  const specsCargadas = useMemo(
    () =>
      specFields.filter((f) => {
        const v = formData.specsProyector[f.key];
        return v === true || (typeof v === 'string' && v.trim() !== '');
      }).length,
    [specFields, formData.specsProyector],
  );
  /** Specs cargadas que NO pertenecen a esta categoría (no se borran, se avisan). */
  const specsAjenas = useMemo(() => {
    const conocidos = new Set(specFields.map((f) => f.key));
    return Object.entries(formData.specsProyector)
      .filter(([k, v]) => !conocidos.has(k) && (v === true || (typeof v === 'string' && v.trim() !== '')))
      .map(([k]) => k);
  }, [specFields, formData.specsProyector]);

  // 3. LÓGICA DE CAMPOS Y MANEJADORES

  // Cambio Nuevo/Editar
  const hayCambiosSinGuardar = useMemo(() => {
    if (formData.imageFile) return true;
    const { imageFile: _f, ...actual } = formData;
    const { imageFile: _r, ...base } = referencia;
    return huella(actual) !== huella(base);
  }, [formData, referencia]);

  /**
   * Corre `accion` si no hay nada que perder; si lo hay, primero pregunta.
   * Todo lo que tire el formulario pasa por acá.
   */
  const siNoHayNadaQuePerder = (accion: () => void) => {
    if (!hayCambiosSinGuardar) {
      accion();
      return;
    }
    setDescartarY({ accion });
  };

  const limpiarFormulario = (editing: boolean) => {
    setIsEditing(editing);
    setFormData(INITIAL_FORM_DATA);
    setReferencia(INITIAL_FORM_DATA);
    setIsCustomCategory(false);
    setBusquedaProducto('');
    setListaAbierta(false);
    setOpcionActiva(-1);
  };

  const handleModeToggle = (editing: boolean) => siNoHayNadaQuePerder(() => limpiarFormulario(editing));

  /**
   * Carga un producto del catálogo en el formulario. Se extrajo del handler del
   * <select> para poder reusarla desde el buscador y desde la entrada directa
   * de Inventario.
   */
  const cargarProducto = (selectedId: string) => {
    const product = catalog.find((p) => p.id === selectedId);

    if (product) {
      const isStandardCategory = uniqueCategories.includes(product.category);
      // El mismo objeto va al formulario y a la referencia: desde este momento
      // "sin cambios" significa "igual a como vino del catálogo".
      const cargado: FormData = {
        id: product.id,
        sku: product.sku || product.id,
        cost: product.cost ?? '',
        stock: product.stock ?? '',
        minStockAlert: product.minStockAlert ?? '',
        nombre: product.nombre,
        descripcion: product.descripcion || '',
        priceUSD: product.priceUSD,
        category: product.category,
        status: product.status || 'Activo',
        imageFile: null,
        quitarImagen: false,
        publicar: product.publicar !== false,
        precioPromo: product.precioPromo || '',
        descEfectivoPct: product.descEfectivoPct || '',
        campania: product.campania || '',
        beneficio: product.beneficio || '',
        bullets: product.bullets || [],
        objecionesOverride: product.objecionesOverride || [],
        financiamiento: product.financiamientoOverride?.habilitado === false
          ? 'sin-cuotas'
          : product.financiamientoOverride?.sinInteres
            ? 'sin-interes'
            : 'categoria',
        specsProyector: toFormSpecs(product.specsProyector),
        specsOriginal: product.specsProyector,
        media: toFormMedia(product.media),
      };
      setFormData(cargado);
      setReferencia(cargado);
      setIsCustomCategory(!isStandardCategory);
      setBusquedaProducto(product.nombre);
    } else {
      setFormData(INITIAL_FORM_DATA);
      setReferencia(INITIAL_FORM_DATA);
      setIsCustomCategory(false);
      setBusquedaProducto('');
    }
    setListaAbierta(false);
    setOpcionActiva(-1);
  };

  /*
    Entrada directa desde Inventario: el botón "Ficha completa" de cada fila
    navega acá con el id del producto. El Catálogo es donde vive la ficha
    entera; el Inventario es donde se BUSCA, porque tiene buscador, filtro por
    categoría y orden por columna. Antes había que acordarse del nombre exacto
    y volver a encontrarlo en una lista.
  */
  useEffect(() => {
    if (!productoInicialId) return;
    if (!catalog.some((p) => p.id === productoInicialId)) return;
    setIsEditing(true);
    cargarProducto(productoInicialId);
    // Solo al llegar con un id, o cuando el catálogo termina de cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoInicialId, catalog.length]);

  /** Los que matchean lo tipeado, por nombre o por SKU. Sin texto: todos. */
  const coincidenciasProducto = useMemo(() => {
    const orden = [...catalog].sort((a, b) => {
      const ai = a.status === 'Inactivo' ? 1 : 0;
      const bi = b.status === 'Inactivo' ? 1 : 0;
      if (ai !== bi) return ai - bi;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return orden;
    return orden.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q),
    );
  }, [catalog, busquedaProducto]);

  // La lista tiene alto máximo: resaltar algo fuera de la ventana visible se ve
  // igual que no hacer nada.
  useEffect(() => {
    if (opcionActiva < 0) return;
    document.getElementById(`catalogo-op-${opcionActiva}`)?.scrollIntoView({ block: 'nearest' });
  }, [opcionActiva]);

  const onTeclaProducto = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!listaAbierta) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setListaAbierta(true);
        setOpcionActiva(0);
      }
      return;
    }
    const ultimo = coincidenciasProducto.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpcionActiva((a) => (a >= ultimo ? 0 : a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpcionActiva((a) => (a <= 0 ? ultimo : a - 1));
    } else if (e.key === 'Enter') {
      /*
        El Enter NUNCA sigue de largo hasta el <form>.

        Antes solo se frenaba si habia una opcion resaltada con las flechas; si
        no, la tecla llegaba al formulario, que hace submit y GUARDA. Buscar el
        producto B con el producto A abierto lo guardaba a A en silencio.

        Ahora: si hay algo resaltado se carga; si la busqueda dejo una sola
        coincidencia se carga esa, que es lo que uno espera al escribir un SKU
        completo; y si no, no pasa nada.
      */
      e.preventDefault();
      // Cargar otro producto pisa el formulario entero: pasa por el portero.
      if (opcionActiva >= 0 && coincidenciasProducto[opcionActiva]) {
        const id = coincidenciasProducto[opcionActiva].id;
        siNoHayNadaQuePerder(() => cargarProducto(id));
      } else if (coincidenciasProducto.length === 1) {
        const id = coincidenciasProducto[0].id;
        siNoHayNadaQuePerder(() => cargarProducto(id));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setListaAbierta(false);
      setOpcionActiva(-1);
    } else if (e.key === 'Tab') {
      setListaAbierta(false);
      setOpcionActiva(-1);
    }
  };

  // Manejo de categorías dinámicas
  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'NEW_CATEGORY') {
      setIsCustomCategory(true);
      setFormData({ ...formData, category: '' });
    } else {
      setIsCustomCategory(false);
      setFormData({ ...formData, category: value });
    }
  };

  // Manejo de la subida de imagen
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFormData({ ...formData, imageFile: e.target.files[0], quitarImagen: false });
    }
  };

  // Resto de los inputs estándar
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // 4. LÓGICA DE SUBMIT
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Crear objeto estandarizado
      const productDataToSave = {
        sku: formData.sku.trim(),
        nombre: formData.nombre,
        descripcion: formData.descripcion.trim(),
        priceUSD: Number(formData.priceUSD),
        // P3.5: datos POS en la misma ficha
        cost: formData.cost !== '' ? Number(formData.cost) : undefined,
        stock: formData.stock !== '' ? Number(formData.stock) : undefined,
        minStockAlert: formData.minStockAlert !== '' ? Number(formData.minStockAlert) : undefined,
        category: formData.category,
        status: formData.status,
        imageFile: formData.imageFile,
        quitarImagen: formData.quitarImagen,
        publicar: formData.publicar,
        precioPromo: formData.precioPromo ? Number(formData.precioPromo) : undefined,
        descEfectivoPct: formData.descEfectivoPct ? Number(formData.descEfectivoPct) : undefined,
        campania: formData.campania || undefined,
        beneficio: formData.beneficio || undefined,
        // Bullets: se descartan las filas vacías y se guarda el orden visible,
        // que es el que respetan la tablet y la web al mostrarlos.
        bullets: (() => {
          const limpios = formData.bullets
            .map((b, i) => ({
              text: (b.text || '').trim(),
              etiqueta: (b.etiqueta || '').trim() || undefined,
              order: i + 1,
            }))
            .filter((b) => b.text.length > 0);
          return limpios.length > 0 ? limpios : undefined;
        })(),
        objecionesOverride: formData.objecionesOverride.length > 0 ? formData.objecionesOverride : undefined,
        // Financiamiento: `undefined` = manda la regla de la categoría.
        financiamientoOverride:
          formData.financiamiento === 'sin-interes' ? { sinInteres: true }
          : formData.financiamiento === 'sin-cuotas' ? { habilitado: false }
          : undefined,
        // Ficha técnica: los campos aplicables los define la categoría
        // (`categorySpecs.ts`), no un `if` de proyectores como antes.
        specsProyector: toFirestoreSpecs(
          formData.specsProyector,
          camposDeCategoria(formData.category),
          formData.specsOriginal,
        ),
        media: (() => {
          // Galería: solo filas con URL; label solo si tiene texto (Firestore rechaza undefined anidado).
          const gallery = (formData.media.gallery ?? [])
            .filter((g: { url: string }) => g.url.trim())
            .map((g: { url: string; label: string }) =>
              g.label.trim() ? { url: g.url.trim(), label: g.label.trim() } : { url: g.url.trim() });
          if (!formData.media.heroImage && !formData.media.videoUrl && gallery.length === 0) return undefined;
          return {
            heroImage: formData.media.heroImage || undefined,
            videoUrl: formData.media.videoUrl || undefined,
            ...(gallery.length > 0 ? { gallery } : {}),
          };
        })(),
      };

      if (isEditing) {
        if (!formData.id) throw new Error('Debe seleccionar un producto para actualizar.');
        // Update product
        await onUpdateProduct(formData.id, productDataToSave);
        toast.success(`«${formData.nombre}» actualizado en el catálogo.`);
      } else {
        if (!formData.sku.trim()) throw new Error('El SKU es obligatorio para nuevos productos.');
        // P3.5: el id del documento lo genera el caller (uuid); acá viaja solo el SKU.
        await onAddProduct(productDataToSave);
        toast.success(`«${formData.nombre}» registrado en el catálogo.`);
      }

      // Limpiar y resetear estados
      setFormData(INITIAL_FORM_DATA);
      setReferencia(INITIAL_FORM_DATA);
      setIsCustomCategory(false);
      
      // Callback opcional de éxito
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudo guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Handlers for Complex Fields ---
  const handleBulletAdd = () => setFormData({ ...formData, bullets: [...formData.bullets, { text: '' }] });
  const handleBulletChange = (index: number, field: 'text' | 'etiqueta', value: string) => {
    setFormData((prev) => ({
      ...prev,
      bullets: prev.bullets.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
  };
  /** Sube o baja un bullet: el orden visible es el que se guarda. */
  const handleBulletMove = (index: number, dir: -1 | 1) => {
    const destino = index + dir;
    setFormData((prev) => {
      if (destino < 0 || destino >= prev.bullets.length) return prev;
      const bullets = [...prev.bullets];
      [bullets[index], bullets[destino]] = [bullets[destino], bullets[index]];
      return { ...prev, bullets };
    });
  };
  const handleBulletRemove = (index: number) => {
    setFormData({ ...formData, bullets: formData.bullets.filter((_, i) => i !== index) });
  };

  const handleObjAdd = () => setFormData({ ...formData, objecionesOverride: [...formData.objecionesOverride, { objId: '', respuesta: '' }] });
  const handleObjChange = (index: number, field: string, value: string) => {
    const newObjs = [...formData.objecionesOverride];
    newObjs[index] = { ...newObjs[index], [field]: value };
    setFormData({ ...formData, objecionesOverride: newObjs });
  };
  const handleObjRemove = (index: number) => {
    setFormData({ ...formData, objecionesOverride: formData.objecionesOverride.filter((_, i) => i !== index) });
  };

  const handleSpecChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      specsProyector: { ...prev.specsProyector, [field]: value },
    }));
  };
  
  const handleMediaChange = (field: string, value: string) => {
    setFormData({ ...formData, media: { ...formData.media, [field]: value } });
  };

  // Fotos complementarias (galería tablet): edición inmutable de la fila i.
  const handleGalleryChange = (index: number, field: 'url' | 'label', value: string) => {
    setFormData((prev: FormData) => ({
      ...prev,
      media: {
        ...prev.media,
        gallery: (prev.media.gallery ?? []).map((g: { url: string; label: string }, i: number) =>
          i === index ? { ...g, [field]: value } : g),
      },
    }));
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-cyan-400" />
            Catálogo Maestro de Productos
          </h2>
          <p className="text-zinc-400 text-sm mt-1">Registra nuevos productos o actualiza existentes.</p>
        </div>
        
        {/* Toggle Mode Builder */}
        <div className="flex bg-zinc-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => handleModeToggle(false)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              !isEditing ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-400 hover:text-white'
            } focus:outline-none focus:ring-1 focus:ring-cyan-500`}
          >
            <PackagePlus className="w-4 h-4" />
            Nuevo Articulo
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              isEditing ? 'bg-cyan-500/20 text-cyan-400' : 'text-zinc-400 hover:text-white'
            } focus:outline-none focus:ring-1 focus:ring-cyan-500`}
          >
            <Edit className="w-4 h-4" />
            Modificar Existente
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/*
          Buscador del producto a editar. Era un <select> con los 31 productos
          que mostraba SOLO el nombre: para editar uno había que reconocerlo
          entre seis MagCubic de nombre casi idéntico, sin ver el SKU ni el
          precio, y sin poder escribir para filtrar.

          Ahora es el patrón combobox de ARIA 1.2 con el foco en el input, el
          mismo que el buscador de cliente del POS: se escribe parte del nombre
          o el SKU, se baja con las flechas y se elige con Enter. Cada opción
          muestra SKU y precio, que es como se distinguen entre sí.
        */}
        {isEditing && (
          <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
            <label htmlFor="catalogo-producto-editar" className="block text-sm font-medium text-zinc-300 mb-2">
              Producto a editar
              <span className="font-normal text-zinc-400"> · escribí el nombre o el SKU</span>
            </label>
            <div className="relative">
              <input
                id="catalogo-producto-editar"
                type="text"
                role="combobox"
                aria-expanded={listaAbierta}
                aria-controls="catalogo-sugerencias"
                aria-autocomplete="list"
                aria-activedescendant={
                  listaAbierta && opcionActiva >= 0 ? `catalogo-op-${opcionActiva}` : undefined
                }
                autoComplete="off"
                placeholder="Buscar en el catálogo…"
                value={busquedaProducto}
                onChange={(e) => {
                  setBusquedaProducto(e.target.value);
                  setListaAbierta(true);
                  setOpcionActiva(-1);
                }}
                onFocus={() => setListaAbierta(true)}
                onKeyDown={onTeclaProducto}
                onBlur={() => {
                  // Elegir una opción no pasa por acá: la lista cancela su
                  // mousedown para que el input no pierda el foco antes del clic.
                  setListaAbierta(false);
                  setOpcionActiva(-1);
                }}
                className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-2.5 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
              {listaAbierta && coincidenciasProducto.length > 0 && (
                <ul
                  id="catalogo-sugerencias"
                  role="listbox"
                  aria-label="Productos del catálogo"
                  className="absolute z-20 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl max-h-64 overflow-y-auto list-none"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {coincidenciasProducto.map((p, idx) => (
                    <li
                      key={p.id}
                      id={`catalogo-op-${idx}`}
                      role="option"
                      aria-selected={idx === opcionActiva}
                      onClick={() => siNoHayNadaQuePerder(() => cargarProducto(p.id))}
                      className={`px-3 py-2 flex items-baseline justify-between gap-3 cursor-pointer hover:bg-zinc-700 ${
                        idx === opcionActiva ? 'bg-zinc-700' : ''
                      }`}
                    >
                      <span className="text-sm text-white truncate">
                        {p.status === 'Inactivo' && (
                          <span className="text-[10px] uppercase font-bold text-amber-400 mr-1.5">Inactivo</span>
                        )}
                        {p.nombre}
                      </span>
                      <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
                        {p.sku} · US${Number(p.priceUSD).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {listaAbierta && coincidenciasProducto.length === 0 && (
                <div className="absolute z-20 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-400">
                  Ningún producto coincide con «{busquedaProducto.trim()}».
                </div>
              )}
            </div>
            {formData.id && (
              <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mt-2">
                Editando · SKU {formData.sku}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SKU Field (P3.5: el id del documento ahora es uuid; el SKU es un campo con unicidad) */}
          <div>
            <label htmlFor="producto-sku-del-producto" className="block text-sm font-medium text-zinc-300 mb-2">SKU del Producto</label>
            <input id="producto-sku-del-producto"
              type="text"
              name="sku"
              value={formData.sku}
              /*
                Antes esto era `handleInputChange` con la clase `uppercase` en
                el className: la mayúscula era CSS y el valor guardado era el
                tipeado. Ahora el valor SE convierte, así que lo que se ve es
                lo que se guarda.
              */
              onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
              required
              placeholder="Ej. PROY-001"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
          </div>

          {/*
              Este campo se llamaba "Descripción del Producto" y escribía en
              `name`: es el nombre que ven el POS, el Inventario y la factura.
              El placeholder lo delataba — "Ej. Proyector MagCubic HY450" es un
              nombre, no una descripción.

              La descripción de verdad existía en Firestore, se grababa UNA vez
              al crear con el mismo valor que el nombre, no se podía editar
              nunca más... y sí viajaba a la tablet. Así que renombrar un
              producto le dejaba al cliente el nombre nuevo arriba y el viejo
              como descripción. Ahora son dos campos distintos, los dos editables.
           */}
          <div>
            <label htmlFor="producto-nombre" className="block text-sm font-medium text-zinc-300 mb-2">
              Nombre del producto
            </label>
            <input id="producto-nombre"
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleInputChange}
              required
              placeholder="Ej. Proyector MagCubic HY450"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-zinc-400 mt-1">Es el que aparece en el mostrador, en el inventario y en la factura.</p>
          </div>

          {/* Price Field */}
          <div>
            <label htmlFor="producto-precio-de-venta-sugerido-usd" className="block text-sm font-medium text-zinc-300 mb-2">Precio de Venta Sugerido (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
              <input id="producto-precio-de-venta-sugerido-usd"
                type="number"
                name="priceUSD"
                value={formData.priceUSD}
                onChange={handleInputChange}
                required
                min="0"
                step="any"
                placeholder="0.00"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-8 pr-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Dynamic Category Category */}
          <div className="space-y-4">
            <div>
              <label htmlFor="producto-categoria" className="block text-sm font-medium text-zinc-300 mb-2">Categoría</label>
              {!isCustomCategory ? (
                <select id="producto-categoria"
                  value={formData.category}
                  onChange={handleCategoryChange}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                >
                  <option value="">— Elegí una categoría —</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="NEW_CATEGORY" className="font-bold text-cyan-400">
                    + Agregar nueva categoría
                  </option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input aria-label="Escriba nueva categoría"
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    placeholder="Escriba nueva categoría"
                    required
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(false);
                      setFormData({ ...formData, category: '' });
                    }}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    Volver
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Status Field */}
          <div>
             <label htmlFor="producto-estado-del-producto" className="block text-sm font-medium text-zinc-300 mb-2">Estado del Producto</label>
             <select id="producto-estado-del-producto"
               name="status"
               value={formData.status}
               onChange={handleInputChange}
               required
               className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
             >
               <option value="Activo">Activo (Disponible en POS)</option>
               <option value="Inactivo">Inactivo (Oculto)</option>
             </select>
          </div>

          {/*
              Foto del producto: la subida y la URL de alta calidad, JUNTAS.

              Estaban a quinientas líneas de distancia —el cargador acá arriba y
              «Imagen Principal (URL)» al fondo, bajo un título que decía
              «(URLs)»— y nada las relacionaba. Como sólo la URL viajaba a la
              tablet, el operador subía la foto, la veía en la vista previa, y
              el cliente no veía nada.
           */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Foto del producto (opcional)</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center justify-center w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-cyan-500 cursor-pointer transition-colors group relative overflow-hidden shrink-0 focus-within:ring-2 focus-within:ring-cyan-500 focus-within:ring-offset-2 focus-within:ring-offset-zinc-900">
                {(() => {
                   const existingImg = isEditing && formData.id && !formData.quitarImagen
                     ? catalog.find(p => p.id === formData.id)?.imageUrl
                     : null;
                   const previewUrl = formData.imageFile ? URL.createObjectURL(formData.imageFile) : existingImg;
                   
                   if (previewUrl) {
                     return (
                       <>
                         <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                           <ImageIcon className="w-5 h-5 text-white" />
                         </div>
                       </>
                     );
                   }
                   return <ImageIcon className="w-5 h-5 text-zinc-400 group-hover:text-cyan-400" />;
                })()}
                <input aria-label="Elegir una imagen para el producto"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              <div className="flex-1 text-sm text-zinc-400 min-w-0">
                {formData.imageFile ? (
                  <span className="text-cyan-400 font-medium truncate block">{formData.imageFile.name}</span>
                ) : formData.quitarImagen ? (
                  <span className="text-amber-400">Se va a quitar la foto al guardar.</span>
                ) : (
                  <span>Subir una foto (PNG, JPG)</span>
                )}
                {isEditing && !formData.imageFile && !formData.quitarImagen
                  && catalog.find(p => p.id === formData.id)?.imageUrl && (
                  <p className="text-xs text-zinc-400 mt-1">Se mantiene la foto actual si no elegís otra.</p>
                )}
              </div>

              {/*
                  Quitar la foto no se podía: sólo reemplazarla. Si subiste la
                  equivocada, quedaba para siempre — ni el formulario ni el hook
                  tenían forma de borrarla.
               */}
              {(formData.imageFile || (isEditing && !formData.quitarImagen && catalog.find(p => p.id === formData.id)?.imageUrl)) && (
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    imageFile: null,
                    // Con un archivo recien elegido, el boton CANCELA esa
                    // eleccion y la foto que ya estaba se queda. Sin archivo,
                    // el boton pide quitar la que hay.
                    quitarImagen: formData.imageFile === null,
                  })}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-rose-400 hover:border-rose-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {formData.imageFile ? 'Cancelar' : 'Quitar foto'}
                </button>
              )}
              {formData.quitarImagen && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, quitarImagen: false })}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  Dejarla
                </button>
              )}
            </div>

            <div className="mt-3">
              <label htmlFor="producto-imagen-principal-url-alta-calidad" className="block text-xs text-zinc-400 mb-1">
                URL de alta calidad para la tablet <span className="font-normal">(opcional)</span>
              </label>
              <input
                id="producto-imagen-principal-url-alta-calidad"
                type="url"
                value={formData.media.heroImage}
                onChange={(e) => handleMediaChange('heroImage', e.target.value)}
                placeholder="https://…"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
              />
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {formData.media.heroImage.trim()
                  ? 'Ésta es la que ve el cliente en la tablet. La foto subida se usa en el mostrador y en la factura.'
                  : 'Sin URL, el cliente ve una versión reducida de la foto subida. Pegá una acá solo si tenés una imagen mejor.'}
              </p>
            </div>
          </div>
        </div>

        {/* --- Datos POS (P3.5: ficha completa en un solo form) --- */}
        <div className="pt-6 mt-6 border-t border-zinc-800">
          <h3 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
            Datos POS (costo e inventario)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="producto-costo-usd" className="block text-sm font-medium text-zinc-300 mb-2">Costo (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                <input id="producto-costo-usd"
                  type="number" name="cost" min="0" step="any"
                  value={formData.cost}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-8 pr-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1">Las compras lo recalculan (costo promedio).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                {isEditing ? 'Stock actual (solo lectura)' : 'Stock inicial'}
              </label>
              <input aria-label="stock"
                type="number" name="stock" min="0"
                value={formData.stock}
                onChange={handleInputChange}
                disabled={isEditing}
                placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isEditing && <p className="text-xs text-zinc-400 mt-1">Ajustalo desde Inventario (queda en el kardex con motivo).</p>}
            </div>
            <div>
              <label htmlFor="producto-alerta-de-stock-minimo" className="block text-sm font-medium text-zinc-300 mb-2">Alerta de stock mínimo</label>
              <input id="producto-alerta-de-stock-minimo"
                type="number" name="minStockAlert" min="0"
                value={formData.minStockAlert}
                onChange={handleInputChange}
                placeholder="5"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* --- Public Catalog / Tablet Options --- */}
        <div className="pt-6 mt-6 border-t border-zinc-800">
          <h3 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
            Configuración de Catálogo Público (Tablet)
          </h3>
          
          <div className="mb-6 bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input aria-label="publicar"
                type="checkbox"
                name="publicar"
                checked={formData.publicar}
                onChange={(e) => setFormData({ ...formData, publicar: e.target.checked })}
                className="w-5 h-5 bg-zinc-900 border-zinc-600 rounded text-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-800"
              />
              <div>
                <span className="block text-sm font-medium text-white">Mostrar producto en el catálogo de la tablet</span>
                <span className="block text-xs text-zinc-400 mt-0.5">Si se desactiva, el producto solo existirá en el POS y no será visible en la tablet.</span>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="producto-precio-promocional-usd-opcional" className="block text-sm font-medium text-zinc-300 mb-2">Precio Promocional (USD) - Opcional</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                <input id="producto-precio-promocional-usd-opcional"
                  type="number"
                  name="precioPromo"
                  value={formData.precioPromo}
                  onChange={handleInputChange}
                  min="0"
                  step="any"
                  placeholder="Ej. 150.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-8 pr-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="producto-descuento-por-efectivo-opcional" className="block text-sm font-medium text-zinc-300 mb-2">Descuento por Efectivo (%) - Opcional</label>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">%</span>
                <input id="producto-descuento-por-efectivo-opcional"
                  type="number"
                  name="descEfectivoPct"
                  value={formData.descEfectivoPct}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  step="0.0001"
                  placeholder="Ej. 5"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-4 pr-8 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="producto-campana-etiqueta-promocional-opcional" className="block text-sm font-medium text-zinc-300 mb-2">Campaña (Etiqueta promocional) - Opcional</label>
              <input id="producto-campana-etiqueta-promocional-opcional"
                type="text"
                name="campania"
                value={formData.campania}
                onChange={handleInputChange}
                placeholder="Ej. Black Friday"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label htmlFor="producto-descripcion" className="block text-sm font-medium text-zinc-300 mb-2">
                Descripción <span className="font-normal text-zinc-400">· opcional</span>
              </label>
              <textarea
                id="producto-descripcion"
                name="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={3}
                maxLength={1000}
                placeholder="Un párrafo corto. Ej. Proyector portátil con Android TV integrado, ideal para cuartos sin mucha luz."
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none resize-none"
              />
              <p className="text-xs text-zinc-400 mt-1 mb-6">
                La tablet la muestra debajo del nombre. Si la dejás vacía, no se muestra nada.
              </p>
            </div>

            <div>
              <label htmlFor="producto-beneficio-gancho-de-venta-opcional" className="block text-sm font-medium text-zinc-300 mb-2">Beneficio / Gancho de Venta - Opcional</label>
              <input id="producto-beneficio-gancho-de-venta-opcional"
                type="text"
                name="beneficio"
                value={formData.beneficio}
                onChange={handleInputChange}
                placeholder="Ej. +10,000 hrs de vida útil"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Excepción de financiamiento. Lo normal es dejarlo en la regla de
                la categoría, que se edita en Configuración. */}
            <div>
              <label htmlFor="producto-financiamiento-a-plazos" className="block text-sm font-medium text-zinc-300 mb-2">Financiamiento a plazos</label>
              <select id="producto-financiamiento-a-plazos"
                name="financiamiento"
                value={formData.financiamiento}
                onChange={handleInputChange}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              >
                <option value="categoria">Según su categoría (recomendado)</option>
                <option value="sin-interes">Forzar 0% interés en este producto</option>
                <option value="sin-cuotas">Sin cuotas para este producto</option>
              </select>
              <p className="text-xs text-zinc-400 mt-1">
                {formData.financiamiento === 'categoria'
                  ? 'Usa el recargo de su categoría. Se edita en Configuración → Financiamiento a plazos.'
                  : formData.financiamiento === 'sin-interes'
                    ? 'Se anuncia como 0% interés aunque su categoría tenga recargo. El costo del banco lo absorbés vos.'
                    : 'No se muestran cuotas en la tablet ni en la web, solo el precio de contado.'}
              </p>
            </div>
          </div>
        </div>

        {/* --- Ficha técnica (campos según la categoría) --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <div className="flex items-baseline justify-between mb-1 gap-4">
            <h4 className="text-base font-medium text-cyan-400">Ficha Técnica</h4>
            {specFields.length > 0 && (
              <span className="text-xs text-zinc-400">
                Campos de <b className="text-zinc-400">{specCategoryLabel}</b> · {specsCargadas} de {specFields.length} cargados
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mb-4">
            Se muestra en la tablet y en la web tal como se escribe acá. Los campos vacíos no se muestran.
          </p>

          {specsDeOtraCategoria.length > 0 && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400 leading-relaxed">
                <strong>
                  {specsDeOtraCategoria.length === 1
                    ? 'Hay un dato guardado que no es de esta categoría'
                    : `Hay ${specsDeOtraCategoria.length} datos guardados que no son de esta categoría`}
                </strong>{' '}
                — quedaron de una categoría anterior. No se editan acá, pero <strong>sí se le
                muestran al cliente en la tablet</strong>.
              </p>
              <ul className="mt-2 space-y-0.5 list-none">
                {specsDeOtraCategoria.map((s) => (
                  <li key={s.clave} className="text-xs text-zinc-300">
                    <span className="text-zinc-400">{s.clave}:</span> {s.valor}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  const conocidos = new Set(specFields.map((f) => f.key));
                  const limpio: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(formData.specsOriginal ?? {})) {
                    if (conocidos.has(k)) limpio[k] = v;
                  }
                  setFormData({ ...formData, specsOriginal: limpio as typeof formData.specsOriginal });
                }}
                className="mt-2 px-3 py-1.5 text-xs font-semibold rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-rose-400 hover:border-rose-500/30 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                Quitarlos
              </button>
              <p className="text-[10px] text-zinc-400 mt-2">
                Se quitan al guardar. Si volvés a la categoría anterior antes de guardar, reaparecen.
              </p>
            </div>
          )}

          {specFields.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              {formData.category
                ? `La categoría "${formData.category}" todavía no tiene ficha técnica definida. Agregala en src/lib/categorySpecs.ts (y copiá el archivo a PandaLink y PandaWEB).`
                : 'Elegí una categoría para ver los campos de su ficha técnica.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {specFields.map((campo) => {
                const valor = formData.specsProyector[campo.key];

                if (campo.type === 'bool') {
                  return (
                    <label key={campo.key} className="flex items-start gap-2 cursor-pointer bg-zinc-800/30 border border-zinc-800 rounded-lg px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={valor === true}
                        onChange={(e) => handleSpecChange(campo.key, e.target.checked)}
                        className="mt-0.5 w-4 h-4 bg-zinc-800 border-zinc-700 rounded text-cyan-500 focus:ring-cyan-500 shrink-0"
                      />
                      <span>
                        <span className="block text-sm text-zinc-300">{campo.label}</span>
                        {campo.help && <span className="block text-xs text-zinc-400 mt-0.5">{campo.help}</span>}
                      </span>
                    </label>
                  );
                }

                return (
                  <div key={campo.key}>
                    <label className="block text-sm text-zinc-400 mb-1">
                      {campo.label}
                      {campo.unit && <span className="text-zinc-400"> ({campo.unit})</span>}
                    </label>

                    {campo.type === 'select' ? (
                      <select aria-label={campo.label}
                        value={typeof valor === 'string' ? valor : ''}
                        onChange={(e) => handleSpecChange(campo.key, e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-cyan-500 outline-none text-sm"
                      >
                        <option value="">— Sin especificar —</option>
                        {(campo.options ?? []).map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={campo.label}
                        type={campo.type === 'number' ? 'number' : 'text'}
                        step={campo.type === 'number' ? 'any' : undefined}
                        value={typeof valor === 'string' ? valor : ''}
                        onChange={(e) => handleSpecChange(campo.key, e.target.value)}
                        placeholder={campo.placeholder}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-cyan-500 outline-none text-sm"
                      />
                    )}

                    {campo.help && <p className="text-xs text-zinc-400 mt-1">{campo.help}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Datos cargados fuera del catálogo de esta categoría: se avisan pero
              no se borran (los conserva `toFirestoreSpecs`). */}
          {specsAjenas.length > 0 && (
            <p className="text-xs text-amber-400/80 mt-4">
              Este producto también tiene cargado: {specsAjenas.join(', ')}. No corresponde(n) a esta
              categoría; se conserva(n) igual y se sigue(n) mostrando en la ficha.
            </p>
          )}
        </div>

        {/* --- Bullets --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-base font-medium text-cyan-400">Guiones de Venta (Bullets)</h4>
            <button type="button" onClick={handleBulletAdd} className="text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500">
              <Plus className="w-3 h-3" /> Agregar Bullet
            </button>
          </div>
          <p className="text-xs text-zinc-400 -mt-2 mb-4">
            Lo que el asesor le dice al cliente. Se muestran en este orden en la tablet y en la web.
            La etiqueta es opcional: es el título corto arriba del bullet en la tablet.
          </p>
          {formData.bullets.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              No hay bullets configurados. Sin bullets, la ficha de la tablet y la sección
              &ldquo;Por qué te sirve&rdquo; de la web quedan vacías.
            </p>
          ) : (
            <div className="space-y-3">
              {formData.bullets.map((b, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleBulletMove(idx, -1)}
                      disabled={idx === 0}
                      title="Subir"
                      className="p-1 text-zinc-400 hover:text-cyan-400 disabled:opacity-25 disabled:hover:text-zinc-400 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulletMove(idx, 1)}
                      disabled={idx === formData.bullets.length - 1}
                      title="Bajar"
                      className="p-1 text-zinc-400 hover:text-cyan-400 disabled:opacity-25 disabled:hover:text-zinc-400 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    aria-label={`Etiqueta del bullet ${idx + 1}`}
                    type="text"
                    value={b.etiqueta ?? ''}
                    onChange={(e) => handleBulletChange(idx, 'etiqueta', e.target.value)}
                    placeholder="Etiqueta"
                    maxLength={24}
                    className="w-28 shrink-0 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                  <input
                    aria-label={`Texto del bullet ${idx + 1}`}
                    type="text"
                    value={b.text}
                    onChange={(e) => handleBulletChange(idx, 'text', e.target.value)}
                    placeholder="Ej. Se ve grande y nítido incluso con luz en el cuarto"
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                    required
                  />
                  <button type="button" onClick={() => handleBulletRemove(idx)} className="p-2 text-zinc-400 hover:text-rose-400 bg-zinc-800 rounded-lg hover:bg-rose-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Objeciones Override --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-base font-medium text-cyan-400">Respuestas a objeciones, solo para este producto</h4>
            <button type="button" onClick={handleObjAdd} className="text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500">
              <Plus className="w-3 h-3" /> Agregar Objeción
            </button>
          </div>
          {formData.objecionesOverride.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">No hay objeciones configuradas para este producto.</p>
          ) : (
            <div className="space-y-3">
              {formData.objecionesOverride.map((obj, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                  <div className="flex-1 space-y-2">
                    {/*
                      Era un campo de TEXTO LIBRE: había que saberse de memoria
                      el identificador de una objeción definida en otra pantalla
                      y tipearlo sin equivocarse. Un typo creaba un override que
                      no sobreescribía nada, y nadie avisaba — el sistema conoce
                      esa lista, no tiene por qué hacérsela recordar al operador.

                      Si el valor guardado ya no está en la lista (la objeción se
                      borró, o el dato es viejo), se conserva como opción propia
                      y se marca: perder el dato en silencio sería peor que
                      mostrar que quedó huérfano.
                    */}
                    <select
                      aria-label={`Objeción general que sobreescribe la respuesta ${idx + 1}`}
                      value={obj.objId}
                      onChange={(e) => handleObjChange(idx, 'objId', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      required
                    >
                      <option value="">— Elegí la objeción a sobreescribir —</option>
                      {objecionesDisponibles.map((o) => (
                        <option key={o.id} value={o.id}>{o.titulo}</option>
                      ))}
                      {obj.objId && !objecionesDisponibles.some((o) => o.id === obj.objId) && (
                        <option value={obj.objId}>
                          {obj.objId} — ya no existe en Objeciones Generales
                        </option>
                      )}
                    </select>
                    <textarea aria-label={`Respuesta a la objeción ${idx + 1}`} value={obj.respuesta} onChange={(e) => handleObjChange(idx, 'respuesta', e.target.value)} placeholder="Respuesta específica para el cliente..." rows={2} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none resize-none" required />
                  </div>
                  <button type="button" onClick={() => handleObjRemove(idx)} className="p-2 text-zinc-400 hover:text-rose-400 bg-zinc-800 rounded-lg hover:bg-rose-500/10 transition-colors mt-1 focus:outline-none focus:ring-2 focus:ring-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Media (URLs) --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <h4 className="text-base font-medium text-cyan-400 mb-4">Video y fotos extra para la tablet</h4>
          {/* La imagen principal se mudó arriba, junto a la foto que se sube:
              eran el mismo dato partido en dos lugares del formulario. */}
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label htmlFor="producto-video-promocional-url-solo-youtube" className="block text-sm text-zinc-400 mb-1">Video Promocional (URL — solo YouTube)</label>
              <input id="producto-video-promocional-url-solo-youtube" type="url" value={formData.media.videoUrl} onChange={(e) => handleMediaChange('videoUrl', e.target.value)} placeholder="https://youtube.com/..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
              <p className="text-xs text-zinc-400 mt-1">La tablet solo reproduce YouTube; otras fuentes muestran la foto.</p>
            </div>
          </div>

          {/* Fotos complementarias para el modo Demo de la tablet */}
          <div className="mt-4">
            <label className="block text-sm text-zinc-400 mb-1">Fotos complementarias (Demo de la tablet)</label>
            <p className="text-xs text-zinc-400 mb-2">Hasta 2 fotos extra con etiqueta corta. Ej. proyector: "A oscuras" y "Con luz".</p>
            <div className="space-y-2">
              {(formData.media.gallery ?? []).map((g: { url: string; label: string }, i: number) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {/* Los dos campos de la fila tenian el MISMO aria-label, asi
                      que un lector anunciaba cuatro veces "Fotos complementarias"
                      sin distinguir la direccion de la etiqueta. */}
                  <input aria-label={`Direccion de la foto ${i + 2}`}
                    type="url"
                    value={g.url}
                    onChange={(e) => handleGalleryChange(i, 'url', e.target.value)}
                    placeholder={`https://... (foto ${i + 2})`}
                    className="md:col-span-2 w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                  <input aria-label={`Etiqueta de la foto ${i + 2}`}
                    type="text"
                    maxLength={40}
                    value={g.label}
                    onChange={(e) => handleGalleryChange(i, 'label', e.target.value)}
                    placeholder={i === 0 ? 'Etiqueta (ej. "A oscuras")' : 'Etiqueta (ej. "Con luz")'}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="pt-6 border-t border-zinc-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => handleModeToggle(isEditing)}
            title={hayCambiosSinGuardar ? 'Hay cambios sin guardar' : undefined}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Cancelar / Limpiar
          </button>
          {/* El ternario de este botón tenía las dos ramas idénticas: no distinguía nada. */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg font-bold text-white bg-cyan-700 hover:bg-cyan-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                {isEditing ? 'Actualizar Producto' : 'Guardar en Catálogo'}
              </>
            )}
          </button>
        </div>
      </form>

      {/*
          Descartar el formulario es tirar trabajo, así que usa el mismo diálogo
          que todo lo demás que no vuelve. Antes las dos pestañas de modo, el
          botón de limpiar y elegir otro producto en el buscador lo hacían sin
          preguntar nada.
       */}
      <ConfirmarBorrado
        abierto={!!descartarY}
        titulo="Descartar los cambios sin guardar"
        nombre={formData.nombre.trim() || 'Producto sin nombre'}
        detalle={isEditing && formData.sku ? `SKU ${formData.sku}` : 'Producto nuevo, todavía sin guardar'}
        consecuencias={[
          {
            tono: 'peligro' as const,
            texto: 'Se pierde todo lo que escribiste desde la última vez que guardaste, incluidos los bullets, las respuestas a objeciones y la ficha técnica.',
          },
        ]}
        textoConfirmar="Descartar los cambios"
        onConfirmar={() => {
          const accion = descartarY?.accion;
          setDescartarY(null);
          accion?.();
        }}
        onCancelar={() => setDescartarY(null)}
      />
    </div>
  );
}
