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

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// Error handler helper
export const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
  const isMissingPermissions = error?.code === 'permission-denied' || (error instanceof Error && error.message.includes('Missing or insufficient permissions'));
  
  if (isMissingPermissions) {
    const errorInfo = {
      error: error.message || 'Permission denied',
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName,
          email: p.email
        })) || []
      }
    };
    throw new Error(JSON.stringify(errorInfo, null, 2));
  }
  throw error;
};
