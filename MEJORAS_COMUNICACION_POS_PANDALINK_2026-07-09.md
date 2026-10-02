# Comunicación POS ↔ PandaLink — inconsistencias y mejoras (2026-07-09)

Revisión del canal de datos entre PandaFactoryPOS y PandaLink al día de hoy, contrastada con lo ya corregido en `INCONSISTENCIAS.md`, `INTEGRACION_Y_UI_2026-07.md` y `REVISION_2026-07-07_MEJORAS.md` (no se repite lo resuelto). Cada mejora indica el modelo de Claude óptimo por etapa.

## Cómo se comunican hoy

`products` → espejo `catalogo_publico` vía **backfill manual semanal** (`scripts/backfill_catalogo_publico.mjs`). Existe la Cloud Function `onProductWritten` (`functions/src/index.ts`) que haría el espejo en vivo, pero el plan Spark no permite desplegarla. `objeciones_universales` y `objeciones_categoria` sí llegan a la tablet **en vivo** (`onSnapshot`). Ambas apps usan la misma config, base nombrada y sesión anónima. La tablet absorbe las diferencias de esquema con un normalizador (`usePandaData.ts`).

## Inconsistencias vigentes

| # | Sev. | Inconsistencia | Evidencia |
|---|------|----------------|-----------|
| 1 | ALTA | **Espejo desactualizado entre backfills**: una venta que agota stock o un cambio de precio no llega a la tablet hasta el próximo `npm run backfill`. No hay indicador de staleness en ningún lado. | `functions/index.ts:132` (sin desplegar); `INTEGRACION §3` |
| 2 | ALTA | **Doble esquema de slugs (ES/EN) con mapa parcial en el cliente**: `SLUG_MAP` solo cubre proyector/camara/parlante. `dashcam` no está mapeado ni en `CATS` → aparece como chip crudo "dashcam". Además el espejo deriva el slug con `slugify(category)` sobre texto libre: "Proyectores" → `proyectores` ≠ `proyector` → categoría partida en dos chips. | `usePandaData.ts:16`; `App.tsx:30-35,83-85`; `backfill:66`; `functions:111` |
| 3 | ALTA | **Tasa de cambio duplicada**: tablet con `USD_TO_NIO = 36.6243` hardcodeada; el POS usa `companyInfo.defaultExchangeRate` editable en Settings. Si cambia la tasa, el precio en C$ que ve el cliente en la tablet ≠ factura en caja. | `PandaLink/config.ts:4` |
| 4 | MEDIA | **Reglas de negocio solo en la tablet**: cuotas 0% (mín. $100, 3/6 meses), promo con vencimiento (19-jul) y voz del asesor viven en `config.ts` de PandaLink. El POS no las conoce → la tablet puede prometer algo que caja no aplica, y actualizar la promo exige rebuild + redeploy de la PWA. | `config.ts:7-17`; `Ficha.tsx:161`; `PCard.tsx:9` |
| 5 | MEDIA | **`buildPublicCatalogDoc` triplicada**: `validations.ts:306` (muerta, nadie la llama), `backfill:49` y `functions:93`. Tres copias a mano = deriva de contrato garantizada al primer cambio. | grep sin usos de la versión de `validations.ts` |
| 6 | MEDIA | **Nomenclatura dual en objeciones**: universales `{titulo, order}`, categoría `{pregunta, orden}`, overrides `{objId, titulo}`. Lo sostiene el normalizador de la tablet; cualquier campo nuevo requiere tocar 3 esquemas + reglas + normalizador. | `firestore.rules:180-199`; `usePandaData.ts:127-149` |
| 7 | BAJA | **`campania` viaja y nadie la muestra**: el espejo la escribe en la raíz del doc, el tipo de la tablet la espera dentro de `precio.*`, y ninguna UI la renderiza. Campo muerto punta a punta. | `backfill:72`; `PandaLink/types.ts:30` |
| 8 | BAJA | **Transporte Firestore desalineado**: POS con `experimentalForceLongPolling` (latencia) y sin `persistentLocalCache`; tablet con `autoDetectLongPolling`. | `db.ts:9`; `firebase.ts:17` |
| 9 | PROCESO | **P0 de seguridad pendiente condiciona el canal**: hoy cualquier anónimo lee ventas y costos. Al cerrar reglas hay que abrir primero lectura pública de `catalogo_publico` + objeciones o la tablet queda a ciegas (el plan ya está comentado en las reglas). | `firestore.rules:343-351`; `REVISION P0.1/P0.2` |
| 10 | PROCESO | **Higiene de repos repetida**: PandaLink otra vez con cambios sin commitear (ya pasó el 2-jul); ningún repo tiene CI (tsc/build); los deploys de reglas olvidados ya bloquearon features (counters). | `git status`; `REVISION "Pendiente de Carlos"` |
| 11 | DATOS | **Overrides sin objeción base**: `luz`/`enfoque` siguen sin existir como base de proyector → el botón muestra el slug crudo. No hay validador que lo detecte antes de publicar. | `INTEGRACION §2.2` |

