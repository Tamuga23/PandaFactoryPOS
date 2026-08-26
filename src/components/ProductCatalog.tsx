import React, { useState, useMemo, ChangeEvent, FormEvent } from 'react';
import { PackagePlus, Edit, Save, AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { SalesBullet, ObjectionOverride, ProjectorSpecs, TabletMedia } from '../types';
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
  return { heroImage: media?.heroImage || '', videoUrl: media?.videoUrl || '', gallery: rows };
};

export interface CatalogProduct {
  id: string; // id del documento (uuid en productos nuevos; SKU en legacy)
  sku?: string; // P3.5: el SKU ahora es campo propio, ya no es el id
  description: string;
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
}

export interface ProductCatalogProps {
  catalog: CatalogProduct[];
  onAddProduct: (productData: any) => Promise<void>;
  onUpdateProduct: (id: string, productData: any) => Promise<void>;
  onSuccess?: () => void;
}

interface FormData {
  id: string;
  sku: string;
  cost: number | string;
  stock: number | string;
  minStockAlert: number | string;
  description: string;
  priceUSD: number | string;
  category: string;
  status: 'Activo' | 'Inactivo' | string;
  imageFile: File | null;
  publicar: boolean;
  precioPromo: number | string;
  descEfectivoPct: number | string;
  campania: string;
  beneficio: string;
  bullets: SalesBullet[];
  objecionesOverride: ObjectionOverride[];
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
  description: '',
  priceUSD: '',
  category: '',
  status: 'Activo',
  imageFile: null,
  publicar: true,
  precioPromo: '',
  descEfectivoPct: '',
  campania: '',
  beneficio: '',
  bullets: [],
  objecionesOverride: [],
  specsProyector: {},
  media: toFormMedia(undefined),
};

