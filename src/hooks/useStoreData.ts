import { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError, mensajeFirestore, tieneClaimStaff } from '../lib/db';
import { toast } from '../components/Toast';
import { collection, onSnapshot, query, setDoc, doc, updateDoc, deleteDoc, writeBatch, runTransaction, where, limit, orderBy, increment, deleteField, getDocs, getDoc, startAfter } from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Product, Sale, Purchase, PurchaseItem, CompanyInfo, DashboardStats, Customer, Supplier, UniversalObjection, CategoryObjection, Movimiento, Apartado, AbonoApartado, NuevoApartado, LineaEncargo, LlegadaEncargo } from '../types';
import {
  UniversalObjectionSchema, CategoryObjectionSchema, SaleSchema, ProductSchema, PurchaseSchema, CustomerSchema, SupplierSchema,
  ApartadoSchema, AbonoApartadoSchema, AnulacionAbonoSchema, ActualizacionApartadoSchema, ConfigApartadosSchema,
  LlegadaEncargoSchema, camposFueraDeReglas, esEmailValido,
} from '../lib/validations';
import {
  CONFIG_FINANCIAMIENTO_DEFAULT,
  normalizarConfig,
  type ConfigFinanciamiento,
} from '../lib/financiamiento';
import { sembrarContadorFacturas } from '../lib/correlativos';
import { costoAlRecibir, costoAlRevertir } from '../lib/costoPromedio';
import {
  CONFIG_APARTADOS_DEFAULT,
  abonadoNio,
  asignarLlegadas,
  estaPagado,
  fechaLimiteDesde,
  llegadasDeCaja,
  metodoPredominante,
  normalizarConfigApartados,
  numeroApartado,
  partesDeApartado,
  pendientesDe,
  redondearCordobas,
  resumenPagos,
  saldoNio,
  tienePendientes,
  validarAbono,
  validarDevolucion,
  type ConfigApartados,
} from '../lib/apartados';
import { formatCurrencyNIO } from '../lib/utils';
import { etiquetaApartado } from '../lib/etiquetas';
import { v5 as uuidv5 } from 'uuid';

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
  // Unidades apartadas del producto: mismo caso. Es un dato del inventario, no
  // de la línea vendida, y sin sacarlo acá TODA venta de un producto con
  // apartados la rechazarían las reglas.
  'apartadas',
  // Unidades prometidas a clientes que todavía no llegaron (encargos): idem.
  'encargadas',
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

// ---------------------------------------------------------------------------
// Apartados: helpers de módulo
// ---------------------------------------------------------------------------

/**
 * Las líneas de un apartado se guardan como las de una venta pero SIN la foto.
 * Un apartado vive semanas y la colección se suscribe entera: con fotos de
 * ~100 KB por línea, cada carga de la app bajaría megas que nadie mira. El
 * comprobante y la factura final toman la foto del catálogo vigente.
 */
const sanitizeApartadoItem = (item: any) => {
  const clean = sanitizeSaleItem(item);
  delete clean.imageBase64;
  return clean;
};

/**
 * Espacio de nombres fijo para derivar el id de la factura de un apartado. Es
 * arbitrario pero ESTABLE, igual que el de proforma → factura en SalesHistory:
 * dos intentos de entregar el mismo apartado caen sobre la MISMA venta.
 */
const NS_APARTADO_A_FACTURA = '5d0b8e2a-7c41-4f9e-b3a6-1e8d2c9f0a57';

/** El id de la venta que se emite al entregar un apartado. */
export const idVentaDeApartado = (apartadoId: string): string => uuidv5(apartadoId, NS_APARTADO_A_FACTURA);

/**
 * Cuántas llegadas nuevas acepta un apartado en una sola escritura. Es el tope
 * de `llegadasSoloCrecen` en firestore.rules: pasarlo hace rechazar la
 * transacción ENTERA, y la que asigna llegadas es la recepción de una caja.
 * Lo que no entra queda por llegar y se reserva después desde Apartados.
 */
const MAX_LLEGADAS_POR_ESCRITURA = 5;

/** Una parte de un encargo que una recepción reservó (o que su reversión devolvió a esperar). */
export interface EncargoReservado {
  apartadoId: string;
  numero: string;
  cliente: string;
  producto: string;
  cantidad: number;
  /** Con esto el apartado ya no espera nada: su plazo de pago empezó a correr. */
  completo: boolean;
}

/** El nombre de un producto según las líneas del apartado (sirve aunque el producto se haya borrado). */
const nombreEnApartado = (ap: Pick<Apartado, 'items'>, productId: string): string =>
  (ap.items || []).find((i) => i.id === productId)?.name || productId;

/**
 * Si la siembra del contador de facturas falla, la transacción arranca desde 0
 * y los números salen repetidos. Es barato avisarlo: el operador puede corregir
 * el contador en Configuración ANTES de seguir facturando. Lo usan los dos
 * caminos que emiten facturas: `recordSale` y `entregarApartado`.
 */
const avisarFallaSiembra = (e: unknown) => {
  toast.error(
    'No se pudo leer el último número de factura. Revisá el correlativo en ' +
    'Configuración → Numeración de facturas antes de seguir facturando.',
  );
  console.error('siembra del contador de facturas', e);
};

/** Cantidad total por producto (por si el mismo producto viniera en dos líneas). */
const cantidadesPorProducto = (items: { id: string; name: string; quantity: number; cost?: number }[]) => {
  const m = new Map<string, { qty: number; name: string; cost?: number }>();
  for (const i of items) {
    const prev = m.get(i.id);
    m.set(i.id, { qty: (prev?.qty || 0) + i.quantity, name: i.name, cost: prev?.cost ?? i.cost });
  }
  return m;
};

/**
 * El diagnóstico exacto de un producto que las reglas no van a dejar escribir.
 * Sin esto, una clave que dejó un script con Admin SDK (pasó con `specs`)
 * tumba la transacción entera con "Sin permisos… probablemente falte desplegar
 * las reglas", que manda a buscar el problema en otro lado.
 */
const errorCamposFuera = (p: Product & Record<string, unknown>): Error | null => {
  const sobran = camposFueraDeReglas(p);
  if (sobran.length === 0) return null;
  return new Error(
    `«${p.name}» tiene ${sobran.length === 1 ? 'el campo' : 'los campos'} ${sobran.join(', ')}, ` +
    `que las reglas no permiten: cualquier escritura de ese producto se rechaza. ` +
    `Hay que quitarlo con un script (Admin SDK) antes de seguir.`,
  );
};

/**
 * La venta (RECIBO_OFICIAL) que se emite al entregar un apartado.
 *
 * Se usa DOS veces, y la primera es la que importa: al CREAR el apartado se arma
 * con un número de relleno y se pasa por SaleSchema. "Aceptado al apartar ⇒
 * facturable al entregar": un dato que la venta rechazaría —un correo mal
 * escrito en la ficha, un teléfono demasiado largo— se descubre hoy, con el
 * cliente enfrente, y no dentro de un mes con el cliente pagado y sin forma de
 * darle su factura.
 */
