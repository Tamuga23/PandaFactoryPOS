import { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError } from '../lib/db';
import { collection, onSnapshot, query, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, where, limit, orderBy, increment } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Product, Sale, Purchase, CompanyInfo, DashboardStats, Customer, Supplier } from '../types';

// Campos de catálogo/tablet que NO deben viajar en los renglones de venta:
// isValidSaleItem (firestore.rules) no los permite y rechazaría la venta.
const TABLET_ONLY_SALE_ITEM_FIELDS = [
  'categorySlug', 'publicar', 'precioPromo', 'descEfectivoPct', 'campania',
  'beneficio', 'bullets', 'specsProyector', 'objecionesOverride', 'media', 'activo',
];

// Devuelve una copia del ítem sin los campos de tablet ni claves `undefined`.
const sanitizeSaleItem = (item: any) => {
  const clean: { [key: string]: any } = { ...item };
  TABLET_ONLY_SALE_ITEM_FIELDS.forEach((k) => delete clean[k]);
  Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);
  return clean;
};

export function useStoreData() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProducts([]);
        setSales([]);
        setPurchases([]);
        setCustomers([]);
        setSuppliers([]);
        setCompanyInfo(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const qProducts = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const prodData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product));
      setProducts(prodData);
      setLoading(false);
    }, (error) => handleFirestoreError(error, 'list', 'products'));

    const qSales = query(collection(db, 'sales'), orderBy('date', 'desc'), limit(100));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const saleData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Sale));
      setSales(saleData);
    }, (error) => handleFirestoreError(error, 'list', 'sales'));

    const qPurchases = query(collection(db, 'purchases'), orderBy('date', 'desc'), limit(100));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      const purchaseData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Purchase));
      setPurchases(purchaseData);
    }, (error) => handleFirestoreError(error, 'list', 'purchases'));

    const qCustomers = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customerData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Customer));
      setCustomers(customerData);
    }, (error) => handleFirestoreError(error, 'list', 'customers'));

    const qSuppliers = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
    const unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const supplierData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Supplier));
      setSuppliers(supplierData);
    }, (error) => handleFirestoreError(error, 'list', 'suppliers'));

    const qCompany = query(collection(db, 'company'));
    const unsubCompany = onSnapshot(qCompany, (snapshot) => {
      if (!snapshot.empty) {
        setCompanyInfo({ ...snapshot.docs[0].data() } as CompanyInfo);
      } else {
        setCompanyInfo(null);
      }
    }, (error) => handleFirestoreError(error, 'list', 'company'));

    return () => {
      unsubProducts();
      unsubSales();
      unsubPurchases();
      unsubCustomers();
      unsubSuppliers();
      unsubCompany();
    };
  }, [user]);

  const updateCompanyInfo = async (info: Omit<CompanyInfo, 'ownerId'>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'company', 'shared_store'), { ...info, ownerId: 'shared_store' });
    } catch (e) {
      handleFirestoreError(e, 'write', `company/shared_store`);
    }
  };

  const addProduct = async (product: Omit<Product, 'ownerId'>) => {
    if (!user) return;
    try {
      const fullProduct: any = { ...product, ownerId: 'shared_store' };
      Object.keys(fullProduct).forEach(key => fullProduct[key] === undefined && delete fullProduct[key]);
      await setDoc(doc(db, 'products', product.id), fullProduct);
    } catch (e) {
      handleFirestoreError(e, 'create', `products/${product.id}`);
    }
  };

  const updateProduct = async (product: Product) => {
    if (!user) return;
    try {
      const pData: any = { ...product, updatedAt: Date.now() };
      Object.keys(pData).forEach(key => pData[key] === undefined && delete pData[key]);
      await updateDoc(doc(db, 'products', product.id), pData);
    } catch (e) {
      handleFirestoreError(e, 'update', `products/${product.id}`);
    }
  };

  const bulkUpdateProducts = async (ids: string[], updates: Partial<Product>) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      
      const safeUpdates: any = { ...updates, updatedAt: Date.now() };
      Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

      ids.forEach((id) => {
        batch.update(doc(db, 'products', id), safeUpdates);
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, 'update', `products/bulk`);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `products/${id}`);
    }
  };

  const addCustomer = async (customer: Omit<Customer, 'ownerId'>) => {
    if (!user) return;
    try {
      const fullCustomer: any = { ...customer, ownerId: 'shared_store' };
      Object.keys(fullCustomer).forEach(key => fullCustomer[key] === undefined && delete fullCustomer[key]);
      await setDoc(doc(db, 'customers', customer.id), fullCustomer);
    } catch (e) {
      handleFirestoreError(e, 'create', `customers/${customer.id}`);
    }
  };

  const updateCustomer = async (customer: Customer) => {
    if (!user) return;
    try {
      const fullCustomer: any = { ...customer };
      Object.keys(fullCustomer).forEach(key => fullCustomer[key] === undefined && delete fullCustomer[key]);
      await updateDoc(doc(db, 'customers', customer.id), fullCustomer);
    } catch (e) {
      handleFirestoreError(e, 'update', `customers/${customer.id}`);
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `customers/${id}`);
    }
  };
  
  const addSupplier = async (supplier: Omit<Supplier, 'ownerId'>) => {
    if (!user) return;
    try {
      const fullSupplier: any = { ...supplier, ownerId: 'shared_store' };
      Object.keys(fullSupplier).forEach(key => fullSupplier[key] === undefined && delete fullSupplier[key]);
      await setDoc(doc(db, 'suppliers', supplier.id), fullSupplier);
    } catch (e) {
      handleFirestoreError(e, 'create', `suppliers/${supplier.id}`);
    }
  };

  const updateSupplier = async (supplier: Supplier) => {
    if (!user) return;
    try {
      const fullSupplier: any = { ...supplier };
      Object.keys(fullSupplier).forEach(key => fullSupplier[key] === undefined && delete fullSupplier[key]);
      await updateDoc(doc(db, 'suppliers', supplier.id), fullSupplier);
    } catch (e) {
      handleFirestoreError(e, 'update', `suppliers/${supplier.id}`);
    }
  };

  const deleteSupplier = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'suppliers', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `suppliers/${id}`);
    }
  };

  const updateSale = async (sale: Sale) => {
    if (!user) return;
    try {
      const fullSale: any = { ...sale };
      Object.keys(fullSale).forEach(key => fullSale[key] === undefined && delete fullSale[key]);
      if (fullSale.items) {
        fullSale.items = fullSale.items.map(sanitizeSaleItem);
      }
      await updateDoc(doc(db, 'sales', sale.id), fullSale);
    } catch (e) {
      handleFirestoreError(e, 'update', `sales/${sale.id}`);
    }
  };

  const deleteSale = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'sales', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `sales/${id}`);
    }
  };

  const recordSale = async (sale: Omit<Sale, 'ownerId'>) => {
    if (!user) return;
    try {
      const fullSale: any = { ...sale, ownerId: 'shared_store', status: sale.status || 'completed' };
      Object.keys(fullSale).forEach(key => fullSale[key] === undefined && delete fullSale[key]);
      if (fullSale.items) {
        fullSale.items = fullSale.items.map(sanitizeSaleItem);
      }
      
      const saleRef = doc(db, 'sales', sale.id);

      // Pilar 3: Transacción atómica
      await runTransaction(db, async (transaction) => {
        const productRefs = sale.items.map(item => ({
          ref: doc(db, 'products', item.id),
          item
        }));

        // 1. Read all required documents first (Requirement of Firestore transactions)
        const productDocs = await Promise.all(productRefs.map(pr => transaction.get(pr.ref)));

        // 2. Perform validations (skip stock check for PROFORMA)
        productDocs.forEach((pDoc, index) => {
          if (!pDoc.exists()) {
            throw new Error(`Product ${productRefs[index].item.name} does not exist in DB.`);
          }
          const productData = pDoc.data() as Product;
          if (sale.documentType !== 'PROFORMA' && productData.stock < productRefs[index].item.quantity) {
             throw new Error(`Insufficient stock for ${productData.name}. Requested: ${productRefs[index].item.quantity}, Available: ${productData.stock}`);
          }
        });

        // 3. Perform all writes
        productDocs.forEach((pDoc, index) => {
          if (sale.documentType !== 'PROFORMA') {
            const productData = pDoc.data() as Product;
            const newStock = productData.stock - productRefs[index].item.quantity;
            transaction.update(productRefs[index].ref, {
               stock: newStock,
               updatedAt: Date.now()
            });
          }
        });

        transaction.set(saleRef, fullSale);
      });

    } catch (e) {
      console.error("Transaction failed: ", e);
      handleFirestoreError(e, 'create', `sales/${sale.id}`);
      throw e; // Rethrow allowing the UI to handle it if needed
    }
  };

  const recordPurchase = async (purchase: Omit<Purchase, 'ownerId'>) => {
    if (!user) return;
    try {
      const fullPurchase: any = { 
        ...purchase, 
        ownerId: 'shared_store',
        status: purchase.status || 'OPEN',
        stockAdded: purchase.stockAdded || false
      };
      
      // Strip all undefined fields
      Object.keys(fullPurchase).forEach(key => fullPurchase[key] === undefined && delete fullPurchase[key]);
      if (fullPurchase.items) {
        fullPurchase.items.forEach((item: any) => {
          Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);
        });
      }

      await setDoc(doc(db, 'purchases', purchase.id), fullPurchase);
    } catch (e) {
      handleFirestoreError(e, 'create', `purchases/${purchase.id}`);
    }
  };

  const updatePurchase = async (purchase: Purchase) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      let updatedPurchase = { ...purchase };

      // Strip all undefined fields to avoid Firestore errors
      Object.keys(updatedPurchase).forEach(key => {
        if ((updatedPurchase as any)[key] === undefined) {
          delete (updatedPurchase as any)[key];
        }
      });
      if (updatedPurchase.items) {
        updatedPurchase.items.forEach(item => {
          Object.keys(item).forEach(key => {
            if ((item as any)[key] === undefined) delete (item as any)[key];
          });
        });
      }

      if (updatedPurchase.trackings) {
        updatedPurchase.trackings.forEach((tracking: any) => {
          Object.keys(tracking).forEach(key => tracking[key] === undefined && delete tracking[key]);
          if (tracking.itemsInBox) {
            tracking.itemsInBox.forEach((iib: any) => {
              Object.keys(iib).forEach(key => iib[key] === undefined && delete iib[key]);
            });
          }
        });
      }

      // Check for newly received trackings
      const oldPurchase = purchases.find(p => p.id === purchase.id);
      
      if (updatedPurchase.trackings && oldPurchase) {
        // Obtenemos la tarifa por defect basada en modalidad o una almacenada (si existiera en el futuro)
        const ratePerLb = updatedPurchase.shippingRatePerLb || (updatedPurchase.shippingModality === 'Air Cargo' ? 6.5 : (updatedPurchase.shippingModality === 'Sea Cargo' ? 2.5 : 0));
        const totalBaseCost = updatedPurchase.items.reduce((acc, item) => acc + (item.cost * item.quantity), 0);
        const totalExpenses = updatedPurchase.freightCost || 0; // Legacy global freight cost fallback

        updatedPurchase.trackings.forEach(tracking => {
          // If tracking was marked with receptionDate, but hasn't updated inventory yet
          if (tracking.receptionDate && !tracking.isReceived) {
            tracking.isReceived = true; // Mark tracking as synced
            
            tracking.itemsInBox.forEach(boxItem => {
              // 1. Update general stock and cost (WAC) of product
              const productRef = doc(db, 'products', boxItem.itemId);
              const p = products.find(prod => prod.id === boxItem.itemId);
              if (p) {
                // Find item in purchase to get its cost
                const pItem = updatedPurchase.items.find(i => i.id === boxItem.itemId);
                let newCost = p.cost;
                
                if (pItem) {
                  // Calculate freight cost for exactly these items in the box based on weight
                  let itemFreightExpense = 0;
                  if (ratePerLb > 0 && pItem.estimatedWeight) {
                    // Si tenemos peso estimado y tarifa, el costo de envío es directo por item
                    const itemWeightPerUnit = pItem.estimatedWeight / pItem.quantity;
                    itemFreightExpense = (itemWeightPerUnit * boxItem.quantity) * ratePerLb;
                  } else {
                    // Prorrateo tradicional si no hay peso a nivel de item (fallback)
                    if (totalBaseCost > 0) {
                       itemFreightExpense = totalExpenses * ((pItem.cost * boxItem.quantity) / totalBaseCost);
                    } else {
                       const totalQty = updatedPurchase.items.reduce((acc, i) => acc + i.quantity, 0);
                       if (totalQty > 0) itemFreightExpense = totalExpenses * (boxItem.quantity / totalQty);
                    }
                  }
                  
                  const realUnitCost = pItem.cost + (itemFreightExpense / boxItem.quantity);
                  
                  // Weighted Average Cost Formula
                  const currentTotalValue = p.stock * p.cost;
                  const newTotalValue = boxItem.quantity * realUnitCost;
                  const newStock = p.stock + boxItem.quantity;
                  
                  newCost = newStock > 0 ? (currentTotalValue + newTotalValue) / newStock : realUnitCost;
                }

                batch.update(productRef, {
                  stock: increment(boxItem.quantity),
                  cost: newCost,
                  updatedAt: Date.now()
                });
              }

              // 2. Accumulate received qty in the purchase item
              const pItem2 = updatedPurchase.items.find(i => i.id === boxItem.itemId);
              if (pItem2) {
                pItem2.receivedQuantity = (pItem2.receivedQuantity || 0) + boxItem.quantity;
              }
            });
          }
        });
      }

      // Re-evaluate Purchase Status based on received vs total quantities
      let allFullyReceived = true;
      let anyReceived = false;
      updatedPurchase.items.forEach(item => {
        if (item.receivedQuantity > 0) anyReceived = true;
        if ((item.receivedQuantity || 0) < item.quantity) allFullyReceived = false;
      });

      if (updatedPurchase.items.length === 0) {
        updatedPurchase.status = 'OPEN';
      } else if (allFullyReceived) {
        updatedPurchase.status = 'CLOSED';
      } else if (anyReceived) {
        updatedPurchase.status = 'PARTIAL';
      } else {
        updatedPurchase.status = 'OPEN';
      }

      batch.update(doc(db, 'purchases', purchase.id), updatedPurchase as any);
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchase.id}`);
    }
  };

  const deletePurchase = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'purchases', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `purchases/${id}`);
    }
  };

  const stats: DashboardStats = useMemo(() => {
    const realSales = sales.filter(s => s.documentType !== 'PROFORMA');
    return {
      totalProducts: products.length,
      totalStockValue: products.reduce((acc, p) => acc + (p.price * p.stock), 0),
      lowStockItems: products.filter(p => p.stock <= p.minStockAlert && !p.isReordering),
      recentSales: [...realSales].sort((a, b) => b.date - a.date).slice(0, 5),
      totalSalesValue: realSales.reduce((acc, s) => acc + (s.status === 'completed' ? s.total : 0), 0),
    };
  }, [products, sales]);

  return {
    user,
    products,
    sales,
    purchases,
    customers,
    suppliers,
    companyInfo,
    loading,
    stats,
    addProduct,
    updateProduct,
    bulkUpdateProducts,
    deleteProduct,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    recordSale,
    updateSale,
    deleteSale,
    recordPurchase,
    updatePurchase,
    deletePurchase,
    updateCompanyInfo,
    refreshMetrics: () => {}
  };
}
