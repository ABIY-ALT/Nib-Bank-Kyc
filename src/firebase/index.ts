
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

export function initializeFirebase(): {
  app: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
} {
  let app: FirebaseApp;

  if (getApps().length > 0) {
    app = getApp();
  } else {
    const isConfigPopulated = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined';
    
    app = initializeApp(isConfigPopulated ? firebaseConfig : {
      ...firebaseConfig,
      apiKey: 'INITIALIZING',
    });
  }

  const firestore = getFirestore(app);
  const auth = getAuth(app);

  return { app, firestore, auth };
}

export * from './provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './firestore/use-memo-firebase';
export * from './auth/use-user';
