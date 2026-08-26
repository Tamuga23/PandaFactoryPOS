# Fichas técnicas por categoría + bullets de venta

Cómo funciona el sistema que reemplaza el bloque de specs hardcodeado a proyectores.

## El problema que había

El formulario del POS mostraba cinco campos fijos (ANSI, resolución, throw ratio,
distancia mínima, autofoco) y **solo si la categoría era proyector**:

```ts
specsProyector: isProjectorCategory(formData.category) ? { ansi, throwRatio, … } : undefined
```

Consecuencia: **ningún producto que no sea proyector podía tener ficha técnica**.
Los smartwatches, dashcams, parlantes y cámaras no tenían dónde guardar
resistencia al agua, duración de batería o almacenamiento, así que en PandaLink y
en PandaWEB la sección de especificaciones salía vacía. Y PandaLink no mostraba
specs en absoluto, ni de los proyectores.

## Cómo funciona ahora

Un solo archivo define, por categoría, qué campos existen, cómo se llaman de cara
al cliente y cómo se muestran:

```
src/lib/categorySpecs.ts
```

Está **duplicado idéntico** en los tres repos:

| Repo | Ruta | Rol |
|---|---|---|
| Panda POS | `src/lib/categorySpecs.ts` | genera el formulario de edición |
| PandaLink | `src/lib/categorySpecs.ts` | muestra la ficha al asesor |
| PandaWEB | `src/lib/categorySpecs.ts` | muestra la ficha al cliente |

No tiene imports ni dependencias justamente para poder copiarse tal cual. Los tres
archivos tienen que tener el mismo contenido:

```bash
md5sum PandaFactoryPOS-main/src/lib/categorySpecs.ts \
       PandaLink/src/lib/categorySpecs.ts \
       PandaWEB/src/lib/categorySpecs.ts
```

### Categorías cubiertas

| Categoría | Campos | Ejemplos |
|---|---|---|
| `proyector` | 12 | brillo, resolución, relación de proyección, distancia mínima, parlante, memoria |
| `smartwatch` | 13 | **resistencia al agua, duración de batería, almacenamiento, tamaño de pantalla**, mide, llamadas, GPS |
| `camara` | 13 | resolución, para usar, visión nocturna, ángulo, dónde graba, alarma |
| `dashcam` | 11 | resolución, cámaras, ángulo, modo estacionamiento, GPS, instalación |
| `parlante` | 11 | potencia, batería, resistencia al agua, tamaño, estéreo, karaoke |
| `smarthome` | 10 | para qué sirve, asistentes, rutinas, alimentación, instalación |
| `smarttv` | 8 | resolución, sistema, memoria, apps, control remoto |

### Dónde se guardan

En Firestore siguen dentro de **`specsProyector`**. El nombre es histórico pero se
mantiene a propósito: `firestore.rules`, la Cloud Function `onProductWritten` y los
normalizadores de PandaLink y PandaWEB ya lo soportan (las reglas solo exigen
`specsProyector is map`). Renombrarlo obligaría a deploy de reglas + functions +
backfill sin ningún cambio visible.

Las claves de proyector (`ansi`, `throwRatio`, `distMinEnfoque`, `resolucion`,
`autofoco`) **no se renombran nunca**: hay productos en producción con esos datos.

## Agregar un campo o una categoría

1. Editar `SPECS_POR_CATEGORIA` en `PandaFactoryPOS-main/src/lib/categorySpecs.ts`.
2. Copiar el archivo a `PandaLink/src/lib/` y `PandaWEB/src/lib/`.
3. `npx tsc --noEmit` en los tres.

No hay que tocar el formulario, ni los tipos, ni las reglas de Firestore, ni la
Cloud Function. El campo aparece solo en el POS y en las dos vistas.

Criterio de redacción: las etiquetas las lee el cliente. `Resistencia al agua →
Apto para nadar (5 ATM)`, no `WR: 5ATM`. Si un dato solo lo entiende un técnico,
va en la descripción o en una objeción.

## Reglas de visualización

Las tres apps usan la misma función, `filasDeSpecs(categoria, specs)`, así que
muestran exactamente lo mismo:

- **Orden**: primero los campos de la categoría en el orden del catálogo; después
  cualquier clave extra, alfabética. Un campo nuevo nunca desaparece sin aviso.
- **Vacíos**: no se muestran (nada de filas en blanco).
- **Booleanos en `false`**: no se muestran. No se le anuncia al cliente lo que el
  producto **no** tiene; `true` sale como "Sí".
- **Unidades**: se completan solo si el dato es un número suelto — `3` → `3 meses`,
  `1.2` → `1.2 m`. Si se escribió `1.2 metros`, se respeta tal cual.
- **`ansi` y `lumens`**: son el mismo dato con dos nombres; se muestra una vez.
- **`extra`**: el mapa clave→valor se expande como filas propias (antes salía
  `[object Object]`).
- **Sin filas visibles**: la sección entera no se renderiza.

## Bullets de venta

- El POS ahora permite **reordenar** (flechas) y una **etiqueta corta** opcional
  por bullet. El orden visible es el que se guarda (`order: 1..n`).
