# PandaFactory POS (PandaStoreOS)

Sistema de punto de venta e inventario para Panda Store (Nicaragua). Registra productos, ventas, compras con logística de importación (trackings, landed cost, costo promedio ponderado), clientes, proveedores y objeciones de venta. Alimenta a **PandaLink**, la PWA de tablet para el piso de venta, a través de la colección `catalogo_publico`.

## Stack

Vite + React 19 + TypeScript + Tailwind v4. Firebase Auth (sesión anónima, pendiente Fase 2) y Firestore con **base de datos nombrada** (`firebase-applet-config.json` → `firestoreDatabaseId`). Plan **Spark** (gratuito): no hay Cloud Functions desplegadas; la sincronización del catálogo público se hace con el script de backfill (abajo).

## Comandos

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # produce dist/
npm run lint           # tsc --noEmit (typecheck)
npm run test:rules     # tests de firestore.rules (requiere firebase-tools y emulador)
npm run backfill:dry   # simula la sincronización de catalogo_publico
npm run backfill       # sincroniza catalogo_publico desde products
```

## Sincronización del catálogo de la tablet (plan Spark)

`catalogo_publico/{id}` es una proyección de `products/{id}` **sin `cost`** que consume PandaLink. Como el plan Spark no permite Cloud Functions, el espejo se actualiza manualmente:

1. Credenciales admin: `GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON del service account (guardalo FUERA de esta carpeta) o `gcloud auth application-default login`.
2. `npm run backfill:dry` para revisar qué escribiría.
3. `npm run backfill` para sincronizar.

Correlo cada vez que cambies precios, stock relevante, o campos de tablet (`publicar`, `precioPromo`, `descEfectivoPct`, `bullets`, etc.). Las objeciones (`objeciones_universales`, `objeciones_categoria`) NO necesitan backfill: la tablet las lee directo.

En `functions/` hay una Cloud Function (`onProductWritten`) que automatizaría esto si algún día se pasa al plan Blaze. Hoy no está desplegada.

## Estructura

- `src/pages/` — POS, Inventory, Catalog, Purchases, Sales History, Customers, Reports, Settings, Dashboard.
- `src/hooks/useStoreData.ts` — capa de datos (suscripciones onSnapshot + writes; ventas y recepciones de compra usan transacciones).
- `src/lib/validations.ts` — schemas Zod + `buildPublicCatalogDoc` (la derivación del espejo; el backfill la replica).
- `firestore.rules` — validación por colección. Desplegar con `firebase deploy --only firestore:rules`.
- `scripts/` — backfill y seeds (usan firebase-admin local).

## Documentos internos

- `CATALOGO_TABLET_RESUMEN.md` — diseño del feature de catálogo público.
- `REVISION_2026-07.md` — revisión de código y plan de mejoras (incluye la Fase 2 de seguridad, pendiente).
- `security_spec.md` — invariantes objetivo de seguridad (la Fase 2 los implementa; hoy las reglas solo exigen sesión).
- `firebase-blueprint.json` — **DESACTUALIZADO**; la fuente de verdad del modelo es `src/types.ts` + `firestore.rules`.

## Pendiente importante

Fase 2 de seguridad (custom claim `admin` + cerrar lecturas/escrituras a anónimos): ver bloque comentado al final de `firestore.rules` y P0 en `REVISION_2026-07.md`. Borrar a mano `_probe.tmp` y `_sandbox_probe.txt` (restos de una sesión anterior).
