import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Eye,
  FileText,
  HandCoins,
  Loader2,
  MessageCircle,
  PackageCheck,
  Phone,
  Plus,
  Printer,
  Search,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { AbonoApartado, Apartado, Customer, Sale } from '../types';
import {
  abonadoNio,
  cajaEntre,
  estadoVisible,
  progresoPct,
  redondearCordobas,
  saldoNio,
  ultimoAbonoEn,
  type EstadoVisible,
} from '../lib/apartados';
import {
  TRANSPORTES_CON_ETIQUETA,
  buildInvoiceDataFromApartado,
  buildInvoiceDataFromSale,
  buildWhatsAppApartado,
  buildWhatsAppMessage,
} from '../lib/invoice';
import { etiquetaApartado, etiquetaMetodo } from '../lib/etiquetas';
import { formatCurrencyNIO } from '../lib/utils';
import { downloadCsv, toCsv } from '../lib/csv';
import { idVentaDeApartado } from '../hooks/useStoreData';
import InvoicePreview from '../components/InvoicePreview';
import ShippingLabelPreview from '../components/ShippingLabelPreview';
import { toast } from '../components/Toast';
import ApartadoDetalle, { type CambiosApartado } from '../components/ApartadoDetalle';
import { DialogoAbonar, DialogoAnularAbono, DialogoCancelar, DialogoEntregar } from '../components/ApartadoDialogos';
import {
  BadgeEstado,
  BarraProgreso,
  diasDesde,
  plazoDe,
  plural,
  resumenProductos,
  telefonoDeFicha,
  telefonoVigente,
  textoEstado,
  textoPagado,
} from '../components/ApartadoPiezas';

/*
  Apartados: lo que los clientes reservaron dejando una prima, lo que falta
  cobrar, lo que ya se puede entregar.

  Un apartado se CREA en el POS (F4), porque arranca de un carrito. Acá se
  cobra, se entrega y se cancela. Esta pantalla es la única que muestra la plata
  que la tienda tiene de clientes que todavía no compraron nada.
*/

const C$ = formatCurrencyNIO;

type Pestana = 'activos' | 'vencidos' | 'listos' | 'entregados' | 'cancelados' | 'todos';

const PESTANAS: { valor: Pestana; texto: string }[] = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'vencidos', texto: 'Vencidos' },
  { valor: 'listos', texto: 'Listos' },
  { valor: 'entregados', texto: 'Entregados' },
  { valor: 'cancelados', texto: 'Cancelados' },
  { valor: 'todos', texto: 'Todos' },
];

/** "Activos" son los que siguen abiertos: con saldo, vencidos o pagados sin retirar. */
const EN_PESTANA: Record<Pestana, (e: EstadoVisible) => boolean> = {
  activos: (e) => e === 'activo' || e === 'vencido' || e === 'listo',
  vencidos: (e) => e === 'vencido',
  listos: (e) => e === 'listo',
  entregados: (e) => e === 'entregado',
  cancelados: (e) => e === 'cancelado',
  todos: () => true,
};

const VACIO: Record<Pestana, string> = {
  activos: 'No hay apartados abiertos: nadie tiene productos reservados ahora.',
  vencidos: 'Ningún apartado pasó su fecha límite.',
  listos: 'No hay apartados pagados esperando que los retiren.',
  entregados: 'Todavía no se entregó ningún apartado.',
  cancelados: 'No hay apartados cancelados.',
  todos: 'Todavía no hay apartados.',
};

interface Fila {
  ap: Apartado;
  visible: EstadoVisible;
  saldo: number;
}

/** Lo que se abre encima de todo: abonar, anular un abono, entregar o cancelar. */
type Accion =
  | { tipo: 'abonar'; apartadoId: string; abonoId: string }
  | { tipo: 'anular'; apartadoId: string; abonoId: string }
  | { tipo: 'entregar'; apartadoId: string }
  | { tipo: 'cancelar'; apartadoId: string };

type VistaPrevia =
  | { tipo: 'comprobante'; apartadoId: string; abonoLocal?: AbonoApartado }
  | { tipo: 'factura'; venta: Sale; totalNio: number; conEtiqueta: boolean };

// ---------------------------------------------------------------------------
// Búsqueda y orden
// ---------------------------------------------------------------------------

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soloDigitos = (s?: string) => (s || '').replace(/\D/g, '');

/**
 * Por número, por nombre (sin importar tildes) o por teléfono. El teléfono se
 * busca por sus dígitos —"8888-1234", "8888 1234" y "+505 88881234" son el
 * mismo— y en los DOS que puede tener el cliente: el que se guardó al apartar y
 * el vigente de su ficha, que es al que se le escribe.
 */
function coincide(ap: Apartado, q: string, telFicha?: string): boolean {
  const nq = normalizar(q);
  if (!nq) return true;
  if (normalizar(ap.numero).includes(nq)) return true;
  // "AP-12", "ap12" y "AP 12" son el AP-000012: nadie tipea los ceros.
  const numero = /^ap[-\s]?0*(\d+)$/.exec(nq);
  if (numero && Number(soloDigitos(ap.numero)) === Number(numero[1])) return true;
  if (normalizar(ap.customerName || '').includes(nq)) return true;
  const dq = soloDigitos(q);
  if (dq.length >= 4 && !/[a-z]/i.test(q)) {
    if (soloDigitos(ap.customerPhone).includes(dq)) return true;
    if (telFicha && soloDigitos(telFicha).includes(dq)) return true;
  }
  return false;
}

