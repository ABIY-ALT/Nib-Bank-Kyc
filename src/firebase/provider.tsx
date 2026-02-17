'use client';

import React, { createContext, useContext } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';

interface FirebaseContextType {
  app: FirebaseApp | null;
  auth: Auth | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  app: null,
  auth: null,
});

export function FirebaseProvider({
  children,
  app,
  auth,
}: {
  children: React.ReactNode;
  app: FirebaseApp;
  auth: Auth;
}) {
  return (
    <FirebaseContext.Provider value={{ app, auth }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => useContext(FirebaseContext);
export const useFirebaseApp = () => useContext(FirebaseContext).app;
export const useAuth = () => useContext(FirebaseContext).auth;
