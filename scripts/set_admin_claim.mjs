#!/usr/bin/env node
/**
 * Otorga (o quita) el custom claim `admin` a un usuario de Firebase Auth.
 *
 * El claim `admin` es lo ÚNICO que separa al staff del público en
 * firestore.rules: `isStaff()` exige `request.auth.token.admin == true`.
 * Una sesión anónima nunca puede llevarlo, y alguien que se auto-registre con
 * email/password tampoco — el claim solo se setea desde acá, con el Admin SDK.
 *
 * Requisitos:
 *   - Credenciales de Admin: GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON
 *     del service account (guardalo FUERA de esta carpeta), o el service
 *     account en la raíz del repo como respaldo.
 *   - El usuario ya tiene que existir en Authentication (creado en la consola
 *     o con --crear).
 *
 * Uso:
 *   node scripts/set_admin_claim.mjs --listar
 *   node scripts/set_admin_claim.mjs vos@tudominio.com
 *   node scripts/set_admin_claim.mjs vos@tudominio.com --crear
 *   node scripts/set_admin_claim.mjs alguien@x.com --quitar
 *
 * DESPUÉS DE CORRERLO: el usuario tiene que cerrar sesión y volver a entrar
 * (o esperar ~1h) para que su token traiga el claim nuevo. El POS fuerza el
 * refresco al iniciar sesión, así que con salir y entrar alcanza.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const LISTAR = args.includes('--listar');
const QUITAR = args.includes('--quitar');
const CREAR = args.includes('--crear');
const email = args.find((a) => !a.startsWith('--'));

if (!LISTAR && !email) {
  console.error(`
Falta el email.

  node scripts/set_admin_claim.mjs --listar              ver quién tiene el claim
  node scripts/set_admin_claim.mjs vos@tudominio.com     dar el claim
  node scripts/set_admin_claim.mjs vos@x.com --crear     crear el usuario y darle el claim
  node scripts/set_admin_claim.mjs otro@x.com --quitar   sacarle el claim
`);
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase-applet-config.json'), 'utf8'));

// Credenciales. Igual que el resto de scripts/: primero la variable de entorno,
// después el service account de la raíz. Si el archivo de la raíz existe pero
// la llave ya fue revocada, firebase-admin falla acá con `invalid_grant`: en ese
// caso borrá el JSON viejo de la raíz para que caiga a la variable de entorno.
const saPath = [
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  join(ROOT, 'gen-lang-client-0460782288-firebase-adminsdk-fbsvc-5e894dbc0a.json'),
].filter(Boolean).find((p) => { try { return existsSync(p); } catch { return false; } });

initializeApp({
  credential: saPath ? cert(JSON.parse(readFileSync(saPath, 'utf8'))) : applicationDefault(),
  projectId: cfg.projectId,
});

const auth = getAuth();

console.log(`[claim] proyecto=${cfg.projectId}`);
console.log(`[claim] credenciales: ${saPath ? 'service account (' + saPath.split(/[\\/]/).pop() + ')' : 'applicationDefault()'}\n`);

async function listar() {
  // Paginado: las sesiones anónimas de la tablet y la web se acumulan de a
  // miles, así que hay que recorrer TODAS las páginas para no perderse una
  // cuenta con claim que quedó más allá de las primeras 1000.
  const todos = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    todos.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);

  if (todos.length === 0) {
    console.log('No hay usuarios en Authentication todavía.');
    console.log('Creá uno en la consola (Authentication -> Usuarios -> Agregar usuario) o corré con --crear.');
    return;
  }

  // Las sesiones anónimas son ruido: son descartables y nunca pueden tener el
  // claim. Se cuentan, no se listan.
  const anonimos = todos.filter((u) => u.providerData.length === 0);
  const conCuenta = todos.filter((u) => u.providerData.length > 0);

  console.log(`${conCuenta.length} cuenta(s) con identidad real:\n`);
  for (const u of conCuenta) {
    const esAdmin = u.customClaims?.admin === true;
    const provs = u.providerData.map((p) => p.providerId).join(', ');
    console.log(`  ${esAdmin ? '[ADMIN]' : '[  -  ]'} ${u.email || '(sin email)'}  uid=${u.uid}  proveedor=${provs}`);
  }

  const admins = todos.filter((u) => u.customClaims?.admin === true).length;
  console.log(`\n+ ${anonimos.length} sesión(es) anónima(s) (PandaLink / PandaWEB / POS viejo) — no se listan.`);
  console.log(`${admins} cuenta(s) con claim admin: solo esas pueden leer products/sales/… con las reglas nuevas.`);
  if (admins === 0) {
    console.log('\nOJO: sin ninguna cuenta admin, desplegar las reglas nuevas deja al staff afuera.');
  }
}

async function main() {
  if (LISTAR) {
    await listar();
    return;
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    if (!CREAR) {
      console.error(`No existe ningún usuario con el email "${email}".`);
      console.error('Creálo en Firebase Console -> Authentication -> Users -> Add user,');
      console.error('o volvé a correr esto con --crear para crearlo desde acá.');
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const pass = (await rl.question(`Contraseña para ${email} (mínimo 6 caracteres): `)).trim();
    rl.close();
    if (pass.length < 6) {
      console.error('La contraseña tiene que tener al menos 6 caracteres.');
      process.exit(1);
    }
    user = await auth.createUser({ email, password: pass, emailVerified: true });
    console.log(`Usuario creado: ${email} (uid=${user.uid})`);
  }

  const claimsPrevios = user.customClaims || {};
  if (QUITAR) {
    const { admin: _quitado, ...resto } = claimsPrevios;
    await auth.setCustomUserClaims(user.uid, resto);
    console.log(`Claim admin QUITADO de ${email} (uid=${user.uid}).`);
  } else {
    await auth.setCustomUserClaims(user.uid, { ...claimsPrevios, admin: true });
    console.log(`Claim admin OTORGADO a ${email} (uid=${user.uid}).`);
  }

  // Releer para confirmar que quedó escrito de verdad.
  const after = await auth.getUser(user.uid);
  console.log(`Confirmado en el servidor: admin=${after.customClaims?.admin === true}`);
  console.log('\nPara que tome efecto: cerrá sesión en el POS y volvé a entrar.');
}

main().catch((err) => {
  console.error('\n[claim] ERROR', err?.message || err);
  if (String(err?.message || '').includes('invalid_grant')) {
    console.error('\nLa llave del service account ya no es válida (fue revocada o rotada).');
    console.error('Borrá el JSON viejo de la raíz del repo y apuntá GOOGLE_APPLICATION_CREDENTIALS a la nueva.');
  }
  process.exit(1);
});
