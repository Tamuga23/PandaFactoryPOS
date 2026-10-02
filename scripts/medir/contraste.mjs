// Ratios WCAG reales de la paleta, desde los OKLCH de Tailwind v4.
//   npm run medir:contraste
//
// Existe porque Tailwind v4 define la paleta en OKLCH y NO en los hex de v3:
// zinc-500 es #71717b, no #71717a. Todo ratio calculado sobre los hex viejos
// esta mal por unas centesimas, y hubo decisiones tomadas sobre esos numeros.
// El script trae control positivo (blanco/negro = 21.0000) para que no se pueda
// confiar en el sin comprobarlo.
//
// Conversion OKLCH -> sRGB -> luminancia WCAG, escrita de cero para no confiar
// en el numero de nadie. Matriz inversa de Bjorn Ottosson.
import { readFileSync } from 'node:fs';

const TEMA = 'node_modules/tailwindcss/theme.css';
const css = readFileSync(TEMA, 'utf8');
const tokens = {};
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\)/g)) {
  tokens[m[1]] = { L: parseFloat(m[2]) / 100, C: parseFloat(m[3]), h: parseFloat(m[4]) };
}
tokens['white'] = null; tokens['black'] = null;

const aLineal = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const oklchARgb = ({ L, C, h }) => {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return lin.map((v) => Math.round(Math.max(0, Math.min(1, aLineal(v))) * 255));
};
const rgbDe = (nombre) => {
  if (nombre === 'white') return [255, 255, 255];
  if (nombre === 'black') return [0, 0, 0];
  if (nombre.startsWith('#')) {
    const h = nombre.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  if (!tokens[nombre]) throw new Error('token desconocido: ' + nombre);
  return oklchARgb(tokens[nombre]);
};
const aLinealInv = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * aLinealInv(r) + 0.7152 * aLinealInv(g) + 0.0722 * aLinealInv(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const componer = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

// CONTROL POSITIVO
const cp = ratio(rgbDe('white'), rgbDe('black'));
console.log('control positivo blanco/negro:', cp.toFixed(4), cp.toFixed(1) === '21.0' ? 'OK' : 'ROTO');
console.log('zinc-500 ->', '#' + rgbDe('zinc-500').map(v=>v.toString(16).padStart(2,'0')).join(''), '(v4 esperado #71717b, v3 era #71717a)');
console.log('');

const FONDOS = ['zinc-950', 'zinc-900', 'zinc-800', 'zinc-700', 'white'];
const TEXTOS = ['zinc-300','zinc-400','zinc-500','zinc-600','cyan-400','rose-400','rose-500','amber-400','emerald-400'];
console.log('texto      ' + FONDOS.map(f => f.padStart(9)).join(''));
for (const t of TEXTOS) {
  const fila = FONDOS.map(f => ratio(rgbDe(t), rgbDe(f)).toFixed(2).padStart(9)).join('');
  console.log(t.padEnd(11) + fila);
}
console.log('\nrellenos solidos con texto blanco:');
for (const f of ['cyan-700','cyan-800','rose-600','rose-700','emerald-700','amber-600','zinc-700']) {
  console.log('  white / ' + f.padEnd(12), ratio(rgbDe('white'), rgbDe(f)).toFixed(2));
}
