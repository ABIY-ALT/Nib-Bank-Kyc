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
import { UserStatus } from '@prisma/client';

export interface UserProfile {
  id: string;
  firebaseUid: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  status: UserStatus;
  branchId?: string | null;
  branchName?: string | null;
  districtName?: string | null;
  assignedBranches: string[];
  roles: any[]; 
  needsPasswordChange?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isMock: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useFirebase();
  const { toast } = useToast();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      if (fbUser) {
        try {
          const sqlUser = await getUserProfile(fbUser.uid);
          if (sqlUser) {
            if (sqlUser.status !== 'ACTIVE') {
              toast({ variant: 'destructive', title: 'Access Denied', description: `Account ${sqlUser.status}.` });
              await signOut(auth);
              setUser(null);
            } else {
              setUser({
                ...sqlUser,
                name: `${sqlUser.firstName} ${sqlUser.lastName}`,
                branchName: (sqlUser as any).branch?.name || null,
                districtName: (sqlUser as any).branch?.district?.name || null,
                assignedBranches: (sqlUser as any).assignedBranches || [],
                roles: (sqlUser.roles && sqlUser.roles.length > 0)
                  ? sqlUser.roles
                  : [{ role: { name: 'BRANCH_OFFICER' } }]
              } as any);
            }
          } else {
            // Fallback for new users: Sync them to SQL immediately
            const result = await syncUserToSql({
              id: fbUser.uid,
              email: fbUser.email!,
              name: fbUser.displayName || fbUser.email!.split('@')[0],
            });
            if (result.success) {
              const u = result.user!;
              setUser({ 
                ...u, 
                name: `${u.firstName} ${u.lastName}`,
                assignedBranches: [],
                roles: [{ role: { name: 'BRANCH_OFFICER' } }]
              } as any);
            }
          }
        } catch (e) {
          console.error("Auth profile synchronization failed:", e);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, toast]);

  const login = async (email: string, pass: string) => {
    const normalizedEmail = email.toLowerCase();
    if (!normalizedEmail.endsWith('@nibbank.com.et')) {
      throw new Error('Institutional access restricted to @nibbank.com.et domain.');
    }

    if (!auth) throw new Error('Authentication gateway not initialized.');
    await signInWithEmailAndPassword(auth, normalizedEmail, pass);
  };

  const logout = async (reason: string = 'User Logout') => {
    setUser(null);
    if (auth) {
      await signOut(auth);
    }
    window.location.href = '/login';
    toast({ title: 'Logged Out', description: `Session terminated: ${reason}` });
  };

  const changePassword = async (newPass: string) => {
    if (user) {
      const updated = { ...user, needsPasswordChange: false };
      setUser(updated);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isMock: false, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