const desdeQuePago = (ap: Apartado) => ultimoAbonoEn(ap) ?? ap.fecha;
const RANGO_ABIERTOS: Partial<Record<EstadoVisible, number>> = { vencido: 0, listo: 1, activo: 2 };

/*
  Cada pestaña en el orden en que hay que atender. En "Activos": primero los
  vencidos (el más atrasado arriba), después los pagados sin retirar (el que más
  espera arriba: la tienda le debe el producto) y al final los que están en
  plazo, el que vence antes arriba. Los cerrados, el más reciente primero.
*/
function ordenar(lista: Fila[], pestana: Pestana): Fila[] {
  const copia = [...lista];
  switch (pestana) {
    case 'activos':
      return copia.sort(
        (x, y) =>
          (RANGO_ABIERTOS[x.visible] ?? 9) - (RANGO_ABIERTOS[y.visible] ?? 9) ||
          (x.visible === 'listo'
            ? desdeQuePago(x.ap) - desdeQuePago(y.ap)
            : x.ap.fechaLimite - y.ap.fechaLimite),
      );
    case 'vencidos':
      return copia.sort((x, y) => x.ap.fechaLimite - y.ap.fechaLimite);
    case 'listos':
      return copia.sort((x, y) => desdeQuePago(x.ap) - desdeQuePago(y.ap));
    case 'entregados':
      return copia.sort((x, y) => (y.ap.entregadoEn ?? y.ap.updatedAt) - (x.ap.entregadoEn ?? x.ap.updatedAt));
    case 'cancelados':
      return copia.sort((x, y) => (y.ap.canceladoEn ?? y.ap.updatedAt) - (x.ap.canceladoEn ?? x.ap.updatedAt));
    default:
      return copia; // Ya vienen por fecha, el más nuevo primero.
  }
}

/** El apartado con este abono, si todavía no lo tiene. */
const conAbono = (ap: Apartado, abono: AbonoApartado): Apartado =>
  (ap.abonos || []).some((a) => a.id === abono.id) ? ap : { ...ap, abonos: [...(ap.abonos || []), abono] };

const listaNombres = (nombres: string[]) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

