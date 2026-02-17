'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useFirebase } from '@/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { syncUserToSql, getUserProfile, getUserByEmail } from '@/actions/auth';
import { firebaseConfig } from '@/firebase/config';
import { UserRole, UserStatus } from '@prisma/client';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  role: UserRole;
  branchName?: string | null;
  assignedBranches: string[];
  districtName?: string | null;
  status: UserStatus;
  needsPasswordChange: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isMock: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const isMockMode = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined' || firebaseConfig.apiKey === 'INITIALIZING';

  useEffect(() => {
    if (isMockMode) {
      const savedUser = localStorage.getItem('nib_mock_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
      setLoading(false);
      return;
    }

    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const sqlUser = await getUserProfile(fbUser.uid);
          if (sqlUser) {
            if (sqlUser.status !== 'ACTIVE') {
              toast({ variant: 'destructive', title: 'Access Denied', description: `Account ${sqlUser.status}.` });
              await signOut(auth);
              setUser(null);
            } else {
              setUser(sqlUser as any);
            }
          } else {
            const result = await syncUserToSql({
              id: fbUser.uid,
              email: fbUser.email!,
              name: fbUser.displayName || fbUser.email!.split('@')[0],
            });
            if (result.success) setUser(result.user as any);
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
  }, [auth, toast, isMockMode]);

  const login = async (email: string, pass: string) => {
    const normalizedEmail = email.toLowerCase();
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domain.');
    }

    if (isMockMode) {
      if (pass !== 'nibbank123') throw new Error('Invalid developer credential.');
      
      const emailId = normalizedEmail.split('@')[0];
      
      // CRITICAL FIX: Look up by EMAIL, not a constructed mock ID
      const existingUser = await getUserByEmail(normalizedEmail);
      
      const userId = existingUser?.id || `mock-${emailId}`;
      
      const mockUser: any = {
        id: userId,
        name: existingUser?.name || emailId.split('.').join(' '),
        email: normalizedEmail,
        role: existingUser?.role || (normalizedEmail.includes('admin') ? 'ADMIN' : 'BRANCH_OFFICER'),
        status: existingUser?.status || 'ACTIVE',
        branchName: existingUser?.branchName || null,
        districtName: existingUser?.districtName || null,
        assignedBranches: existingUser?.assignedBranches || []
      };
      
      setUser(mockUser);
      localStorage.setItem('nib_mock_user', JSON.stringify(mockUser));
      await syncUserToSql(mockUser);
      return;
    }

    if (!auth) return;
    await signInWithEmailAndPassword(auth, normalizedEmail, pass);
  };

  const logout = async (reason: string = 'User Logout') => {
    setUser(null);
    if (isMockMode) {
      localStorage.removeItem('nib_mock_user');
    } else if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Session terminated: ${reason}` });
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isMock: isMockMode,
      login, 
      logout,
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
