import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { firebaseConfig } from './config';

/**
 * Pure SQL Implementation: Firestore removed.
 * Firebase is strictly used for Identity Authentication.
 */
export function initializeFirebase(): {
  app: FirebaseApp;
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

  const auth = getAuth(app);

  return { app, auth };
}

export * from './provider';
export * from './auth/use-user';
