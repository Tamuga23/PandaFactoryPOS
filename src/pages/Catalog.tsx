import React from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCatalog, { CatalogProduct } from '../components/ProductCatalog';
import { fileToBase64, compressImage } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';


export default function Catalog() {
  const { products, addProduct, updateProduct, loading, companyInfo, universalObjections } = useStore();
  /*
    Entrada directa desde Inventario. El Catálogo es donde vive la ficha
    completa, pero el Inventario es donde se BUSCA: tiene buscador, filtro por
    categoría y orden por columna. Antes había que encontrar el producto acá,
    de memoria y en una lista.
  */
  const { state } = useLocation();
  const editarId = (state as { editarId?: string } | null)?.editarId ?? null;

  if (loading) {
    return <div className="text-zinc-500">Cargando catálogo...</div>;
  }

  // Preparamos los datos para que el componente ProductCatalog los entienda
  const catalogForComponent: CatalogProduct[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    cost: p.cost,
    stock: p.stock,
    minStockAlert: p.minStockAlert,
    description: p.name, // Usamos el nombre del producto como descripcion principal
    priceUSD: p.price,
    category: p.category,
    status: p.activo === false ? 'Inactivo' : 'Activo',
    imageUrl: p.imageBase64,
    publicar: p.publicar,
    precioPromo: p.precioPromo,
    descEfectivoPct: p.descEfectivoPct,
    campania: p.campania,
    beneficio: p.beneficio,
    // Cargar también los campos complejos para que se vean al editar
    bullets: p.bullets,
    objecionesOverride: p.objecionesOverride,
    specsProyector: p.specsProyector,
    media: p.media,
    financiamientoOverride: p.financiamientoOverride,
  }));

  const handleAddProduct = async (productData: any) => {
    let imageBase64 = '';
    if (productData.imageFile) {
       const rawBase64 = await fileToBase64(productData.imageFile);
       imageBase64 = await compressImage(rawBase64);
    }
    
    // Convertir de formato ProductCatalog a Formato Product BD
    // P3.5: id SIEMPRE uuid (adiós al riesgo de charset del SKU tipeado, A4);
    // el SKU es un campo con check de unicidad en el hook.
    const newProduct = {
      id: uuidv4(),
      sku: (productData.sku || '').trim(),
      name: productData.description,
      description: productData.description,
      price: Number(productData.priceUSD), // We store USD as base now
      cost: productData.cost !== undefined ? Number(productData.cost) : 0,
      stock: productData.stock !== undefined ? Number(productData.stock) : 0,
      minStockAlert: productData.minStockAlert !== undefined ? Number(productData.minStockAlert) : 5,
      category: productData.category,
      imageBase64: imageBase64,
      publicar: productData.publicar !== false,
      activo: productData.status !== 'Inactivo',
      precioPromo: productData.precioPromo,
      descEfectivoPct: productData.descEfectivoPct,
      campania: productData.campania,
      beneficio: productData.beneficio,
      bullets: productData.bullets,
      objecionesOverride: productData.objecionesOverride,
      specsProyector: productData.specsProyector,
      media: productData.media,
      financiamientoOverride: productData.financiamientoOverride,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await addProduct(newProduct);
  };

  const handleUpdateProduct = async (id: string, productData: any) => {
    // Buscar el producto original para no perder datos como stock, etc.
    const originalProduct = products.find(p => p.id === id);
    if (!originalProduct) throw new Error('Producto no encontrado');

    let imageBase64 = originalProduct.imageBase64;
    // Si subió un archivo nuevo, reemplazar imagen
    if (productData.imageFile) {
       const rawBase64 = await fileToBase64(productData.imageFile);
       imageBase64 = await compressImage(rawBase64);
    }

    const updatedProduct = {
      ...originalProduct,
      // P3.5: SKU editable (unicidad verificada en el hook); stock NO se toca
      // desde este form (los ajustes van por Inventario → kardex).
      sku: (productData.sku || '').trim() || originalProduct.sku,
      cost: productData.cost !== undefined ? Number(productData.cost) : originalProduct.cost,
      minStockAlert: productData.minStockAlert !== undefined ? Number(productData.minStockAlert) : originalProduct.minStockAlert,
      name: productData.description,
      // A3: no pisar `description` con el nombre al editar; se preserva la original.
      price: Number(productData.priceUSD), // We store USD as base now
      category: productData.category,
      imageBase64: imageBase64,
      publicar: productData.publicar !== false,
      activo: productData.status !== 'Inactivo',
      precioPromo: productData.precioPromo,
      descEfectivoPct: productData.descEfectivoPct,
      campania: productData.campania,
      beneficio: productData.beneficio,
      bullets: productData.bullets,
      objecionesOverride: productData.objecionesOverride,
      specsProyector: productData.specsProyector,
      media: productData.media,
      financiamientoOverride: productData.financiamientoOverride,
      updatedAt: Date.now(),
    };

    await updateProduct(updatedProduct);
  };



  /*
    Acá había dos cosas que se fueron:

    1. Un <h1> que decía "Gestor de Catálogo" mientras el menú y el encabezado
       decían "Catálogo Maestro" — dos nombres para la misma pantalla. Y estaba
       escrito `text-gray-900 dark:text-zinc-100`: en Tailwind v4 `dark:`
       compila como `prefers-color-scheme`, así que con el Windows del operador
       en modo CLARO el título caía a gris casi negro sobre el fondo casi negro
       de la app — 1.12:1, invisible. El nombre de la pantalla ya lo pone el
       encabezado del Layout, en un solo lugar y para las once pantallas.

    2. "Importar Preset (Masivo)": 24 productos con SKU, nombre, categoría y
       precio escritos a mano en el código fuente, de la siembra inicial. Ya no
       se usa —el catálogo real tiene sus productos cargados— y traía dos
       problemas: escribía en la base sin decir NADA (éxito y error iban los dos
       a la consola, que nadie mira), y fabricaba el costo como el 60% del
       precio. Ese costo inventado alimenta el WAC y el margen de Reportes.
       Decisión del usuario el 2026-09-21: quitarlo.
  */
  return (
    <div className="space-y-6">
      <ProductCatalog
        productoInicialId={editarId}
        objecionesDisponibles={universalObjections.map((o) => ({ id: o.id, titulo: o.titulo }))}
        catalog={catalogForComponent}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
      />
    </div>
  );
}
