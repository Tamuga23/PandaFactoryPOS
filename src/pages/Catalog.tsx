import React from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ProductCatalog, { CatalogProduct } from '../components/ProductCatalog';
import { fileToBase64, compressImage, MEDIDA_FOTO_TABLET } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';


/*
  Una sola foto para las tres superficies.

  Antes eran dos y había que mantenerlas a mano: la que se sube va a
  `imageBase64`, que leen el POS, el Inventario y la factura, y NO viaja al
  espejo `catalogo_publico` — ni `buildPublicCatalogDoc` ni el backfill la
  copian. Lo único que le llega a la tablet es `media.heroImage`, una URL que
  había que pegar quinientas líneas más abajo en el formulario, bajo un título
  que decía «(URLs)». El operador hacía lo obvio —subir la foto, verla en la
  vista previa— y el cliente parado en el mostrador veía un hueco.

  Es justo lo que el principio 2 de PRODUCT.md prohíbe: «cualquier feature que
  obligue a mantener el mismo dato en dos lados está mal planteada».

  Ahora `media.heroImage` significa una sola cosa: LA IMAGEN QUE VE EL CLIENTE.
  Si se pegó una URL de alta calidad, esa manda. Si no, se deriva de la foto
  subida, reducida a la medida de tablet. PandaLink no se entera: un data URI
  entra en un `<img src>` igual que una URL, y ni el schema (`heroImage` es
  `z.string()`) ni las reglas (`media is map`) piden que sea una URL.
*/
const fotoParaLaTablet = async (
  urlPegada: string | undefined,
  fotoDelProducto: string | undefined,
): Promise<string | undefined> => {
  const url = (urlPegada || '').trim();
  // Una URL pegada por el operador gana siempre: es la de alta calidad.
  if (url && !url.startsWith('data:')) return url;
  if (!fotoDelProducto) return undefined;
  const { ancho, alto, calidad } = MEDIDA_FOTO_TABLET;
  return compressImage(fotoDelProducto, ancho, alto, calidad);
};

/** `media` con su `heroImage` ya resuelto. Devuelve `undefined` si queda vacío. */
const conFotoDeTablet = async (media: any, fotoDelProducto?: string) => {
  const hero = await fotoParaLaTablet(media?.heroImage, fotoDelProducto);
  const resultado = { ...(media || {}) };
  if (hero) resultado.heroImage = hero;
  else delete resultado.heroImage;
  return Object.keys(resultado).length > 0 ? resultado : undefined;
};

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
    return <div className="text-zinc-400">Cargando catálogo...</div>;
  }

  // Preparamos los datos para que el componente ProductCatalog los entienda
  const catalogForComponent: CatalogProduct[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    cost: p.cost,
    stock: p.stock,
    minStockAlert: p.minStockAlert,
    nombre: p.name,
    descripcion: p.description || '',
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
      name: productData.nombre,
      description: productData.descripcion || undefined,
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
      media: await conFotoDeTablet(productData.media, imageBase64),
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
      name: productData.nombre,
      /*
        `description` ya es un campo propio y editable, no una copia del nombre.
        Antes se preservaba la original a proposito (A3) para no pisarla con el
        nombre — pero como al crear se grababa IGUAL al nombre y despues no se
        podia tocar, lo que se preservaba era el nombre viejo, y eso es lo que
        la tablet mostraba como descripcion.
      */
      description: productData.descripcion || undefined,
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
      // La foto de la tablet se rederiva en CADA guardado, no solo cuando se
      // sube una nueva: si el operador borra la URL de alta calidad, tiene que
      // volver a valer la foto del producto, y si cambia la foto, la de la
      // tablet tiene que cambiar con ella.
      media: await conFotoDeTablet(productData.media, imageBase64),
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