export default function ProductCatalog({
  catalog,
  onAddProduct,
  onUpdateProduct,
  onSuccess,
}: ProductCatalogProps) {
  // 2. ESTADOS REQUERIDOS
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);

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
  const handleModeToggle = (editing: boolean) => {
    setIsEditing(editing);
    setFormData(INITIAL_FORM_DATA);
    setIsCustomCategory(false);
    setFeedback(null);
  };

  // Selección para Editar
  const handleProductSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const product = catalog.find((p) => p.id === selectedId);

    if (product) {
      const isStandardCategory = uniqueCategories.includes(product.category);
      setFormData({
        id: product.id,
        sku: product.sku || product.id,
        cost: product.cost ?? '',
        stock: product.stock ?? '',
        minStockAlert: product.minStockAlert ?? '',
        description: product.description,
        priceUSD: product.priceUSD,
        category: product.category,
        status: product.status || 'Activo',
        imageFile: null,
        publicar: product.publicar !== false,
        precioPromo: product.precioPromo || '',
        descEfectivoPct: product.descEfectivoPct || '',
        campania: product.campania || '',
        beneficio: product.beneficio || '',
        bullets: product.bullets || [],
        objecionesOverride: product.objecionesOverride || [],
        specsProyector: toFormSpecs(product.specsProyector),
        specsOriginal: product.specsProyector,
        media: toFormMedia(product.media),
      });
      setIsCustomCategory(!isStandardCategory);
    } else {
      setFormData(INITIAL_FORM_DATA);
      setIsCustomCategory(false);
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
      setFormData({ ...formData, imageFile: e.target.files[0] });
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
    setFeedback(null);

    try {
      // Crear objeto estandarizado
      const productDataToSave = {
        sku: formData.sku.trim(),
        description: formData.description,
        priceUSD: Number(formData.priceUSD),
        // P3.5: datos POS en la misma ficha
        cost: formData.cost !== '' ? Number(formData.cost) : undefined,
        stock: formData.stock !== '' ? Number(formData.stock) : undefined,
        minStockAlert: formData.minStockAlert !== '' ? Number(formData.minStockAlert) : undefined,
        category: formData.category,
        status: formData.status,
        imageFile: formData.imageFile,
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
        setFeedback({ message: 'Producto actualizado exitosamente.', type: 'success' });
      } else {
        if (!formData.sku.trim()) throw new Error('El SKU es obligatorio para nuevos productos.');
        // P3.5: el id del documento lo genera el caller (uuid); acá viaja solo el SKU.
        await onAddProduct(productDataToSave);
        setFeedback({ message: 'Producto registrado exitosamente en el catálogo.', type: 'success' });
      }

      // Limpiar y resetear estados
      setFormData(INITIAL_FORM_DATA);
      setIsCustomCategory(false);
      
      // Callback opcional de éxito
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      setFeedback({ 
        message: error.message || 'Ocurrió un error al guardar el producto.', 
        type: 'error' 
      });
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl max-w-4xl mx-auto">
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
              !isEditing ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            Nuevo Articulo
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              isEditing ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Edit className="w-4 h-4" />
            Modificar Existente
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          feedback.type === 'success' ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-rose-500/10 border border-rose-500/20'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <p className={`text-sm ${feedback.type === 'success' ? 'text-cyan-400' : 'text-rose-400'}`}>
            {feedback.message}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selector de edición condicional */}
        {isEditing && (
          <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Seleccionar Producto a Actualizar</label>
            <select
              value={formData.id}
              onChange={handleProductSelect}
              required
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            >
              <option value="">-- Seleccione un producto --</option>
              {[...catalog]
                .sort((a, b) => {
                  const aInactive = a.status === 'Inactivo' ? 1 : 0;
                  const bInactive = b.status === 'Inactivo' ? 1 : 0;
                  if (aInactive !== bInactive) return aInactive - bInactive;
                  return a.description.localeCompare(b.description, 'es');
                })
                .map(product => (
                  <option key={product.id} value={product.id}>
                    {product.status === 'Inactivo' ? `[Inactivo] ${product.description}` : product.description}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SKU Field (P3.5: el id del documento ahora es uuid; el SKU es un campo con unicidad) */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">SKU del Producto</label>
            <input
              type="text"
              name="sku"
              value={formData.sku}
              onChange={handleInputChange}
              required
              placeholder="Ej. PROY-001"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none uppercase"
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Descripción del Producto</label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              required
              placeholder="Ej. Proyector MagCubic HY450"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Price Field */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Precio de Venta Sugerido (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
              <input
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Categoría</label>
              {!isCustomCategory ? (
                <select
                  value={formData.category}
                  onChange={handleCategoryChange}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                >
                  <option value="">-- Seleccione Categoría --</option>
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
                  <input
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
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm"
                  >
                    Volver
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Status Field */}
          <div>
             <label className="block text-sm font-medium text-zinc-300 mb-2">Estado del Producto</label>
             <select
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

          {/* Image Upload Field */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Imagen del Producto (Opcional)</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center justify-center w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-cyan-500 cursor-pointer transition-colors group relative overflow-hidden shrink-0">
                {(() => {
                   const existingImg = isEditing && formData.id ? catalog.find(p => p.id === formData.id)?.imageUrl : null;
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <div className="flex-1 text-sm text-zinc-400 truncate">
                {formData.imageFile ? (
                  <span className="text-cyan-400 font-medium">{formData.imageFile.name}</span>
                ) : (
                  <span>Subir nueva imagen (PNG, JPG)</span>
                )}
                {isEditing && !formData.imageFile && catalog.find(p => p.id === formData.id)?.imageUrl && (
                  <p className="text-xs text-zinc-500 mt-1">Mantendrá la imagen actual si no selecciona otra.</p>
                )}
              </div>
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Costo (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                <input
                  type="number" name="cost" min="0" step="any"
                  value={formData.cost}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-8 pr-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">Las compras lo recalculan (costo promedio).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                {isEditing ? 'Stock actual (solo lectura)' : 'Stock inicial'}
              </label>
              <input
                type="number" name="stock" min="0"
                value={formData.stock}
                onChange={handleInputChange}
                disabled={isEditing}
                placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isEditing && <p className="text-xs text-zinc-500 mt-1">Ajustalo desde Inventario (queda en el kardex con motivo).</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Alerta de stock mínimo</label>
              <input
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
              <input
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Precio Promocional (USD) - Opcional</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                <input
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Descuento por Efectivo (%) - Opcional</label>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">%</span>
                <input
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Campaña (Etiqueta promocional) - Opcional</label>
              <input
                type="text"
                name="campania"
                value={formData.campania}
                onChange={handleInputChange}
                placeholder="Ej. Black Friday"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Beneficio / Gancho de Venta - Opcional</label>
              <input
                type="text"
                name="beneficio"
                value={formData.beneficio}
                onChange={handleInputChange}
                placeholder="Ej. +10,000 hrs de vida útil"
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </div>

        {/* --- Ficha técnica (campos según la categoría) --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <div className="flex items-baseline justify-between mb-1 gap-4">
            <h4 className="text-md font-medium text-cyan-400">Ficha Técnica</h4>
            {specFields.length > 0 && (
              <span className="text-xs text-zinc-500">
                Campos de <b className="text-zinc-400">{specCategoryLabel}</b> · {specsCargadas} de {specFields.length} cargados
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            Se muestra en la tablet y en la web tal como se escribe acá. Los campos vacíos no se muestran.
          </p>

          {specFields.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
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
                        {campo.help && <span className="block text-xs text-zinc-500 mt-0.5">{campo.help}</span>}
                      </span>
                    </label>
                  );
                }

                return (
                  <div key={campo.key}>
                    <label className="block text-sm text-zinc-400 mb-1">
                      {campo.label}
                      {campo.unit && <span className="text-zinc-600"> ({campo.unit})</span>}
                    </label>

                    {campo.type === 'select' ? (
                      <select
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
                        type={campo.type === 'number' ? 'number' : 'text'}
                        step={campo.type === 'number' ? 'any' : undefined}
                        value={typeof valor === 'string' ? valor : ''}
                        onChange={(e) => handleSpecChange(campo.key, e.target.value)}
                        placeholder={campo.placeholder}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-cyan-500 outline-none text-sm"
                      />
                    )}

                    {campo.help && <p className="text-xs text-zinc-500 mt-1">{campo.help}</p>}
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
            <h4 className="text-md font-medium text-cyan-400">Guiones de Venta (Bullets)</h4>
            <button type="button" onClick={handleBulletAdd} className="text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> Agregar Bullet
            </button>
          </div>
          <p className="text-xs text-zinc-500 -mt-2 mb-4">
            Lo que el asesor le dice al cliente. Se muestran en este orden en la tablet y en la web.
            La etiqueta es opcional: es el título corto arriba del bullet en la tablet.
          </p>
          {formData.bullets.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
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
                      className="p-1 text-zinc-500 hover:text-cyan-400 disabled:opacity-25 disabled:hover:text-zinc-500 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulletMove(idx, 1)}
                      disabled={idx === formData.bullets.length - 1}
                      title="Bajar"
                      className="p-1 text-zinc-500 hover:text-cyan-400 disabled:opacity-25 disabled:hover:text-zinc-500 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={b.etiqueta ?? ''}
                    onChange={(e) => handleBulletChange(idx, 'etiqueta', e.target.value)}
                    placeholder="Etiqueta"
                    maxLength={24}
                    className="w-28 shrink-0 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                  <input
                    type="text"
                    value={b.text}
                    onChange={(e) => handleBulletChange(idx, 'text', e.target.value)}
                    placeholder="Ej. Se ve grande y nítido incluso con luz en el cuarto"
                    className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                    required
                  />
                  <button type="button" onClick={() => handleBulletRemove(idx)} className="p-2 text-zinc-500 hover:text-rose-400 bg-zinc-800 rounded-lg hover:bg-rose-500/10 transition-colors">
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
            <h4 className="text-md font-medium text-cyan-400">Respuestas a Objeciones (Override)</h4>
            <button type="button" onClick={handleObjAdd} className="text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> Agregar Objeción
            </button>
          </div>
          {formData.objecionesOverride.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No hay objeciones configuradas para este producto.</p>
          ) : (
            <div className="space-y-3">
              {formData.objecionesOverride.map((obj, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-zinc-800/30 p-3 rounded-lg border border-zinc-800">
                  <div className="flex-1 space-y-2">
                    <input type="text" value={obj.objId} onChange={(e) => handleObjChange(idx, 'objId', e.target.value)} placeholder="ID Objeción (ej. garantia, brillo)" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" required />
                    <textarea value={obj.respuesta} onChange={(e) => handleObjChange(idx, 'respuesta', e.target.value)} placeholder="Respuesta específica para el cliente..." rows={2} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none resize-none" required />
                  </div>
                  <button type="button" onClick={() => handleObjRemove(idx)} className="p-2 text-zinc-500 hover:text-rose-400 bg-zinc-800 rounded-lg hover:bg-rose-500/10 transition-colors mt-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Media (URLs) --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <h4 className="text-md font-medium text-cyan-400 mb-4">Multimedia del Catálogo Público (URLs)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Imagen Principal (URL Alta Calidad)</label>
              <input type="url" value={formData.media.heroImage} onChange={(e) => handleMediaChange('heroImage', e.target.value)} placeholder="https://..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Video Promocional (URL — solo YouTube)</label>
              <input type="url" value={formData.media.videoUrl} onChange={(e) => handleMediaChange('videoUrl', e.target.value)} placeholder="https://youtube.com/..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
              <p className="text-xs text-zinc-500 mt-1">La tablet solo reproduce YouTube; otras fuentes muestran la foto.</p>
            </div>
          </div>

          {/* Fotos complementarias para el modo Demo de la tablet */}
          <div className="mt-4">
            <label className="block text-sm text-zinc-400 mb-1">Fotos complementarias (Demo de la tablet)</label>
            <p className="text-xs text-zinc-500 mb-2">Hasta 2 fotos extra con etiqueta corta. Ej. proyector: "A oscuras" y "Con luz".</p>
            <div className="space-y-2">
              {(formData.media.gallery ?? []).map((g: { url: string; label: string }, i: number) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="url"
                    value={g.url}
                    onChange={(e) => handleGalleryChange(i, 'url', e.target.value)}
                    placeholder={`https://... (foto ${i + 2})`}
                    className="md:col-span-2 w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none"
                  />
                  <input
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
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 font-medium"
          >
            Cancelar / Limpiar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-2.5 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${
              isEditing ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-cyan-600 hover:bg-cyan-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
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
    </div>
  );
}
