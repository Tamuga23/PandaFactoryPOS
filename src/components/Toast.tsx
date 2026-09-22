import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

/**
 * Sistema de notificaciones del POS (reemplaza a los alert() nativos).
 * Uso: import { toast } from '../components/Toast';
 *      toast.error('Mensaje'); toast.success('...'); toast.info('...');
 * <Toaster /> se monta UNA vez en Layout.tsx.
 */
type ToastType = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  type: ToastType;
  text: string;
}

let pushToast: ((t: Omit<ToastMsg, 'id'>) => void) | null = null;
let seq = 0;

const emit = (type: ToastType) => (text: string) => {
  if (pushToast) pushToast({ type, text });
  else console.warn(`[toast:${type}]`, text); // Toaster aún no montado
};

export const toast = {
  success: emit('success'),
  error: emit('error'),
  info: emit('info'),
};

const BORDER: Record<ToastType, string> = {
  success: 'border-emerald-500/40',
  error: 'border-rose-500/40',
  info: 'border-cyan-500/40',
};
const ICON_COLOR: Record<ToastType, string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-cyan-400',
};
const ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    pushToast = (t) => {
      const id = ++seq;
      setItems((prev) => {
        /*
          Los errores no caducan por tiempo (ver abajo) pero SÍ se podían
          perder por cantidad: `prev.slice(-3)` recortaba la cola sin mirar el
          tipo, así que un error todavía sin leer se caía de la lista apenas
          llegaban tres avisos después. En el POS eso es fácil: una venta que
          falla suele venir seguida de un "se creó la ficha", un "se quitó el
          precio de efectivo" y un "venta recuperada".

          Ahora el recorte sólo alcanza a los que sí caducan solos. Los errores
          se quedan hasta que alguien los cierra, que es la regla que este
          archivo ya declaraba y que este recorte contradecía.
        */
        const errores = prev.filter((i) => i.type === 'error');
        const efimeros = prev.filter((i) => i.type !== 'error').slice(-2);
        return [...errores, ...efimeros, { ...t, id }];
      });
      /*
        Los ERRORES no se autodestruyen. Los avisos de este POS son el único
        canal de los fallos que bloquean el cobro, y el operador es su propia
        mesa de ayuda: `recordSale` produce un diagnóstico exacto ("Stock
        insuficiente de X. Pedido: 3, Disponible: 1") y borrarlo a los 4,5
        segundos lo tiraba a la basura justo cuando más se necesita.

        El caso real: el operador aprieta Confirmar, se da vuelta a decirle al
        cliente que ya está, y al volver a mirar el mensaje ya no existe. No
        sabe si se guardó. Aprieta de nuevo, falla de nuevo, y vuelve a
        perderse la explicación.

        Éxito e información sí se van solos: no hay nada que leer dos veces.
        El error se cierra con su X, que ya existía.
      */
      if (t.type === 'error') return;
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 4500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  // NO se hace `return null` cuando no hay avisos. La region viva tiene que
  // existir ANTES de que llegue su primer contenido: los lectores de pantalla
  // observan mutaciones DENTRO de una region preexistente, y una region que
  // nace ya poblada es el caso clasico que no se anuncia. Como los toasts son
  // el UNICO canal de los errores que bloquean el cobro, perder ese anuncio
  // deja al operador sin forma de enterarse de que la venta no se registro.
  // `pointer-events-none` mientras esta vacia para no comerse clics.

  return (
    // Región viva. Sin esto, los toasts no se anuncian a un lector de pantalla
    // — y en el POS son el ÚNICO canal de 7 errores que bloquean el cobro (sin
    // stock, descuento mayor al total, venta que no califica para cuotas,
    // plazo sin elegir, venta fallida). `role="alert"` para lo que interrumpe,
    // `role="status"` para lo demás: es la diferencia entre cortarle la frase
    // al lector o esperar a que termine.
    <div
      /*
        z-[200]: POR ENCIMA de todo modal. Los avisos compartían z-[100] con el
        preview de factura y, al estar montados ANTES en el DOM (Layout.tsx:43
        contra :183) y sin contexto de apilamiento propio que los separe, el
        modal los tapaba. Consecuencia: el error de una venta fallida —el
        mensaje más caro del sistema— se pintaba detrás de un overlay opaco y
        el operador no veía nada.
        Escala real del proyecto: 10 · 40 · 50 · 60 · 80 · 100-102 (modales) ·
        200 (avisos). Los avisos van siempre arriba de todo.
      */
      className={`fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(92vw,380px)] ${
        items.length === 0 ? 'pointer-events-none' : ''
      }`}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2.5 rounded-xl border ${BORDER[t.type]} bg-zinc-900/95 backdrop-blur px-4 py-3 text-sm shadow-2xl`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${ICON_COLOR[t.type]}`} aria-hidden="true" />
            <span className="flex-1 text-zinc-100 leading-snug">{t.text}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}
              aria-label="Cerrar aviso"
              className="shrink-0 p-1 -m-1 text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
