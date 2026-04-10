import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { toast } from 'sonner';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  throwError = false
) {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code ?? '';

  let userMessage = 'Error inesperado. Inténtalo de nuevo.';
  if (code === 'permission-denied') userMessage = 'Permiso denegado. Contacta con el administrador.';
  else if (code === 'unavailable')  userMessage = 'Sin conexión. Comprueba tu red.';
  else if (code === 'not-found')    userMessage = 'Registro no encontrado.';
  else if (message)                 userMessage = message;

  console.error(`[Firestore ${operationType}] ${path}:`, error);
  toast.error(userMessage);
  if (throwError) throw error;
}
