
'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase, useFirestore } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword as fbUpdatePassword,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, limit, onSnapshot, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { syncUserToSql } from '@/actions/auth';
import { firebaseConfig } from '@/firebase/config';

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
  isMock: boolean;
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
  
  // Detect if we are in mock mode (no valid API key)
  const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === 'INITIALIZING';

  useEffect(() => {
    if (!db || isMockMode) return;
    
    const q = query(collection(db, "users"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
      setDbUsers(users);
    }, (error) => {
      console.warn("User list sync bypassed:", error.message);
    });
    return () => unsubscribe();
  }, [db, isMockMode]);

  useEffect(() => {
    if (isMockMode) {
      const savedUser = localStorage.getItem('nib_mock_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      setLoading(false);
      return;
    }

    if (!auth || !db) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", fbUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            if (userData.status !== 'ACTIVE') {
              toast({ variant: 'destructive', title: 'Access Denied', description: `Your account is currently ${userData.status}.` });
              await signOut(auth);
              setUser(null);
            } else {
              const currentUser = { ...userData, id: fbUser.uid };
              setUser(currentUser);
              
              await syncUserToSql({
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
                role: currentUser.role,
                branch: currentUser.branch,
                district: currentUser.district
              });
            }
          } else {
            const basicUser: User = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Unknown User',
              email: fbUser.email || '',
              role: 'BRANCH_OFFICER',
              status: 'ACTIVE'
            };
            setUser(basicUser);
            await syncUserToSql(basicUser);
          }
        } catch (e) {
          console.error("Auth profile sync failed:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, db, toast, isMockMode]);

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
    if (!email.toLowerCase().endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domain.');
    }

    if (isMockMode) {
      if (pass !== 'nibbank123') throw new Error('Invalid developer credential.');
      
      const mockId = `mock-${email.split('@')[0]}`;
      const mockUser: User = {
        id: mockId,
        name: email.split('@')[0].split('.').join(' '),
        email: email,
        role: email.toLowerCase().includes('admin') ? 'ADMIN' : 'BRANCH_OFFICER',
        status: 'ACTIVE'
      };

      setUser(mockUser);
      localStorage.setItem('nib_mock_user', JSON.stringify(mockUser));
      
      await syncUserToSql({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });

      toast({ title: 'Mock Mode Active', description: 'Authenticated using developer fallback.' });
      return;
    }

    if (!auth) return;
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async (reason: string = 'User Logout') => {
    setUser(null);
    if (isMockMode) {
      localStorage.removeItem('nib_mock_user');
    } else if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Institutional session terminated: ${reason}` });
  };

  const changePassword = async (newPass: string) => {
    if (isMockMode) {
      setUser(prev => prev ? { ...prev, needsPasswordChange: false } : null);
      return;
    }
    if (!db || !user || !auth?.currentUser) return;
    await fbUpdatePassword(auth.currentUser, newPass);
    await updateDoc(doc(db, "users", user.id), { needsPasswordChange: false });
    setUser(prev => prev ? { ...prev, needsPasswordChange: false } : null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isMock: isMockMode,
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
