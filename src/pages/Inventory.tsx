import React, { useState, useRef } from 'react';
import { useStoreData } from '../hooks/useStoreData';
import { Product } from '../types';
import { formatCurrency, fileToBase64, compressImage } from '../lib/utils';
import { Plus, Edit2, Trash2, Image as ImageIcon, Search, PackagePlus, AlertTriangle, ShoppingCart, Check, Layers } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function Inventory() {
  const { products, loading, addProduct, updateProduct, deleteProduct, bulkUpdateProducts } = useStoreData();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    if (confirmingDelete === id) {
      deleteProduct(id);
      setConfirmingDelete(null);
    } else {
      setConfirmingDelete(id);
      setTimeout(() => setConfirmingDelete(null), 3000); // Reset after 3 seconds
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredProducts = React.useMemo(() => {
    let sortableProducts = [...products];
    if (sortConfig !== null) {
      sortableProducts.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return sortableProducts.filter(p => {
      const searchLower = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(searchLower) || 
        p.sku.toLowerCase().includes(searchLower) ||
        (p.category && p.category.toLowerCase().includes(searchLower)) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    });
  }, [products, searchTerm, sortConfig]);

  if (loading) return <div className="text-zinc-500">Loading inventory...</div>;

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
    } else {
      setEditingProduct(null);
    }
    setIsModalOpen(true);
  };

  const openStockModal = (product: Product) => {
    setEditingProduct(product);
    setIsStockModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setIsStockModalOpen(false);
    setIsBulkEditModalOpen(false);
    setEditingProduct(null);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProducts(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleBulkEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const category = formData.get('category') as string;
    const priceStr = formData.get('price') as string;
    const minAlertStr = formData.get('minStockAlert') as string;
    const stockStr = formData.get('stock') as string;

    const updates: Partial<Product> = {};
    if (category) updates.category = category;
    if (priceStr) updates.price = Number(priceStr);
    if (minAlertStr) updates.minStockAlert = Number(minAlertStr);
    if (stockStr) updates.stock = Number(stockStr);

    if (Object.keys(updates).length > 0) {
      await bulkUpdateProducts(selectedProducts, updates);
    }
    setSelectedProducts([]);
    closeModal();
    setIsSaving(false);
  };

  const handleToggleReorder = async (product: Product) => {
    try {
      await updateProduct({
        ...product,
        isReordering: !product.isReordering,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Error toggling reorder status:', error);
      alert('Error updating reorder status.');
    }
  };

  const handleStockSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const newStock = Number(formData.get('stock'));
    const newMinAlert = Number(formData.get('minStockAlert'));

    // Automatically remove the reordering flag if stock goes above the min alert
    const isNowLowStock = newStock <= newMinAlert;
    const updatedIsReordering = isNowLowStock ? editingProduct.isReordering : false;

    try {
      await updateProduct({
        ...editingProduct,
        stock: newStock,
        minStockAlert: newMinAlert,
        isReordering: updatedIsReordering,
        updatedAt: Date.now()
      });
      closeModal();
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Error updating stock. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      // Handle image separately if uploaded
      const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
      let imageBase64 = editingProduct?.imageBase64 || '';
      if (fileInput.files && fileInput.files[0]) {
        const rawBase64 = await fileToBase64(fileInput.files[0]);
        imageBase64 = await compressImage(rawBase64);
      }

      const productData: Product = {
        id: editingProduct?.id || uuidv4(),
        sku: formData.get('sku') as string,
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        price: Number(formData.get('price')),
        cost: Number(formData.get('cost')),
        stock: Number(formData.get('stock')),
        minStockAlert: Number(formData.get('minStockAlert')),
        category: formData.get('category') as string,
        imageBase64,
        createdAt: editingProduct?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      if (editingProduct) {
        await updateProduct(productData);
      } else {
        await addProduct(productData);
      }
      closeModal();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Error saving product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1> */}
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-zinc-700 bg-zinc-800 rounded-lg leading-5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
            placeholder="Search products by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-lg shadow-cyan-900/20 text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </button>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="font-semibold text-zinc-200">Current Inventory Status</h3>
          {selectedProducts.length > 0 && (
            <button
              onClick={() => setIsBulkEditModalOpen(true)}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
            >
              <Layers className="h-4 w-4 mr-2" />
              Bulk Edit ({selectedProducts.length})
            </button>
          )}
        </div>

        <div className="overflow-x-auto p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase">
              <tr className="border-b border-zinc-800">
                <th scope="col" className="px-4 py-3">
                  <input 
                    type="checkbox" 
                    className="rounded bg-zinc-800 border-zinc-700 text-cyan-600 focus:ring-cyan-500/20"
                    checked={filteredProducts.length > 0 && selectedProducts.length === filteredProducts.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-4 py-3">Image</th>
                <th scope="col" className="px-4 py-3">Product Name</th>
                <th scope="col" className="px-4 py-3">SKU</th>
                <th scope="col" className="px-4 py-3 text-right">Price</th>
                <th scope="col" className="px-4 py-3 text-right cursor-pointer hover:text-zinc-200 transition-colors group" onClick={() => handleSort('stock')}>
                  <div className="flex items-center justify-end gap-1">
                    Stock
                    <span className={`text-zinc-600 group-hover:text-zinc-400 ${sortConfig?.key === 'stock' ? 'text-cyan-500' : ''}`}>
                      {sortConfig?.key === 'stock' && sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-center">Status</th>
                <th scope="col" className="px-4 py-3 relative"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredProducts.map((product) => {
                const isLowStock = product.stock <= product.minStockAlert;
                const isSelected = selectedProducts.includes(product.id);
                return (
                <tr key={product.id} className={`hover:bg-zinc-800/30 ${isLowStock ? 'bg-rose-500/5' : ''} ${isSelected ? 'bg-indigo-500/10' : ''}`}>
                  <td className="px-4 py-2">
                    <input 
                      type="checkbox" 
                      className="rounded bg-zinc-800 border-zinc-700 text-cyan-600 focus:ring-cyan-500/20"
                      checked={isSelected}
                      onChange={() => handleSelectProduct(product.id)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-500 overflow-hidden">
                      {product.imageBase64 ? (
                        <img className="h-10 w-10 object-cover" src={product.imageBase64} alt="" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-zinc-600" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-medium text-zinc-200">
                    <div>{product.name}</div>
                    <div className="text-xs text-zinc-500 font-normal">{product.category}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-500">{product.sku}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(product.price)}</td>
                  <td className={`px-4 py-2 text-right ${isLowStock ? 'text-rose-400 font-medium' : 'text-zinc-300'}`}>
                    {product.stock}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        isLowStock ? 'bg-rose-500/10 text-rose-500 font-medium border border-rose-500/20' : 'bg-cyan-500/10 text-cyan-500 font-medium'
                      }`}>
                        {isLowStock ? 'Low Stock' : 'Active'}
                      </span>
                      {isLowStock && (
                        <button 
                          onClick={() => handleToggleReorder(product)}
                          className={`text-[9px] px-2 py-0.5 rounded flex items-center justify-center gap-1 transition-colors w-full ${
                            product.isReordering 
                              ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 font-bold border border-amber-500/30' 
                              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border border-zinc-700'
                          }`}
                          title={product.isReordering ? "Mark as not requested" : "Mark for reorder"}
                        >
                          {product.isReordering ? <Check className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                          {product.isReordering ? 'Reordered' : 'Reorder'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-medium">
                    <button 
                      onClick={() => openStockModal(product)} 
                      className="text-cyan-600 hover:text-cyan-400 mr-4 transition-colors p-1.5 bg-cyan-500/10 rounded"
                      title="Adjust Stock"
                    >
                      <PackagePlus className="h-4 w-4 inline" />
                    </button>
                    <button onClick={() => openModal(product)} className="text-zinc-400 hover:text-cyan-400 mr-4 transition-colors" title="Edit Product">
                      <Edit2 className="h-4 w-4 inline" />
                    </button>
                    <button 
                      onClick={() => handleDeleteClick(product.id)} 
                      className={`transition-colors ${confirmingDelete === product.id ? 'text-rose-500 font-bold' : 'text-zinc-400 hover:text-rose-400'}`}
                      title="Delete Product"
                    >
                      {confirmingDelete === product.id ? 'Delete?' : <Trash2 className="h-4 w-4 inline" />}
                    </button>
                  </td>
                </tr>
              )})}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-zinc-500">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stock Modal */}
      {isStockModalOpen && (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-zinc-950/75 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={closeModal}></div>
            <div className="relative inline-block align-bottom bg-zinc-900 border border-zinc-700 rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm w-full">
              <form onSubmit={handleStockSave}>
                <div className="bg-zinc-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-cyan-500/10 rounded-lg shrink-0">
                      <PackagePlus className="h-6 w-6 text-cyan-500" />
                    </div>
                    <div>
                      <h3 className="text-lg leading-6 font-medium text-zinc-100" id="modal-title">
                        Manage Stock
                      </h3>
                      <p className="text-xs text-zinc-400 truncate">{editingProduct?.name}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Current Stock Level</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => {
                          const input = document.getElementById('quick-stock-input') as HTMLInputElement;
                          if(input) input.value = String(Math.max(0, Number(input.value) - 1));
                        }} className="p-2 bg-zinc-800 rounded text-zinc-400 hover:text-white">-</button>
                        <input id="quick-stock-input" required type="number" name="stock" defaultValue={editingProduct?.stock} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-center text-lg font-bold text-cyan-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                        <button type="button" onClick={() => {
                          const input = document.getElementById('quick-stock-input') as HTMLInputElement;
                          if(input) input.value = String(Number(input.value) + 1);
                        }} className="p-2 bg-zinc-800 rounded text-zinc-400 hover:text-white">+</button>
                      </div>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                      <label className="flex items-center gap-2 text-xs uppercase text-zinc-500 font-bold mb-2">
                         <AlertTriangle className="w-3 h-3 text-amber-500" /> Low Stock Alert Threshold
                      </label>
                      <input required type="number" name="minStockAlert" defaultValue={editingProduct?.minStockAlert} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 sm:px-6 flex gap-3 justify-end">
                  <button 
                    type="button" 
                    onClick={closeModal} 
                    disabled={isSaving}
                    className="w-full sm:w-auto inline-flex justify-center rounded-lg border border-zinc-700 px-4 py-2 bg-zinc-800 text-sm font-medium text-zinc-300 hover:bg-zinc-700 focus:outline-none transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="w-full sm:w-auto inline-flex justify-center rounded-lg border border-transparent px-4 py-2 bg-cyan-600 text-sm font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Update Stock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Overlay & Content */}
      {isModalOpen && (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-zinc-950/75 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={closeModal}></div>
            <div className="relative inline-block align-bottom bg-zinc-900 border border-zinc-700 rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
              <form onSubmit={handleSave}>
                <div className="bg-zinc-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-zinc-100 mb-4" id="modal-title">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">SKU</label>
                        <input required type="text" name="sku" defaultValue={editingProduct?.sku} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Category</label>
                        <input required type="text" name="category" defaultValue={editingProduct?.category} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Name</label>
                      <input required type="text" name="name" defaultValue={editingProduct?.name} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Description</label>
                      <textarea name="description" rows={2} defaultValue={editingProduct?.description} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Price (Sell)</label>
                        <input required type="number" step="any" name="price" defaultValue={editingProduct?.price} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Cost (Buy)</label>
                        <input required type="number" step="any" name="cost" defaultValue={editingProduct?.cost} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Current Stock</label>
                        <input required type="number" name="stock" defaultValue={editingProduct?.stock} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Min Stock Alert</label>
                        <input required type="number" name="minStockAlert" defaultValue={editingProduct?.minStockAlert} className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Product Image</label>
                      <input type="file" accept="image/*" className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-cyan-400 hover:file:bg-zinc-700" />
                      {editingProduct?.imageBase64 && (
                        <div className="mt-3">
                          <img src={editingProduct.imageBase64} alt="Preview" className="h-20 w-20 object-cover rounded-md border border-zinc-700" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-cyan-600 text-base font-medium text-white hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Processing...' : 'Save Changes'}
                  </button>
                  <button 
                    type="button" 
                    onClick={closeModal} 
                    disabled={isSaving}
                    className="mt-3 w-full inline-flex justify-center rounded-lg border border-zinc-700 shadow-sm px-4 py-2 bg-zinc-800 text-base font-medium text-zinc-300 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isBulkEditModalOpen && (
        <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-zinc-950/75 transition-opacity backdrop-blur-sm" aria-hidden="true" onClick={closeModal}></div>
            <div className="relative inline-block align-bottom bg-zinc-900 border border-zinc-700 rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md w-full">
              <form onSubmit={handleBulkEditSubmit}>
                <div className="bg-zinc-900 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-zinc-100 mb-2" id="modal-title">
                    Bulk Edit ({selectedProducts.length} items)
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4">Leave fields blank to keep their current values.</p>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">New Category</label>
                      <input type="text" name="category" placeholder="Leave empty to keep current" className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                    </div>
                    <div>
                      <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">New Price</label>
                      <input type="number" step="any" name="price" placeholder="Leave empty to keep current" className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Stock Level</label>
                        <input type="number" name="stock" placeholder="Leave empty" className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Min Stock Alert</label>
                        <input type="number" name="minStockAlert" placeholder="Leave empty" className="block w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button 
                    type="submit" 
                    disabled={isSaving}
                    className="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Processing...' : 'Apply Changes'}
                  </button>
                  <button 
                    type="button" 
                    onClick={closeModal} 
                    disabled={isSaving}
                    className="mt-3 w-full inline-flex justify-center rounded-lg border border-zinc-700 shadow-sm px-4 py-2 bg-zinc-800 text-base font-medium text-zinc-300 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
