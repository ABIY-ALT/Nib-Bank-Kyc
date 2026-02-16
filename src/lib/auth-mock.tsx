
'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase, useFirestore } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, limit, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export type UserRole = 
  | 'BRANCH_OFFICER' 
  | 'KYC_OFFICER' 
  | 'SUPERVISOR' 
  | 'BRANCH_BANKING_DIRECTOR' 
  | 'ADMIN' 
  | 'BRANCH_MANAGER' 
  | 'DISTRICT_DIRECTOR' 
  | 'DIVISION_MANAGER' 
  | 'CHIEF_RETAIL_SME_OFFICER' 
  | 'FOLLOW_UP_TEAM' 
  | 'CHIEF';

export interface User {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  role?: UserRole;
  branch?: string;
  assignedBranches?: string[];
  district?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  needsPasswordChange?: boolean;
}

const SESSION_TIMEOUT_MINUTES = 30;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
  allUsers: User[]; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [dbUsers, setDbUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "users"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      setDbUsers(users);
    });
    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!auth || !db) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const userDoc = await getDoc(doc(db, "users", fbUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          if (userData.status !== 'ACTIVE') {
            toast({ variant: 'destructive', title: 'Access Denied', description: `Your account is currently ${userData.status}.` });
            await signOut(auth);
            setUser(null);
          } else {
            setUser({ ...userData, id: fbUser.uid });
          }
        } else {
          setUser(null); // No local profile found for this auth user
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, db]);

  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      if (user && now - lastActivity > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
        logout('Session Timeout');
      }
    }, 60000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearInterval(interval);
    };
  }, [user, lastActivity]);

  const login = async (email: string, pass: string) => {
    if (!auth) return;
    if (!email.toLowerCase().endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domain.');
    }
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async (reason: string = 'User Logout') => {
    setUser(null);
    if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Institutional session terminated: ${reason}` });
  };

  const changePassword = async (newPass: string) => {
    if (!db || !user || !auth?.currentUser) return;
    await fbUpdatePassword(auth.currentUser, newPass);
    await updateDoc(doc(db, "users", user.id), { needsPasswordChange: false });
    setUser(prev => prev ? { ...prev, needsPasswordChange: false } : null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      changePassword, 
      allUsers: dbUsers 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
