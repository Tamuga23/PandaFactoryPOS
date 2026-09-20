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
      ).filter((el) => el.offsetParent !== null); // descarta lo que está oculto

      if (enfocables.length === 0) return;

      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement as HTMLElement | null;

      // Si el foco se escapó del modal (o nunca entró), volverlo adentro.
      if (!actual || !raiz.contains(actual)) {
        e.preventDefault();
        primero.focus();
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
    return () => window.removeEventListener('keydown', handler);
  }, [active, contenedor]);
}