- La etiqueta enciende una función que PandaLink ya tenía implementada pero que
  nunca recibía datos: el título en mayúsculas arriba del bullet.
- PandaWEB muestra la etiqueta en negrita antes del texto.
- Si un producto no tiene bullets, el POS lo avisa en el formulario.

## Scripts

Todos leen los campos de `categorySpecs.ts`, así que no se desincronizan.

```bash
npm run auditoria             # qué falta, producto por producto
npm run auditoria:faltantes   # solo los que tienen huecos
node scripts/auditoria_fichas.mjs --csv > fichas.csv

npm run fichas:dry            # PRUEBA: muestra el diff, no escribe
npm run fichas                # aplica
```

`seed_fichas_tecnicas.mjs` lee `scripts/fichas_tecnicas.json` y es conservador:

- Las specs se **mezclan**; un valor ya cargado no se pisa (`--pisar-specs` para forzar).
- Los bullets se escriben **solo si el producto no tiene ninguno**
  (`--pisar-bullets` para reemplazar).
- Nunca toca precio, costo, stock, categoría ni publicación.
- Una clave con typo se reporta y se omite, no se guarda en silencio.

Después de aplicar, `onProductWritten` reconstruye `catalogo_publico`. Si la
función no está desplegada: `node scripts/backfill_catalogo_publico.mjs`.

## Contenido ya cargado en `fichas_tecnicas.json`

Seis productos que no son proyectores, con fuentes verificadas:

| SKU | Producto | Specs |
|---|---|---|
| 1217 | Amazfit Active Max | 10 |
| 1154 | Amazfit Active 2 | 8 |
| — | 70mai A810 Lite | 9 |
| 1208 | 70mai M310 Plus | 8 |
| 1224 | Anker SoundCore 2 | 7 |
| 1212 | Amazon Echo Dot Max | 9 |

Las URLs de referencia están en `_fuentes` dentro del JSON.

## Dos cosas encontradas de paso

1. **Anker SoundCore 2 (1224) está en la categoría `smarthome`.** Es un parlante.
   Con la categoría actual no aparece en el filtro de parlantes de la web.
   Cambiarla a `parlante` no rompe nada: las specs cargadas funcionan en ambas.
2. **El bullet de eero del Echo Dot Max promete de más.** "Extiende tu WiFi hasta
   1,000 pies²" solo aplica si el cliente **ya tiene una red eero**. Sin eero no
   funciona como repetidor.

## Archivos tocados

**Panda POS**
- `src/lib/categorySpecs.ts` — nuevo, el catálogo
- `src/components/ProductCatalog.tsx` — formulario dinámico + bullets con orden y etiqueta
- `src/types.ts` — `ProjectorSpecs` extendida y abierta
- `src/lib/validations.ts` — `SalesBulletSchema.etiqueta`; `ProjectorSpecsSchema` con `catchall`
- `scripts/lib/leerCatalogoSpecs.mjs` — nuevo, lee el catálogo desde `.mjs`
- `scripts/auditoria_fichas.mjs` — nuevo, solo lectura
- `scripts/seed_fichas_tecnicas.mjs` + `scripts/fichas_tecnicas.json` — nuevos
- `package.json` — scripts `auditoria` y `fichas`

**PandaLink**
- `src/lib/categorySpecs.ts` — copia
- `src/components/Ficha.tsx` — bloque "Ficha técnica" colapsable (cerrado por
  defecto, para no romper el layout sin scroll de la tablet); la calculadora de
  distancia ahora se activa por categoría resuelta y no por el literal `"projector"`
- `src/types.ts` — `Specs` abierta

**PandaWEB**
- `src/lib/categorySpecs.ts` — copia
- `src/components/Specs.tsx` — usa el catálogo compartido
- `src/components/comparar/ModalComparar.tsx` — descarta filas sin valor
- `src/app/producto/[id]/page.tsx` — pasa `categorySlug`, oculta la sección vacía, muestra etiquetas
- `src/lib/types.ts` — `Bullet.etiqueta`, `Specs` abierta
- `src/lib/normalize.ts` — conserva `etiqueta`

## Verificación hecha

- `tsc --noEmit` limpio en los tres proyectos.
- Recorrido real doc de Firestore → normalizador de PandaWEB → filas: smartwatch
  con 12 filas ordenadas, `extra` expandido, `false` y vacíos descartados;
  proyector con `ansi`/`lumens` deduplicados; categoría desconocida que igual
  muestra sus datos; producto con todo vacío que no renderiza la sección.
- Lo mismo por el normalizador de PandaLink, que traduce `proyector` → `projector`:
  la ficha resuelve igual y la calculadora sigue apareciendo solo en proyectores.
- 11 pruebas de ida y vuelta del formulario del POS sobre el código real extraído
  del componente: tipos preservados (número, arreglo, booleano), vacíos y `false`
  descartados, y **ninguna spec perdida al cambiar de categoría**.
- 14 casos de formato de unidades.
- Las claves de `fichas_tecnicas.json` validadas contra el catálogo: cero typos.