const armarVentaDeApartado = (
  ap: Omit<Apartado, 'ownerId' | 'updatedAt' | 'status'>,
  opts: { id: string; invoiceNumber: string; fecha: number; imagenes?: Map<string, string> },
): Sale => {
  const items = (ap.items || []).map((i) => {
    const img = opts.imagenes?.get(i.id);
    return img ? { ...i, imageBase64: img } : { ...i };
  });
  const venta: any = {
    id: opts.id,
    date: opts.fecha,
    items,
    subtotal: ap.subtotal,
    tax: ap.tax,
    total: ap.total,
    discount: ap.discount,
    shipping: ap.shipping,
    documentType: 'RECIBO_OFICIAL',
    clientDocumentType: 'NINGUNO',
    customerId: ap.customerId,
    customerName: ap.customerName,
    // Un correo que la venta rechazaría se deja afuera en vez de trabar la
    // entrega: el apartado ya está pagado, y un correo no vale una factura.
    customerEmail: esEmailValido(ap.customerEmail) ? ap.customerEmail : undefined,
    customerPhone: ap.customerPhone,
    customerAddress: ap.customerAddress,
    transport: ap.transport,
    invoiceNumber: opts.invoiceNumber,
    currency: 'USD',
    exchangeRate: ap.exchangeRate,
    // El recibo lleva UNA forma de pago: la que más plata movió. El desglose,
    // con las referencias bancarias, va en la nota, que también se imprime.
    paymentMethod: metodoPredominante(ap),
    paymentReference: `Apartado ${ap.numero}`,
    notes: [ap.notes?.trim(), resumenPagos(ap)].filter(Boolean).join(' · '),
    status: 'completed',
    apartadoId: ap.id,
    ownerId: 'shared_store',
  };
  Object.keys(venta).forEach((k) => venta[k] === undefined && delete venta[k]);
  return venta as Sale;
};

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
  /*
    Apartados: la colección ENTERA, sin `limit`. A diferencia de las ventas, lo
    que más importa acá es lo más viejo: un apartado activo de hace dos meses es
    justo el que hay que cobrar o liberar, y no puede caerse de una ventana de
    "los últimos 100". El volumen es chico (una tienda, un operador) y los
    documentos no llevan fotos.

    `apartadosCargados` distingue "no hay apartados" de "todavía no llegaron":
    una pantalla que decide algo con la lista vacía del primer render (por
    ejemplo, que un producto no tiene unidades apartadas) estaría decidiendo
    sobre una ausencia de datos.
  */
  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [apartadosCargados, setApartadosCargados] = useState(false);
  const [configApartados, setConfigApartados] = useState<ConfigApartados>(CONFIG_APARTADOS_DEFAULT);
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
      // Nombres, teléfonos y saldos de clientes: no se quedan en memoria
      // después de cerrar sesión.
      setApartados([]);
      setApartadosCargados(false);
      setConfigApartados(CONFIG_APARTADOS_DEFAULT);
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

    const qApartados = query(collection(db, 'apartados'), orderBy('fecha', 'desc'));
    const unsubApartados = onSnapshot(qApartados, (snapshot) => {
      setApartados(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Apartado)));
      setApartadosCargados(true);
    }, (error) => fallaSuscripcion(error, 'apartados'));

    /*
      La política de apartados. NO se copia el patrón de `config/financiamiento`
      de arriba, que le pasa `handleFirestoreError` al callback de error: esa
      función siempre lanza, y lanzar ahí no lo atrapa nadie (ver el comentario
      de `coleccionesCaidas`). Si este doc no se puede leer, se sigue con la
      política de fábrica —sin prima mínima, 30 días— y se dice.
    */
    const unsubConfigApartados = onSnapshot(doc(db, 'config', 'apartados'), (snapshot) => {
      setConfigApartados(snapshot.exists() ? normalizarConfigApartados(snapshot.data()) : CONFIG_APARTADOS_DEFAULT);
    }, (error) => {
      toast.error(
        `No se pudo leer la política de apartados: ${mensajeFirestore(error, 'get', 'config/apartados')} ` +
        `Mientras tanto se usa la de fábrica (sin prima mínima, 30 días).`,
      );
    });

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
      unsubApartados();
      unsubConfigApartados();
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
      /*
        El SKU se guarda NORMALIZADO, en mayúsculas y sin espacios al borde.

        El campo del Catálogo Maestro tenía la clase `uppercase`, que es
        `text-transform` — puro CSS. Escribías `proy-001`, veías `PROY-001`, y
        se guardaba `proy-001`: después el Inventario y la factura mostraban la
        minúscula y la pantalla donde lo cargaste quedaba como la única que
        decía otra cosa.

        La unicidad ya se comparaba sin distinguir mayúsculas, así que esto no
        cambia qué se considera duplicado; lo que hace es que lo guardado
        coincida con lo que se mostró al escribirlo.
      */
      fullProduct.sku = String(fullProduct.sku || '').trim().toUpperCase();
      // P3.5: SKU único (case-insensitive) — antes se podían crear duplicados en silencio.
      const skuNorm = fullProduct.sku.toLowerCase();
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
      // P3.5: SKU único también al editar. Se normaliza igual que al crear.
      product = { ...product, sku: String(product.sku || '').trim().toUpperCase() };
      const skuNorm = product.sku.toLowerCase();
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
      // `apartadas` y `encargadas` tienen el mismo problema y la misma
      // solución: vienen de la caché, y sólo los escriben las transacciones de
      // apartados y la recepción de compras.
      delete pData.apartadas;
      delete pData.encargadas;

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

  /**
   * Devuelve los productos que NO se tocaron porque tienen unidades apartadas
   * (sólo cuando el lote cambia stock). Ver el comentario de adentro.
   */
  const bulkUpdateProducts = async (
    ids: string[],
    updates: Partial<Product>,
    motivo?: string,
  ): Promise<{ conApartados: string[] }> => {
    if (!user) return { conApartados: [] };
    // Se reinicia dentro de cada vuelta de transacción: puede reintentarse.
    const conApartados: string[] = [];
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
          const omitidosTanda: string[] = [];
          await runTransaction(db, async (transaction) => {
            omitidosTanda.length = 0;
            const snaps = await Promise.all(
              tanda.map(id => transaction.get(doc(db, 'products', id))),
            );
            snaps.forEach((snap, idx) => {
              if (!snap.exists()) return; // borrado en el medio: se saltea
              const server = snap.data() as Product;
              const id = tanda[idx];
              /*
                Un producto con unidades APARTADAS no entra en el lote.

                El lote escribe el MISMO stock absoluto en todos ("Ej. conteo
                físico anual"), y en un producto con apartados el conteo físico
                no es el stock: las unidades del cliente están en el estante
                pero no están a la venta. Escribir el conteo tal cual las volvía
                vendibles, y el POS podía vender la unidad de alguien que la está
                pagando. Esos se ajustan de a uno, donde el formulario pide el
                conteo y descuenta las apartadas.
              */
              if ((server.apartadas || 0) > 0) {
                omitidosTanda.push(server.name);
                return;
              }
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
          conApartados.push(...omitidosTanda);
        }
        return { conApartados };
      }

      // Sin stock de por medio no hay invariante que proteger: el batch alcanza.
      const batch = writeBatch(db);
      ids.forEach((id) => batch.update(doc(db, 'products', id), safeUpdates));
      await batch.commit();
      return { conApartados: [] };
    } catch (e) {
      handleFirestoreError(e, 'update', `products/bulk`);
      return { conApartados: [] };
    }
  };

  /**
   * P2.7: ajuste manual de stock CON motivo y rastro en el kardex.
   * `extraFields` permite actualizar en el mismo write otros campos del
   * producto (p.ej. minStockAlert desde el modal de stock).
   *
   * `conteoFisico`: el número que llega es lo que el operador CONTÓ en la
   * tienda, y eso incluye las unidades apartadas, que están en el estante pero
   * no a la venta. Se descuentan acá, con el `apartadas` del SERVIDOR leído en
   * la misma transacción: si en el medio se apartó algo desde otro lado, la
   * cuenta igual da. Sin esto, contar 5 con 1 apartada escribía stock 5 y el
   * POS podía vender la unidad del cliente que la está pagando.
   */
  const adjustStock = async (
    product: Product,
    newStock: number,
    motivo: string,
    extraFields: Partial<Product> = {},
    opciones: { conteoFisico?: boolean } = {},
  ) => {
    if (!user) return;
    const productRef = doc(db, 'products', product.id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(productRef);
        if (!snap.exists()) throw new Error('El producto ya no existe.');
        const server = snap.data() as Product;

        let stockFinal = newStock;
        let motivoFinal = motivo || 'Ajuste manual';
        const apartadasServer = server.apartadas || 0;
        if (opciones.conteoFisico && apartadasServer > 0) {
          if (newStock < apartadasServer) {
            throw new Error(
              `Contaste ${newStock}, pero hay ${apartadasServer} ` +
              `${apartadasServer === 1 ? 'unidad apartada' : 'unidades apartadas'} de clientes. ` +
              `Falta mercadería que ya está pagándose: revisalo antes de ajustar.`,
            );
          }
          stockFinal = newStock - apartadasServer;
          motivoFinal = `${motivoFinal} (contadas ${newStock} − ${apartadasServer} ` +
            `${apartadasServer === 1 ? 'apartada' : 'apartadas'})`;
        }
        const delta = stockFinal - (server.stock || 0);

        const upd: any = { ...extraFields, stock: stockFinal, updatedAt: Date.now() };
        Object.keys(upd).forEach(k => upd[k] === undefined && delete upd[k]);
        // Ni por `extraFields` se escribe esto: lo manejan sólo los apartados.
        delete upd.apartadas;
        delete upd.encargadas;
        transaction.update(productRef, upd);

        if (delta !== 0) {
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: product.id, productName: server.name, sku: server.sku,
            tipo: 'ajuste', delta, stockDespues: stockFinal,
            fecha: Date.now(), motivo: motivoFinal.slice(0, 300),
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

  /**
   * No se borra un producto con unidades APARTADAS. Con todo apartado su stock
   * es 0 y parece agotado, pero esas unidades están en el estante con el nombre
   * de un cliente: si el producto desaparece, cancelar el apartado ya no tiene
   * a dónde devolverlas y quedan fuera del sistema, sin kardex. Se lee del
   * servidor en una transacción, no de la caché.
   */
  const deleteProduct = async (id: string) => {
    if (!user) return;
    const ref = doc(db, 'products', id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) return; // ya no está: no hay nada que borrar
        const p = snap.data() as Product;
        if ((p.apartadas || 0) > 0) {
          throw new Error(
            `«${p.name}» tiene ${p.apartadas} ${p.apartadas === 1 ? 'unidad apartada' : 'unidades apartadas'}. ` +
            `Entregá o cancelá el apartado antes de borrarlo, o marcalo Inactivo.`,
          );
        }
        // Un encargo apunta al producto por id: si se borra, la caja que lo
        // trae no tiene a quién reservárselo y el cliente se queda esperando.
        if ((p.encargadas || 0) > 0) {
          throw new Error(
            `«${p.name}» tiene ${p.encargadas} ${p.encargadas === 1 ? 'unidad encargada' : 'unidades encargadas'} ` +
            `por clientes que la están esperando. Cancelá el encargo antes de borrarlo, o marcalo Inactivo.`,
          );
        }
        transaction.delete(ref);
      });
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
      Siembra del contador de FACTURAS la primera vez. Vive en
      `src/lib/correlativos.ts` (`sembrarContadorFacturas`), con la historia del
      barrido que reiniciaba la numeración: la comparte con `entregarApartado`,
      el otro camino que emite facturas.
    */
    if (!isProforma) {
      try {
        await sembrarContadorFacturas();
      } catch (e) {
        avisarFallaSiembra(e);
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
  ): Promise<{
    faltantes: string[];
    unidadesNoEntraron: number;
    /** Encargos que esta recepción dejó reservados: de quién, qué y cuánto. */
    asignados: EncargoReservado[];
    /** Productos con clientes esperando cuyas unidades igual quedaron a la venta. */
    sinReservar: string[];
  }> => {
    if (!user) return { faltantes: [], unidadesNoEntraron: 0, asignados: [], sinReservar: [] };
    // Se reinician dentro del callback: la transacción puede reintentarse.
    let faltantes: string[] = [];
    let unidadesNoEntraron = 0;
    let asignados: EncargoReservado[] = [];
    let sinReservar: string[] = [];
    try {
      // Copia profunda, limpia de `undefined`: la PLANTILLA de cada intento
      // de la transacción, que hace su propia copia (`updatedPurchase`).
      const limpia: Purchase = {
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
      Object.keys(limpia).forEach(key => {
        if ((limpia as any)[key] === undefined) {
          if (VACIABLES.includes(key)) aVaciar.push(key);
          delete (limpia as any)[key];
        }
      });
      limpia.items.forEach(item => {
        Object.keys(item).forEach(key => {
          if ((item as any)[key] === undefined) delete (item as any)[key];
        });
      });
      limpia.trackings.forEach((tracking: any) => {
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
        /*
          Una copia NUEVA por intento. El SDK vuelve a correr este callback
          cuando algo que leyó cambió antes del commit (una venta en otro
          equipo, un abono a un encargo), y el intento anterior ya había
          marcado las cajas `isReceived` y sumado `receivedQuantity` sobre su
          copia. Con una sola copia afuera, el reintento no encontraba nada que
          recibir: la caja quedaba "recibida" sin que sus unidades entraran al
          stock ni a los encargos que la esperaban.
        */
        const updatedPurchase: Purchase = {
          ...limpia,
          items: limpia.items.map(i => ({ ...i })),
          trackings: limpia.trackings.map(t => ({
            ...t,
            itemsInBox: (t.itemsInBox || []).map(b => ({ ...b })),
          })),
        };

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

        /*
          Encargos: los apartados activos que esperan algo de lo que trae esta
          recepción. Una transacción no admite consultas, así que los candidatos
          salen de la lista en vivo y se LEEN acá, por id, para decidir con lo
          que dice el servidor. Sólo para productos con `encargadas` en el
          servidor: es lo que dice que alguien está esperando.
        */
        const conEncargo = new Set(productIds.filter(pid => (serverProducts.get(pid)?.encargadas || 0) > 0));
        const idsEsperando = conEncargo.size === 0 ? [] : apartados
          .filter(a => a.status === 'activo' && Array.from(pendientesDe(a).keys()).some(pid => conEncargo.has(pid)))
          .map(a => a.id);
        const esperandoSnaps = await Promise.all(idsEsperando.map(id => transaction.get(doc(db, 'apartados', id))));
        const esperando = new Map<string, Apartado>();
        esperandoSnaps.forEach((snap, i) => {
          if (!snap.exists()) return;
          const ap = { ...(snap.data() as Apartado), id: idsEsperando[i] };
          if (ap.status === 'activo') esperando.set(ap.id, ap);
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

        /*
          --- 2b. ENCARGOS ---

          Lo que llegó para clientes que lo estaban esperando se reserva acá,
          en la misma transacción que lo recibe: entre "entró al stock" y "quedó
          a nombre del cliente" no hay un momento en que el POS lo pueda vender.

          Caja por caja y del encargo más viejo al más nuevo (asignarLlegadas):
          cada llegada guarda de qué caja vino, para que revertir esa recepción
          sepa exactamente qué deshacer. Al costo promedio que queda después de
          recibir, que es el costo con que sale cualquier unidad del stock —una
          venta o un apartado común—.
        */
        const ahora = Date.now();
        const pendienteVivo = new Map<string, Map<string, number>>();
        esperando.forEach((ap, id) => pendienteVivo.set(id, pendientesDe(ap)));
        const encargadasVivas = new Map<string, number>();
        conEncargo.forEach(pid => encargadasVivas.set(pid, serverProducts.get(pid)?.encargadas || 0));
        const nuevasLlegadas = new Map<string, LlegadaEncargo[]>();
        const reservadoDe = new Map<string, number>();
        const recibidoDe = new Map<string, number>();
        toProcess.forEach(tracking => {
          const enCaja = new Map<string, number>();
          (tracking.itemsInBox || []).forEach(b => {
            if (!productChanges.has(b.itemId)) return; // producto borrado: no entró nada
            enCaja.set(b.itemId, (enCaja.get(b.itemId) || 0) + b.quantity);
          });
          enCaja.forEach((qty, pid) => {
            recibidoDe.set(pid, (recibidoDe.get(pid) || 0) + qty);
            const espera = encargadasVivas.get(pid) || 0;
            if (espera <= 0) return;
            const candidatos: { id: string; fecha: number; pendiente: number }[] = [];
            pendienteVivo.forEach((pend, apId) => {
              const falta = pend.get(pid) || 0;
              if (falta > 0 && (nuevasLlegadas.get(apId)?.length || 0) < MAX_LLEGADAS_POR_ESCRITURA) {
                candidatos.push({ id: apId, fecha: esperando.get(apId)!.fecha, pendiente: falta });
              }
            });
            asignarLlegadas(candidatos, Math.min(qty, espera)).forEach(({ id: apId, cantidad }) => {
              const pend = pendienteVivo.get(apId)!;
              pend.set(pid, (pend.get(pid) || 0) - cantidad);
              encargadasVivas.set(pid, (encargadasVivas.get(pid) || 0) - cantidad);
              reservadoDe.set(pid, (reservadoDe.get(pid) || 0) + cantidad);
              const llegada = LlegadaEncargoSchema.safeParse({
                productId: pid, cantidad, fecha: ahora, origen: 'compra',
                costoUnitario: productChanges.get(pid)!.newCost,
                compraId: purchase.id, trackingId: tracking.id,
              });
              if (!llegada.success) throw new Error(`Llegada inválida — ${zodErrorMsg(llegada)}`);
              nuevasLlegadas.set(apId, [...(nuevasLlegadas.get(apId) || []), llegada.data]);
            });
          });
        });
        // Unidades que pudieron ir a un cliente y quedaron a la venta: la lista
        // en vivo no tenía el encargo, o el apartado llegó al tope por escritura.
        sinReservar = [];
        conEncargo.forEach(pid => {
          const debia = Math.min(recibidoDe.get(pid) || 0, serverProducts.get(pid)?.encargadas || 0);
          if ((reservadoDe.get(pid) || 0) < debia) sinReservar.push(serverProducts.get(pid)!.name);
        });

        // --- 3. ESCRITURAS ---
        productChanges.forEach((change, pid) => {
          const reservado = reservadoDe.get(pid) || 0;
          const sp = serverProducts.get(pid);
          const cambios: any = {
            stock: increment(change.addStock - reservado),
            cost: change.newCost,
            updatedAt: Date.now(),
          };
          if (reservado > 0) {
            cambios.apartadas = (sp?.apartadas || 0) + reservado;
            cambios.encargadas = Math.max(0, (sp?.encargadas || 0) - reservado);
          }
          transaction.update(doc(db, 'products', pid), cambios);
          // P2.7: kardex (stockDespues calculado sobre el stock del servidor)
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: pid, productName: sp?.name, sku: sp?.sku,
            tipo: 'compra', delta: change.addStock,
            stockDespues: sp ? (sp.stock || 0) + change.addStock : undefined,
            refId: purchase.id, fecha: Date.now(),
          }));
        });

        // Los encargos que esta recepción dejó reservados, con su salida del
        // stock en el kardex: la compra entra entera y la reserva sale aparte.
        const stockCorriendo = new Map<string, number>();
        productChanges.forEach((c, pid) => stockCorriendo.set(pid, (serverProducts.get(pid)?.stock || 0) + c.addStock));
        asignados = [];
        nuevasLlegadas.forEach((llegadas, apId) => {
          const ap = esperando.get(apId)!;
          const todas = [...(ap.llegadas || []), ...llegadas];
          const completo = !tienePendientes({ ...ap, llegadas: todas });
          const upd: any = { llegadas: todas, updatedAt: ahora };
          // Decisión del dueño (2026-10-27): el plazo de pago de un encargo
          // corre desde que llega la mercadería, no desde que se apartó.
          if (completo) upd.fechaLimite = fechaLimiteDesde(ahora, configApartados.plazoDias);
          transaction.update(doc(db, 'apartados', apId), upd);
          llegadas.forEach(l => {
            const sp = serverProducts.get(l.productId);
            const stockDespues = (stockCorriendo.get(l.productId) || 0) - l.cantidad;
            stockCorriendo.set(l.productId, stockDespues);
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: l.productId, productName: sp?.name, sku: sp?.sku,
              tipo: 'apartado', delta: -l.cantidad, stockDespues,
              refId: apId, fecha: ahora,
              motivo: `Llegó para ${ap.numero} · ${ap.customerName}`.slice(0, 300),
            }));
            asignados.push({
              apartadoId: apId, numero: ap.numero, cliente: ap.customerName,
              producto: sp?.name || nombreEnApartado(ap, l.productId), cantidad: l.cantidad, completo,
            });
          });
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
      return { faltantes, unidadesNoEntraron, asignados, sinReservar };
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchase.id}`);
      return { faltantes: [], unidadesNoEntraron: 0, asignados: [], sinReservar: [] };
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
    /** Encargos que esta caja había reservado y vuelven a esperar mercadería. */
    vuelvenAEncargo: EncargoReservado[];
    /** Apartados que recibieron unidades de esta caja y ya se entregaron o cancelaron. */
    encargosCerrados: string[];
  }> => {
    const vacio = {
      borrados: [], topeados: [], costoSinRevertir: [], costoAproximado: [], vuelvenAEncargo: [], encargosCerrados: [],
    };
    if (!user) return vacio;
    // Se reinician dentro del callback: la transacción puede reintentarse.
    let borrados: string[] = [];
    let topeados: string[] = [];
    let costoSinRevertir: string[] = [];
    let costoAproximado: string[] = [];
    let vuelvenAEncargo: EncargoReservado[] = [];
    let encargosCerrados: string[] = [];
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
        vuelvenAEncargo = [];
        encargosCerrados = [];

        // Los apartados que recibieron algo de esta caja (ver updatePurchase).
        // Como allá: los candidatos de la lista en vivo, leídos por id.
        const idsConLlegadas = apartados
          .filter(a => llegadasDeCaja(a, purchaseId, trackingId).size > 0)
          .map(a => a.id);
        const conLlegadasSnaps = await Promise.all(
          idsConLlegadas.map(id => transaction.get(doc(db, 'apartados', id))),
        );

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

        /*
          Lo que esta caja dejó reservado para clientes se deshace PRIMERO: las
          unidades vuelven al stock al costo con que salieron, y recién ahí la
          reversión de siempre saca la caja entera. Así el stock, el promedio y
          el kardex se mueven como si la reserva nunca hubiera pasado, y el
          encargo vuelve a "esperando mercadería".

          Un apartado que ya se entregó o se canceló no se toca: esas unidades
          se fueron con el cliente o ya volvieron al stock. Se avisa.
        */
        const ahora = Date.now();
        const devueltoDe = new Map<string, { cantidad: number; costo?: number }[]>();
        const reversiones: { ap: Apartado; llegadas: LlegadaEncargo[] }[] = [];
        conLlegadasSnaps.forEach((s, i) => {
          if (!s.exists()) return;
          const ap = { ...(s.data() as Apartado), id: idsConLlegadas[i] };
          const netas = llegadasDeCaja(ap, purchaseId, trackingId);
          if (netas.size === 0) return;
          if (ap.status !== 'activo') {
            encargosCerrados.push(`${ap.numero} (${etiquetaApartado(ap.status).toLowerCase()})`);
            return;
          }
          const llegadas: LlegadaEncargo[] = [];
          netas.forEach(({ cantidad, costoUnitario }, pid) => {
            if (!serverProducts.has(pid)) return; // borrado: no hay a dónde devolverla
            // Sin costo, sin la clave (no `undefined`): así se anula con su
            // llegada en costoDeLinea, que tampoco lo tenía.
            const l = LlegadaEncargoSchema.safeParse({
              productId: pid, cantidad: -cantidad, fecha: ahora, origen: 'reversion',
              ...(typeof costoUnitario === 'number' ? { costoUnitario } : {}),
              compraId: purchaseId, trackingId,
            });
            if (!l.success) throw new Error(`Reversión de la llegada inválida — ${zodErrorMsg(l)}`);
            llegadas.push(l.data);
            devueltoDe.set(pid, [...(devueltoDe.get(pid) || []), { cantidad, costo: costoUnitario }]);
            vuelvenAEncargo.push({
              apartadoId: ap.id, numero: ap.numero, cliente: ap.customerName,
              producto: serverProducts.get(pid)!.name, cantidad, completo: false,
            });
          });
          if (llegadas.length > MAX_LLEGADAS_POR_ESCRITURA) {
            throw new Error(
              `El apartado ${ap.numero} recibió ${llegadas.length} productos distintos de esta caja y ` +
              `no se pueden devolver a encargo de una vez. Avisá al soporte antes de revertir.`,
            );
          }
          if (llegadas.length > 0) reversiones.push({ ap, llegadas });
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
        // Primero los encargos: cada uno recupera su pendiente y su kardex.
        const stockCorriendo = new Map<string, number>();
        serverProducts.forEach((p, pid) => stockCorriendo.set(pid, p.stock || 0));
        reversiones.forEach(({ ap, llegadas }) => {
          transaction.update(doc(db, 'apartados', ap.id), {
            llegadas: [...(ap.llegadas || []), ...llegadas],
            updatedAt: ahora,
          });
          llegadas.forEach(l => {
            const p = serverProducts.get(l.productId)!;
            const stockDespues = (stockCorriendo.get(l.productId) || 0) - l.cantidad; // cantidad < 0
            stockCorriendo.set(l.productId, stockDespues);
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: l.productId, productName: p.name, sku: p.sku,
              tipo: 'liberacion', delta: -l.cantidad, stockDespues,
              refId: ap.id, fecha: ahora,
              motivo: `Recepción revertida: vuelve a encargo ${ap.numero} · ${ap.customerName}`.slice(0, 300),
            }));
          });
        });

        removeByProduct.forEach((qty, pid) => {
          const p = serverProducts.get(pid);
          if (!p) {
            // Producto borrado: no hay stock que ajustar. Se anota para avisar.
            const enCaja = boxItems.find(b => b.itemId === pid);
            borrados.push((serverPurchase.items || []).find(i => i.id === pid)?.name || enCaja?.itemId || pid);
            return;
          }

          // Las unidades que estaban reservadas para un encargo vuelven primero
          // al stock, al costo con que salieron (ver arriba).
          let stockAntes = p.stock || 0;
          let costoAntes = p.cost || 0;
          const devueltas = devueltoDe.get(pid) || [];
          devueltas.forEach(d => {
            // Con el mismo costo, el promedio no se mueve: no se recalcula, para
            // que el camino exacto de costoAlRevertir lo siga reconociendo.
            if (typeof d.costo === 'number' && Math.abs(d.costo - costoAntes) > 1e-9) {
              costoAntes = costoAlRecibir(stockAntes, costoAntes, d.cantidad, d.costo);
            }
            stockAntes += d.cantidad;
          });
          const bruto = stockAntes - qty;
          const newStock = Math.max(0, bruto);
          // El piso en 0 es deliberado, pero significa que se descontó MENOS de
          // lo que decía la caja. Hay que decirlo, igual que en changeSaleStatus.
          if (bruto < 0) topeados.push(p.name);

          const cambios: any = { stock: newStock, updatedAt: Date.now() };
          const unidadesDevueltas = devueltas.reduce((s, d) => s + d.cantidad, 0);
          if (unidadesDevueltas > 0) {
            cambios.apartadas = Math.max(0, (p.apartadas || 0) - unidadesDevueltas);
            cambios.encargadas = (p.encargadas || 0) + unidadesDevueltas;
          }

          /*
            Deshacer el costo promedio. Los dos caminos, sus supuestos y el caso
            que no se puede resolver están en `src/lib/costoPromedio.ts`, con
            trece pruebas en `npm run costo:test` — incluido el ciclo de cinco
            reversiones que antes empujaba el costo hasta el de la última caja.
          */
          const efectoP = efecto.get(pid);
          const reversion = costoAlRevertir(stockAntes, costoAntes, {
            unidades: qty,
            costoUnitarioReal: efectoP?.unitario,
            costoPrevio: efectoP?.previo,
            costoDespues: efectoP?.despues,
            stockDespues: efectoP?.stockDespues,
            lineas: efectoP?.lineas,
          });
          if (reversion.costo === null) {
            costoSinRevertir.push(p.name);
            if (costoAntes !== (p.cost || 0)) cambios.cost = costoAntes;
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
      return { borrados, topeados, costoSinRevertir, costoAproximado, vuelvenAEncargo, encargosCerrados };
    } catch (e) {
      handleFirestoreError(e, 'update', `purchases/${purchaseId}`);
      return vacio;
    }
  };

  // ---------------------------------------------------------------------------
  // Apartados
  // ---------------------------------------------------------------------------
  //
  // Las escrituras de un apartado siguen el patrón de recordSale: Zod antes de
  // escribir, todas las lecturas de la transacción antes de cualquier
  // escritura, e IDEMPOTENCIA explícita. El SDK reintenta solo ante
  // `unavailable` y `deadline-exceeded` volviendo a correr la función, y el
  // operador reintenta a mano cuando el error no dice si se guardó: cobrar un
  // abono dos veces, descontar el stock dos veces o emitir dos facturas por el
  // mismo apartado tiene que ser imposible, no improbable.

  /**
   * Aparta: reserva el stock, consume el correlativo AP-xxxxxx y registra la
   * prima. Devuelve el número asignado.
   *
   * El `id` del apartado nace UNA vez por diálogo, en el POS. Si la transacción
   * falla de forma ambigua y el operador reintenta, cae sobre el mismo
   * documento: la guarda de abajo devuelve el número sin volver a descontar
   * stock ni a consumir otro correlativo.
   */
  /*
    Devuelve también `guardado` cuando el apartado YA EXISTÍA (un reintento
    después de un error ambiguo): entre un intento y otro el operador pudo
    corregir la prima, y el aviso y el comprobante tienen que salir de lo que
    quedó en el servidor, no de lo que se pidió la segunda vez.
  */
  const crearApartado = async (
    nuevo: NuevoApartado,
  ): Promise<{ numero: string; guardado: Apartado | null; encargo: LineaEncargo[] }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const ahora = Date.now();
    const base: any = {
      ...nuevo,
      items: (nuevo.items || []).map(sanitizeApartadoItem),
      anulaciones: [],
      status: 'activo',
      ownerId: 'shared_store',
      updatedAt: ahora,
    };
    Object.keys(base).forEach((k) => base[k] === undefined && delete base[k]);
    // Un correo que la venta final rechazaría no se guarda: ver armarVentaDeApartado.
    if (base.customerEmail !== undefined && !esEmailValido(base.customerEmail)) delete base.customerEmail;

    // Zod sobre una copia con número de relleno: el definitivo se asigna en la
    // transacción, leyendo el contador (mismo truco que recordSale).
    const parsed = ApartadoSchema.safeParse({ ...base, numero: 'AP-PENDIENTE' });
    if (!parsed.success) throw new Error(`Apartado inválido — ${zodErrorMsg(parsed)}`);
    /*
      Se escribe la SALIDA de Zod, no el objeto que llegó. Zod no rechaza una
      clave que no conoce: la deja pasar en la validación y la saca de su
      salida. Si se escribiera el objeto crudo, una clave de más en un abono o
      en una línea llegaría a Firestore, las reglas (que validan con `hasOnly`)
      la rechazarían, y el operador leería "Sin permisos… falta desplegar las
      reglas". Con la salida, lo que se valida es exactamente lo que se escribe.
    */
    const documento: any = { ...parsed.data };

    // Aceptado al apartar ⇒ facturable al entregar: ver armarVentaDeApartado.
    const prueba = SaleSchema.safeParse(
      armarVentaDeApartado({ ...base, numero: 'AP-PENDIENTE' }, { id: 'prueba', invoiceNumber: 'PENDIENTE', fecha: ahora }),
    );
    if (!prueba.success) {
      throw new Error(`Este apartado no se podría facturar al entregarlo — ${zodErrorMsg(prueba)}`);
    }

    const apRef = doc(db, 'apartados', nuevo.id);
    const counterRef = doc(db, 'counters', 'apartados');
    let numero = '';
    let guardado = null as Apartado | null;
    let encargo: LineaEncargo[] = [];
    try {
      await runTransaction(db, async (transaction) => {
        guardado = null;
        encargo = [];
        // 0. IDEMPOTENCIA: si ya existe, el stock ya bajó y el número ya se usó.
        const apSnap = await transaction.get(apRef);
        if (apSnap.exists()) {
          guardado = { ...(apSnap.data() as Apartado), id: nuevo.id };
          numero = String(guardado.numero || '');
          encargo = guardado.encargo || [];
          return;
        }

        // 1. LECTURAS
        const counterSnap = await transaction.get(counterRef);
        const siguiente = ((counterSnap.exists() ? counterSnap.data().value : 0) || 0) + 1;
        numero = numeroApartado(siguiente);

        const porProducto = cantidadesPorProducto(base.items);
        const ids = Array.from(porProducto.keys());
        const snaps = await Promise.all(ids.map((id) => transaction.get(doc(db, 'products', id))));

        // 2. VALIDACIONES
        snaps.forEach((snap, i) => {
          const { name } = porProducto.get(ids[i])!;
          if (!snap.exists()) throw new Error(`El producto ${name} ya no existe en la base de datos.`);
          const fuera = errorCamposFuera(snap.data() as Product & Record<string, unknown>);
          if (fuera) throw fuera;
        });

        /*
          Lo que hay en la tienda se reserva ya; lo que falta queda ENCARGADO.

          Antes esto lanzaba "Stock insuficiente", y la salida que quedaba para
          apartar algo que venía en camino era subir el stock a mano: un stock
          fantasma que el POS podía vender, la tablet mostraba disponible y el
          conteo físico no encontraba. Ahora lo que no está no se descuenta de
          ningún lado: suma a `encargadas` (prometido, no físico) y espera en
          `encargo` a que la recepción de la caja lo reserve.

          Con el stock del SERVIDOR: si alguien vendió la última unidad mientras
          el diálogo estaba abierto, este apartado queda como encargo en vez de
          fallar, y `encargo` vuelve al POS para que lo diga.
        */
        ids.forEach((id, i) => {
          const p = snaps[i].data() as Product;
          const { qty } = porProducto.get(id)!;
          const reservadas = Math.min(Math.max(0, p.stock || 0), qty);
          if (qty - reservadas > 0) encargo.push({ productId: id, cantidad: qty - reservadas });
        });
        const final: any = { ...documento, numero };
        if (encargo.length > 0) final.encargo = encargo;
        // Lo que se escribe es la salida de Zod, ahora con el encargo adentro.
        const revision = ApartadoSchema.safeParse(final);
        if (!revision.success) throw new Error(`Apartado inválido — ${zodErrorMsg(revision)}`);

        // 3. ESCRITURAS
        snaps.forEach((snap, i) => {
          const p = snap.data() as Product;
          const { qty } = porProducto.get(ids[i])!;
          const porLlegar = encargo.find((e) => e.productId === ids[i])?.cantidad || 0;
          const reservadas = qty - porLlegar;
          const stockNuevo = (p.stock || 0) - reservadas;
          const cambios: any = { updatedAt: ahora };
          if (reservadas > 0) {
            cambios.stock = stockNuevo;
            cambios.apartadas = (p.apartadas || 0) + reservadas;
          }
          if (porLlegar > 0) cambios.encargadas = (p.encargadas || 0) + porLlegar;
          transaction.update(doc(db, 'products', ids[i]), cambios);
          // El kardex registra lo que SALIÓ del stock. Lo encargado no estaba.
          if (reservadas > 0) {
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: ids[i], productName: p.name, sku: p.sku,
              tipo: 'apartado', delta: -reservadas, stockDespues: stockNuevo,
              refId: nuevo.id, fecha: ahora,
              motivo: `Apartado ${numero} · ${base.customerName}`.slice(0, 300),
            }));
          }
        });
        transaction.set(counterRef, { value: siguiente, updatedAt: ahora });
        transaction.set(apRef, revision.data);
      });
      return { numero, guardado, encargo };
    } catch (e) {
      console.error('crearApartado', e);
      handleFirestoreError(e, 'create', `apartados/${nuevo.id}`);
      throw e;
    }
  };

  /**
   * Registra un abono. `abono.id` nace al ABRIR el diálogo, no al confirmar: si
   * el error no dice si se guardó y el operador reintenta, la guarda reconoce el
   * abono y no lo cobra dos veces. Devuelve el saldo según el SERVIDOR y si el
   * abono ya estaba registrado.
   */
  const registrarAbono = async (
    apartadoId: string,
    abono: AbonoApartado,
  ): Promise<{ saldoNio: number; yaEstaba: boolean; abono: AbonoApartado }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const limpio: any = { ...abono, montoNio: redondearCordobas(abono.montoNio) };
    const referencia = (abono.referencia || '').trim();
    if (referencia) limpio.referencia = referencia;
    else delete limpio.referencia;
    const parsed = AbonoApartadoSchema.safeParse(limpio);
    if (!parsed.success) throw new Error(`Abono inválido — ${zodErrorMsg(parsed)}`);
    // La salida de Zod, no el objeto crudo: ver el porqué en crearApartado.
    const nuevoAbono = parsed.data;

    const apRef = doc(db, 'apartados', apartadoId);
    let saldo = 0;
    let yaEstaba = false;
    // El abono como quedó: si ya estaba, el GUARDADO, que puede tener otro
    // monto si el operador lo corrigió entre un intento y otro.
    let abonoFinal: AbonoApartado = nuevoAbono;
    try {
      await runTransaction(db, async (transaction) => {
        yaEstaba = false;
        abonoFinal = nuevoAbono;
        const snap = await transaction.get(apRef);
        if (!snap.exists()) throw new Error('El apartado ya no existe.');
        const ap = snap.data() as Apartado;
        const previo = (ap.abonos || []).find((a) => a.id === nuevoAbono.id);
        if (previo) {
          yaEstaba = true;
          abonoFinal = previo;
          saldo = saldoNio(ap);
          return;
        }
        if (ap.status !== 'activo') {
          throw new Error(
            `El apartado ${ap.numero} está ${etiquetaApartado(ap.status).toLowerCase()}: ya no recibe abonos.`,
          );
        }
        // Contra el saldo del SERVIDOR: si otro abono entró en el medio, éste
        // ya no puede pasarse de lo que de verdad falta.
        const error = validarAbono(nuevoAbono.montoNio, saldoNio(ap));
        if (error) throw new Error(error);
        const abonos = [...ap.abonos, nuevoAbono];
        transaction.update(apRef, { abonos, updatedAt: Date.now() });
        saldo = saldoNio({ ...ap, abonos });
      });
      return { saldoNio: saldo, yaEstaba, abono: abonoFinal };
    } catch (e) {
      handleFirestoreError(e, 'update', `apartados/${apartadoId}`);
      throw e;
    }
  };

  /**
   * Anula un abono cargado por error. El abono NO se borra: se agrega una
   * anulación y queda impreso tachado, con el motivo. El cliente puede tener en
   * el teléfono un comprobante con ese abono; el siguiente tiene que explicarlo.
   *
   * Sólo en un apartado activo: uno entregado ya tiene una factura emitida con
   * esos pagos, y uno cancelado ya calculó la devolución sobre ellos.
   */
  const anularAbono = async (
    apartadoId: string,
    abonoId: string,
    motivo: string,
  ): Promise<{ yaEstaba: boolean }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const anulacion = { abonoId, motivo: (motivo || '').trim(), fecha: Date.now() };
    const parsed = AnulacionAbonoSchema.safeParse(anulacion);
    if (!parsed.success) throw new Error(`Anulación inválida — ${zodErrorMsg(parsed)}`);

    const apRef = doc(db, 'apartados', apartadoId);
    let yaEstaba = false;
    try {
      await runTransaction(db, async (transaction) => {
        yaEstaba = false;
        const snap = await transaction.get(apRef);
        if (!snap.exists()) throw new Error('El apartado ya no existe.');
        const ap = snap.data() as Apartado;
        const anulaciones = ap.anulaciones || [];
        if (anulaciones.some((x) => x.abonoId === abonoId)) {
          yaEstaba = true;
          return;
        }
        if (ap.status !== 'activo') {
          throw new Error(
            `El apartado ${ap.numero} está ${etiquetaApartado(ap.status).toLowerCase()}: sus abonos ya no se pueden anular.`,
          );
        }
        if (!(ap.abonos || []).some((a) => a.id === abonoId)) {
          throw new Error('Ese abono no está en el apartado.');
        }
        transaction.update(apRef, { anulaciones: [...anulaciones, anulacion], updatedAt: Date.now() });
      });
      return { yaEstaba };
    } catch (e) {
      handleFirestoreError(e, 'update', `apartados/${apartadoId}`);
      throw e;
    }
  };

  /**
   * Entrega un apartado pagado: emite la factura (RECIBO_OFICIAL, correlativo
   * A-) y lo cierra.
   *
   * NO toca `stock` ni el kardex: las unidades salieron al apartar. Sí baja
   * `apartadas`, porque recién ahora se van de la tienda. Si después esa venta
   * se marca devuelta en el Historial, changeSaleStatus repone el stock, y está
   * bien: las unidades habían salido.
   *
   * Idempotente por dos lados: el id de la venta se DERIVA del apartado, y un
   * apartado ya entregado devuelve la venta que emitió en vez de emitir otra.
   */
  const entregarApartado = async (
    apartadoId: string,
  ): Promise<{ venta: Sale | null; yaEstaba: boolean; borrados: string[] }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    try {
      await sembrarContadorFacturas();
    } catch (e) {
      avisarFallaSiembra(e);
    }

    const apRef = doc(db, 'apartados', apartadoId);
    const saleId = idVentaDeApartado(apartadoId);
    const saleRef = doc(db, 'sales', saleId);
    const counterRef = doc(db, 'counters', 'invoices');
    // Las fotos salen del catálogo en memoria: es sólo para que la factura las
    // imprima, no decide nada.
    const imagenes = new Map<string, string>();
    products.forEach((p) => { if (p.imageBase64) imagenes.set(p.id, p.imageBase64); });

    // `as`: sin él TypeScript angosta estas variables a su valor inicial y no
    // ve las asignaciones que hace el callback de la transacción.
    let venta = null as Sale | null;
    let yaEstaba = false;
    let borrados: string[] = [];
    try {
      await runTransaction(db, async (transaction) => {
        venta = null;
        yaEstaba = false;
        borrados = [];

        // 1. LECTURAS
        const apSnap = await transaction.get(apRef);
        if (!apSnap.exists()) throw new Error('El apartado ya no existe.');
        const ap = { ...(apSnap.data() as Apartado), id: apartadoId };
        if (ap.status === 'cancelado') {
          throw new Error(`El apartado ${ap.numero} está cancelado: no se puede entregar.`);
        }
        const saleSnap = await transaction.get(saleRef);
        if (ap.status === 'entregado') {
          yaEstaba = true;
          venta = saleSnap.exists() ? ({ ...(saleSnap.data() as Sale), id: saleId }) : null;
          return;
        }
        // Con el saldo del SERVIDOR: la pantalla pudo haber quedado vieja.
        if (!saleSnap.exists() && !estaPagado(ap)) {
          throw new Error(
            `Falta cobrar ${formatCurrencyNIO(saldoNio(ap))} del apartado ${ap.numero}: ` +
            `se entrega con el saldo en cero.`,
          );
        }
        // Un encargo se entrega cuando llegó todo: lo que falta no está en la
        // tienda, y la factura diría que se entregó.
        const faltan = pendientesDe(ap);
        if (!saleSnap.exists() && faltan.size > 0) {
          const lista = Array.from(faltan, ([pid, n]) => `${n} × ${nombreEnApartado(ap, pid)}`).join(', ');
          throw new Error(`Todavía no llegó ${lista} del apartado ${ap.numero}: se entrega cuando esté todo en la tienda.`);
        }
        const porProducto = cantidadesPorProducto(ap.items);
        const ids = Array.from(porProducto.keys());
        const snaps = await Promise.all(ids.map((id) => transaction.get(doc(db, 'products', id))));
        const counterSnap = saleSnap.exists() ? null : await transaction.get(counterRef);

        // 2. VALIDACIONES
        snaps.forEach((snap) => {
          if (!snap.exists()) return;
          const fuera = errorCamposFuera(snap.data() as Product & Record<string, unknown>);
          if (fuera) throw fuera;
        });
        const ahora = Date.now();
        let v: Sale;
        if (saleSnap.exists()) {
          // Las dos escrituras van en la misma transacción, así que esto no
          // debería pasar. Si pasa (un script, un import a mano), la factura ya
          // existe: no se emite otra, sólo se cierra el apartado.
          v = { ...(saleSnap.data() as Sale), id: saleId };
          yaEstaba = true;
        } else {
          const siguiente = ((counterSnap?.exists() ? counterSnap.data().value : 0) || 0) + 1;
          /*
            El costo de cada línea es el de sus unidades reservadas: las que
            salieron del stock al apartar, al costo de ese día, y las que
            llegaron después, al de la caja que las trajo (costoDeLinea). El
            margen de Reportes sale de este número; con el del día que se apartó,
            un encargo que llegó más caro declararía una ganancia que no existe.
          */
          const partes = partesDeApartado(ap);
          const conCosto = {
            ...ap,
            items: ap.items.map((i) => {
              const c = partes.get(i.id)?.costo;
              return typeof c === 'number' ? { ...i, cost: c } : i;
            }),
          };
          v = armarVentaDeApartado(conCosto, {
            id: saleId,
            invoiceNumber: `A-${String(siguiente).padStart(6, '0')}`,
            fecha: ahora,
            imagenes,
          });
          const revision = SaleSchema.safeParse(v);
          if (!revision.success) {
            throw new Error(`La factura del apartado ${ap.numero} no pasa la validación — ${zodErrorMsg(revision)}`);
          }
          // 3. ESCRITURAS (venta y contador)
          transaction.set(counterRef, { value: siguiente, updatedAt: ahora });
          transaction.set(saleRef, v);
        }

        // 3. ESCRITURAS (productos y apartado)
        snaps.forEach((snap, i) => {
          const { qty, name } = porProducto.get(ids[i])!;
          if (!snap.exists()) {
            // Producto borrado: no hay `apartadas` que bajar. Se avisa; la
            // factura igual sale, porque las unidades se entregan igual.
            borrados.push(name);
            return;
          }
          const p = snap.data() as Product;
          transaction.update(doc(db, 'products', ids[i]), {
            apartadas: Math.max(0, (p.apartadas || 0) - qty),
            updatedAt: ahora,
          });
        });
        transaction.update(apRef, {
          status: 'entregado',
          saleId,
          invoiceNumber: v.invoiceNumber,
          entregadoEn: ahora,
          updatedAt: ahora,
        });
        venta = v;
      });
      return { venta, yaEstaba, borrados };
    } catch (e) {
      console.error('entregarApartado', e);
      handleFirestoreError(e, 'create', `sales/${saleId}`);
      throw e;
    }
  };

  /**
   * Cancela un apartado: las unidades vuelven al stock (kardex `liberacion`) y
   * queda escrito cuánto se le devolvió al cliente. Eso se decide en cada caso,
   * de 0 a todo lo abonado (decisión del dueño, 2026-10-26).
   *
   * Las unidades vuelven al COSTO con que salieron —el `cost` congelado en la
   * línea—, no al promedio de hoy: si en el medio entró una caja a otro costo,
   * el promedio se recalcula con `costoAlRecibir` como en cualquier entrada.
   * Con plazos de 30 días eso es mucho más probable que en una devolución del
   * mismo día.
   *
   * Un producto borrado no se puede reponer: se saltea y se devuelve en
   * `borrados`, igual que en changeSaleStatus. (Borrar un producto con unidades
   * apartadas está bloqueado; esto cubre lo que haya pasado por otro lado.)
   */
  const cancelarApartado = async (
    apartadoId: string,
    datos: { devueltoNio: number; motivo?: string },
  ): Promise<{ borrados: string[]; yaEstaba: boolean; devueltoNio: number }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const apRef = doc(db, 'apartados', apartadoId);
    const devuelto = redondearCordobas(datos.devueltoNio);
    const motivo = (datos.motivo || '').trim().slice(0, 300);
    let borrados: string[] = [];
    let yaEstaba = false;
    // Lo que QUEDÓ registrado como devuelto. En un reintento puede no ser lo
    // que se pidió esta vez, y la pantalla tiene que decirlo: es plata que ya
    // salió del cajón.
    let devueltoFinal = devuelto;
    try {
      await runTransaction(db, async (transaction) => {
        borrados = [];
        yaEstaba = false;
        devueltoFinal = devuelto;

        // 1. LECTURAS
        const snap = await transaction.get(apRef);
        if (!snap.exists()) throw new Error('El apartado ya no existe.');
        const ap = snap.data() as Apartado;
        if (ap.status === 'cancelado') {
          yaEstaba = true;
          devueltoFinal = ap.devueltoNio ?? 0;
          return;
        }
        if (ap.status === 'entregado') {
          throw new Error(
            `El apartado ${ap.numero} ya se entregó con la factura ${ap.invoiceNumber || ''}. ` +
            `Si el cliente devuelve el producto, anulá esa factura en el Historial.`,
          );
        }
        // Contra lo abonado según el SERVIDOR.
        const errorDevolucion = validarDevolucion(devuelto, abonadoNio(ap));
        if (errorDevolucion) throw new Error(errorDevolucion);

        // Cada producto partido en lo que está en la tienda (vuelve al stock) y
        // lo que todavía no llegó (sólo deja de estar prometido).
        const partes = partesDeApartado(ap);
        const ids = Array.from(partes.keys());
        const snaps = await Promise.all(ids.map((id) => transaction.get(doc(db, 'products', id))));

        // 2. VALIDACIONES
        snaps.forEach((s) => {
          if (!s.exists()) return;
          const fuera = errorCamposFuera(s.data() as Product & Record<string, unknown>);
          if (fuera) throw fuera;
        });

        // 3. ESCRITURAS
        const ahora = Date.now();
        snaps.forEach((s, i) => {
          const parte = partes.get(ids[i])!;
          if (!s.exists()) {
            if (parte.reservadas > 0) borrados.push(nombreEnApartado(ap, ids[i]));
            return;
          }
          const p = s.data() as Product;
          const cambios: any = { updatedAt: ahora };
          if (parte.reservadas > 0) {
            const stockAntes = p.stock || 0;
            const stockNuevo = stockAntes + parte.reservadas;
            cambios.stock = stockNuevo;
            cambios.apartadas = Math.max(0, (p.apartadas || 0) - parte.reservadas);
            // Al costo con que salieron —el de la línea, o el de la caja que las
            // trajo si eran de un encargo—: ver partesDeApartado.
            const costo = parte.costo;
            if (typeof costo === 'number' && Number.isFinite(costo) && costo >= 0) {
              cambios.cost = costoAlRecibir(stockAntes, p.cost || 0, parte.reservadas, costo);
            }
            transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
              productId: ids[i], productName: p.name, sku: p.sku,
              tipo: 'liberacion', delta: parte.reservadas, stockDespues: stockNuevo,
              refId: apartadoId, fecha: ahora,
              motivo: `Apartado ${ap.numero} cancelado${motivo ? ` · ${motivo}` : ''}`.slice(0, 300),
            }));
          }
          // Lo que no llegó no estaba en la tienda: no vuelve a ningún stock,
          // sólo deja de estar prometido. Si después llega, queda a la venta.
          if (parte.pendiente > 0) cambios.encargadas = Math.max(0, (p.encargadas || 0) - parte.pendiente);
          transaction.update(doc(db, 'products', ids[i]), cambios);
        });
        const cierre: any = { status: 'cancelado', canceladoEn: ahora, devueltoNio: devuelto, updatedAt: ahora };
        if (motivo) cierre.motivoCancelacion = motivo;
        transaction.update(apRef, cierre);
      });
      return { borrados, yaEstaba, devueltoNio: devueltoFinal };
    } catch (e) {
      handleFirestoreError(e, 'update', `apartados/${apartadoId}`);
      throw e;
    }
  };

  /**
   * Reserva para un encargo unidades que aparecieron en el stock por otro
   * camino que su caja: una devolución, un apartado cancelado, un ajuste, o
   * una recepción que no lo alcanzó. Lo que la recepción hace sola, pero a
   * pedido, desde la pantalla de Apartados.
   *
   * Con el stock del SERVIDOR, al costo promedio de hoy (es el costo con que
   * sale cualquier unidad del stock) y como mucho lo que haya: si falta, queda
   * esperando. Si con esto llegó todo, el plazo de pago empieza a correr hoy.
   */
  const reservarEncargo = async (
    apartadoId: string,
  ): Promise<{ reservadas: { producto: string; cantidad: number }[]; completo: boolean; faltan: string[] }> => {
    if (!user) throw new Error('Sesión no iniciada.');
    const apRef = doc(db, 'apartados', apartadoId);
    let reservadas: { producto: string; cantidad: number }[] = [];
    let completo = false;
    let faltan: string[] = [];
    try {
      await runTransaction(db, async (transaction) => {
        reservadas = [];
        completo = false;
        faltan = [];

        // 1. LECTURAS
        const snap = await transaction.get(apRef);
        if (!snap.exists()) throw new Error('El apartado ya no existe.');
        const ap = { ...(snap.data() as Apartado), id: apartadoId };
        if (ap.status !== 'activo') {
          throw new Error(`El apartado ${ap.numero} está ${etiquetaApartado(ap.status).toLowerCase()}.`);
        }
        const pendientes = pendientesDe(ap);
        if (pendientes.size === 0) {
          completo = true;
          return;
        }
        const ids = Array.from(pendientes.keys());
        const snaps = await Promise.all(ids.map((id) => transaction.get(doc(db, 'products', id))));

        // 2. VALIDACIONES Y CÁLCULOS
        snaps.forEach((s) => {
          if (!s.exists()) return;
          const fuera = errorCamposFuera(s.data() as Product & Record<string, unknown>);
          if (fuera) throw fuera;
        });
        const ahora = Date.now();
        const nuevas: LlegadaEncargo[] = [];
        const porProducto: { id: string; p: Product; cantidad: number }[] = [];
        snaps.forEach((s, i) => {
          const pid = ids[i];
          const falta = pendientes.get(pid)!;
          if (!s.exists()) {
            faltan.push(nombreEnApartado(ap, pid));
            return;
          }
          const p = s.data() as Product;
          const cantidad = Math.min(falta, Math.max(0, p.stock || 0));
          if (cantidad <= 0 || nuevas.length >= MAX_LLEGADAS_POR_ESCRITURA) {
            faltan.push(p.name);
            return;
          }
          if (cantidad < falta) faltan.push(p.name);
          const l = LlegadaEncargoSchema.safeParse({
            productId: pid, cantidad, fecha: ahora, origen: 'stock', costoUnitario: p.cost || 0,
          });
          if (!l.success) throw new Error(`Llegada inválida — ${zodErrorMsg(l)}`);
          nuevas.push(l.data);
          porProducto.push({ id: pid, p, cantidad });
          reservadas.push({ producto: p.name, cantidad });
        });
        if (nuevas.length === 0) return;

        // 3. ESCRITURAS
        porProducto.forEach(({ id, p, cantidad }) => {
          const stockNuevo = (p.stock || 0) - cantidad;
          transaction.update(doc(db, 'products', id), {
            stock: stockNuevo,
            apartadas: (p.apartadas || 0) + cantidad,
            encargadas: Math.max(0, (p.encargadas || 0) - cantidad),
            updatedAt: ahora,
          });
          transaction.set(doc(collection(db, 'movimientos')), buildMovimiento({
            productId: id, productName: p.name, sku: p.sku,
            tipo: 'apartado', delta: -cantidad, stockDespues: stockNuevo,
            refId: apartadoId, fecha: ahora,
            motivo: `Reservado del stock para ${ap.numero} · ${ap.customerName}`.slice(0, 300),
          }));
        });
        const llegadas = [...(ap.llegadas || []), ...nuevas];
        completo = !tienePendientes({ ...ap, llegadas });
        const upd: any = { llegadas, updatedAt: ahora };
        // Decisión del dueño: el plazo de un encargo corre desde que está todo.
        if (completo) upd.fechaLimite = fechaLimiteDesde(ahora, configApartados.plazoDias);
        transaction.update(apRef, upd);
      });
      return { reservadas, completo, faltan };
    } catch (e) {
      handleFirestoreError(e, 'update', `apartados/${apartadoId}`);
      throw e;
    }
  };

  /**
   * Lo único que se edita de un apartado ya creado: la fecha límite (sólo si
   * está activo), la nota y el teléfono de contacto. Se escriben SÓLO esos
   * campos —nunca el array de abonos—, así que no pisan un abono que se esté
   * registrando en el mismo momento. Lo pactado (líneas, total, tasa) no se
   * toca: las reglas no lo dejan.
   */
  const actualizarApartado = async (
    apartadoId: string,
    cambios: { fechaLimite?: number; notes?: string; customerPhone?: string },
  ) => {
    if (!user) return;
    const limpio: any = { ...cambios };
    Object.keys(limpio).forEach((k) => limpio[k] === undefined && delete limpio[k]);
    if (typeof limpio.customerPhone === 'string') limpio.customerPhone = limpio.customerPhone.trim();
    if (Object.keys(limpio).length === 0) return;
    const parsed = ActualizacionApartadoSchema.safeParse(limpio);
    if (!parsed.success) throw new Error(`Cambio inválido — ${zodErrorMsg(parsed)}`);

    const actual = apartados.find((a) => a.id === apartadoId);
    if (actual && actual.status !== 'activo' && 'fechaLimite' in limpio) {
      throw new Error(
        `El apartado ${actual.numero} está ${etiquetaApartado(actual.status).toLowerCase()}: su fecha límite ya no se mueve.`,
      );
    }
    if (actual && typeof limpio.fechaLimite === 'number' && limpio.fechaLimite < actual.fecha) {
      throw new Error('La fecha límite no puede ser anterior al día en que se apartó.');
    }
    try {
      await updateDoc(doc(db, 'apartados', apartadoId), { ...limpio, updatedAt: Date.now() });
    } catch (e) {
      handleFirestoreError(e, 'update', `apartados/${apartadoId}`);
    }
  };

  /** Política de apartados (doc `config/apartados`): prima mínima y plazo. */
  const guardarConfigApartados = async (config: ConfigApartados) => {
    if (!user) return;
    const paraGuardar = {
      primaMinimaPct: config.primaMinimaPct,
      plazoDias: config.plazoDias,
      actualizadoEn: Date.now(),
    };
    const parsed = ConfigApartadosSchema.safeParse(paraGuardar);
    if (!parsed.success) throw new Error(`Política inválida — ${zodErrorMsg(parsed)}`);
    try {
      await setDoc(doc(db, 'config', 'apartados'), paraGuardar);
    } catch (e) {
      handleFirestoreError(e, 'write', 'config/apartados');
    }
  };

  /**
   * Una venta por id, aunque esté fuera de la ventana de 100 en vivo: la
   * factura de un apartado entregado hace meses también se reimprime.
   */
  const fetchVenta = async (saleId: string): Promise<Sale | null> => {
    if (!user) return null;
    const enMemoria = [...sales, ...olderSales].find((s) => s.id === saleId);
    if (enMemoria) return enMemoria;
    try {
      const snap = await getDoc(doc(db, 'sales', saleId));
      return snap.exists() ? ({ ...(snap.data() as Sale), id: snap.id }) : null;
    } catch (e) {
      handleFirestoreError(e, 'get', `sales/${saleId}`);
      return null;
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
    /*
      Lo apartado sigue siendo inventario de la tienda hasta que se entrega, pero
      ya no está en `stock`. Sin sumarlo, cuatro apartados de un proyector de
      US$95 hacían desaparecer US$380 del valor de inventario durante todo el
      plazo, sin haber entrado tampoco al costo de ventas: no estaban en
      ninguna parte. Se valúa al costo con que salió del stock, que quedó
      congelado en la línea del apartado.
    */
    // Sólo las unidades RESERVADAS: lo encargado que no llegó no está en la
    // tienda, y sumarlo inflaba el inventario con mercadería que no se pagó.
    const totalApartadoValue = apartados
      .filter((a) => a.status === 'activo')
      .reduce((acc, a) => {
        let valor = 0;
        partesDeApartado(a).forEach((parte) => { valor += (parte.costo || 0) * parte.reservadas; });
        return acc + valor;
      }, 0);
    return {
      totalProducts: products.length,
      // Valor de inventario A COSTO (no a precio de venta); guards contra docs viejos sin cost/stock.
      totalStockValue:
        products.reduce((acc, p) => acc + ((p.cost || 0) * (p.stock || 0)), 0) + totalApartadoValue,
      totalApartadoValue,
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
  }, [products, sales, apartados]);

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
    // Apartados
    apartados,
    apartadosCargados,
    configApartados,
    crearApartado,
    registrarAbono,
    anularAbono,
    entregarApartado,
    cancelarApartado,
    reservarEncargo,
    actualizarApartado,
    guardarConfigApartados,
    fetchVenta,
    refreshMetrics: () => {}
  };
}
