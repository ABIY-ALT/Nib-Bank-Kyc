'use client';

import React, { useEffect, useState } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<{
    app: FirebaseApp;
    auth: Auth;
  } | null>(null);

  useEffect(() => {
    const { app, auth } = initializeFirebase();
    setInstances({ app, auth });
  }, []);

  if (!instances) return null;

  return (
    <FirebaseProvider
      app={instances.app}
      auth={instances.auth}
    >
      {children}
    </FirebaseProvider>
  );
}
