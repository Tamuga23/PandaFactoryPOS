// Cuantos controles enfocables hay y cuantos muestran el foco.
//   npm run medir:foco
//
// Existe porque los numeros de DESIGN.md se contaban a mano y salian mal. Decia
// "144 de 146 botones" cuando el conteo real de <button> es 149 de 149, y peor:
// medir SOLO <button> daba la regla por cumplida mientras tres controles
// visibles (un <Link> con pinta de boton primario, el buscador del Historial y
// un file input) no declaraban nada. Un documento que mide mal manda a trabajar
// sobre el problema equivocado.
//
// Cuenta controles enfocables de JSX balanceando llaves, comillas y strings de
// plantilla. Un <button> NO termina en el primer '>': `onClick={() => ...}` trae
// uno adentro, y un comentario que diga `700 -> 800` tambien. Contar con una
// expresion ingenua SUBCUENTA — ya paso en este repo.
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const ETIQUETAS = ['button', 'input', 'select', 'textarea', 'a', 'Link'];

/** Devuelve las etiquetas de apertura completas del archivo, sin comentarios. */
function aperturas(src) {
  // Sacar comentarios de bloque JS y de JSX para no contar menciones en prosa.
  const limpio = src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')   // {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '')             // /* ... */
    .replace(/^[ \t]*\/\/.*$/gm, '');             // // ...

  const out = [];
  for (let i = 0; i < limpio.length; i++) {
    if (limpio[i] !== '<') continue;
    const m = /^<([A-Za-z][A-Za-z0-9]*)[\s/>]/.exec(limpio.slice(i, i + 40));
    if (!m || !ETIQUETAS.includes(m[1])) continue;

    // Avanzar balanceando { } y saltando strings, hasta el '>' de cierre.
    let j = i + 1, llaves = 0, comilla = null;
    for (; j < limpio.length; j++) {
      const c = limpio[j];
      if (comilla) {
        if (c === '\\') { j++; continue; }
        if (c === comilla) comilla = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { comilla = c; continue; }
      if (c === '{') { llaves++; continue; }
      if (c === '}') { llaves--; continue; }
      if (c === '>' && llaves === 0) break;
    }
    out.push({ tag: m[1], texto: limpio.slice(i, j + 1) });
    i = j;
  }
  return out;
}


/** El <label> mas cercano hacia atras, y si declara focus-within. */
function envueltoEnFocusWithin(src, textoInput) {
  const i = src.indexOf(textoInput.slice(0, 40));
  if (i < 0) return false;
  const j = src.lastIndexOf('<label', i);
  if (j < 0) return false;
  return /focus-within:/.test(src.slice(j, i));
}

const archivos = globSync('src/**/*.tsx');
const porTipo = {};
const sinFoco = [];

for (const f of archivos) {
  const src = readFileSync(f, 'utf8');
  for (const { tag, texto } of aperturas(src)) {
    // Un <a> o <Link> sin href/to no es un control enfocable.
    if ((tag === 'a' || tag === 'Link') && !/\b(href|to)=/.test(texto)) continue;
    // Los type="hidden" no se enfocan.
    if (tag === 'input' && /type="hidden"/.test(texto)) continue;

    porTipo[tag] ??= { total: 0, conFoco: 0 };
    porTipo[tag].total++;
    // Un anillo declarado por el propio control...
    let tieneAnillo = /focus:ring-[0-9]/.test(texto) || /focus:border-/.test(texto)
      || /focus-visible:/.test(texto) || /focus-within:/.test(texto);
    // ...o el anillo NATIVO del navegador, que sigue ahi mientras nadie ponga
    // `outline-none`. Los checkbox y radio lo dibujan solos y se ve bien.
    if (!tieneAnillo && /type="(checkbox|radio)"/.test(texto) && !/outline-none/.test(texto)) {
      tieneAnillo = true;
    }
    // ...o, si el control esta `sr-only`, el <label> que lo envuelve con
    // `focus-within`. Se verifica aparte porque el wrapper no esta en `texto`.
    if (!tieneAnillo && /className="sr-only"/.test(texto) && /type="file"/.test(texto)) {
      tieneAnillo = envueltoEnFocusWithin(src, texto);
    }
    if (tieneAnillo) porTipo[tag].conFoco++;
    else sinFoco.push(`${f.replace(/\\/g, '/')}  <${tag}>  ${texto.replace(/\s+/g, ' ').slice(0, 88)}`);
  }
}

let t = 0, c = 0;
console.log('tipo        con foco / total');
for (const [tag, v] of Object.entries(porTipo).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  <${tag}>`.padEnd(12) + `${v.conFoco} / ${v.total}`);
  t += v.total; c += v.conFoco;
}
console.log('  ' + '-'.repeat(24));
console.log('  TOTAL'.padEnd(12) + `${c} / ${t}   (${((c / t) * 100).toFixed(1)}%)`);

if (sinFoco.length) {
  console.log('\nSIN ANILLO DE FOCO (' + sinFoco.length + '):');
  sinFoco.forEach((s) => console.log('  ' + s));
}
