#!/usr/bin/env node
/**
 * Genera los íconos de la PWA a partir de los dos SVG maestros.
 *
 *   scripts/iconos/icono-app.svg  -> íconos de instalación (manifest + iOS)
 *   public/favicon.svg            -> favicon.ico (pestaña del navegador y Vercel)
 *
 * Los PNG y el .ico se commitean: el build de Vercel NO corre este script.
 * Si cambiás un SVG, corré `npm run iconos` y commiteá lo que genere.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const publico = join(raiz, 'public');
mkdirSync(join(publico, 'icons'), { recursive: true });

const iconoApp = readFileSync(join(raiz, 'scripts', 'iconos', 'icono-app.svg'), 'utf8');
const favicon = readFileSync(join(publico, 'favicon.svg'), 'utf8');

const png = (svg, lado) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: lado } }).render().asPng();

// 192 y 512 los pide el manifest; 96 lo usan los accesos directos; 180 es el
// tamaño que iOS espera para la pantalla de inicio (sin transparencia: iOS
// rellena de negro lo transparente, y el ícono maestro ya es opaco).
const salidas = [
  ['icons/icon-96.png', iconoApp, 96],
  ['icons/icon-192.png', iconoApp, 192],
  ['icons/icon-512.png', iconoApp, 512],
  ['apple-touch-icon.png', iconoApp, 180],
];
for (const [ruta, svg, lado] of salidas) {
  writeFileSync(join(publico, ruta), png(svg, lado));
  console.log(`  ${ruta} (${lado}px)`);
}

// favicon.ico con PNG embebidos (formato válido desde Windows Vista). Existe
// porque hay clientes que piden /favicon.ico sin leer el HTML, y sin el
// archivo esa ruta caía en el rewrite de vercel.json y devolvía index.html.
const lados = [16, 32, 48];
const imagenes = lados.map((lado) => png(favicon, lado));
const cabecera = Buffer.alloc(6 + 16 * lados.length);
cabecera.writeUInt16LE(0, 0); // reservado
cabecera.writeUInt16LE(1, 2); // tipo: ícono
cabecera.writeUInt16LE(lados.length, 4);
let offset = cabecera.length;
lados.forEach((lado, i) => {
  const e = 6 + 16 * i;
  cabecera.writeUInt8(lado, e); // ancho
  cabecera.writeUInt8(lado, e + 1); // alto
  cabecera.writeUInt8(0, e + 2); // sin paleta
  cabecera.writeUInt8(0, e + 3); // reservado
  cabecera.writeUInt16LE(1, e + 4); // planos
  cabecera.writeUInt16LE(32, e + 6); // bits por pixel
  cabecera.writeUInt32LE(imagenes[i].length, e + 8);
  cabecera.writeUInt32LE(offset, e + 12);
  offset += imagenes[i].length;
});
writeFileSync(join(publico, 'favicon.ico'), Buffer.concat([cabecera, ...imagenes]));
console.log(`  favicon.ico (${lados.join(', ')}px)`);
