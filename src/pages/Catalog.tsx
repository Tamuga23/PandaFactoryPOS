import React, { useState } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import ProductCatalog, { CatalogProduct } from '../components/ProductCatalog';
import { fileToBase64, compressImage } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { DownloadCloud, Loader2 } from 'lucide-react';

const PRESET_DATA = [
  { sku: '1004', name: 'Amazon Fire TV HD', category: 'SmartTV Device', price: 50.02 },
  { sku: '1014', name: 'Amazon Fire TV Stick 4K', category: 'SmartTV Device', price: 55.02 },
  { sku: '1062', name: 'MagCubic Proyector Portatil', category: 'Projector', price: 110.01 },
  { sku: '1097', name: '70mai Dash Cam M310 1296P', category: 'Security Cam', price: 65.00 },
  { sku: '1110', name: 'Amazon Echo Show 5', category: 'SmartHome', price: 85.00 },
  { sku: '1112', name: 'MagCubic Proyector Portatil L018 650 ANSI', category: 'Projector', price: 125.05 },
  { sku: '1132', name: 'Redmi Watch 5', category: 'SmartWatch', price: 115.00 },
  { sku: '1138', name: 'Xiaomi Mi TV Box S, 3a Generación', category: 'SmartHome', price: 85.00 },
  { sku: '1139', name: 'TP-Link - Cámara de seguridad inalámbrica para exteriores, 1080P', category: 'Security Cam', price: 65.00 },
  { sku: '1142', name: 'MagCubic Proyector Portatil HY450 900 ANSI', category: 'Projector', price: 175.00 },
  { sku: '1145', name: 'Amazfit Bip 6', category: 'SmartWatch', price: 102.94 },
  { sku: '1153', name: 'Amazfit Active 2 Premium Version', category: 'SmartWatch', price: 143.89 },
  { sku: '1154', name: 'Amazfit Active 2', category: 'SmartWatch', price: 122.05 },
  { sku: '1164', name: 'MagCubic Proyector Portatil HY310 330 ANSI', category: 'Projector', price: 92.02 },
  { sku: '1169', name: 'Xiaomi Mi Band 10', category: 'SmartWatch', price: 64.71 },
  { sku: '1174', name: 'MagCubic Proyector Portatil HY350MAX 900 ANSI', category: 'Projector', price: 141.16 },
  { sku: '1179', name: 'Amazfit Active 2 Premium Square Version', category: 'SmartWatch', price: 171.20 },
  { sku: '1185', name: '70mai Dash Cam A800S 4K', category: 'Security Cam', price: 113.86 },
  { sku: '1187', name: 'XGODY N6 Pro 4K Projector Netflix Officially 700 ANSI', category: 'Projector', price: 146.62 },
  { sku: '1188', name: 'MagCubic Proyector Portatil X7 1000 ANSI', category: 'Projector', price: 190.31 },
  { sku: '1198', name: 'MagCubic Proyector Portatil HY450MAX 1100 ANSI', category: 'Projector', price: 198.50 },
  { sku: '1199', name: 'MagCubic Proyector Portatil HY310X 420 ANSI', category: 'Projector', price: 94.75 },
  { sku: '1203', name: 'MagCubic Proyector Portatil HY300 Pro + 260 ANSI', category: 'Projector', price: 53.79 },
  { sku: '1204', name: 'MagCubic Proyector Portatil HY300 Max 400 ANSI', category: 'Projector', price: 78.36 }
];

export default function Catalog() {
  const { products, addProduct, updateProduct, loading, companyInfo } = useStoreData();
  const [isImporting, setIsImporting] = useState(false);

  if (loading) {
    return <div className="text-zinc-500">Cargando catálogo...</div>;
  }

  // Preparamos los datos para que el componente ProductCatalog los entienda
  const catalogForComponent: CatalogProduct[] = products.map((p) => ({
    id: p.id,
    description: p.name, // Usamos el nombre del producto como descripcion principal
    priceUSD: p.price,
    category: p.category,
    status: p.stock >= 0 ? 'Activo' : 'Inactivo', // Mapeo temporal
    imageUrl: p.imageBase64,
  }));

  const handleAddProduct = async (productData: any) => {
    let imageBase64 = '';
    if (productData.imageFile) {
       const rawBase64 = await fileToBase64(productData.imageFile);
       imageBase64 = await compressImage(rawBase64);
    }
    
    // Convertir de formato ProductCatalog a Formato Product BD
    const newProduct = {
      id: productData.id || uuidv4(),
      sku: productData.id || uuidv4(), // Usamos el ID como SKU también
      name: productData.description,
      description: productData.description,
      price: Number(productData.priceUSD), // We store USD as base now
      cost: 0, // Costo base (lo manejaría compras)
      stock: 0, // Stock inicia en 0 (lo manejaría compras)
      minStockAlert: 5,
      category: productData.category,
      imageBase64: imageBase64,
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
      name: productData.description,
      description: productData.description,
      price: Number(productData.priceUSD), // We store USD as base now
      category: productData.category,
      imageBase64: imageBase64,
      updatedAt: Date.now(),
    };

    await updateProduct(updatedProduct);
  };

  const importPresets = async () => {
    setIsImporting(true);
    let imported = 0;
    
    try {
      for (const preset of PRESET_DATA) {
        if (products.some(p => p.sku === preset.sku || p.name === preset.name)) {
          continue;
        }
        
        const newProduct = {
          id: uuidv4(),
          sku: preset.sku,
          name: preset.name,
          description: preset.name,
          price: preset.price, // Store as USD directly
          cost: preset.price * 0.6, // placeholder cost in USD
          stock: 0,
          minStockAlert: 5,
          category: preset.category,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        await addProduct(newProduct);
        imported++;
      }
      
      console.log(`Importación completada. Se importaron ${imported} productos nuevos.`);
    } catch (e: any) {
      console.error("Error importando:", e);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Gestor de Catálogo</h1>
        <button 
          onClick={importPresets}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition-colors border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
          Importar Preset (Masivo)
        </button>
      </div>
      
      <ProductCatalog 
        catalog={catalogForComponent}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
        onSuccess={() => {
           console.log("Catálogo actualizado");
        }}
      />
    </div>
  );
}
