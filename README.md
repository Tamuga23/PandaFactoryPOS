# PandaFactory POS (PandaStoreOS)

Sistema de punto de venta e inventario para Panda Store (Nicaragua). Registra productos, ventas, compras con logística de importación (trackings, landed cost, costo promedio ponderado), clientes, proveedores y objeciones de venta. Alimenta a **PandaLink**, la PWA de tablet para el piso de venta, a través de la colección `catalogo_publico`.

## Stack

Vite + React 19 + TypeScript + Tailwind v4. Firebase Auth (**email/password** con custom claim `admin`; el proveedor anónimo sigue habilitado a propósito para la tablet PandaLink y PandaWEB, que sin el claim no leen nada sensible) y Firestore con **base de datos nombrada** (`firebase-applet-config.json` → `firestoreDatabaseId`). Plan **Spark** (gratuito): no hay Cloud Functions desplegadas; la sincronización del catálogo público se hace con el script de backfill (abajo).

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
- `REVISION_2026-07.md` — revisión de código y plan de mejoras (histórico; su Fase 2 de seguridad ya se implementó).
- `security_spec.md` — invariantes de seguridad. Implementados el 2026-09-10: las reglas exigen el claim `admin` (`isStaff()`), no una sesión cualquiera.
- `REVISION_2026-07-07_MEJORAS.md` — revisión vigente con el ESTADO de lo aplicado (P1, P2.5–P2.8, P3.1, P3.5).
- `DESIGN.md` — el sistema de diseño, derivado de lo que está embarcado. Tiene sidecar en `.impeccable/design.json`.
- `PRODUCT.md` — qué es el producto y qué se le prometió al usuario.
- `AGENTS.md` — guía para agentes de IA que trabajen en este repo.
- La fuente de verdad del modelo de datos es `src/types.ts` + `firestore.rules` (el viejo `firebase-blueprint.json` se eliminó por obsoleto; las fichas Magcubic viven en `docs/`).

## Pendiente importante

**Rotar el service account** (`gen-lang-client-*.json`, en la raíz). Se auditó el historial de git sobre un clon completo el 2026-09-10 y la llave NUNCA se commiteó, así que no hay que reescribir historia; falta rotarla por higiene. Al rotar: **borrá el JSON viejo de la raíz ANTES de revocar la clave en la consola**, porque seis scripts eligen credencial con `existsSync`, que mira si el archivo existe y no si sirve — una llave revocada pero presente en disco los hace fallar con `invalid_grant` aunque `GOOGLE_APPLICATION_CREDENTIALS` esté bien puesta.

La Fase 2 de seguridad ya no está pendiente: se implementó el 2026-09-10 (commit `e029765`), verificada con 26 tests de reglas y contra Firestore real con un token anónimo.
