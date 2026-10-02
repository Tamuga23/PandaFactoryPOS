import { createContext, useContext, ReactNode } from 'react';
import { useStoreData } from '../hooks/useStoreData';

/**
 * P3.1: una ÚNICA instancia de useStoreData() para toda la app.
 *
 * Antes, cada página/componente llamaba useStoreData() y montaba su propio
 * set de 8 onSnapshot sobre colecciones completas (App + Layout + página =
 * 3× lecturas de Firestore facturadas, 3× memoria, 3× re-renders). Con este
 * provider, las suscripciones viven una sola vez en App y los hijos consumen
 * los mismos datos vía useStore().
 */
type StoreData = ReturnType<typeof useStoreData>;

const StoreContext = createContext<StoreData | null>(null);

export function StoreDataProvider({ children }: { children: ReactNode }) {
  const store = useStoreData();
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreData {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore() debe usarse dentro de <StoreDataProvider> (ver src/App.tsx).');
  }
  return ctx;
}
