import React, { useState, useMemo, ChangeEvent, FormEvent } from 'react';
import { PackagePlus, Edit, Save, AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import type { SalesBullet, ObjectionOverride, ProjectorSpecs, TabletMedia } from '../types';

export interface CatalogProduct {
  id: string; // SKU o código
  description: string;
  priceUSD: number;
  category: string;
  status: 'Activo' | 'Inactivo' | string;
  imageUrl?: string;
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
  specsProyector: any;
  media: any;
}

const INITIAL_FORM_DATA: FormData = {
  id: '',
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
  specsProyector: { ansi: '', throwRatio: '', distMinEnfoque: '', resolucion: '', autofoco: false },
  media: { heroImage: '', videoUrl: '' },
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
        specsProyector: product.specsProyector || { ansi: '', throwRatio: '', distMinEnfoque: '', resolucion: '', autofoco: false },
        media: product.media || { heroImage: '', videoUrl: '' },
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
        description: formData.description,
        priceUSD: Number(formData.priceUSD),
        category: formData.category,
        status: formData.status,
        imageFile: formData.imageFile,
        publicar: formData.publicar,
        precioPromo: formData.precioPromo ? Number(formData.precioPromo) : undefined,
        descEfectivoPct: formData.descEfectivoPct ? Number(formData.descEfectivoPct) : undefined,
        campania: formData.campania || undefined,
        beneficio: formData.beneficio || undefined,
        bullets: formData.bullets.length > 0 ? formData.bullets : undefined,
        objecionesOverride: formData.objecionesOverride.length > 0 ? formData.objecionesOverride : undefined,
        specsProyector: formData.category === 'Projector' ? {
          ansi: Number(formData.specsProyector.ansi) || undefined,
          throwRatio: formData.specsProyector.throwRatio || undefined,
          distMinEnfoque: formData.specsProyector.distMinEnfoque || undefined,
          resolucion: formData.specsProyector.resolucion || undefined,
          autofoco: formData.specsProyector.autofoco || false
        } : undefined,
        media: (formData.media.heroImage || formData.media.videoUrl) ? {
          heroImage: formData.media.heroImage || undefined,
          videoUrl: formData.media.videoUrl || undefined
        } : undefined,
      };

      if (isEditing) {
        if (!formData.id) throw new Error('Debe seleccionar un producto para actualizar.');
        // Update product
        await onUpdateProduct(formData.id, productDataToSave);
        setFeedback({ message: 'Producto actualizado exitosamente.', type: 'success' });
      } else {
        if (!formData.id) throw new Error('El SKU/ID es obligatorio para nuevos productos.');
        // Create new product (include ID)
        await onAddProduct({ ...productDataToSave, id: formData.id });
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
  const handleBulletChange = (index: number, text: string) => {
    const newBullets = [...formData.bullets];
    newBullets[index].text = text;
    setFormData({ ...formData, bullets: newBullets });
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

  const handleSpecChange = (field: string, value: any) => {
    setFormData({ ...formData, specsProyector: { ...formData.specsProyector, [field]: value } });
  };
  
  const handleMediaChange = (field: string, value: string) => {
    setFormData({ ...formData, media: { ...formData.media, [field]: value } });
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
              isEditing ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-zinc-400 hover:text-white'
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
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">-- Seleccione un producto --</option>
              {catalog.map(product => (
                <option key={product.id} value={product.id}>
                  {product.description}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ID / SKU Field */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">SKU / ID del Producto</label>
            <input
              type="text"
              name="id"
              value={formData.id}
              onChange={handleInputChange}
              required
              disabled={isEditing}
              placeholder="Ej. PROY-001"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed uppercase"
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

        {/* --- Specs Proyector --- */}
        {formData.category === 'Projector' && (
          <div className="mt-6 border-t border-zinc-800/50 pt-6">
            <h4 className="text-md font-medium text-blue-400 mb-4">Especificaciones de Proyector</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Brillo (ANSI)</label>
                <input type="number" value={formData.specsProyector.ansi} onChange={(e) => handleSpecChange('ansi', e.target.value)} placeholder="Ej. 900" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Resolución Nativa</label>
                <input type="text" value={formData.specsProyector.resolucion} onChange={(e) => handleSpecChange('resolucion', e.target.value)} placeholder="Ej. 1080p, 4K" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Throw Ratio</label>
                <input type="text" value={formData.specsProyector.throwRatio} onChange={(e) => handleSpecChange('throwRatio', e.target.value)} placeholder="Ej. 1.2:1" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Distancia Mínima Enfoque</label>
                <input type="text" value={formData.specsProyector.distMinEnfoque} onChange={(e) => handleSpecChange('distMinEnfoque', e.target.value)} placeholder="Ej. 1.5m" className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm" />
              </div>
              <div className="flex items-center mt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.specsProyector.autofoco} onChange={(e) => handleSpecChange('autofoco', e.target.checked)} className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded text-blue-500 focus:ring-blue-500" />
                  <span className="text-sm text-zinc-300">Autofoco Automático</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* --- Bullets --- */}
        <div className="mt-6 border-t border-zinc-800/50 pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-medium text-cyan-400">Guiones de Venta (Bullets)</h4>
            <button type="button" onClick={handleBulletAdd} className="text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> Agregar Bullet
            </button>
          </div>
          {formData.bullets.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No hay bullets configurados.</p>
          ) : (
            <div className="space-y-3">
              {formData.bullets.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input type="text" value={b.text} onChange={(e) => handleBulletChange(idx, e.target.value)} placeholder="Ej. Imágenes ultra nítidas de día..." className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" required />
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
              <label className="block text-sm text-zinc-400 mb-1">Video Promocional (URL YouTube/Vimeo)</label>
              <input type="url" value={formData.media.videoUrl} onChange={(e) => handleMediaChange('videoUrl', e.target.value)} placeholder="https://youtube.com/..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none" />
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
              isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-cyan-600 hover:bg-cyan-700'
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