/**
 * La hora, refrescada cada minuto. "Vence hoy", "vencido" y los días de espera
 * dependen de ella, y esta pantalla se deja abierta todo el día: sin esto, a
 * medianoche nada cambiaba hasta que alguien tocara algo.
 */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return ahora;
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function Apartados() {
  const {
    apartados,
    apartadosCargados,
    customers,
    products,
    companyInfo,
    registrarAbono,
    anularAbono,
    entregarApartado,
    cancelarApartado,
    actualizarApartado,
    fetchVenta,
  } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const qUrl = params.get('q');
  const ahora = useAhora();

  // `?q=AP-000012` precarga la búsqueda (los links desde el POS, el inventario
  // o una factura). Va a "Todos": un apartado entregado no está en "Activos", y
  // el link llevaría a una lista vacía.
  const [busqueda, setBusqueda] = useState(() => qUrl ?? '');
  const [pestana, setPestana] = useState<Pestana>(() => (qUrl ? 'todos' : 'activos'));
  useEffect(() => {
    if (qUrl === null) return;
    setBusqueda(qUrl);
    setPestana('todos');
  }, [qUrl, location.key]);

  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [preview, setPreview] = useState<VistaPrevia | null>(null);
  const [etiqueta, setEtiqueta] = useState<Sale | null>(null);
  /*
    `reservada`: la pantalla está tomada por un diálogo de afuera (el
    comprobante, la factura o la etiqueta). Mientras tanto, el detalle queda
    inactivo. Es un estado propio, y no "hay preview", por el orden en que hay
    que abrirlos: ver `abrirEncima`.
  */
  const [reservada, setReservada] = useState(false);
  const [buscandoFactura, setBuscandoFactura] = useState<string | null>(null);

  // ¿Sigue montada esta pantalla? El botón de un aviso se puede apretar desde
  // otra pantalla, y ahí las funciones de ésta ya no hacen nada.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // Lo último que se sabe, para los avisos con botón: el botón se aprieta
  // segundos o minutos después de crearse el aviso, con otro estado.
  const apartadosRef = useRef(apartados);
  const capasRef = useRef({ accion, preview, etiqueta });
  useEffect(() => {
    apartadosRef.current = apartados;
  }, [apartados]);
  useEffect(() => {
    capasRef.current = { accion, preview, etiqueta };
  }, [accion, preview, etiqueta]);

  const fichas = useMemo(() => new Map<string, Customer>(customers.map((c) => [c.id, c])), [customers]);

  const filas = useMemo<Fila[]>(
    () => apartados.map((ap) => ({ ap, visible: estadoVisible(ap, ahora), saldo: saldoNio(ap) })),
    [apartados, ahora],
  );

  const q = busqueda.trim();
  const coincidentes = useMemo(
    () => (q ? filas.filter((f) => coincide(f.ap, q, telefonoDeFicha(f.ap, fichas))) : filas),
    [filas, q, fichas],
  );
  const conteos = useMemo(() => {
    const c = {} as Record<Pestana, number>;
    for (const { valor } of PESTANAS) c[valor] = coincidentes.filter((f) => EN_PESTANA[valor](f.visible)).length;
    return c;
  }, [coincidentes]);
  const visibles = useMemo(
    () => ordenar(coincidentes.filter((f) => EN_PESTANA[pestana](f.visible)), pestana),
    [coincidentes, pestana],
  );

  const kpis = useMemo(() => {
    let porCobrar = 0;
    let conSaldo = 0;
    let vencidos = 0;
    let saldoVencido = 0;
    let listos = 0;
    let listoMasViejo: number | null = null;
    for (const f of filas) {
      if (f.visible === 'activo' || f.visible === 'vencido') {
        porCobrar += f.saldo;
        conSaldo++;
      }
      if (f.visible === 'vencido') {
        vencidos++;
        saldoVencido += f.saldo;
      }
      if (f.visible === 'listo') {
        listos++;
        const desde = desdeQuePago(f.ap);
        if (listoMasViejo === null || desde < listoMasViejo) listoMasViejo = desde;
      }
    }
    const inicio = new Date(ahora);
    inicio.setHours(0, 0, 0, 0);
    const fin = new Date(ahora);
    fin.setHours(23, 59, 59, 999);
    return {
      porCobrar: redondearCordobas(porCobrar),
      conSaldo,
      vencidos,
      saldoVencido: redondearCordobas(saldoVencido),
      listos,
      listoMasViejo,
      caja: cajaEntre(apartados, inicio.getTime(), fin.getTime()),
    };
  }, [filas, apartados, ahora]);

  const apDe = (id: string | null | undefined) => (id ? apartados.find((a) => a.id === id) : undefined);
  const apDetalle = apDe(detalleId);
  const apAccion = apDe(accion?.apartadoId);

  // -------------------------------------------------------------------------
  // Capas: detalle → acción → comprobante/factura → etiqueta
  // -------------------------------------------------------------------------

  /*
    Abre algo de los que toman el foco con `autoFocus` (InvoicePreview,
    ShippingLabelPreview). `autoFocus` corre ANTES que los efectos, y si en el
    mismo commit se cierra o se tapa un diálogo nuestro, la limpieza de su
    trampa de foco le devuelve el foco a la tarjeta de atrás y se lo saca al
    comprobante recién abierto: un Enter apretaría un botón que no se ve. Por
    eso los nuestros se cierran/tapan primero, en un commit propio, y recién
    después se monta el otro.
  */
  const abrirEncima = (montar: () => void) => {
    flushSync(() => {
      setAccion(null);
      setReservada(true);
    });
    montar();
  };

  const cerrarPreview = () => {
    if (preview?.tipo === 'factura' && preview.conEtiqueta) {
      // La etiqueta, recién cuando el operador cierra la factura (como en el
      // POS): no debajo de ella. También toma el foco con autoFocus, así que
      // la factura se desmonta en su propio commit.
      const venta = preview.venta;
      flushSync(() => setPreview(null));
      setEtiqueta(venta);
      return;
    }
    setPreview(null);
    setReservada(false);
  };

  const cerrarEtiqueta = () => {
    setEtiqueta(null);
    setReservada(false);
  };

  // -------------------------------------------------------------------------
  // Aperturas
  // -------------------------------------------------------------------------

  // El id del abono nace al ABRIR: los reintentos de este diálogo usan el
  // mismo, y uno nuevo nace sólo al volver a abrirlo.
  //
  // Por eso hace falta acordarse del último intento que FALLÓ. Si la red se
  // cae justo al registrar, el servidor puede haber guardado el abono aunque
  // el diálogo diga error; si el operador cierra y vuelve a abrir, el id es
  // nuevo y el mismo pago se cobraría DOS veces. Es la misma guarda que tiene
  // el POS al apartar: no se adivina, se dice qué pasó y decide el operador.
  const intentoAbono = useRef<{ apartadoId: string; abonoId: string; montoNio: number } | null>(null);
  const abrirAbono = (ap: Apartado) => {
    const anterior = intentoAbono.current;
    if (anterior && anterior.apartadoId === ap.id && (ap.abonos || []).some((a) => a.id === anterior.abonoId)) {
      intentoAbono.current = null;
      toast.error(
        `El intento anterior SÍ registró el abono de ${C$(anterior.montoNio)} en ${ap.numero}. ` +
          `Saldo: ${C$(saldoNio(ap))}. Si el cliente te dio otro pago, apretá Abonar de nuevo.`,
      );
      return;
    }
    intentoAbono.current = null;
    setAccion({ tipo: 'abonar', apartadoId: ap.id, abonoId: uuidv4() });
  };
  const abrirAnular = (ap: Apartado, abono: AbonoApartado) =>
    setAccion({ tipo: 'anular', apartadoId: ap.id, abonoId: abono.id });
  const abrirEntrega = (ap: Apartado) => setAccion({ tipo: 'entregar', apartadoId: ap.id });
  const abrirCancelar = (ap: Apartado) => setAccion({ tipo: 'cancelar', apartadoId: ap.id });
  const cerrarAccion = () => setAccion(null);

  const verComprobante = (ap: Apartado) =>
    abrirEncima(() => setPreview({ tipo: 'comprobante', apartadoId: ap.id }));

  /** El recordatorio de saldo va sólo con texto: no hay PDF que adjuntar. */
  const recordar = (ap: Apartado) => {
    const tel = telefonoVigente(ap, fichas);
    const { link } = buildWhatsAppApartado(ap, 'recordatorio', tel);
    if (!link) {
      toast.error(
        `El teléfono de ${ap.numero} (${tel || 'vacío'}) no sirve para WhatsApp: tiene que tener 8 dígitos. ` +
          'Corregilo en el detalle del apartado.',
      );
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  /** Con saldo, el recordatorio; si no, el comprobante, que se manda con el PDF desde el preview. */
  const enviarWhatsApp = (ap: Apartado, visible: EstadoVisible) => {
    if (visible === 'activo' || visible === 'vencido') recordar(ap);
    else verComprobante(ap);
  };

  const verFactura = async (ap: Apartado) => {
    if (buscandoFactura) return;
    setBuscandoFactura(ap.id);
    try {
      // `saleId` lo escribe la entrega; el id derivado es el mismo y cubre un
      // documento viejo que no lo tenga.
      const venta = await fetchVenta(ap.saleId || idVentaDeApartado(ap.id));
      if (!venta) {
        toast.error(
          ap.invoiceNumber
            ? `La factura ${ap.invoiceNumber} ya no está en el historial.`
            : `La factura de ${ap.numero} ya no está en el historial.`,
        );
        return;
      }
      abrirEncima(() => setPreview({ tipo: 'factura', venta, totalNio: ap.totalNio, conEtiqueta: false }));
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo abrir la factura.');
    } finally {
      setBuscandoFactura(null);
    }
  };

  /*
    "Entregar y facturar" desde el aviso que sale cuando un abono deja el
    apartado pagado. Se aprieta cuando sea, con la pantalla en otro estado:
    se decide con lo último que se sabe, no con lo que había al crear el aviso.
  */
  const pedirEntrega = (apartadoId: string) => {
    const ap = apartadosRef.current.find((a) => a.id === apartadoId);
    if (!ap) return;
    if (ap.status !== 'activo') {
      toast.info(`${ap.numero} ya está ${etiquetaApartado(ap.status).toLowerCase()}.`);
      return;
    }
    // No se pisa lo que está abierto: un diálogo a medio llenar, o una factura
    // cuya etiqueta de envío todavía no salió.
    const { accion: abierta, preview: vista, etiqueta: etiquetaAbierta } = capasRef.current;
    if (abierta || etiquetaAbierta || (vista?.tipo === 'factura' && vista.conEtiqueta)) {
      toast.info(`Terminá lo que tenés abierto y entregá ${ap.numero} desde su tarjeta.`);
      return;
    }
    setPreview(null);
    setEtiqueta(null);
    setReservada(false);
    setAccion({ tipo: 'entregar', apartadoId });
  };

  // -------------------------------------------------------------------------
  // Operaciones. Si el hook lanza, el diálogo muestra el motivo y se queda
  // abierto para reintentar; acá sólo se sigue cuando salió bien.
  // -------------------------------------------------------------------------

  const registrar = async (ap: Apartado, abono: AbonoApartado) => {
    // Se anota ANTES de esperar: si lanza, queda registrado el intento (ver
    // `abrirAbono`); si sale bien, se borra.
    intentoAbono.current = { apartadoId: ap.id, abonoId: abono.id, montoNio: abono.montoNio };
    const r = await registrarAbono(ap.id, abono);
    intentoAbono.current = null;
    const pagado = redondearCordobas(r.saldoNio) <= 0;
    if (r.yaEstaba) {
      // El monto es el GUARDADO: entre un intento y otro el operador pudo
      // corregirlo, y el que vale es el que quedó en el servidor.
      toast.info(
        `Ese abono ya estaba registrado, por ${C$(r.abono.montoNio)}. Saldo de ${ap.numero}: ${C$(r.saldoNio)}.` +
          (redondearCordobas(r.abono.montoNio) !== redondearCordobas(abono.montoNio)
            ? ' Si el monto no es el correcto, anulalo y registrá el bueno.'
            : ''),
      );
    } else if (!pagado) {
      toast.success(`Abono de ${C$(abono.montoNio)} registrado en ${ap.numero}. Saldo: ${C$(r.saldoNio)}.`);
    }
    // El comprobante se arma con el apartado EN VIVO más este abono: la
    // transacción ya terminó pero la copia local puede no haberlo recibido
    // todavía, y el papel no puede salir sin el abono que se acaba de cobrar.
    // Cuando llega, `conAbono` no lo duplica.
    abrirEncima(() => setPreview({ tipo: 'comprobante', apartadoId: ap.id, abonoLocal: r.abono }));
    if (pagado) {
      const numero = ap.numero;
      toast.accion(
        `${numero} quedó pagado. ¿Se lo lleva ahora?`,
        {
          etiqueta: 'Entregar y facturar',
          /*
            El aviso no caduca y flota en TODAS las pantallas. Si el operador ya
            salió de Apartados, `pedirEntrega` es de una pantalla desmontada y
            no hacía nada: el botón quedaba mudo. Fuera de acá, se vuelve a la
            pantalla con el apartado buscado, donde su tarjeta ofrece entregar.
          */
          alHacer: () => {
            if (montado.current) pedirEntrega(ap.id);
            else navigate(`/apartados?q=${encodeURIComponent(numero)}`);
          },
        },
        r.yaEstaba ? undefined : `Abono de ${C$(r.abono.montoNio)} registrado.`,
      );
    }
  };

  const anular = async (ap: Apartado, abono: AbonoApartado, motivo: string) => {
    const r = await anularAbono(ap.id, abono.id, motivo);
    setAccion(null);
    if (r.yaEstaba) {
      toast.info('Ese abono ya estaba anulado.');
      return;
    }
    const saldo = saldoNio({
      ...ap,
      anulaciones: [...(ap.anulaciones || []), { abonoId: abono.id, motivo, fecha: Date.now() }],
    });
    toast.success(
      `Abono de ${C$(abono.montoNio)} anulado. Saldo de ${ap.numero}: ${C$(saldo)}. ` +
        'Si el cliente tenía el comprobante anterior, mandale el nuevo.',
    );
  };

  const entregar = async (ap: Apartado) => {
    const r = await entregarApartado(ap.id);
    if (r.borrados.length > 0) {
      const n = r.borrados.length;
      toast.error(
        `${n === 1 ? 'Un producto' : `${n} productos`} de ${ap.numero} ya no ${n === 1 ? 'está' : 'están'} en el ` +
          `catálogo (${listaNombres(r.borrados)}). La factura salió igual, pero no había reserva que descontar: ` +
          'si esas unidades siguen en la tienda, revisá el inventario.',
      );
    }
    const factura = r.venta?.invoiceNumber || ap.invoiceNumber || '';
    if (!r.venta) {
      // Sólo pasa si ya estaba entregado y la venta se borró del historial:
      // una entrega nueva siempre devuelve la factura que acaba de emitir.
      setAccion(null);
      toast.error(
        `${ap.numero} ya estaba entregado, pero ${factura ? `la factura ${factura}` : 'su factura'} ya no está en el historial.`,
      );
      return;
    }
    if (r.yaEstaba) toast.info(`Ya estaba entregado con la factura ${factura}.`);
    else toast.success(`${ap.numero} entregado. Factura ${factura} por ${C$(ap.totalNio)}.`);
    const venta = r.venta;
    // La etiqueta se ofrece también si ya estaba entregado: si el primer
    // intento sí se guardó pero la respuesta no llegó, nadie la imprimió.
    abrirEncima(() =>
      setPreview({
        tipo: 'factura',
        venta,
        totalNio: ap.totalNio,
        conEtiqueta: TRANSPORTES_CON_ETIQUETA.includes(venta.transport || ''),
      }),
    );
  };

  const cancelar = async (ap: Apartado, devueltoNio: number, motivo: string) => {
    const r = await cancelarApartado(ap.id, { devueltoNio, motivo });
    setAccion(null);
    if (r.yaEstaba) {
      // Con lo que QUEDÓ registrado como devuelto: si el primer intento sí se
      // guardó y el operador corrigió el monto antes de reintentar, la plata
      // que salió del cajón es la del primero, y la pantalla tiene que decirlo.
      if (redondearCordobas(r.devueltoNio) !== redondearCordobas(devueltoNio)) {
        toast.error(
          `${ap.numero} ya estaba cancelado con una devolución de ${C$(r.devueltoNio)} ` +
            `(ahora pediste ${C$(devueltoNio)}). Quedó registrada la primera.`,
        );
      } else {
        toast.info(`${ap.numero} ya estaba cancelado, con una devolución de ${C$(r.devueltoNio)}.`);
      }
    } else {
      toast.success(
        `${ap.numero} cancelado. ` +
          (devueltoNio > 0 ? `Le devolviste ${C$(devueltoNio)}.` : 'No se le devolvió nada.') +
          (r.borrados.length === 0 ? ' Las unidades volvieron al stock.' : ''),
      );
    }
    if (r.borrados.length > 0) {
      toast.error(
        `No volvieron al stock porque ya no están en el catálogo: ${listaNombres(r.borrados)}. ` +
          'Si las unidades están en la tienda, volvé a dar de alta el producto y cargalas con un ajuste.',
      );
    }
  };

  const guardarDatos = async (ap: Apartado, cambios: CambiosApartado) => {
    await actualizarApartado(ap.id, cambios);
    toast.success(`Datos de ${ap.numero} guardados.`);
  };

  const nuevoApartado = () => {
    navigate('/pos');
    toast.info('Los apartados se arman en el carrito: cargá los productos y el cliente, y apretá Apartar (F4).');
  };

  // -------------------------------------------------------------------------
  // CSV para el contador: la plata que entró y salió por apartados
  // -------------------------------------------------------------------------

  const exportarCsv = () => {
    const filasCsv: (Record<string, unknown> & { _t: number })[] = [];
    let abonos = 0;
    let anulados = 0;
    let devoluciones = 0;
    for (const ap of apartados) {
      const anulacionDe = new Map((ap.anulaciones || []).map((x) => [x.abonoId, x]));
      const estado = textoEstado(estadoVisible(ap, ahora));
      for (const a of ap.abonos || []) {
        const anulacion = anulacionDe.get(a.id);
        if (anulacion) anulados++;
        else abonos++;
        filasCsv.push({
          _t: a.fecha,
          fecha: format(a.fecha, 'yyyy-MM-dd HH:mm'),
          // Un anulado va con su monto y su tipo: el contador tiene que poder
          // ver el error y su corrección, no sólo el resultado.
          tipo: anulacion ? 'Anulado' : 'Abono',
          apartado: ap.numero,
          cliente: ap.customerName,
          metodo: etiquetaMetodo(a.metodo),
          referencia: a.referencia || '',
          montoNio: redondearCordobas(a.montoNio),
          estado,
          motivo: anulacion ? `Anulado el ${format(anulacion.fecha, 'yyyy-MM-dd')}: ${anulacion.motivo}` : '',
        });
      }
      // Lo que se devolvió al cancelar sale de la caja: va en negativo, con la
      // fecha en que se canceló (como lo cuenta `cajaEntre`).
      if (ap.status === 'cancelado' && typeof ap.canceladoEn === 'number' && (ap.devueltoNio || 0) > 0) {
        devoluciones++;
        filasCsv.push({
          _t: ap.canceladoEn,
          fecha: format(ap.canceladoEn, 'yyyy-MM-dd HH:mm'),
          tipo: 'Devolución',
          apartado: ap.numero,
          cliente: ap.customerName,
          metodo: '',
          referencia: '',
          montoNio: -redondearCordobas(ap.devueltoNio || 0),
          estado,
          motivo: ap.motivoCancelacion || '',
        });
      }
    }
    if (filasCsv.length === 0) {
      toast.info('Todavía no hay abonos que exportar.');
      return;
    }
    filasCsv.sort((x, y) => x._t - y._t);
    downloadCsv(
      `apartados_abonos_${format(ahora, 'yyyy-MM-dd')}`,
      toCsv(filasCsv, [
        ['fecha', 'Fecha'],
        ['tipo', 'Tipo'],
        ['apartado', 'Apartado'],
        ['cliente', 'Cliente'],
        ['metodo', 'Método'],
        ['referencia', 'Referencia'],
        ['montoNio', 'Monto C$'],
        ['estado', 'Estado del apartado'],
        ['motivo', 'Motivo'],
      ]),
    );
    toast.success(
      `Exportadas ${filasCsv.length} filas: ${plural(abonos, 'abono', 'abonos')}, ` +
        `${plural(anulados, 'anulado', 'anulados')} y ${plural(devoluciones, 'devolución', 'devoluciones')}.`,
    );
  };

  // -------------------------------------------------------------------------
  // Comprobante o factura en pantalla
  // -------------------------------------------------------------------------

  const vistaPrevia = useMemo(() => {
    if (!preview) return null;
    if (preview.tipo === 'factura') {
      const v = preview.venta;
      return {
        data: buildInvoiceDataFromSale(v, companyInfo),
        whatsApp: buildWhatsAppMessage(v, C$(preview.totalNio)),
      };
    }
    const base = apartados.find((a) => a.id === preview.apartadoId);
    if (!base) return null;
    const ap = preview.abonoLocal ? conAbono(base, preview.abonoLocal) : base;
    return {
      data: buildInvoiceDataFromApartado(ap, companyInfo, products, Date.now()),
      whatsApp: buildWhatsAppApartado(ap, 'comprobante', telefonoVigente(ap, fichas)),
    };
  }, [preview, apartados, companyInfo, products, fichas]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const textoPestana = PESTANAS.find((p) => p.valor === pestana)?.texto.toLowerCase() ?? '';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight italic">Apartados</h2>
          <p className="text-xs text-zinc-400">Productos reservados con prima: abonos, saldos y entregas.</p>
        </div>
        <div className="flex flex-col md:flex-row w-full lg:w-auto gap-3">
          <div className="relative w-full md:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar un apartado por número, cliente o teléfono"
              placeholder="Número, cliente o teléfono…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-3 h-10 text-sm text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <button
            type="button"
            onClick={exportarCsv}
            disabled={!apartadosCargados}
            className="h-10 px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Exportar CSV
          </button>
          {/* Secundario a propósito: acá no se crea nada, sólo se va al POS. */}
          <button
            type="button"
            onClick={nuevoApartado}
            className="h-10 px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nuevo apartado
          </button>
        </div>
      </div>

      {!apartadosCargados ? (
        <div className="p-12 text-center text-zinc-400 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Cargando apartados…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              titulo="Por cobrar"
              icono={Wallet}
              valor={C$(kpis.porCobrar)}
              tono="text-cyan-400"
              sub={
                kpis.conSaldo === 0
                  ? 'Ningún apartado con saldo'
                  : `en ${plural(kpis.conSaldo, 'apartado', 'apartados')} con saldo`
              }
            />
            <Kpi
              titulo="Vencidos"
              icono={AlertTriangle}
              valor={String(kpis.vencidos)}
              tono={kpis.vencidos > 0 ? 'text-rose-400' : 'text-zinc-100'}
              borde={kpis.vencidos > 0 ? 'border-l-2 border-l-rose-500' : ''}
              sub={kpis.vencidos > 0 ? `${C$(kpis.saldoVencido)} de saldo` : 'Ninguno pasó su fecha límite'}
            />
            {/* Un listo nunca vence (estadoVisible), así que necesita su propia
                alarma: cuánto hace que la tienda le debe el producto. */}
            <Kpi
              titulo="Listos para entregar"
              icono={PackageCheck}
              valor={String(kpis.listos)}
              tono={kpis.listos > 0 ? 'text-emerald-400' : 'text-zinc-100'}
              sub={
                kpis.listoMasViejo === null
                  ? 'Ninguno esperando que lo retiren'
                  : `el más viejo, ${textoPagado(diasDesde(kpis.listoMasViejo, ahora))}`
              }
            />
            {/* Neto: un día con una devolución no puede mostrar más plata de
                la que hay en el cajón (ver `cajaEntre`). */}
            <Kpi
              titulo="Abonos de hoy"
              icono={HandCoins}
              valor={C$(kpis.caja.netoNio)}
              tono="text-cyan-400"
              sub={`recibido ${C$(kpis.caja.recibidoNio)} · devuelto ${C$(kpis.caja.devueltoNio)}`}
            />
          </div>

          {apartados.length === 0 ? (
            <div className="p-12 text-center text-zinc-400 flex flex-col items-center gap-3 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl">
              <HandCoins className="w-12 h-12 opacity-20" aria-hidden="true" />
              <p className="text-zinc-200 font-semibold">Todavía no hay apartados.</p>
              <p className="text-sm max-w-md leading-relaxed">
                Se crean desde la Terminal POS: cargá los productos y el cliente en el carrito, y apretá{' '}
                <strong className="text-zinc-200">Apartar (F4)</strong>. El cliente deja una prima y el producto queda
                reservado a su nombre.
              </p>
              <Link
                to="/pos"
                className="mt-1 h-10 px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                Ir a la Terminal POS
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar apartados por estado">
                {PESTANAS.map(({ valor, texto }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setPestana(valor)}
                    aria-pressed={pestana === valor}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                      pestana === valor
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    {texto}
                    <span className="ml-1.5 font-normal tabular-nums">{conteos[valor]}</span>
                  </button>
                ))}
              </div>

              {visibles.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 flex flex-col items-center gap-3 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl">
                  <HandCoins className="w-10 h-10 opacity-20" aria-hidden="true" />
                  {q ? (
                    <>
                      <p className="text-sm">
                        {pestana === 'todos'
                          ? `Ningún apartado coincide con «${q}».`
                          : `Ningún apartado en ${textoPestana} coincide con «${q}».`}{' '}
                        Se busca por número, cliente o teléfono.
                      </p>
                      {pestana !== 'todos' && conteos.todos > 0 && (
                        <button
                          type="button"
                          onClick={() => setPestana('todos')}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          Ver {conteos.todos === 1 ? 'el que coincide' : `los ${conteos.todos} que coinciden`} en Todos
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">{VACIO[pestana]}</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {visibles.map((f) => (
                    <TarjetaApartado
                      key={f.ap.id}
                      fila={f}
                      ahora={ahora}
                      telefono={telefonoVigente(f.ap, fichas)}
                      buscandoFactura={buscandoFactura === f.ap.id}
                      onDetalle={() => setDetalleId(f.ap.id)}
                      onAbonar={() => abrirAbono(f.ap)}
                      onEntregar={() => abrirEntrega(f.ap)}
                      onVerFactura={() => void verFactura(f.ap)}
                      onComprobante={() => verComprobante(f.ap)}
                      onWhatsApp={() => enviarWhatsApp(f.ap, f.visible)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* El detalle queda abierto DEBAJO de lo que abre: al cerrar el abono o
          el comprobante se vuelve acá, con la cuenta actualizada. */}
      {apDetalle && (
        <ApartadoDetalle
          key={apDetalle.id}
          ap={apDetalle}
          ahora={ahora}
          activo={!accion && !reservada}
          telefonoFicha={telefonoDeFicha(apDetalle, fichas)}
          buscandoFactura={buscandoFactura === apDetalle.id}
          onCerrar={() => setDetalleId(null)}
          onAbonar={() => abrirAbono(apDetalle)}
          onAnular={(abono) => abrirAnular(apDetalle, abono)}
          onEntregar={() => abrirEntrega(apDetalle)}
          onCancelar={() => abrirCancelar(apDetalle)}
          onComprobante={() => verComprobante(apDetalle)}
          onRecordatorio={() => recordar(apDetalle)}
          onVerFactura={() => void verFactura(apDetalle)}
          onGuardar={(cambios) => guardarDatos(apDetalle, cambios)}
        />
      )}

      {accion && apAccion && accion.tipo === 'abonar' && (
        <DialogoAbonar
          key={accion.abonoId}
          ap={apAccion}
          abonoId={accion.abonoId}
          onCerrar={cerrarAccion}
          onRegistrar={(abono) => registrar(apAccion, abono)}
        />
      )}
      {accion && apAccion && accion.tipo === 'anular' && (() => {
        const abono = (apAccion.abonos || []).find((a) => a.id === accion.abonoId);
        return abono ? (
          <DialogoAnularAbono
            key={abono.id}
            ap={apAccion}
            abono={abono}
            onCerrar={cerrarAccion}
            onAnular={(motivo) => anular(apAccion, abono, motivo)}
          />
        ) : null;
      })()}
      {accion && apAccion && accion.tipo === 'entregar' && (
        <DialogoEntregar key={apAccion.id} ap={apAccion} onCerrar={cerrarAccion} onEntregar={() => entregar(apAccion)} />
      )}
      {accion && apAccion && accion.tipo === 'cancelar' && (
        <DialogoCancelar
          key={apAccion.id}
          ap={apAccion}
          onCerrar={cerrarAccion}
          onCancelar={(devuelto, motivo) => cancelar(apAccion, devuelto, motivo)}
        />
      )}

      {preview && vistaPrevia && (
        <InvoicePreview data={vistaPrevia.data} isOpen onClose={cerrarPreview} whatsApp={vistaPrevia.whatsApp} />
      )}
      {etiqueta && (
        <ShippingLabelPreview
          sale={etiqueta}
          isOpen
          onClose={cerrarEtiqueta}
          companyLogo={companyInfo?.logoBase64}
          companyName={companyInfo?.name}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas de la pantalla
// ---------------------------------------------------------------------------

function Kpi({
  titulo,
  icono: Icono,
  valor,
  tono,
  sub,
  borde = '',
}: {
  titulo: string;
  icono: LucideIcon;
  valor: string;
  tono: string;
  sub: string;
  borde?: string;
}) {
  return (
    <div className={`bg-zinc-900/50 p-4 border border-zinc-800 rounded-xl ${borde}`}>
      <p className="text-zinc-400 text-xs font-medium uppercase flex items-center gap-2">
        <Icono className="h-4 w-4" aria-hidden="true" /> {titulo}
      </p>
      <p className={`text-2xl font-bold mt-2 tabular-nums break-words ${tono}`}>{valor}</p>
      <p className="text-[11px] text-zinc-400 mt-1 tabular-nums">{sub}</p>
    </div>
  );
}

function TarjetaApartado({
  fila,
  ahora,
  telefono,
  buscandoFactura,
  onDetalle,
  onAbonar,
  onEntregar,
  onVerFactura,
  onComprobante,
  onWhatsApp,
}: {
  fila: Fila;
  ahora: number;
  /** El vigente: el de la ficha si sirve, si no el del apartado. */
  telefono: string;
  buscandoFactura: boolean;
  onDetalle: () => void;
  onAbonar: () => void;
  onEntregar: () => void;
  onVerFactura: () => void;
  onComprobante: () => void;
  onWhatsApp: () => void;
}) {
  const { ap, visible, saldo } = fila;
  const plazo = plazoDe(ap, visible, ahora);
  const conSaldo = visible === 'activo' || visible === 'vencido';
  const pct = progresoPct(ap);
  const idTitulo = `apartado-${ap.id}`;

  return (
    <article
      aria-labelledby={idTitulo}
      className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors rounded-xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={idTitulo} className="text-sm font-bold text-zinc-100 tabular-nums">
            {ap.numero}
          </h3>
          <p className="text-sm font-semibold text-zinc-200 truncate">{ap.customerName}</p>
          <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5 min-w-0">
            <Phone className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate tabular-nums">{telefono}</span>
          </p>
        </div>
        <BadgeEstado estado={visible} />
      </div>

      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{resumenProductos(ap)}</p>

      <p className={`text-xs flex items-center gap-1.5 ${plazo.tono}`}>
        <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {plazo.texto}
      </p>

      <div className="mt-auto space-y-2">
        <BarraProgreso
          pct={pct}
          tono={
            visible === 'cancelado'
              ? 'bg-zinc-600'
              : visible === 'listo' || visible === 'entregado'
                ? 'bg-emerald-500'
                : 'bg-cyan-500'
          }
          etiqueta={`${ap.numero}: pagado el ${Math.round(pct)}%`}
        />
        <div className="flex items-end justify-between gap-3">
          <p className="text-[11px] text-zinc-400 tabular-nums">
            Abonado {C$(abonadoNio(ap))} de {C$(ap.totalNio)}
          </p>
          <div className="text-right shrink-0">
            {visible === 'entregado' ? (
              <>
                <p className="text-[10px] uppercase text-zinc-400 font-bold">Factura</p>
                <p className="text-sm font-bold text-zinc-200">{ap.invoiceNumber || '—'}</p>
              </>
            ) : visible === 'cancelado' ? (
              <>
                <p className="text-[10px] uppercase text-zinc-400 font-bold">Devuelto</p>
                <p className="text-sm font-bold text-zinc-300 tabular-nums">{C$(ap.devueltoNio ?? 0)}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase text-zinc-400 font-bold">Saldo</p>
                {saldo > 0 ? (
                  <p className="text-lg font-bold text-cyan-400 tabular-nums">{C$(saldo)}</p>
                ) : saldo < 0 ? (
                  // Dato corrupto (más abonado que el total): se muestra, no se tapa.
                  <p className="text-lg font-bold text-rose-400 tabular-nums">{C$(saldo)}</p>
                ) : (
                  <p className="text-lg font-bold text-emerald-400">Pagado</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {conSaldo ? (
          <button
            type="button"
            onClick={onAbonar}
            className="flex-1 h-9 px-3 bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <HandCoins className="w-4 h-4" aria-hidden="true" />
            Abonar
          </button>
        ) : visible === 'listo' ? (
          <button
            type="button"
            onClick={onEntregar}
            className="flex-1 h-9 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <PackageCheck className="w-4 h-4" aria-hidden="true" />
            Entregar y facturar
          </button>
        ) : visible === 'entregado' ? (
          <button
            type="button"
            onClick={onVerFactura}
            disabled={buscandoFactura}
            className="flex-1 h-9 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {buscandoFactura ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="w-4 h-4" aria-hidden="true" />
            )}
            Ver factura
          </button>
        ) : (
          <button
            type="button"
            onClick={onDetalle}
            className="flex-1 h-9 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
            Ver detalle
          </button>
        )}
        <button
          type="button"
          onClick={onComprobante}
          aria-label={`Comprobante de ${ap.numero}`}
          title="Comprobante"
          className="h-9 w-9 shrink-0 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onWhatsApp}
          aria-label={
            conSaldo
              ? `Recordarle el saldo de ${ap.numero} por WhatsApp`
              : `Mandar el comprobante de ${ap.numero} por WhatsApp`
          }
          title={conSaldo ? 'Recordatorio por WhatsApp' : 'Comprobante por WhatsApp'}
          className="h-9 w-9 shrink-0 flex items-center justify-center text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
        </button>
        {visible !== 'cancelado' && (
          <button
            type="button"
            onClick={onDetalle}
            aria-label={`Ver el detalle de ${ap.numero}`}
            title="Detalle"
            className="h-9 w-9 shrink-0 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
