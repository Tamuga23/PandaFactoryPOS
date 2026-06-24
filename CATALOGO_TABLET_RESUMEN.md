# Feature: `catalogo_publico` (catálogo para tablet)

Rama de trabajo: **`feature/catalogo-tablet`**. Sin deploy a Firebase, sin push a `main`.
Verificación: `tsc --noEmit` (= `npm run lint`) **compila limpio** con el proyecto completo y `zod@4` real.

## Principio de diseño respetado

`products` sigue siendo privado y fuente de verdad. Se le agregaron campos **opcionales** para la tablet. `cost` **no cambia y nunca se copia** al espejo. `catalogo_publico/{id}` es una proyección derivada (sin `cost`) que **solo escribe el servidor** (Cloud Function); ningún cliente la escribe.

## Archivos tocados

Modificados:
- `src/types.ts` — `Product` extendido con 10 campos opcionales; nuevas interfaces `SalesBullet`, `ObjectionOverride`, `ProjectorSpecs`, `TabletMedia`, `PublicCatalogProduct`, `UniversalObjection`.
- `src/lib/validations.ts` — schemas Zod de las sub-estructuras + `ProductTabletFieldsSchema`; `ProductSchema` ahora hace `.extend(ProductTabletFieldsSchema.shape)` (todo opcional); funciones puras `slugify`, `round2` y `buildPublicCatalogDoc`.
- `firestore.rules` — lista blanca de `products` ampliada (en `isValidProduct` y en `affectedKeys().hasOnly` del update) con validaciones por campo; reglas nuevas para `catalogo_publico` y `objeciones_universales`; bloque comentado **Fase 2** (claim `admin`).
- `tsconfig.json` — `exclude` agregado para `functions` y `scripts` (paquetes aparte; no deben entrar al `tsc` del front).

Nuevos:
- `functions/src/index.ts` — Cloud Function v2 `onProductWritten` = `onDocumentWritten('products/{id}')`. Reconstruye `catalogo_publico/{id}` en cada cambio; lo borra si el producto se borra o si `publicar === false`. Usa **base de datos nombrada** (`DATABASE_ID`) leída de `firebase-applet-config.json`.
- `functions/package.json` — paquete mínimo con `firebase-admin` + `firebase-functions`.
- `functions/tsconfig.json` — config de compilación de las functions (CommonJS, `outDir: lib`).
- `scripts/backfill_catalogo_publico.mjs` — script de un solo uso (Admin SDK) que puebla `catalogo_publico` desde los `products` actuales, respetando `publicar`. Soporta `--dry-run`.

## Lógica de `buildPublicCatalogDoc(product)`

- **Nunca** incluye `cost`.
- `disponible = stock > 0 && publicar !== false`.
- `precio.actual = precioPromo ?? price`; `precio.efectivo = round2(actual * (1 - descEfectivoPct/100))`.
- `categorySlug = slugify(categorySlug || category)` — sin acentos, minúsculas, espacios→guiones.
- Copia campos de display si existen: `description, campania, beneficio, bullets, specsProyector, objecionesOverride, media`.

La función vive en `src/lib/validations.ts` (front). La Cloud Function y el backfill **replican** esa lógica localmente para no arrastrar `zod` al paquete de functions (se mantiene mínimo); hay un comentario que lo indica.

## Diff de `firestore.rules`

> Nota: el rule logic es idéntico al de tu archivo; este diff fue generado en una copia interna donde algunos comentarios quedaron sin tildes. Tu `firestore.rules` real conserva los acentos (“Catálogo público”, “garantía”, etc.).

```diff
@@ isValidProduct: lista blanca de products ampliada @@
-        && data.keys().hasOnly([... 'createdAt', 'updatedAt', 'ownerId'])
+        && data.keys().hasOnly([... 'createdAt', 'updatedAt', 'ownerId',
+            'categorySlug', 'publicar', 'precioPromo', 'descEfectivoPct', 'campania', 'beneficio', 'bullets', 'specsProyector', 'objecionesOverride', 'media'])
@@ isValidProduct: validaciones por campo (todas opcionales) @@
-        && (!('isReordering' in data) || (data.isReordering is bool));
+        && (!('isReordering' in data) || (data.isReordering is bool))
+        && (!('categorySlug' in data) || (data.categorySlug is string && data.categorySlug.size() <= 60))
+        && (!('publicar' in data) || (data.publicar is bool))
+        && (!('precioPromo' in data) || (data.precioPromo is number && data.precioPromo >= 0))
+        && (!('descEfectivoPct' in data) || (data.descEfectivoPct is number && data.descEfectivoPct >= 0 && data.descEfectivoPct <= 100))
+        && (!('campania' in data) || (data.campania is string && data.campania.size() <= 100))
+        && (!('beneficio' in data) || (data.beneficio is string && data.beneficio.size() <= 300))
+        && (!('bullets' in data) || (data.bullets is list && data.bullets.size() <= 20))
+        && (!('specsProyector' in data) || (data.specsProyector is map))
+        && (!('objecionesOverride' in data) || (data.objecionesOverride is list && data.objecionesOverride.size() <= 30))
+        && (!('media' in data) || (data.media is map));
@@ products update: affectedKeys().hasOnly ampliado con los mismos campos @@
@@ + function isValidUniversalObjection(data) { ... } @@
@@ + match /catalogo_publico/{productId}  -> get/list si signed-in; create/update/delete: false @@
@@ + match /objeciones_universales/{objId} -> get/list si signed-in; write si signed-in + isValidUniversalObjection @@
@@ + bloque comentado "FASE 2" (isAdmin con request.auth.token.admin) @@
```

## Próximos pasos (cuando quieras, manual)

1. **Functions**: `cd functions && npm install && npm run build`. La región del trigger debe coincidir con la ubicación de la BD nombrada; si no es `us-central1`, agregá `region` en las opciones. En deploy, la function lee `firestoreDatabaseId` de `firebase-applet-config.json` (busca en `functions/` y en la raíz) o de `FIRESTORE_DATABASE_ID`.
2. **Reglas**: `firebase deploy --only firestore:rules` (cuando revises).
3. **Backfill** (una vez, tras desplegar reglas/función): `node scripts/backfill_catalogo_publico.mjs --dry-run` y luego sin el flag. Requiere `GOOGLE_APPLICATION_CREDENTIALS` o `gcloud auth application-default login`, y `firebase-admin` instalado.
4. **Índices**: si la tablet filtra por `categorySlug` + `disponible`, creá el índice compuesto correspondiente.

## Nota sobre git y archivos a borrar

El sistema de archivos por el que accedí a tu carpeta **no permite borrar archivos**, así que no pude inicializar un repo git dentro de tu carpeta (git necesita borrar/renombrar locks). Construí y verifiqué la rama en una copia interna; **tus archivos quedaron actualizados in situ** para que los commitees vos. Quedaron 3 restos que conviene borrar a mano (yo no puedo):

- `.git/` (carpeta corrupta de un intento fallido)
- `_probe.tmp`
- `_sandbox_probe.txt`

En Windows: `rmdir /s /q .git` y `del _probe.tmp _sandbox_probe.txt`.
