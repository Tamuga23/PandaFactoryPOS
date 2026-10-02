import { useEffect } from 'react';

/**
 * P4.7: cierra modales con la tecla ESC.
 * `active` = hay algún modal abierto; `onEscape` decide cuál cerrar
 * (conviene cerrar el de más arriba primero).
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
