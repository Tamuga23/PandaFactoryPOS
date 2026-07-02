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
      setItems((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 4500);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]">
      {items.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-xl border ${BORDER[t.type]} bg-zinc-900/95 backdrop-blur px-4 py-3 text-sm shadow-2xl`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${ICON_COLOR[t.type]}`} />
            <span className="flex-1 text-zinc-100 leading-snug">{t.text}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}
              className="shrink-0 p-1 -m-1 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
