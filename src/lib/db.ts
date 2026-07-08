import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';
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

export const loginAnonymouslyUser = () => signInAnonymously(auth);
export const logout = () => signOut(auth);

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
