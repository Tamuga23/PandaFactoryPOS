import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, collection, query, writeBatch, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Product, Sale } from '../types';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // Evita que valores `undefined` (incl. anidados en specsProyector/media)
  // rompan los writes a Firestore.
  ignoreUndefinedProperties: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email.trim(), password);
export const logout = () => signOut(auth);

/**
 * ¿Esta sesión es staff? Lo define el custom claim `admin`, que es exactamente
 * lo que exige `isStaff()` en firestore.rules. Se setea a mano con
 * `node scripts/set_admin_claim.mjs <email>`; ninguna sesión anónima ni
 * ninguna cuenta auto-registrada lo tiene.
 *
 * Si el claim se acaba de otorgar, el token en mano todavía es viejo: por eso,
 * cuando no aparece, se reintenta UNA vez forzando el refresco contra el
 * servidor. Así el staff no tiene que esperar a que expire el token.
 */
export const tieneClaimStaff = async (user: User): Promise<boolean> => {
  const token = await user.getIdTokenResult();
  if (token.claims.admin === true) return true;
  const fresco = await user.getIdTokenResult(true);
  return fresco.claims.admin === true;
};

/** Mensaje humano para los errores de login de Firebase Auth. */
export const mensajeErrorLogin = (code: string): string => {
  switch (code) {
    case 'auth/invalid-email':
      return 'El correo no tiene un formato válido.';
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Esperá unos minutos e intentá de nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Verificá tu internet e intentá de nuevo.';
    case 'auth/operation-not-allowed':
      return 'El proveedor Email/Password no está habilitado en Firebase Console → Authentication → Sign-in method.';
    default:
      return 'No se pudo iniciar sesión. Intentá de nuevo.';
  }
};

// P3.5: errores de Firestore con mensaje HUMANO (el detalle completo va a
// console.error para depurar; antes el toast mostraba un JSON ilegible).
const OP_LABEL: Record<string, string> = {
  create: 'crear', update: 'actualizar', delete: 'eliminar',
  list: 'leer', get: 'leer', write: 'guardar',
};

export const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
  const code = error?.code || '';
  const isMissingPermissions =
    code === 'permission-denied' ||
    (error instanceof Error && error.message.includes('Missing or insufficient permissions'));

  // Detalle técnico completo, solo a consola.
  console.error('[Firestore]', { code, operationType, path, message: error?.message,
    uid: auth.currentUser?.uid, isAnonymous: auth.currentUser?.isAnonymous });

  const op = OP_LABEL[operationType] || operationType;
  if (isMissingPermissions) {
    throw new Error(
      `Sin permisos para ${op} en "${path}". Si acabás de actualizar la app, ` +
      `probablemente falte desplegar las reglas (firebase deploy --only firestore:rules).`
    );
  }
  if (code === 'unavailable') {
    throw new Error('Sin conexión con la base de datos. Verificá tu internet e intentá de nuevo.');
  }
  if (code === 'not-found') {
    throw new Error(`No se pudo ${op}: el documento "${path}" ya no existe.`);
  }
  if (code === 'aborted' || code === 'failed-precondition') {
    throw new Error('Otro dispositivo modificó estos datos al mismo tiempo. Intentá de nuevo.');
  }
  if (code === 'resource-exhausted') {
    throw new Error('Se alcanzó la cuota diaria de Firestore (plan Spark). Intentá más tarde.');
  }
  throw error;
};
