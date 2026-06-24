# Runbook: desplegar reglas + Cloud Function + backfill de `catalogo_publico`

Estado de preparación (hecho):
- `firebase.json` ahora incluye el bloque `functions` (source `functions`, build en `predeploy`) y ya apuntaba a la BD nombrada + `us-east1`.
- La Cloud Function corre en `region: us-east1` (coincide con la ubicación de la BD).
- `functions/.env` creado con `FIRESTORE_DATABASE_ID` y `FUNCTION_REGION`.
- Sintaxis de `functions/src/index.ts` validada; sintaxis de `scripts/backfill_catalogo_publico.mjs` validada.

Los comandos de abajo los corrés vos (necesitan tu login de Firebase / credenciales de Admin).

---

## 0) Prerequisitos

```bash
npm install -g firebase-tools        # si no lo tenés
firebase login
firebase use gen-lang-client-0460782288
```

> **Importante (plan):** Las Cloud Functions gen2 requieren el plan **Blaze** (pago por uso) y las APIs de Cloud Build / Artifact Registry / Eventarc. Tu proyecto parece estar en el tier compartido de AI Studio. Si **no** podés activar Blaze, mirá la sección "Sin Functions" más abajo: el **backfill solo sí funciona** sin Blaze para sembrar el catálogo.

---

## 1) Desplegar las reglas (funciona en cualquier plan)

```bash
firebase deploy --only firestore:rules
```

Despliega a la BD nombrada (firebase.json ya define `database` + `location`).

---

## 2) Compilar y desplegar la Function (requiere Blaze)

```bash
cd functions
npm install
npm run build        # tsc -> lib/  (acá ves si compila; debería compilar limpio)
cd ..
firebase deploy --only functions
```

- El deploy publica `onProductWritten` en **us-east1**, escuchando `products/{id}` en la BD nombrada.
- En el primer deploy, Firebase puede pedir habilitar APIs (Cloud Build, Artifact Registry, Eventarc): aceptá.
- La función lee la BD desde `functions/.env` (`FIRESTORE_DATABASE_ID`). No necesita más config.

Verificar que quedó arriba:
```bash
firebase functions:list
firebase functions:log --only onProductWritten
```

Prueba de humo: editá/guardá un producto con `publicar: true` desde la app y confirmá que aparece/actualiza un doc en `catalogo_publico/{id}` **sin** el campo `cost`.

---

## 3) Backfill: sembrar `catalogo_publico` con los productos actuales

Esto puebla el espejo de una vez. Es **independiente** de las Functions (usa Admin SDK y omite las reglas), así que sirve para la carga inicial incluso sin Blaze.

```bash
# Credenciales de Admin (una de las dos):
export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json
#   o:
gcloud auth application-default login

# El script usa firebase-admin; instalalo donde node lo resuelva (raíz del repo):
npm install firebase-admin

# Primero en seco (no escribe nada):
node scripts/backfill_catalogo_publico.mjs --dry-run

# Si se ve bien, ejecutá de verdad:
node scripts/backfill_catalogo_publico.mjs
```

Qué hace: recorre `products`, y por cada uno con `publicar !== false` escribe `catalogo_publico/{id}` derivado (sin `cost`, con `disponible`, `precio.efectivo`, `categorySlug`); los `publicar: false` los borra del espejo. Respeta el mismo cálculo que la Function.

---

## Sin Functions (si no activás Blaze)

- Podés **sembrar** `catalogo_publico` con el backfill (paso 3) — funciona sin Blaze.
- Lo que perdés es la **sincronización automática**: cada cambio de producto no se reflejará solo en el espejo. Opciones:
  - Re-correr el backfill periódicamente (cron en tu máquina/servidor).
  - Activar Blaze más adelante y desplegar la Function (paso 2) para auto-sync.
- No conviene permitir que el cliente escriba `catalogo_publico` (rompería el modelo de seguridad: el espejo es solo-servidor por diseño).

---

## Pendiente / opcional

- **Índices**: si la tablet filtra `catalogo_publico` por `categorySlug` + `disponible` (o con `orderBy`), Firestore pedirá un índice compuesto. Cuando aparezca el error en consola, hace clic en el link que genera el índice, o agregalo a `firestore.indexes.json` y `firebase deploy --only firestore:indexes`.
- **Fase 2 (reglas)**: cuando quieras, activar el bloque comentado de `admin` claim en `firestore.rules` para restringir lectura de `products` (que incluye `cost`) y servir a la tablet solo desde `catalogo_publico`.
