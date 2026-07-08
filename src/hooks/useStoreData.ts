import { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError } from '../lib/db';
import { collection, onSnapshot, query, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, where, limit, orderBy, increment, deleteField, getDocs, startAfter } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Product, Sale, Purchase, CompanyInfo, DashboardStats, Customer, Supplier, UniversalObjection, CategoryObjection, Movimiento } from '../types';
import { UniversalObjectionSchema, CategoryObjectionSchema, SaleSchema, ProductSchema, PurchaseSchema, CustomerSchema, SupplierSchema } from '../lib/validations';

// Campos de catálogo/tablet que NO deben viajar en los renglones de venta:
// isValidSaleItem (firestore.rules) no los permite y rechazaría la venta.
const TABLET_ONLY_SALE_ITEM_FIELDS = [
  'categorySlug', 'publicar', 'precioPromo', 'descEfectivoPct', 'campania',
  'beneficio', 'bullets', 'specsProyector', 'objecionesOverride', 'media', 'activo',
  'efectivoApplied', // P2.5: flag de UI del carrito, no viaja a Firestore
];

// P2.7: arma el doc de un movimiento de kardex (sin claves undefined).
const buildMovimiento = (m: Omit<Movimiento, 'ownerId' | 'id'>) => {
  const data: any = { ...m, ownerId: 'shared_store' };
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
  return data;
};

// Devuelve una copia del ítem sin los campos de tablet ni claves `undefined`.
const sanitizeSaleItem = (item: any) => {
  const clean: { [key: string]: any } = { ...item };
  TABLET_ONLY_SALE_ITEM_FIELDS.forEach((k) => delete clean[k]);
  Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);
  return clean;
};

