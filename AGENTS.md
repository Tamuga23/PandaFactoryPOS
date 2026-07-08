# Guía para agentes de IA — PandaFactoryPOS

POS + inventario para Panda Store (Nicaragua): React 19 + Vite + TS + Tailwind v4 + Firebase (Firestore con BD nombrada, plan Spark). Alimenta la tablet PandaLink vía `catalogo_publico`. Idioma del proyecto y de la UI: **español**.

## Lectura obligatoria antes de tocar código (en este orden)

1. `README.md` — arquitectura, comandos, flujo del catálogo público (backfill manual, plan Spark).
2. `REVISION_2026-07-07_MEJORAS.md` — revisión completa vigente. La sección **ESTADO** arriba dice qué ya se aplicó (todo P1) y qué falta.
3. `REVISION_2026-07.md` + `INTEGRACION_Y_UI_2026-07.md` — historial de fixes previos (no repetir trabajo).
4. `security_spec.md` + bloque comentado al final de `firestore.rules` — diseño de la Fase 2 de seguridad (P0, pendiente).

## Estado al 2026-07-08

- **P1 completo** (facturas correlativas con `counters/*`, devoluciones reponen stock, Reports por rango, landed cost, revertir recepción, validación Zod en writes). Verificado con `tsc --noEmit` en cero errores.
- **P2.5–P2.8 completo** (proforma→factura, reimprimir PDF, precio por línea, método de pago + descuento efectivo, Enter/barcode, historial CRM + WhatsApp, kardex `movimientos` + export CSV, editar/cancelar órdenes, fix timezone, días en tránsito). Verificado por consistencia de símbolos; **correr `npm run lint` antes de deployar** (el entorno de esa sesión no pudo ejecutar tsc).
- **Pendiente inmediato del usuario:** `npm run lint` → `firebase deploy --only firestore:rules` (sin esto fallan: facturar/`counters`, kardex/`movimientos`, cancelar orden/`CANCELLED`) → smoke test → commit.
- **P0 pendiente** (lo más importante): reglas abiertas a sesiones anónimas + rotar el service account (`gen-lang-client-*.json`, está en la raíz y probablemente en el historial git). La colección `movimientos` también debe quedar solo-admin en Fase 2.

## Reglas de trabajo para el agente

- **NUNCA** leas, muevas, copies ni pegues en el chat el JSON del service account. La rotación de la llave la hace el usuario a mano en Google Cloud Console.
- No refactorices `src/hooks/useStoreData.ts` sin leer sus comentarios: `recordSale`, `changeSaleStatus`, `updatePurchase` y `revertTrackingReception` son transacciones con invariantes de stock/WAC deliberadas.
- Después de cada cambio: `npm run lint` (es `tsc --noEmit`). No hay tests unitarios; los de reglas corren con `npm run test:rules` (requiere emulador).
- Toda escritura nueva a Firestore debe pasar por Zod (`src/lib/validations.ts`) Y estar permitida en `firestore.rules` (validación por whitelist de campos — si agregás un campo, tocá tipo + schema + regla).
- El proyecto se queda en plan **Spark**: no despliegues Cloud Functions ni sugieras Blaze salvo pedido explícito. `catalogo_publico` se sincroniza con `npm run backfill`.
- No borres los `.md` de revisiones; actualizá su sección ESTADO cuando apliques algo.
- UI: paleta cyan (acción) / emerald (éxito) / rose (peligro) / amber (warning), dark zinc, todo en español.

## Backlog priorizado (detalles en REVISION_2026-07-07_MEJORAS.md)

1. **P0.1** — Fase 2 seguridad: proveedor Email/Password, claim `admin` (script con firebase-admin en `scripts/`), reemplazar `isSignedIn()` por `isAdmin()` en colecciones sensibles, login real en `App.tsx`. `counters` también debe quedar solo-admin.
2. **P0.2** — (humano) rotar service account + sacarlo del historial git.
3. ~~P4~~ **HECHO (2026-07-08) excepto P4.6**: traducción completa, filtros en Historial, chips de categoría + sort en Inventario, Dashboard Hoy/7d/30d con comparación, modal de confirmación al borrar ventas, ESC en modales (`src/hooks/useEscapeKey.ts`). Pendiente P4.6: PDF nativo con jspdf-autotable + formato ticket 80mm (hacerlo con la app corriendo, hay riesgo de regresión visual) y focus-trap en modales.
4. ~~P3.1~~ **HECHO (2026-07-08)**: `StoreDataProvider` en `src/context/StoreContext.tsx`; los componentes consumen `useStore()`. NUNCA llamar `useStoreData()` directo fuera del provider.
   ~~P3.5~~ **HECHO (2026-07-08)**: id de producto = uuid siempre + SKU único (check en hook); alta de productos SOLO en Catálogo Maestro (ficha completa con Datos POS); specs de proyector por slug; errores Firestore humanizados en `db.ts`; repo limpio (blueprint/probe eliminados, xlsx en `docs/`, scripts dedup).
5. **P2** en orden de valor: seriales/IMEI (tipos/reglas ya lo soportan, falta UI), garantías configurables (hoy la factura imprime "[3] meses" literal desde `POS.tsx`), selector de método de pago + cuentas por cobrar, reimprimir factura desde Historial, proforma → factura, caja/arqueo, kardex.

## Comandos

```bash
npm run dev          # localhost:3000
npm run lint         # typecheck (única verificación disponible)
npm run backfill:dry # simular sync de catalogo_publico
npm run backfill     # sincronizar catálogo de la tablet
firebase deploy --only firestore:rules
```
