import { useEffect, RefObject } from 'react';

/**
 * P4.6: atrapa el foco dentro de un modal.
 *
 * Sin esto, tabular dentro de un diálogo termina sacando el foco al formulario
 * que quedó detrás: se puede llegar a un control que no se ve, y en el preview
 * de factura eso pasa justo en el paso de la acción irreversible.
 *
 * Solo mueve el foco cuando el Tab se iría afuera; dentro del modal deja que
 * el navegador haga su trabajo, que lo hace bien.
 */
export function useFocusTrap(active: boolean, contenedor: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;

    // Quién tenía el foco antes de abrir, para devolvérselo al cerrar. Sin
    // esto el foco cae a <body> al desmontar el diálogo y el siguiente Tab
    // arranca desde el principio del documento, no desde el botón que lo abrió.
    const previo = document.activeElement as HTMLElement | null;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const raiz = contenedor.current;
      if (!raiz) return;

      // Se consulta en cada Tab, no al montar: el contenido del modal cambia
      // (aparece "Descargar PDF" al confirmar, se oculta la barra en modo
      // presentación) y una lista cacheada quedaría desactualizada.
      const enfocables: HTMLElement[] = Array.from<HTMLElement>(
        raiz.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0);
      // ^ `getClientRects()`, NO `offsetParent`. `offsetParent` devuelve null
      //   para todo elemento `position: fixed`, así que descartaba por error el
      //   botón "Salir (ESC)" del modo presentación — que es fixed. Con ese
      //   botón filtrado la lista quedaba vacía, el handler salía sin
      //   `preventDefault`, y el Tab se escapaba a la pantalla del POS que está
      //   detrás: exactamente en el estado que existe para girarle la laptop al
      //   cliente. `getClientRects()` da 0 solo para lo realmente oculto
      //   (`display:none`) y funciona con fixed.

      if (enfocables.length === 0) return;

      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement as HTMLElement | null;

      // Si el foco se escapó del modal (o nunca entró), volverlo adentro.
      if (!actual || !raiz.contains(actual)) {
        e.preventDefault();
        // Entrando desde afuera: Tab va al primero, Shift+Tab al último.
        (e.shiftKey ? ultimo : primero).focus();
        return;
      }
      if (e.shiftKey && actual === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && actual === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // `isConnected` evita enfocar un nodo que ya no está en el documento.
      if (previo && previo.isConnected) previo.focus();
    };
  }, [active, contenedor]);
}
