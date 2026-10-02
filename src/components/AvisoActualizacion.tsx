import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from './Toast';

/**
 * Registra el service worker de la PWA y avisa cuando hay versión nueva.
 *
 * La versión nueva NO se aplica sola (ver registerType en vite.config.ts): se
 * aplica cuando el operador aprieta "Actualizar", porque aplicarla recarga la
 * página y una recarga en medio de una venta tira el carrito. Si cierra el
 * aviso, la versión nueva entra la próxima vez que se abra la app.
 *
 * El aviso es un Toast con acción y no una tarjeta propia: DESIGN.md quiere
 * una sola manera de avisar, en una sola esquina. Abajo, además, tapaba la
 * barra de cobro fija del POS en el celular.
 */
const UNA_HORA = 60 * 60 * 1000;

export default function AvisoActualizacion() {
  const registro = useRef<ServiceWorkerRegistration | null>(null);
  const avisado = useRef(false);

  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (r) registro.current = r;
    },
  });

  useEffect(() => {
    if (!hayVersionNueva || avisado.current) return;
    avisado.current = true;
    toast.accion(
      'Hay una versión nueva del sistema.',
      { etiqueta: 'Actualizar', alHacer: () => updateServiceWorker(true) },
      'Actualizar recarga la pantalla. Si estás cobrando, terminá la venta primero.',
    );
  }, [hayVersionNueva, updateServiceWorker]);

  // Instalada en el celular, la app puede quedar abierta días sin recargarse,
  // y el navegador sólo busca versión nueva al navegar. Se le pregunta cada
  // hora y cada vez que la app vuelve al frente.
  useEffect(() => {
    const buscar = () => {
      const r = registro.current;
      if (r && !r.installing && navigator.onLine) r.update().catch(() => {});
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') buscar();
    };
    const intervalo = window.setInterval(buscar, UNA_HORA);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  return null;
}
