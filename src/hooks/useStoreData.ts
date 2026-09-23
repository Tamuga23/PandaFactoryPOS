import { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError, mensajeFirestore, tieneClaimStaff } from '../lib/db';
import { toast } from '../components/Toast';
import { collection, onSnapshot, query, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, where, limit, orderBy, increment, deleteField, getDocs, getDoc, startAfter } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Product, Sale, Purchase, PurchaseItem, CompanyInfo, DashboardStats, Customer, Supplier, UniversalObjection, CategoryObjection, Movimiento } from '../types';
import { UniversalObjectionSchema, CategoryObjectionSchema, SaleSchema, ProductSchema, PurchaseSchema, CustomerSchema, SupplierSchema } from '../lib/validations';
import {
  CONFIG_FINANCIAMIENTO_DEFAULT,
  normalizarConfig,
  type ConfigFinanciamiento,
} from '../lib/financiamiento';
import { maximoFacturaEmitido } from '../lib/correlativos';
import { costoAlRecibir, costoAlRevertir } from '../lib/costoPromedio';

// Campos de catálogo/tablet que NO deben viajar en los renglones de venta:
// isValidSaleItem (firestore.rules) no los permite y rechazaría la venta.
const TABLET_ONLY_SALE_ITEM_FIELDS = [
  'categorySlug', 'publicar', 'precioPromo', 'descEfectivoPct', 'campania',
  'beneficio', 'bullets', 'specsProyector', 'objecionesOverride', 'media', 'activo',
  'efectivoApplied', // P2.5: flag de UI del carrito, no viaja a Firestore
  'precioAntesEfectivo', // idem: precio previo al descuento, para poder revertirlo
  // Excepción de financiamiento del producto: el CartItem la arrastra porque
  // extiende Product, pero isValidSaleItem no la permite y la venta entera
  // sería rechazada por las reglas. El plan cobrado va a nivel de VENTA, en
  // `Sale.financiamiento`, no en el renglón.
  'financiamientoOverride',
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
  /*
    Colecciones cuya suscripción en vivo se cayó.

    Los ocho `onSnapshot` pasaban su error a `handleFirestoreError`, que SIEMPRE
    LANZA — y lanzar adentro del callback de error de un listener no lo atrapa
    nadie: no hay `try`, no es un render de React, no es una promesa encadenada.
    Además `setLoading(false)` vivía sólo en el camino de éxito, así que si el
    PRIMER snapshot fallaba, `loading` no bajaba nunca y la aplicación entera se
    quedaba en "Cargando App…" sin un solo carácter de diagnóstico.

    Y el caso intermedio es peor que el total: cuando un listener muere a media
    mañana, Firestore lo termina y `products` deja de actualizarse EN SILENCIO —
    el POS sigue vendiendo contra un stock congelado. En un tablero de vuelo, el
    instrumento que se queda clavado es más peligroso que el que se apaga.
  */
  const [coleccionesCaidas, setColeccionesCaidas] = useState<string[]>([]);
  const [categoryObjections, setCategoryObjections] = useState<CategoryObjection[]>([]);
  // Reglas de financiamiento a plazos. Las edita Configuración y las consume el
  // checkout del POS para calcular la cuota que se le cobra al cliente.
  const [configFinanciamiento, setConfigFinanciamiento] = useState<ConfigFinanciamiento>(
    CONFIG_FINANCIAMIENTO_DEFAULT,
  );
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  // Sesión válida en Firebase pero SIN el claim `admin`: hay que decirlo con
  // todas las letras en la pantalla de login, no dejarlo en un permission-denied.
  const [authError, setAuthError] = useState<string | null>(null);

  // P1.4: páginas adicionales del historial (más allá de las 100 en vivo).
  const [olderSales, setOlderSales] = useState<Sale[]>([]);
  const [hasMoreOlderSales, setHasMoreOlderSales] = useState(true);
  const [loadingOlderSales, setLoadingOlderSales] = useState(false);

  useEffect(() => {
    // El chequeo del claim es asíncrono: si el componente se desmonta mientras
    // está en vuelo, no hay que tocar estado.
    let cancelado = false;

    const limpiar = () => {
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
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthError(null);
        limpiar();
        return;
      }

      // Antes de montar NADA: confirmar que esta sesión trae el claim `admin`.
      // Sin él, firestore.rules niega products/sales/purchases/customers/…, y
      // suscribirse igual solo produce una cascada de permission-denied que no
      // le dice al usuario cuál es el problema real.
      tieneClaimStaff(currentUser)
        .then((esStaff) => {
          if (cancelado) return;
          if (esStaff) {
            setAuthError(null);
            setUser(currentUser);
            return;
          }
          setAuthError(
            `La cuenta ${currentUser.email ?? ''} no tiene permisos de staff. ` +
            `Pedí que te habiliten con: node scripts/set_admin_claim.mjs ${currentUser.email ?? '<tu correo>'}`
          );
          setUser(null);
          limpiar();
          // Cerrar la sesión inútil deja la pantalla de login limpia para
          // reintentar con otra cuenta. Dispara onAuthStateChanged(null), que
          // entra por la rama de arriba y corta acá — no hay bucle.
          signOut(auth).catch(() => { /* la sesión igual quedó sin uso */ });
        })
        .catch((e) => {
          if (cancelado) return;
          console.error('[auth] no se pudo verificar el claim de staff', e);
          setAuthError('No se pudo verificar tu sesión. Revisá tu conexión e intentá de nuevo.');
          setUser(null);
          limpiar();
        });
    });
    return () => { cancelado = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    /*
      Un listener que se cae: se avisa, se deja de cargar, y queda anotado para
      que el shell muestre un cartel permanente. Lo que NO se hace es lanzar.
    */
    const fallaSuscripcion = (error: any, coleccion: string) => {
      setLoading(false);
      setColeccionesCaidas((prev) => (prev.includes(coleccion) ? prev : [...prev, coleccion]));
      toast.error(
        `Se perdió la conexión en vivo con «${coleccion}». ` +
        `${mensajeFirestore(error, 'list', coleccion)} ` +
        `Lo que ves puede estar desactualizado: recargá la página.`,
      );
    };

    const qProducts = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      const prodData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Product));
      setProducts(prodData);
      setLoading(false);
    }, (error) => fallaSuscripcion(error, 'products'));

    const qSales = query(collection(db, 'sales'), orderBy('date', 'desc'), limit(100));
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const saleData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Sale));
      setSales(saleData);
    }, (error) => fallaSuscripcion(error, 'sales'));

    const qPurchases = query(collection(db, 'purchases'), orderBy('date', 'desc'), limit(100));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      const purchaseData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Purchase));
      setPurchases(purchaseData);
    }, (error) => fallaSuscripcion(error, 'purchases'));

    const qCustomers = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const customerData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Customer));
      setCustomers(customerData);
    }, (error) => fallaSuscripcion(error, 'customers'));

    const qSuppliers = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
    const unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const supplierData = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Supplier));
      setSuppliers(supplierData);
    }, (error) => fallaSuscripcion(error, 'suppliers'));

    const qCompany = query(collection(db, 'company'));
    const unsubCompany = onSnapshot(qCompany, (snapshot) => {
      if (!snapshot.empty) {
        setCompanyInfo({ ...snapshot.docs[0].data() } as CompanyInfo);
      } else {
        setCompanyInfo(null);
      }
    }, (error) => fallaSuscripcion(error, 'company'));

    const qUniversalObjections = query(
      collection(db, 'objeciones_universales'),
      orderBy('order', 'asc'),
    );
    const unsubUniversalObjections = onSnapshot(qUniversalObjections, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UniversalObjection));
      setUniversalObjections(data);
    }, (error) => fallaSuscripcion(error, 'objeciones_universales'));

    const qCategoryObjections = query(
      collection(db, 'objeciones_categoria'),
      orderBy('categorySlug', 'asc'),
    );
    const unsubCategoryObjections = onSnapshot(qCategoryObjections, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CategoryObjection));
      setCategoryObjections(data);
    }, (error) => fallaSuscripcion(error, 'objeciones_categoria'));

    // Si el doc todavía no existe (reglas sin desplegar, o nunca se guardó),
    // queda el default del módulo compartido: proyectores 0%, resto con recargo.
    const unsubConfigFin = onSnapshot(doc(db, 'config', 'financiamiento'), (snapshot) => {
      if (snapshot.exists()) setConfigFinanciamiento(normalizarConfig(snapshot.data()));
    }, (error) => handleFirestoreError(error, 'get', 'config/financiamiento'));

    return () => {
      unsubProducts();
      unsubSales();
      unsubPurchases();
      unsubCustomers();
      unsubSuppliers();
      unsubCompany();
      unsubUniversalObjections();
      unsubCategoryObjections();
      unsubConfigFin();
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
      /*
        Campos opcionales que el usuario puede BORRAR desde la ficha: si llegan
        `undefined` se escriben con `deleteField()` para que Firestore los
        elimine de verdad.

        La lista tenía sólo tres y le faltaban seis, así que en esos seis
        "vaciar el campo" no vaciaba nada: el `undefined` se omitía, Firestore
        conservaba el valor viejo, el aviso decía "actualizado" y al recargar la
        ficha el dato seguía ahí. Un guardado que informa éxito y no aplica el
        cambio es peor que uno que falla.

        El más caro de los seis era `financiamientoOverride`: un producto puesto
        en "sin cuotas" o en "0% de interés" no se podía devolver a la regla de
        su categoría desde la interfaz. Eso mueve plata — decide si la venta
        califica para cuotas y con qué recargo.

        Los otros cinco son el contenido que alimenta la tablet y la web:
        borrar todos los bullets, todas las objeciones, toda la ficha técnica o
        el gancho de venta no los borraba.

        Ojo al agregar acá: sólo van campos DECLARADOS OPCIONALES en
        `firestore.rules` (los seis lo están, con `!('X' in data) || ...`), y
        sólo si quien llama distingue "vaciar" de "no tocar". `Inventory` pasa
        objetos donde estas claves están AUSENTES, no en `undefined`, así que
        no las toca.
      */
      /*
        `stock` NO se escribe por acá, NUNCA.

        Los tres que llaman a esta función arman el objeto con `...product`
        partiendo del array `products` de React — o sea, de la CACHÉ del
        cliente — y `stock` nunca es `undefined`, así que viajaba en cada
        guardado. El comentario de `Catalog.tsx` incluso afirma que "stock NO se
        toca desde este form": la intención estaba, el `...originalProduct` se
        la llevaba puesta.

        Mientras la suscripción está viva casi siempre coincide y no se nota.
        Cuando NO coincide es cuando duele: el listener de `products` se cae a
        media mañana —caso que esta misma aplicación contempla, ver
        `coleccionesCaidas`—, el POS sigue vendiendo (las ventas son
        transaccionales, el servidor sí descuenta), y el primer guardado de un
        precio desde el Catálogo devuelve el stock al valor congelado y borra
        las ventas de la mañana del inventario. Sin transacción y sin un
        movimiento de kardex que lo registre: la única forma de mover stock en
        todo el sistema que el kardex no puede reconciliar.

        El stock tiene dueños y todos leen del servidor y dejan rastro:
        `recordSale`, `adjustStock`, `updatePurchase`, `revertTrackingReception`.
        El formulario de Inventario ya enruta los cambios de stock por
        `adjustStock`; acá se cierra la puerta de atrás.
      */
      delete pData.stock;

      const CLEARABLE = [
        'precioPromo', 'descEfectivoPct', 'campania',
        'beneficio', 'bullets', 'objecionesOverride',
        'specsProyector', 'media', 'financiamientoOverride',
        // La foto no se podía QUITAR, sólo reemplazar: si subías la equivocada,
        // quedaba. Es opcional en `firestore.rules`, así que `deleteField()`
        // pasa sin tocar nada más.
        'imageBase64',
      ];
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
      const safeUpdates: any = { ...updates, updatedAt: Date.now() };
      Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

      /*
        Cuando el lote TOCA STOCK va por transacción, no por batch.

        El delta del kardex se calculaba contra `products`, que es el estado de
        React: la caché del cliente. Si alguno de los N productos se vendió en
        los segundos anteriores, el delta registrado no era el cambio que
        ocurrió, y el write pisaba la venta. `adjustStock` —el camino de a uno—
        sí es transaccional y lee del servidor; el de a veinte no lo era, que es
        la asimetría del lado peor: el que multiplica el daño por N.

        Y si el producto no estaba en la caché, el delta salía igual a
        `updates.stock`, como si hubiera partido de cero.

        Firestore permite 500 escrituras por transacción y acá van 2 por
        producto, así que se corta en 200 por vuelta. Sin ese corte, a partir de
        250 seleccionados el lote entero fallaba.
      */
      if (typeof updates.stock === 'number') {
        const LOTE = 200;
        for (let i = 0; i < ids.length; i += LOTE) {
          const tanda = ids.slice(i, i + LOTE);
          await runTransaction(db, async (transaction) => {
            const snaps = await Promise.all(
              tanda.map(id => transaction.get(doc(db, 'products', id))),
            );
            snaps.forEach((snap, idx) => {
              if (!snap.exists()) return; // borrado en el medio: se saltea
              const server = snap.data() as Product;
              const id = tanda[idx];
              transaction.update(doc(db, 'products', id), safeUpdates);
              const delta = (updates.stock as number) - (server.stock || 0);
              if (delta !== 0) {
                transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
                  productId: id, productName: server.name, sku: server.sku,
                  tipo: 'ajuste', delta, stockDespues: updates.stock as number,
                  fecha: Date.now(), motivo: motivo || 'Ajuste masivo',
                }));
              }
            });
          });
        }
        return;
      }

      // Sin stock de por medio no hay invariante que proteger: el batch alcanza.
      const batch = writeBatch(db);
      ids.forEach((id) => batch.update(doc(db, 'products', id), safeUpdates));
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
   *
   * Esas dos últimas reglas —el piso en 0 y saltar los productos borrados— son
   * DELIBERADAS y no se tocan. Lo que faltaba es que se supieran: el ajuste se
   * aplicaba a medias y la pantalla decía "stock repuesto" igual. El operador
   * anulaba una venta de 3 unidades, recuperaba 2, y nada se lo decía.
   *
   * Por eso ahora devuelve un resumen de lo que NO pudo ajustar. No cambia
   * ninguna escritura: sólo deja de perderse la información.
   */
  const changeSaleStatus = async (
    sale: Sale,
    newStatus: Sale['status'],
  ): Promise<{ borrados: string[]; topeados: string[] }> => {
    if (!user) return { borrados: [], topeados: [] };
    const saleRef = doc(db, 'sales', sale.id);
    // Se reinician en cada intento: la transacción puede reintentarse.
    let borrados: string[] = [];
    let topeados: string[] = [];
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

        borrados = [];
        topeados = [];

        if (direction !== 0) {
          const items = serverSale.items || [];
          const productSnaps = await Promise.all(
            items.map(i => transaction.get(doc(db, 'products', i.id)))
          );
          productSnaps.forEach((snap, idx) => {
            if (!snap.exists()) {
              // Producto borrado: no se puede ajustar. Se anota para avisar.
              borrados.push(items[idx].name);
              return;
            }
            const pData = snap.data() as Product;
            const bruto = (pData.stock || 0) + direction * items[idx].quantity;
            const newStock = Math.max(0, bruto);
            // El piso en 0 es deliberado, pero significa que se descontó MENOS
            // de lo que dice el movimiento del kardex. Hay que decirlo.
            if (bruto < 0) topeados.push(items[idx].name);
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
      return { borrados, topeados };
    } catch (e) {
      handleFirestoreError(e, 'update', `sales/${sale.id}`);
      return { borrados: [], topeados: [] };
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

    // P1.7: validar ANTES de escribir. El `invoiceNumber` queda FUERA de este
    // parse porque todavía no existe: el correlativo definitivo se asigna más
    // abajo, dentro de la transacción, leyendo `counters/*`.
    //
    // Esto no era así y rompía el producto entero. El schema pide
    // `z.string().min(1)`; el POS manda `''` a propósito, para que el preview
    // oculte el renglón del número mientras no haya número en vez de
    // enseñarle al cliente un texto interno. Las dos decisiones son correctas
    // por separado y juntas hacían que TODA venta y TODA proforma murieran acá
    // con un mensaje de librería sin traducir. `tsc` y el build no pueden
    // verlo: el tipo sigue siendo `string`, el vacío también es string.
    // (El camino de SalesHistory seguía mandando 'POR ASIGNAR' y por eso
    // funcionaba: la divergencia entre los dos caminos era la pista.)
    //
    // Se valida una COPIA con un número de relleno en vez de `.omit()`: zod
    // lanza `.omit() cannot be used on object schemas containing refinements`
    // y este schema tiene un `.refine` para la cédula. `tsc` no lo ve porque a
    // nivel de tipos `.omit()` existe igual. El relleno no viaja a Firestore:
    // el documento se escribe más abajo con `assignedNumber`.
    const parsedSale = SaleSchema.safeParse({
      ...fullSale,
      invoiceNumber: fullSale.invoiceNumber || 'PENDIENTE',
    });
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

    /*
      Siembra del contador de FACTURAS la primera vez: arranca desde el número
      máximo ya usado, para no reiniciar la numeración de un negocio en marcha.
      El número definitivo igual se asigna DENTRO de la transacción.

      El barrido que había acá ordenaba por `invoiceNumber` descendente y se
      quedaba con 30 filas. Como 'P' (0x50) > 'A' (0x41), las proformas se
      ordenan por encima de TODAS las facturas: con treinta proformas emitidas
      la ventana entera eran proformas, el filtro las descartaba, `maxNum`
      quedaba en 0, el `if (maxNum > 0)` no sembraba nada y la primera factura
      de un negocio en marcha salía `A-000001` OTRA VEZ. Con el `catch` vacío
      de abajo, en silencio.

      `maximoFacturaEmitido` lo calcula por rango de prefijo, que es lo único
      que hace que el orden lexicográfico sea el numérico.
    */
    if (!isProforma) {
      try {
        const probe = await getDoc(counterRef);
        if (!probe.exists()) {
          const maxNum = await maximoFacturaEmitido();
          if (maxNum > 0) {
            await setDoc(counterRef, { value: maxNum, updatedAt: Date.now() });
          }
        }
      } catch (e) {
        // Si la siembra falla, la transacción arranca desde 0 y los números
        // salen repetidos. Es barato avisarlo: el operador puede corregir el
        // contador en Configuración ANTES de seguir facturando.
        toast.error(
          'No se pudo leer el último número de factura. Revisá el correlativo en ' +
          'Configuración → Numeración de facturas antes de seguir facturando.',
        );
        console.error('siembra del contador de facturas', e);
      }
    }

    try {
      // Pilar 3: Transacción atómica (stock + contador + venta).
      await runTransaction(db, async (transaction) => {
        // 0. IDEMPOTENCIA. Antes que nada, preguntar si esta venta YA existe.
        //
        // El caso que esto cubre es el peor de todos y el más difícil de ver:
        // la transacción falla con `unavailable` o `deadline-exceeded`, que
        // significan "no sé si se guardó" — el servidor pudo haber commiteado
        // y la respuesta no llegó de vuelta. El operador ve el error, el modal
        // queda igual, y el instinto es apretar otra vez. Sin esta guarda, el
        // segundo intento vuelve a leer el stock del servidor (YA descontado),
        // lo descuenta de nuevo, incrementa el contador otra vez y crea un
        // SEGUNDO movimiento de kardex con el mismo `refId`, mientras el
        // `transaction.set(saleRef)` pisa la venta con el nuevo número.
        // Resultado: stock -2 por una venta de 1, un correlativo saltado, dos
        // movimientos por el mismo hecho y una sola factura. Nada en la
        // pantalla lo delata, y el kardex —que existe para ser la verdad
        // inmutable del inventario— queda mintiendo.
        //
        // Reintentar tiene que ser gratis. Si el doc ya está, se devuelve su
        // número y se sale SIN escribir nada. El `sale.id` es un uuid que se
        // genera una vez por preview, así que dos confirmaciones del mismo
        // preview son el mismo hecho; volver a FACTURAR genera un uuid nuevo y
        // sí es una venta distinta, como debe ser.
        const saleSnap = await transaction.get(saleRef);
        if (saleSnap.exists()) {
          assignedNumber = String((saleSnap.data() as any).invoiceNumber || '');
          return; // sin escrituras: el stock y el contador ya se movieron
        }

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

        // El número sí es obligatorio en el documento que se escribe: lo que
        // se sacó del parse de arriba fue el estado previo a asignarlo, no la
        // garantía. Si por lo que sea llegamos acá sin número, es preferible
        // abortar la transacción que escribir una venta sin identificar.
        if (!assignedNumber) {
          throw new Error('No se pudo asignar el número de documento. La venta no se registró.');
        }
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

  /**
   * Devuelve los productos de las cajas recibidas que YA NO EXISTEN en el
   * catálogo, para que el caller no diga que entró mercadería que no entró.
   *
   * El tracking se marcaba `isReceived`, `receivedQuantity` subía, la orden
   * pasaba a CLOSED y el aviso decía «N unidad(es) sumadas al inventario» —
   * cuando el `if (serverProduct)` que gobierna el stock no se había cumplido y
   * no había entrado nada ni quedado un solo movimiento en el kardex. Tres
   * registros afirmando lo mismo, y la única fuente que decía la verdad era el
   * kardex, por omisión. Nadie mira un movimiento que no existe.
   */
  const updatePurchase = async (
    purchase: Purchase,
  ): Promise<{ faltantes: string[]; unidadesNoEntraron: number }> => {
    if (!user) return { faltantes: [], unidadesNoEntraron: 0 };
    // Se reinician dentro del callback: la transacción puede reintentarse.
    let faltantes: string[] = [];
    let unidadesNoEntraron = 0;
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

      /*
        Los `undefined` se borran del objeto porque Firestore los rechaza. Pero
        `transaction.update` sólo toca las claves que le llegan, así que borrar
        una clave equivale a "no tocar ese campo" — y el editor de órdenes manda
        `undefined` justamente para decir "vaciar": su helper es
        `num(v) => Number(v) > 0 ? Number(v) : undefined`.

        Resultado: el operador cargaba $120 de aduana por error, entraba a
        editar, borraba el campo, guardaba, y leía "Orden actualizada." Los $120
        seguían ahí, y se iban a prorratear al costo de cada unidad cuando
        llegara la mercadería.

        Es el mismo defecto que `updateProduct` ya había resuelto con
        `deleteField()`, y cuyo comentario dice que un guardado que informa éxito
        y no aplica el cambio es peor que uno que falla. La lección se había
        aplicado a los campos de la tablet y no a los cuatro que definen el
        landed cost, que es lo que mueve plata.

        Sólo van acá campos DECLARADOS OPCIONALES en `firestore.rules` (los siete
        lo están) y sólo si quien llama distingue "vaciar" de "no tocar".
      */
      const VACIABLES = [
        'freightCost', 'customsTaxes', 'insuranceCost', 'shippingRatePerLb',
        'platform', 'orderNumber', 'financing',
      ];
      const aVaciar: string[] = [];
      Object.keys(updatedPurchase).forEach(key => {
        if ((updatedPurchase as any)[key] === undefined) {
          if (VACIABLES.includes(key)) aVaciar.push(key);
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
        /*
          La tarifa es la que el operador cargó. No se inventa ninguna.

          Antes, si el campo venía vacío, se usaba un default por modalidad
          (6.5 aéreo, 2.5 marítimo) — y 'Sea Cargo' es la modalidad inicial del
          formulario, así que TODA orden que no la cambiara tenía un $2.50/lb
          latente. Con peso cargado en los ítems (el formulario lo pide), ese
          2.50 ganaba sobre el "Flete Total USD" que el operador había escrito
          con la factura del courier en la mano, y el flete declarado se
          descartaba sin decir nada.

          Una orden de 40 lbs con $180 de flete real absorbía $100. Los otros
          $80 no entraban al costo, el margen de Reportes salía optimista, y no
          hay pantalla que muestre cuánto flete se imputó, así que el error era
          invisible por los dos lados.

          Con `|| 0`: si no hay tarifa por libra, se prorratea el flete total
          declarado, que es lo que el operador quiso decir al escribirlo. Los
          defaults 6.5 y 2.5 siguen existiendo como sugerencia VISIBLE en el
          formulario, que es donde un default se puede ver y corregir.
        */
        const ratePerLb = updatedPurchase.shippingRatePerLb || 0;
        const totalBaseCost = updatedPurchase.items.reduce((acc, item) => acc + (item.cost * item.quantity), 0);
        const totalExpenses = updatedPurchase.freightCost || 0; // Flete global (fallback cuando no hay peso por ítem)
        /*
          Los dos regímenes de flete conviven en una misma orden: los ítems con
          peso pagan por tarifa $/lb, los que no tienen peso se reparten el
          "Flete Total". El problema era el DENOMINADOR: el prorrateo dividía
          por el valor de la orden ENTERA, incluidos los ítems que ya habían
          pagado su flete por peso. Resultado: los ítems sin peso absorbían sólo
          una fracción del flete total y el resto no lo absorbía nadie.

          El denominador correcto es el valor de los ítems que efectivamente
          entran al prorrateo. Así el "Flete Total" se reparte completo entre
          ellos y la suma de lo imputado cuadra con lo declarado.
        */
        const usaPeso = (it: PurchaseItem) => ratePerLb > 0 && !!it.estimatedWeight;
        const baseProrrateo = updatedPurchase.items
          .filter(i => !usaPeso(i))
          .reduce((acc, i) => acc + (i.cost * i.quantity), 0);
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

        faltantes = [];
        unidadesNoEntraron = 0;

        toProcess.forEach(tracking => {
          {
            tracking.isReceived = true; // Mark tracking as synced
            
            (tracking.itemsInBox || []).forEach(boxItem => {
              // 1. Stock y costo (WAC) con datos del SERVIDOR leídos en la transacción
              const serverProduct = serverProducts.get(boxItem.itemId);
              if (!serverProduct) {
                // Se anota para que el aviso no cuente unidades que no entraron.
                // El conteo se hace acá, donde están los datos: cruzarlo por
                // nombre del lado del caller falla con nombres repetidos.
                const enOrden = updatedPurchase.items.find(i => i.id === boxItem.itemId);
                faltantes.push(enOrden?.name || boxItem.itemId);
                unidadesNoEntraron += boxItem.quantity;
              }
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
                    // Prorrateo del Flete Total entre los ítems que NO pagan por
                    // peso. El denominador son sólo ellos: ver arriba.
                    if (baseProrrateo > 0) {
                       itemFreightExpense = totalExpenses * ((pItem.cost * boxItem.quantity) / baseProrrateo);
                    } else {
                       const totalQty = updatedPurchase.items
                         .filter(i => !usaPeso(i))
                         .reduce((acc, i) => acc + i.quantity, 0);
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

                  /*
                    (sigue abajo, después de calcular newCost)
                  */

                  // El promedio ponderado vive en `src/lib/costoPromedio.ts`,
                  // junto con su inversa, y las dos tienen test: `npm run costo:test`.
                  const newStock = baseStock + boxItem.quantity;
                  newCost = costoAlRecibir(baseStock, baseCost, boxItem.quantity, realUnitCost);

                  /*
                    Se guarda EN LA CAJA con qué costo entraron estas unidades y
                    cuál era el promedio antes y después. Sin estos números,
                    revertir una recepción no puede deshacer el promedio: la
                    reversión devolvía el stock y dejaba el costo inflado, y como
                    también reabre el tracking, volver a recibir la caja
                    promediaba OTRA VEZ contra el costo ya inflado.

                    Cada ciclo revertir → re-recibir empujaba el costo hacia el
                    de la última caja y no volvía nunca. Con 5 unidades a $10 y
                    una caja de 10 a $16: $14, después $15.33, después $15.78.
                    Sin que entrara un centavo más de mercadería.

                    Ese costo alimenta el valor de inventario del Dashboard y el
                    margen de Reportes: un producto con el costo inflado se ve
                    menos rentable de lo que es, y el precio que sale de esa
                    lectura es plata.

                    Se guardan los tres porque la reversión tiene dos caminos:
                    restaurar `costoPrevio` cuando nadie más tocó el costo desde
                    entonces —el caso normal, y es exacto—, y la inversa
                    algebraica con `costoUnitarioReal` cuando sí lo tocaron.
                  */
                  (boxItem as any).costoUnitarioReal = realUnitCost;
                  (boxItem as any).costoPrevio = baseCost;
                  (boxItem as any).costoDespues = newCost;
                  (boxItem as any).stockDespues = newStock;
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
        /*
          Validar ANTES de escribir, como hace `recordPurchase`. Era la única
          escritura de compras que no pasaba por Zod, y es la que fija el landed
          cost de cada unidad.

          `stockAdded` se completa en vez de exigirse: el campo es opcional en
          las reglas, así que puede faltar en órdenes viejas, y no vale la pena
          dejar sin editar una orden de 2024 por un booleano que el sistema ya
          no usa para decidir nada (manda `status`).
        */
        const paraValidar = { ...updatedPurchase, stockAdded: updatedPurchase.stockAdded ?? false };
        const revision = PurchaseSchema.safeParse(paraValidar);
        if (!revision.success) throw new Error(`Orden inválida — ${zodErrorMsg(revision)}`);

        // Los campos que el editor dejó en blanco se borran de verdad; ver
        // `VACIABLES` arriba. `deleteField()` es lo único que Firestore entiende
        // como "sacá este campo" dentro de un update.
        const escritura: any = { ...paraValidar };
        aVaciar.forEach(k => { escritura[k] = deleteField(); });
        transaction.update(purchaseRef, escritura);
        }
      });
      return { faltantes, unidadesNoEntraron };
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchase.id}`);
      return { faltantes: [], unidadesNoEntraron: 0 };
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
   *
   * Y AHORA TAMBIÉN DESHACE EL COSTO PROMEDIO, que antes se quedaba inflado.
   *
   * El promedio ponderado es un cociente de valores totales, así que su inversa
   * es exacta y no depende de lo que haya pasado en el medio:
   *
   *     valor    = stock × costo
   *     costoAnterior = (valor − unidades × costoUnitarioReal) / (stock − unidades)
   *
   * Las ventas sacan unidades AL promedio, así que no lo mueven; otra recepción
   * posterior suma su propio valor, y restar el de esta caja sigue dando el
   * promedio correcto de lo que queda. Por eso alcanza con haber guardado
   * `costoUnitarioReal` en la caja al recibirla.
   *
   * No se toca el costo en tres casos, y los tres se informan en vez de
   * disimularse: cuando la caja se recibió antes de que ese dato se guardara,
   * cuando al sacar estas unidades no queda stock contra el cual promediar, y
   * cuando la cuenta daría un costo negativo (señal de que el inventario ya se
   * movió por otro lado).
   *
   * Devuelve lo que NO se pudo ajustar. Las decisiones de piso en 0 y de saltar
   * productos borrados son deliberadas y siguen igual; lo que cambia es que
   * dejan de ser invisibles.
   */
  const revertTrackingReception = async (
    purchaseId: string,
    trackingId: string,
  ): Promise<{
    borrados: string[];
    topeados: string[];
    costoSinRevertir: string[];
    costoAproximado: string[];
  }> => {
    if (!user) return { borrados: [], topeados: [], costoSinRevertir: [], costoAproximado: [] };
    // Se reinician dentro del callback: la transacción puede reintentarse.
    let borrados: string[] = [];
    let topeados: string[] = [];
    let costoSinRevertir: string[] = [];
    let costoAproximado: string[] = [];
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

        borrados = [];
        topeados = [];
        costoSinRevertir = [];
        costoAproximado = [];

        const boxItems = tracking.itemsInBox || [];
        const removeByProduct = new Map<string, number>();
        /*
          Lo que esta caja le hizo al costo de cada producto, para poder
          deshacerlo. `lineas` cuenta cuántas entradas de la caja tocan al mismo
          producto: si es más de una, los promedios intermedios no sirven y hay
          que ir por la inversa algebraica.
        */
        const efecto = new Map<string, {
          lineas: number;
          unitario?: number;
          previo?: number;
          despues?: number;
          stockDespues?: number;
        }>();
        boxItems.forEach(b => {
          removeByProduct.set(b.itemId, (removeByProduct.get(b.itemId) || 0) + b.quantity);
          const prev = efecto.get(b.itemId);
          efecto.set(b.itemId, {
            lineas: (prev?.lineas || 0) + 1,
            unitario: prev?.unitario ?? (b as any).costoUnitarioReal,
            previo: prev ? prev.previo : (b as any).costoPrevio,
            despues: (b as any).costoDespues ?? prev?.despues,
            stockDespues: (b as any).stockDespues ?? prev?.stockDespues,
          });
        });

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
          if (!p) {
            // Producto borrado: no hay stock que ajustar. Se anota para avisar.
            const enCaja = boxItems.find(b => b.itemId === pid);
            borrados.push((serverPurchase.items || []).find(i => i.id === pid)?.name || enCaja?.itemId || pid);
            return;
          }

          const stockAntes = p.stock || 0;
          const bruto = stockAntes - qty;
          const newStock = Math.max(0, bruto);
          // El piso en 0 es deliberado, pero significa que se descontó MENOS de
          // lo que decía la caja. Hay que decirlo, igual que en changeSaleStatus.
          if (bruto < 0) topeados.push(p.name);

          const cambios: any = { stock: newStock, updatedAt: Date.now() };

          /*
            Deshacer el costo promedio. Los dos caminos, sus supuestos y el caso
            que no se puede resolver están en `src/lib/costoPromedio.ts`, con
            trece pruebas en `npm run costo:test` — incluido el ciclo de cinco
            reversiones que antes empujaba el costo hasta el de la última caja.
          */
          const efectoP = efecto.get(pid);
          const reversion = costoAlRevertir(stockAntes, p.cost || 0, {
            unidades: qty,
            costoUnitarioReal: efectoP?.unitario,
            costoPrevio: efectoP?.previo,
            costoDespues: efectoP?.despues,
            stockDespues: efectoP?.stockDespues,
            lineas: efectoP?.lineas,
          });
          if (reversion.costo === null) {
            costoSinRevertir.push(p.name);
          } else {
            cambios.cost = reversion.costo;
            // `exacto` es el caso normal y no necesita aviso. Los otros dos sí:
            // el operador puede estar por poner precio con ese número.
            if (reversion.via !== 'exacto') costoAproximado.push(p.name);
          }

          transaction.update(doc(db, 'products', pid), cambios);

          /*
            P2.7: kardex. `delta` es el cambio REAL de stock, no el nominal de la
            caja: con el piso en 0, escribir `-qty` dejaba una fila donde
            `stockDespues − delta` no daba el stock anterior, y `movimientos` es
            inmutable por reglas, así que esa fila quedaba mal para siempre. La
            cantidad que decía la caja se conserva en el motivo.
          */
          const deltaReal = newStock - stockAntes;
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: pid, productName: p.name, sku: p.sku,
            tipo: 'reversion', delta: deltaReal, stockDespues: newStock,
            refId: purchaseId, fecha: Date.now(),
            motivo: deltaReal === -qty
              ? 'Recepción revertida'
              : `Recepción revertida (la caja traía ${qty}; sólo había ${stockAntes})`,
          }));
        });
        transaction.update(purchaseRef, { items, trackings, status });
      });
      return { borrados, topeados, costoSinRevertir, costoAproximado };
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchaseId}`);
      return { borrados: [], topeados: [], costoSinRevertir: [], costoAproximado: [] };
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
      /*
        Es el único alta del sistema con id elegido a mano: el formulario tiene
        un campo de texto libre con placeholder «garantia». `setDoc` sobre un id
        que ya existe REEMPLAZA el documento entero —título y respuesta— y la
        pantalla decía «Objeción creada correctamente».

        Lo que se destruía es el guion de venta que la tablet le muestra al
        cliente. `addProduct` tiene check de unicidad de SKU exactamente por esto.
      */
      if (universalObjections.some((o) => o.id === objection.id)) {
        throw new Error(
          `Ya existe una objeción con el id "${objection.id}". Elegí otro, o editá la que ya está.`,
        );
      }
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
      // Mismo caso que en las universales: id a mano, `setDoc` que reemplaza.
      if (categoryObjections.some((o) => o.id === objection.id)) {
        throw new Error(
          `Ya existe una objeción con el id "${objection.id}". Elegí otro, o editá la que ya está.`,
        );
      }
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
    authError,
    products,
    sales,
    purchases,
    customers,
    suppliers,
    companyInfo,
    universalObjections,
    /** Colecciones cuya suscripción en vivo se cayó: el shell lo muestra. */
    coleccionesCaidas,
    categoryObjections,
    configFinanciamiento,
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