---

## Mejoras propuestas

Formato: qué hacer → etapas con **modelo Claude** sugerido. Guía de asignación al final.

### Proceso

**PR1 · Congelar el contrato de datos v1.**
Un `contracts/` con JSON Schema de `catalogo_publico` y las 3 formas de objeción + fixtures golden, referenciado por ambos repos, con test de paridad en CI (si el POS escribe algo que la tablet no entiende, falla el build, no la venta).
*Etapas:* diseño del contrato → **Opus 4.8** (una sesión, en modo plan) · schemas + tests → **Sonnet 5** · mantenimiento → **Haiku 4.5**.

**PR2 · Rutina de publicación única.**
Script `publicar`: `backfill:dry` → resumen → `backfill` → verificación (conteo publicados + staleness). Expuesto como GitHub Action manual para correrlo desde el teléfono.
*Etapas:* script + YAML → **Haiku 4.5** · revisión → **Sonnet 5**.

**PR3 · CI mínima en ambos repos.**
`tsc` + build (+ smoke Playwright que ya existe en la tablet) en cada push; aviso de working tree sucio. Ataca #10.
*Etapas:* todo → **Haiku 4.5**.

**PR4 · Validador de datos pre-publicación.**
Script que cruza: overrides vs objeciones base (caso `luz`/`enfoque`), slugs de productos vs `objeciones_categoria`, productos publicados sin precio/imagen. Correr antes de cada backfill. Ataca #11.
*Etapas:* escribirlo → **Sonnet 5** · ajustes futuros → **Haiku 4.5**.

**PR5 · Plan de corte para P0 sin romper la tablet.**
Secuencia: (1) abrir lectura pública de espejo + objeciones, (2) claim `admin` + login email, (3) cerrar el resto. Ensayar en emulador con los tests de reglas.
*Etapas:* diseño de secuencia y reglas → **Opus 4.8** (seguridad = no escatimar) · ejecución → **Sonnet 5** · tests de reglas → **Haiku 4.5**.

### Backend