// P1.7: mensaje humano a partir de un safeParse fallido de Zod.
// (acepta el resultado sin discriminar: en éxito `error` viene undefined)
const zodErrorMsg = (result: { error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  result.error
    ? result.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ')
    : 'error de validación';

const SALES_PAGE_SIZE = 100;

export function useStoreData() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [universalObjections, setUniversalObjections] = useState<UniversalObjection[]>([]);
  const [categoryObjections, setCategoryObjections] = useState<CategoryObjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  // P1.4: páginas adicionales del historial (más allá de las 100 en vivo).
  const [olderSales, setOlderSales] = useState<Sale[]>([]);
  const [hasMoreOlderSales, setHasMoreOlderSales] = useState(true);
  const [loadingOlderSales, setLoadingOlderSales] = useState(false);

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
        setUniversalObjections([]);
        setCategoryObjections([]);
        setOlderSales([]);
        setHasMoreOlderSales(true);
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

    const qUniversalObjections = query(
      collection(db, 'objeciones_universales'),
      orderBy('order', 'asc'),
    );
    const unsubUniversalObjections = onSnapshot(qUniversalObjections, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UniversalObjection));
      setUniversalObjections(data);
    }, (error) => handleFirestoreError(error, 'list', 'objeciones_universales'));

    const qCategoryObjections = query(
      collection(db, 'objeciones_categoria'),
      orderBy('categorySlug', 'asc'),
    );
    const unsubCategoryObjections = onSnapshot(qCategoryObjections, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CategoryObjection));
      setCategoryObjections(data);
    }, (error) => handleFirestoreError(error, 'list', 'objeciones_categoria'));

    return () => {
      unsubProducts();
      unsubSales();
      unsubPurchases();
      unsubCustomers();
      unsubSuppliers();
      unsubCompany();
      unsubUniversalObjections();
      unsubCategoryObjections();
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
      // P3.5: SKU único (case-insensitive) — antes se podían crear duplicados en silencio.
      const skuNorm = String(fullProduct.sku || '').trim().toLowerCase();
      if (skuNorm && products.some(p => (p.sku || '').trim().toLowerCase() === skuNorm)) {
        throw new Error(`Ya existe un producto con el SKU "${fullProduct.sku}". Usá otro SKU.`);
      }
      // P1.7: validar ANTES de escribir (evita permission-denied crípticos de las reglas).
      const parsed = ProductSchema.safeParse(fullProduct);
      if (!parsed.success) throw new Error(`Producto inválido — ${zodErrorMsg(parsed)}`);
      await setDoc(doc(db, 'products', product.id), fullProduct);
    } catch (e) {
      handleFirestoreError(e, 'create', `products/${product.id}`);
    }
  };

  const updateProduct = async (product: Product) => {
    if (!user) return;
    try {
      // P3.5: SKU único también al editar.
      const skuNorm = String(product.sku || '').trim().toLowerCase();
      if (skuNorm && products.some(p => p.id !== product.id && (p.sku || '').trim().toLowerCase() === skuNorm)) {
        throw new Error(`Ya existe otro producto con el SKU "${product.sku}".`);
      }
      const pData: any = { ...product, updatedAt: Date.now() };
      // Campos opcionales que el usuario puede borrar explícitamente:
      // si son undefined usamos deleteField() para que Firestore los elimine.
      const CLEARABLE = ['precioPromo', 'descEfectivoPct', 'campania'];
      const writeData: any = {};
      for (const [key, val] of Object.entries(pData)) {
        if (val === undefined) {
          if (CLEARABLE.includes(key)) writeData[key] = deleteField();
          // otros undefined se omiten (no tocar el campo)
        } else {
          writeData[key] = val;
        }
      }
      await updateDoc(doc(db, 'products', product.id), writeData);
    } catch (e) {
      handleFirestoreError(e, 'update', `products/${product.id}`);
    }
  };

  const bulkUpdateProducts = async (ids: string[], updates: Partial<Product>, motivo?: string) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      
      const safeUpdates: any = { ...updates, updatedAt: Date.now() };
      Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

      ids.forEach((id) => {
        batch.update(doc(db, 'products', id), safeUpdates);
        // P2.7: si el bulk cambia stock, dejar rastro en el kardex.
        if (typeof updates.stock === 'number') {
          const p = products.find(pr => pr.id === id);
          batch.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: id, productName: p?.name, sku: p?.sku,
            tipo: 'ajuste', delta: updates.stock - (p?.stock || 0),
            stockDespues: updates.stock, fecha: Date.now(),
            motivo: motivo || 'Ajuste masivo',
          }));
        }
      });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, 'update', `products/bulk`);
    }
  };

  /**
   * P2.7: ajuste manual de stock CON motivo y rastro en el kardex.
   * `extraFields` permite actualizar en el mismo write otros campos del
   * producto (p.ej. minStockAlert desde el modal de stock).
   */
  const adjustStock = async (
    product: Product,
    newStock: number,
    motivo: string,
    extraFields: Partial<Product> = {},
  ) => {
    if (!user) return;
    const productRef = doc(db, 'products', product.id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(productRef);
        if (!snap.exists()) throw new Error('El producto ya no existe.');
        const server = snap.data() as Product;
        const delta = newStock - (server.stock || 0);

        const upd: any = { ...extraFields, stock: newStock, updatedAt: Date.now() };
        Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]);
        transaction.update(productRef, upd);

        if (delta !== 0) {
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: product.id, productName: server.name, sku: server.sku,
            tipo: 'ajuste', delta, stockDespues: newStock,
            fecha: Date.now(), motivo: motivo || 'Ajuste manual',
          }));
        }
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `products/${product.id}`);
    }
  };

  /** P2.7: kardex de un producto (equality query, sin índice compuesto; orden en cliente). */
  const fetchMovimientos = async (productId: string): Promise<Movimiento[]> => {
    if (!user) return [];
    try {
      const q = query(collection(db, 'movimientos'), where('productId', '==', productId));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Movimiento))
        .sort((a, b) => b.fecha - a.fecha);
    } catch (e) {
      handleFirestoreError(e, 'list', `movimientos(${productId})`);
      return [];
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
      const parsed = CustomerSchema.safeParse(fullCustomer);
      if (!parsed.success) throw new Error(`Cliente inválido — ${zodErrorMsg(parsed)}`);
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
      const parsed = SupplierSchema.safeParse(fullSupplier);
      if (!parsed.success) throw new Error(`Proveedor inválido — ${zodErrorMsg(parsed)}`);
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
      // Mantener sincronizadas las páginas viejas cargadas manualmente (P1.4).
      setOlderSales(prev => prev.map(s => (s.id === sale.id ? { ...s, ...fullSale } : s)));
    } catch (e) {
      handleFirestoreError(e, 'update', `sales/${sale.id}`);
    }
  };

  const deleteSale = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'sales', id));
      setOlderSales(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `sales/${id}`);
    }
  };

  /**
   * P1.2: cambia el estado de una venta con ajuste de stock TRANSACCIONAL.
   *  - completed → returned/cancelled: repone las unidades al inventario.
   *  - returned/cancelled → completed: vuelve a descontarlas (piso en 0).
   *  - returned ↔ cancelled: sin efecto en stock.
   * Las PROFORMAS nunca tocan stock. Productos borrados se saltan.
   */
  const changeSaleStatus = async (sale: Sale, newStatus: Sale['status']) => {
    if (!user) return;
    const saleRef = doc(db, 'sales', sale.id);
    try {
      await runTransaction(db, async (transaction) => {
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error('La venta ya no existe en la base de datos.');
        const serverSale = saleSnap.data() as Sale;
        const oldStatus = serverSale.status || 'completed';
        if (oldStatus === newStatus) return;

        const affectsStock = serverSale.documentType !== 'PROFORMA';
        const wasDeducted = oldStatus === 'completed';
        const willBeDeducted = newStatus === 'completed';
        // +1 repone stock, -1 lo vuelve a descontar, 0 sin cambio.
        let direction = 0;
        if (affectsStock && wasDeducted && !willBeDeducted) direction = 1;
        if (affectsStock && !wasDeducted && willBeDeducted) direction = -1;

        if (direction !== 0) {
          const items = serverSale.items || [];
          const productSnaps = await Promise.all(
            items.map(i => transaction.get(doc(db, 'products', i.id)))
          );
          productSnaps.forEach((snap, idx) => {
            if (!snap.exists()) return; // producto borrado: no se puede ajustar
            const pData = snap.data() as Product;
            const newStock = Math.max(0, (pData.stock || 0) + direction * items[idx].quantity);
            transaction.update(doc(db, 'products', items[idx].id), {
              stock: newStock,
              updatedAt: Date.now(),
            });
            // P2.7: kardex
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: items[idx].id, productName: items[idx].name, sku: items[idx].sku,
              tipo: direction > 0 ? 'devolucion' : 'venta',
              delta: direction * items[idx].quantity, stockDespues: newStock,
              refId: sale.id, fecha: Date.now(),
              motivo: direction > 0
                ? `Venta ${serverSale.invoiceNumber} → ${newStatus}`
                : `Venta ${serverSale.invoiceNumber} re-completada`,
            }));
          });
        }

        transaction.update(saleRef, { status: newStatus });
      });
      setOlderSales(prev => prev.map(s => (s.id === sale.id ? { ...s, status: newStatus } : s)));
    } catch (e) {
      handleFirestoreError(e, 'update', `sales/${sale.id}`);
    }
  };

  /**
   * P1.4: carga la siguiente página del historial (ventas más viejas que las
   * 100 en vivo). Devuelve cuántas trajo; setea hasMoreOlderSales.
   */
  const loadMoreSales = async () => {
    if (!user || loadingOlderSales) return;
    const all = [...sales, ...olderSales];
    if (all.length === 0) return;
    const oldestLoaded = Math.min(...all.map(s => s.date));
    setLoadingOlderSales(true);
    try {
      const q = query(
        collection(db, 'sales'),
        orderBy('date', 'desc'),
        startAfter(oldestLoaded),
        limit(SALES_PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const older = snap.docs.map(d => ({ ...d.data(), id: d.id } as Sale));
      setOlderSales(prev => {
        const seen = new Set([...sales, ...prev].map(s => s.id));
        return [...prev, ...older.filter(s => !seen.has(s.id))];
      });
      if (snap.docs.length < SALES_PAGE_SIZE) setHasMoreOlderSales(false);
    } catch (e) {
      handleFirestoreError(e, 'list', 'sales(older)');
    } finally {
      setLoadingOlderSales(false);
    }
  };

  /**
   * P1.4: ventas de un período SIN el límite de 100 (para Reports).
   * Query por rango sobre `date` (no requiere índice compuesto).
   */
  const fetchSalesInRange = async (startMs: number, endMs: number): Promise<Sale[]> => {
    if (!user) return [];
    try {
      const q = query(
        collection(db, 'sales'),
        where('date', '>=', startMs),
        where('date', '<=', endMs),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ ...d.data(), id: d.id } as Sale));
    } catch (e) {
      handleFirestoreError(e, 'list', 'sales(range)');
      return [];
    }
  };

  /** P2.6: compras de un cliente (equality query, sin índice compuesto; orden en cliente). */
  const fetchSalesByCustomer = async (customerId: string): Promise<Sale[]> => {
    if (!user) return [];
    try {
      const q = query(collection(db, 'sales'), where('customerId', '==', customerId));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Sale))
        .sort((a, b) => b.date - a.date);
    } catch (e) {
      handleFirestoreError(e, 'list', `sales(customer ${customerId})`);
      return [];
    }
  };

  /**
   * Registra la venta en una transacción atómica y le asigna el número de
   * documento CORRELATIVO (P1.1) desde counters/invoices (A-000001) o
   * counters/proformas (P-000001). Devuelve el número asignado.
   */
  const recordSale = async (sale: Omit<Sale, 'ownerId'>): Promise<string> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const fullSale: any = { ...sale, ownerId: 'shared_store', status: sale.status || 'completed' };
    Object.keys(fullSale).forEach(key => fullSale[key] === undefined && delete fullSale[key]);
    if (fullSale.items) {
      fullSale.items = fullSale.items.map(sanitizeSaleItem);
    }

    // P1.7: validar ANTES de escribir (el invoiceNumber definitivo se asigna adentro).
    const parsedSale = SaleSchema.safeParse(fullSale);
    if (!parsedSale.success) {
      const err = new Error(`Venta inválida — ${zodErrorMsg(parsedSale)}`);
      console.error('Zod validation failed:', err.message);
      throw err;
    }

    const isProforma = fullSale.documentType === 'PROFORMA';
    const counterRef = doc(db, 'counters', isProforma ? 'proformas' : 'invoices');
    const prefix = isProforma ? 'P' : 'A';
    const saleRef = doc(db, 'sales', sale.id);
    let assignedNumber = fullSale.invoiceNumber as string;

    try {
      // Pilar 3: Transacción atómica (stock + contador + venta).
      await runTransaction(db, async (transaction) => {
        // 1. LECTURAS (Firestore exige hacerlas todas antes de escribir)
        const counterSnap = await transaction.get(counterRef);
        const nextValue = ((counterSnap.exists() ? counterSnap.data().value : 0) || 0) + 1;
        assignedNumber = `${prefix}-${String(nextValue).padStart(6, '0')}`;

        const productRefs = sale.items.map(item => ({
          ref: doc(db, 'products', item.id),
          item
        }));
        const productDocs = await Promise.all(productRefs.map(pr => transaction.get(pr.ref)));

        // 2. Validaciones (las proformas no verifican ni tocan stock)
        productDocs.forEach((pDoc, index) => {
          if (!pDoc.exists()) {
            throw new Error(`El producto ${productRefs[index].item.name} ya no existe en la base de datos.`);
          }
          const productData = pDoc.data() as Product;
          if (sale.documentType !== 'PROFORMA' && productData.stock < productRefs[index].item.quantity) {
             throw new Error(`Stock insuficiente de ${productData.name}. Pedido: ${productRefs[index].item.quantity}, Disponible: ${productData.stock}`);
          }
        });

        // 3. Escrituras
        productDocs.forEach((pDoc, index) => {
          if (sale.documentType !== 'PROFORMA') {
            const productData = pDoc.data() as Product;
            const item = productRefs[index].item;
            const newStock = productData.stock - item.quantity;
            transaction.update(productRefs[index].ref, {
               stock: newStock,
               updatedAt: Date.now()
            });
            // P2.7: kardex
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: item.id, productName: item.name, sku: item.sku,
              tipo: 'venta', delta: -item.quantity, stockDespues: newStock,
              refId: sale.id, fecha: Date.now(),
            }));
          }
        });

        transaction.set(counterRef, { value: nextValue, updatedAt: Date.now() });
        transaction.set(saleRef, { ...fullSale, invoiceNumber: assignedNumber });
      });

      return assignedNumber;
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

      // P1.7: validar ANTES de escribir.
      const parsed = PurchaseSchema.safeParse(fullPurchase);
      if (!parsed.success) throw new Error(`Compra inválida — ${zodErrorMsg(parsed)}`);

      await setDoc(doc(db, 'purchases', purchase.id), fullPurchase);
    } catch (e) {
      handleFirestoreError(e, 'create', `purchases/${purchase.id}`);
    }
  };

  const updatePurchase = async (purchase: Purchase) => {
    if (!user) return;
    try {
      // Copia profunda de lo que vamos a mutar (items/trackings) para no tocar el estado de React.
      const updatedPurchase: Purchase = {
        ...purchase,
        items: (purchase.items || []).map(i => ({ ...i })),
        trackings: (purchase.trackings || []).map(t => ({
          ...t,
          itemsInBox: (t.itemsInBox || []).map(b => ({ ...b })),
        })),
      };

      // Strip all undefined fields to avoid Firestore errors
      Object.keys(updatedPurchase).forEach(key => {
        if ((updatedPurchase as any)[key] === undefined) {
          delete (updatedPurchase as any)[key];
        }
      });
      updatedPurchase.items.forEach(item => {
        Object.keys(item).forEach(key => {
          if ((item as any)[key] === undefined) delete (item as any)[key];
        });
      });
      updatedPurchase.trackings.forEach((tracking: any) => {
        Object.keys(tracking).forEach(key => tracking[key] === undefined && delete tracking[key]);
        if (tracking.itemsInBox) {
          tracking.itemsInBox.forEach((iib: any) => {
            Object.keys(iib).forEach(key => iib[key] === undefined && delete iib[key]);
          });
        }
      });

      const purchaseRef = doc(db, 'purchases', purchase.id);

      // Transacción: stock y costo promedio (WAC) se calculan con datos del
      // SERVIDOR, no del estado local del cliente. Si dos dispositivos reciben
      // mercadería a la vez, Firestore reintenta y nadie doble-cuenta stock.
      await runTransaction(db, async (transaction) => {
        // --- 1. LECTURAS (Firestore exige hacerlas todas antes de escribir) ---
        const serverSnap = await transaction.get(purchaseRef);
        if (!serverSnap.exists()) {
          throw new Error(`Purchase ${purchase.id} does not exist in DB.`);
        }
        const serverPurchase = serverSnap.data() as Purchase;

        // Estado real de cada tracking según el servidor (guard contra doble proceso).
        const serverTrackingReceived = new Map<string, boolean>();
        (serverPurchase.trackings || []).forEach(t => serverTrackingReceived.set(t.id, !!t.isReceived));

        // Trackings a procesar: tienen receptionDate y NADIE los sincronizó aún.
        const toProcess = updatedPurchase.trackings.filter(t =>
          t.receptionDate && !t.isReceived && serverTrackingReceived.get(t.id) !== true
        );

        const productIds = Array.from(new Set(
          toProcess.flatMap(t => (t.itemsInBox || []).map(b => b.itemId))
        ));
        const productSnaps = await Promise.all(
          productIds.map(pid => transaction.get(doc(db, 'products', pid)))
        );
        const serverProducts = new Map<string, Product>();
        productSnaps.forEach((snap, i) => {
          if (snap.exists()) serverProducts.set(productIds[i], { ...(snap.data() as Product), id: productIds[i] });
        });

        // --- 2. CÁLCULOS ---
        {
        // Tarifa de flete: la guardada en la orden, o el default por modalidad.
        const ratePerLb = updatedPurchase.shippingRatePerLb || (updatedPurchase.shippingModality === 'Air Cargo' ? 6.5 : (updatedPurchase.shippingModality === 'Sea Cargo' ? 2.5 : 0));
        const totalBaseCost = updatedPurchase.items.reduce((acc, item) => acc + (item.cost * item.quantity), 0);
        const totalExpenses = updatedPurchase.freightCost || 0; // Flete global (fallback cuando no hay peso por ítem)
        // P1.5: aduana + seguro SIEMPRE se prorratean al costo real (landed cost).
        const extraExpenses = (updatedPurchase.customsTaxes || 0) + (updatedPurchase.insuranceCost || 0);

        // receivedQuantity parte del estado del SERVIDOR para no pisar recepciones concurrentes.
        const serverReceived = new Map<string, number>();
        (serverPurchase.items || []).forEach(i => serverReceived.set(i.id, i.receivedQuantity || 0));
        updatedPurchase.items.forEach(i => {
          i.receivedQuantity = serverReceived.get(i.id) ?? (i.receivedQuantity || 0);
        });

        // Acumulador por producto: un solo write aunque el producto venga en varias cajas.
        const productChanges = new Map<string, { addStock: number; newCost: number }>();

        toProcess.forEach(tracking => {
          {
            tracking.isReceived = true; // Mark tracking as synced
            
            (tracking.itemsInBox || []).forEach(boxItem => {
              // 1. Stock y costo (WAC) con datos del SERVIDOR leídos en la transacción
              const serverProduct = serverProducts.get(boxItem.itemId);
              if (serverProduct) {
                const prev = productChanges.get(boxItem.itemId);
                const baseStock = serverProduct.stock + (prev?.addStock || 0);
                const baseCost = prev?.newCost ?? serverProduct.cost;
                // Find item in purchase to get its cost
                const pItem = updatedPurchase.items.find(i => i.id === boxItem.itemId);
                let newCost = baseCost;
                
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
                  
                  // P1.5: prorratear aduana+seguro por participación en el valor
                  // de la orden (fallback: por cantidad si los costos base son 0).
                  let itemExtraExpense = 0;
                  if (extraExpenses > 0) {
                    if (totalBaseCost > 0) {
                      itemExtraExpense = extraExpenses * ((pItem.cost * boxItem.quantity) / totalBaseCost);
                    } else {
                      const totalQtyAll = updatedPurchase.items.reduce((acc, i) => acc + i.quantity, 0);
                      if (totalQtyAll > 0) itemExtraExpense = extraExpenses * (boxItem.quantity / totalQtyAll);
                    }
                  }

                  const realUnitCost = pItem.cost + ((itemFreightExpense + itemExtraExpense) / boxItem.quantity);

                  // Weighted Average Cost Formula (sobre datos del servidor)
                  const currentTotalValue = baseStock * baseCost;
                  const newTotalValue = boxItem.quantity * realUnitCost;
                  const newStock = baseStock + boxItem.quantity;
                  
                  newCost = newStock > 0 ? (currentTotalValue + newTotalValue) / newStock : realUnitCost;
                }

                productChanges.set(boxItem.itemId, {
                  addStock: (prev?.addStock || 0) + boxItem.quantity,
                  newCost,
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

        // Si el servidor ya procesó un tracking que el cliente traía como pendiente,
        // respetamos el estado del servidor (evita re-proceso en el próximo save).
        updatedPurchase.trackings.forEach(t => {
          if (serverTrackingReceived.get(t.id) === true) t.isReceived = true;
        });

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
        // P2.8: una orden CANCELADA no se "des-cancela" por recomputación.
        if (serverPurchase.status === 'CANCELLED') {
          updatedPurchase.status = 'CANCELLED';
        }

        // --- 3. ESCRITURAS ---
        productChanges.forEach((change, pid) => {
          transaction.update(doc(db, 'products', pid), {
            stock: increment(change.addStock),
            cost: change.newCost,
            updatedAt: Date.now(),
          });
          // P2.7: kardex (stockDespues calculado sobre el stock del servidor)
          const sp = serverProducts.get(pid);
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: pid, productName: sp?.name, sku: sp?.sku,
            tipo: 'compra', delta: change.addStock,
            stockDespues: sp ? (sp.stock || 0) + change.addStock : undefined,
            refId: purchase.id, fecha: Date.now(),
          }));
        });
        transaction.update(purchaseRef, updatedPurchase as any);
        }
      });
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

  /**
   * P2.8: cancela una orden (solo si no tiene cajas recibidas; el caller lo
   * valida en UI, y updatePurchase preserva CANCELLED en recomputaciones).
   */
  const cancelPurchase = async (id: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'purchases', id), { status: 'CANCELLED' });
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${id}`);
    }
  };

  /**
   * P1.7: revierte una recepción marcada por error. Resta del inventario las
   * unidades de esa caja (piso en 0), descuenta receivedQuantity, reabre el
   * tracking (isReceived=false y BORRA receptionDate para que no se
   * re-procese solo) y recalcula el estado de la orden.
   * NOTA: el costo promedio (WAC) NO se recalcula hacia atrás.
   */
  const revertTrackingReception = async (purchaseId: string, trackingId: string) => {
    if (!user) return;
    const purchaseRef = doc(db, 'purchases', purchaseId);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. LECTURAS
        const snap = await transaction.get(purchaseRef);
        if (!snap.exists()) throw new Error('La compra ya no existe.');
        const serverPurchase = snap.data() as Purchase;
        const tracking = (serverPurchase.trackings || []).find(t => t.id === trackingId);
        if (!tracking || !tracking.isReceived) {
          throw new Error('Este tracking no está marcado como recibido.');
        }

        const boxItems = tracking.itemsInBox || [];
        const removeByProduct = new Map<string, number>();
        boxItems.forEach(b => removeByProduct.set(b.itemId, (removeByProduct.get(b.itemId) || 0) + b.quantity));

        const productIds = Array.from(removeByProduct.keys());
        const productSnaps = await Promise.all(
          productIds.map(pid => transaction.get(doc(db, 'products', pid)))
        );
        const serverProducts = new Map<string, Product>();
        productSnaps.forEach((s, i) => {
          if (s.exists()) serverProducts.set(productIds[i], s.data() as Product);
        });

        // 2. CÁLCULOS
        const items = (serverPurchase.items || []).map(i => ({
          ...i,
          receivedQuantity: Math.max(0, (i.receivedQuantity || 0) - (removeByProduct.get(i.id) || 0)),
        }));

        const trackings = (serverPurchase.trackings || []).map(t => {
          if (t.id !== trackingId) return t;
          const reopened: any = { ...t, isReceived: false };
          delete reopened.receptionDate;
          return reopened;
        });

        let allFullyReceived = items.length > 0;
        let anyReceived = false;
        items.forEach(item => {
          if ((item.receivedQuantity || 0) > 0) anyReceived = true;
          if ((item.receivedQuantity || 0) < item.quantity) allFullyReceived = false;
        });
        const status: Purchase['status'] =
          items.length === 0 ? 'OPEN' : allFullyReceived ? 'CLOSED' : anyReceived ? 'PARTIAL' : 'OPEN';

        // 3. ESCRITURAS
        removeByProduct.forEach((qty, pid) => {
          const p = serverProducts.get(pid);
          if (!p) return; // producto borrado: no hay stock que ajustar
          const newStock = Math.max(0, (p.stock || 0) - qty);
          transaction.update(doc(db, 'products', pid), {
            stock: newStock,
            updatedAt: Date.now(),
          });
          // P2.7: kardex
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: pid, productName: p.name, sku: p.sku,
            tipo: 'reversion', delta: -qty, stockDespues: newStock,
            refId: purchaseId, fecha: Date.now(),
            motivo: 'Recepción revertida',
          }));
        });
        transaction.update(purchaseRef, { items, trackings, status });
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchaseId}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Objeciones universales
  // ---------------------------------------------------------------------------

  const addUniversalObjection = async (objection: Omit<UniversalObjection, 'ownerId'>) => {
    if (!user) return;
    const payload = { ...objection, ownerId: 'shared_store' as const };
    const result = UniversalObjectionSchema.safeParse(payload);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      handleFirestoreError(new Error(msg), 'create', `objeciones_universales/${objection.id}`);
      throw new Error(msg);
    }
    try {
      const data: any = { ...result.data };
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
      await setDoc(doc(db, 'objeciones_universales', objection.id), data);
    } catch (e) {
      handleFirestoreError(e, 'create', `objeciones_universales/${objection.id}`);
      throw e;
    }
  };

  const updateUniversalObjection = async (objection: UniversalObjection) => {
    if (!user) return;
    const payload = { ...objection, ownerId: objection.ownerId || 'shared_store', updatedAt: Date.now() };
    const result = UniversalObjectionSchema.safeParse(payload);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      handleFirestoreError(new Error(msg), 'update', `objeciones_universales/${objection.id}`);
      throw new Error(msg);
    }
    try {
      const data: any = { ...result.data };
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
      await updateDoc(doc(db, 'objeciones_universales', objection.id), data);
    } catch (e) {
      handleFirestoreError(e, 'update', `objeciones_universales/${objection.id}`);
      throw e;
    }
  };

  const deleteUniversalObjection = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'objeciones_universales', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `objeciones_universales/${id}`);
      throw e;
    }
  };

  // ---------------------------------------------------------------------------
  // Objeciones por categoría
  // ---------------------------------------------------------------------------

  const addCategoryObjection = async (objection: CategoryObjection) => {
    if (!user) return;
    const result = CategoryObjectionSchema.safeParse(objection);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      handleFirestoreError(new Error(msg), 'create', `objeciones_categoria/${objection.id}`);
      throw new Error(msg);
    }
    try {
      const data: any = { ...result.data };
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
      await setDoc(doc(db, 'objeciones_categoria', objection.id), data);
    } catch (e) {
      handleFirestoreError(e, 'create', `objeciones_categoria/${objection.id}`);
      throw e;
    }
  };

  const updateCategoryObjection = async (objection: CategoryObjection) => {
    if (!user) return;
    const result = CategoryObjectionSchema.safeParse(objection);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      handleFirestoreError(new Error(msg), 'update', `objeciones_categoria/${objection.id}`);
      throw new Error(msg);
    }
    try {
      const data: any = { ...result.data };
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
      await updateDoc(doc(db, 'objeciones_categoria', objection.id), data);
    } catch (e) {
      handleFirestoreError(e, 'update', `objeciones_categoria/${objection.id}`);
      throw e;
    }
  };

  const deleteCategoryObjection = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'objeciones_categoria', id));
    } catch (e) {
      handleFirestoreError(e, 'delete', `objeciones_categoria/${id}`);
      throw e;
    }
  };

  const stats: DashboardStats = useMemo(() => {
    const realSales = sales.filter(s => s.documentType !== 'PROFORMA');
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return {
      totalProducts: products.length,
      // Valor de inventario A COSTO (no a precio de venta); guards contra docs viejos sin cost/stock.
      totalStockValue: products.reduce((acc, p) => acc + ((p.cost || 0) * (p.stock || 0)), 0),
      lowStockItems: products.filter(p => p.stock <= p.minStockAlert && !p.isReordering),
      recentSales: [...realSales].sort((a, b) => b.date - a.date).slice(0, 5),
      totalSalesValue: realSales.reduce((acc, s) => acc + ((s.status || 'completed') === 'completed' ? s.total : 0), 0),
      // P1.4: KPI honesto para el Dashboard (la ventana en vivo son 100 ventas;
      // las de HOY siempre caben ahí en una tienda pequeña).
      todaySalesValue: realSales.reduce(
        (acc, s) => acc + (((s.status || 'completed') === 'completed' && s.date >= todayStart) ? s.total : 0),
        0,
      ),
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
    universalObjections,
    categoryObjections,
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
    changeSaleStatus,
    olderSales,
    hasMoreOlderSales,
    loadingOlderSales,
    loadMoreSales,
    fetchSalesInRange,
    fetchSalesByCustomer,
    recordPurchase,
    updatePurchase,
    deletePurchase,
    cancelPurchase,
    revertTrackingReception,
    adjustStock,
    fetchMovimientos,
    updateCompanyInfo,
    addUniversalObjection,
    updateUniversalObjection,
    deleteUniversalObjection,
    addCategoryObjection,
    updateCategoryObjection,
    deleteCategoryObjection,
    refreshMetrics: () => {}
  };
}