**BE1 · Slugs canónicos en el origen (mata #2).**
Catálogo fijo de categorías `{slug EN canónico, label ES}` en un módulo compartido; `buildPublicCatalogDoc` escribe siempre el slug canónico; migración one-shot de docs existentes (espejo + `objeciones_categoria`); borrar `SLUG_MAP` de la tablet.
*Etapas:* definir catálogo canónico + plan de migración → **Opus 4.8** (corto) · implementación + script de migración → **Sonnet 5** · renombres mecánicos → **Haiku 4.5**.

**BE2 · Una sola `buildPublicCatalogDoc` (mata #5).**
Fuente única en `validations.ts` (hoy muerta) consumida por script y functions vía build, o mínimo un golden-test que falle si las 3 copias divergen.
*Etapas:* **Sonnet 5**.

**BE3 · Espejo en vivo (mata #1).**
Pasar a Blaze y desplegar `onProductWritten` (ya está escrita; a este volumen el costo es ~$0). El backfill queda como reconciliación semanal. Alternativa en Spark: badge de staleness (FE1/FE4) + Action diaria.
*Etapas:* decisión de plan → conversación (sin modelo) · deploy + config → **Sonnet 5**.

**BE4 · Doc `config_publico` compartido (mata #3 y #4).**
Un doc con tasa NIO, promo (texto + vencimiento), financiamiento (mín. + plazos) y voz del asesor. Editable desde Settings del POS; la tablet lo lee `onSnapshot` con fallback a `config.ts`. Cambiar la promo deja de requerir redeploy.
*Etapas:* modelo de datos + reglas → **Sonnet 5** (validar reglas con **Opus 4.8** si se hace junto a PR5) · implementación ambos lados → **Sonnet 5** · UI de Settings → **Haiku 4.5**.

**BE5 · Alinear transporte Firestore (mata #8).**
POS a `experimentalAutoDetectLongPolling` + `persistentLocalCache` (un punto de venta físico no puede quedarse ciego sin internet; la tablet ya degrada bien).
*Etapas:* **Haiku 4.5**, revisión **Sonnet 5**.

**BE6 · Unificar contrato de objeciones (mata #6).**
Migrar universales a `{pregunta, respuesta, orden}` (script admin + reglas + UI del POS) y adelgazar el normalizador de la tablet a passthrough con tolerancia legacy.
*Etapas:* plan de migración → **Opus 4.8** (toca reglas + datos vivos) · ejecución → **Sonnet 5** · limpieza del normalizador → **Haiku 4.5**.

### UI/UX/Frontend

**FE1 · POS: panel "Canal tablet".**
En Settings o Catálogo: estado de sincronización (máx `updatedAt` de products vs `espejoActualizadoAt`), lista "pendiente de publicar", y edición de tasa/promo/financiamiento (BE4). Le da a Carlos visibilidad de lo que el cliente está viendo.
*Etapas:* diseño + implementación → **Sonnet 5** · estilos → **Haiku 4.5**.

**FE2 · POS: categoría como select canónico.**
En form de producto y de objeción por categoría: select con label ES y slug fijo (BE1) en vez de texto libre. Elimina la raíz del split de categorías.
*Etapas:* **Sonnet 5**.

**FE3 · POS: aviso "solo YouTube" en Video URL.**
Peor que pendiente: el label del form dice "URL YouTube/**Vimeo**" (`ProductCatalog.tsx:728`), pero la tablet solo embebe YouTube (`toYouTubeEmbed`) — un Vimeo cae a foto en silencio. Corregir label + validación.
*Etapas:* **Haiku 4.5**.

**FE4 · Tablet: badge de frescura.**
"Precios actualizados hace Xd" discreto cuando `espejoActualizadoAt` supera un umbral. Complemento barato de BE3 (o sustituto si se queda en Spark).
*Etapas:* **Sonnet 5**.

**FE5 · Tablet: mostrar `campania` o retirarla (mata #7).**
Badge en Ficha/PCard leyendo de la raíz del doc, o eliminar el campo del contrato en PR1.
*Etapas:* **Haiku 4.5**.

**FE6 · Tokens visuales compartidos.**
Acento cyan, semánticos emerald/rose/amber y labels `text-xs uppercase` definidos igual en el `tailwind.config` de ambos repos desde un snippet común (cierra la coherencia iniciada el 2-jul).
*Etapas:* **Haiku 4.5**.

---

## Guía de modelos para gastar menos tokens

Regla central: **planificar caro, ejecutar barato.**

| Modelo | Usarlo para | Evitarlo para |
|---|---|---|
| **Opus 4.8** | Diseño de contrato (PR1), seguridad/reglas (PR5, BE6), migraciones que tocan datos vivos (BE1). Solo en modo plan: entrega el plan y se retira. | Editar muchos archivos, traducciones, estilos — quema tokens sin ganancia. |
| **Sonnet 5** | Default de desarrollo: features multi-archivo, integración entre repos, hooks, scripts con lógica (PR4, BE2-BE4, FE1, FE2, FE4). | Barridos mecánicos que Haiku resuelve igual. |
| **Haiku 4.5** | Renombres, traducciones, estilos, YAML de CI, scripts chicos, tests mecánicos (PR2, PR3, BE5, FE3, FE5, FE6). Cuesta una fracción de Sonnet y en tareas acotadas rinde igual. | Decisiones de arquitectura o cambios que crucen los dos repos. |

Prácticas que multiplican el ahorro: una sesión por mejora (contexto chico = menos tokens re-leídos); guardar el plan de Opus como `.md` y pasárselo a Sonnet/Haiku en vez de re-explicar; en Claude Code cambiar con `/model` por tarea; y usar este documento como brief — cada mejora ya trae contexto y referencias para no re-explorar el código.

## Orden sugerido

1. **BE3 + PR2** — frescura del espejo (la inconsistencia que el cliente ve).
2. **BE4 + FE1** — tasa/promo unificadas y visibles.
3. **BE1 + FE2** — slugs canónicos.
4. **PR5** — corte de seguridad P0 (ya diseñado, no posponer más).
5. **PR1, BE6, PR3/PR4** y el resto de FE.
